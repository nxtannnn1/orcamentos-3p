import candidateFields from "../../../docs/phase-m-decision-fields.candidate.json";
import { correctionFixture, correctionInput, actorM } from "./__test-support__/correction";
import { CORRECTION_COLUMNS } from "../../domain/item-correction";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../security/store", () => ({ securityCommand: vi.fn(async () => "OK") }));
import { DecisionError } from "../../domain/decision-error";
import { securityCommand } from "../security/store";
import { SharePointOperatorRepository } from "./sharepoint-operator-repository";
import { decisionColumns, syntheticPersonResolver } from "./__test-support__/decision";
import type { GraphReadTransport, GraphWriteTransport, SharePointRepositoryConfig } from "./sharepoint-types";
import type { SharePointPersonResolver } from "./person-resolver";
import { GraphListPersonResolver } from "./graph-list-person-resolver";

const actor = { tenantId: "tenant", oid: "human-oid" };
const fields = {
  budgets: { code: "Codigo_Orcamento", number: "Numero_Orcamento", supplier: "Fornecedor", date: "Data_Orcamento", status: "Status_Revisao" },
  items: { code: "Codigo_Item", budgetLookupId: "Codigo_Orcamento", itemNumber: "Numero_Item", description: "Descricao_Original", quantity: "Quantidade", unit: "Unidade_Original", unitPrice: "Preco_Unitario", totalPrice: "Preco_Total", status: "Status_Revisao", suggestedMaterialLookupId: "Material_Sugerido_Ref", approvedMaterialLookupId: "Material_Aprovado", observation: "Observacao_Item", reviewedByOid: "Revisado_Por_Oid", reviewedByPerson: "Responsavel_Decisao", reviewedAt: "Data_Decisao", decisionId: "Decisao_Id" },
  materials: { code: "Title", name: "Material", unit: "Unidade_Padrao" },
};
const config: SharePointRepositoryConfig = { tenantId: "tenant", siteId: "site", itemsListId: "items", budgetsListId: "budgets", materialsListId: "materials", fields };
const material = { id: "22", code: "SYNTHETIC", name: "Synthetic", family: "", unit: "UN" };
const approve = { action: "APPROVE" as const, approvedMaterial: material, observation: "Synthetic" };
const reject = { action: "REJECT" as const, approvedMaterial: null, observation: "Synthetic rejection reason" };

function setup(resolver: SharePointPersonResolver | undefined = syntheticPersonResolver) {
  const metadata = decisionColumns(fields, "materials");
  let persisted: Record<string, unknown> = {};
  let version = 1;
  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path.endsWith("/columns")) return metadata;
    if (path.includes("/items/1?")) return { id: "1", eTag: `"v${version}"`, fields: { ...persisted, Codigo_OrcamentoLookupId: "10", Fornecedor: "Synthetic", Status_Revisao: persisted.Status_Revisao ?? "PENDENTE", Numero_Item: 1, Descricao_Original: "Synthetic", Quantidade: 2, Unidade_Original: "UN", Preco_Unitario: 10, Preco_Total: 20 } };
    if (path.includes("/lists/materials/")) return { value: [{ id: "22", fields: { Title: "SYNTHETIC", Material: "Synthetic", Unidade_Padrao: "UN" } }] };
    if (path.includes("/lists/budgets/")) return { value: [{ id: "10", fields: { Status_Revisao: "PENDENTE" } }] };
    throw new Error("Unexpected simulated request");
  });
  const patch = vi.fn(async (_path: string, payload: Record<string, unknown>, etag: string) => {
    if (etag !== `"v${version}"`) throw new DecisionError("Conflito", 409, "DECISION_CONFLICT");
    persisted = structuredClone(payload);
    version++;
    return { "@odata.etag": `"v${version}"` };
  });
  const graph = { get: get as GraphReadTransport["get"], patch: patch as GraphWriteTransport["patch"] };
  return { repository: new SharePointOperatorRepository(graph, structuredClone(config), resolver), graph, get, patch, metadata };
}
beforeEach(() => { vi.mocked(securityCommand).mockReset().mockResolvedValue("OK"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("persistência completa da decisão em um PATCH", () => {
  it.each(["denied", "timeout-before", "reason-diverged", "read-unavailable"])("rejeição falha sem sucesso fictício ou retry: %s", async mode => {
    const f = setup();
    const read = f.get.getMockImplementation()!;
    if (mode === "denied") f.patch.mockRejectedValue(new DecisionError("Negado", 403, "GRAPH_WRITE_FORBIDDEN"));
    if (mode === "timeout-before") f.patch.mockRejectedValue(new Error("Timeout"));
    if (mode === "reason-diverged" || mode === "read-unavailable") f.get.mockImplementation(async path => {
      const row = await read(path);
      if (!path.includes("/items/1?") || !f.patch.mock.calls.length) return row;
      if (mode === "read-unavailable") throw new Error("Read timeout");
      const item = row as { fields: Record<string, unknown> };
      return { ...item, fields: { ...item.fields, Observacao_Item: "Outra justificativa" } };
    });
    await expect(f.repository.saveItemDecision("1", reject, { actor, version: '"v1"' }))
      .rejects.toMatchObject({ code: mode === "denied" ? "GRAPH_WRITE_FORBIDDEN" : "DECISION_UNCONFIRMED" });
    expect(f.patch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(securityCommand).mock.calls[1][0][2])).outcome)
      .toBe(mode === "denied" ? "denied" : "unconfirmed");
  });

  it("usa os quatro nomes internos candidatos observados sem criar Aprovador", () => {
    expect(fields.items).toMatchObject(candidateFields.items);
    expect(candidateFields.items.reviewedByPerson).toBe("Responsavel_Decisao");
    expect(Object.values(candidateFields.items)).not.toContain("Aprovador");
  });
  it.each(["", " ".repeat(20), "123456789", "x".repeat(2001)])("rejeição inválida não lê, audita nem grava", async observation => {
    const f = setup();
    await expect(f.repository.saveItemDecision("1", { ...reject, observation }, { actor, version: '"v1"' }))
      .rejects.toMatchObject({ code: "INVALID_REJECTION_JUSTIFICATION" });
    expect(f.get).not.toHaveBeenCalled();
    expect(f.patch).not.toHaveBeenCalled();
    expect(securityCommand).not.toHaveBeenCalled();
  });
  it.each(["1234567890", "x".repeat(2000)])("rejeição válida confirma justificativa, autoria, data, UUID e material vazio", async observation => {
    const f = setup();
    const saved = await f.repository.saveItemDecision("1", { ...reject, observation }, { actor, version: '"v1"' });
    expect(saved).toMatchObject({ observation, reviewStatus: "REJEITADO", approvedMaterial: null,
      lastDecision: { actorOid: actor.oid, personLookupId: "7", id: expect.any(String), at: expect.any(String) } });
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it("rejeição não sobrescreve os registros de auditoria de uma decisão anterior", async () => {
    const ledger = new Map<string, string>();
    vi.mocked(securityCommand).mockImplementation(async args => {
      const key = String(args[1]);
      if (args[0] !== "SET" || !args.includes("NX")) throw new Error("Unexpected audit command");
      if (ledger.has(key)) return null;
      ledger.set(key, String(args[2])); return "OK";
    });
    const f = setup();
    const approved = await f.repository.saveItemDecision("1", approve, { actor, version: '"v1"' });
    const previous = [...ledger.entries()];
    const rejected = await f.repository.saveItemDecision("1", reject, { actor, version: '"v2"' });
    expect(approved.lastDecision?.id).not.toBe(rejected.lastDecision?.id);
    for (const [key, value] of previous) expect(ledger.get(key)).toBe(value);
    expect(ledger.size).toBe(4);
  });
  it("rejeição após correção preserva registro, original e ledger da correção", async () => {
    const f = correctionFixture();
    f.config.fields.items.observation = "Observacao_Item";
    f.row.fields.Observacao_Item = "";
    delete f.row.fields.Observation;
    f.columns.find(column => column.name === "Observation")!.name = "Observacao_Item";
    const extra = decisionColumns(f.config.fields, "materials").value.filter(column => !f.columns.some(existing => existing.name === column.name));
    const read = f.get.getMockImplementation()!;
    f.get.mockImplementation(async path => {
      if (path.endsWith("/columns")) return { value: [...f.columns, ...extra] };
      if (path.includes("/lists/materials/items?")) return { value: [] };
      if (path.includes("/lists/budgets/items?")) return { value: [{ id: "10", fields: { Status: "PENDENTE" } }] };
      return read(path);
    });
    vi.mocked(securityCommand).mockImplementation(f.command);
    await f.service.save("1", correctionInput, { actor: actorM, version: '"v1"' });
    const original = f.row.fields[CORRECTION_COLUMNS.original];
    const record = f.row.fields[CORRECTION_COLUMNS.record];
    const ledger = [...f.ledger.entries()];
    const repository = new SharePointOperatorRepository(f.graph, f.config, f.resolver);
    const saved = await repository.saveItemDecision("1", { ...reject, observation: "Material fora da especificação" }, { actor: actorM, version: '"v2"' });
    expect(saved.observation).toBe("Material fora da especificação");
    expect(saved.correction?.values.observation).toBe(correctionInput.values.observation);
    expect(saved.reviewStatus).toBe("REJEITADO");
    expect(f.row.fields[CORRECTION_COLUMNS.original]).toBe(original);
    expect(f.row.fields[CORRECTION_COLUMNS.record]).toBe(record);
    for (const [key, value] of ledger) expect(f.ledger.get(key)).toBe(value);
  });
  it("rejeição com resposta perdida reconcilia o mesmo UUID sem segundo PATCH", async () => {
    const f = setup();
    const commit = f.patch.getMockImplementation()!;
    f.patch.mockImplementation(async (...args) => { await commit(...args); throw new Error("Response lost"); });
    const saved = await f.repository.saveItemDecision("1", reject, { actor, version: '"v1"' });
    const calls = vi.mocked(securityCommand).mock.calls;
    const intent = JSON.parse(String(calls[0][0][2]));
    const proof = JSON.parse(String(calls[2][0][2]));
    expect(saved.lastDecision?.id).toBe(intent.decisionId);
    expect(proof.decisionId).toBe(intent.decisionId);
    expect(proof.outcome).toBe("confirmed");
    expect(f.patch).toHaveBeenCalledTimes(1);
    await expect(f.repository.saveItemDecision("1", reject, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "DECISION_CONFLICT" });
    expect(f.patch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Status_Revisao", "PENDENTE"], ["Responsavel_DecisaoLookupId", "8"],
    ["Responsavel_DecisaoLookupId", { LookupId: "7" }], ["Responsavel_DecisaoLookupId", null],
    ["Revisado_Por_Oid", "another-human"], ["Decisao_Id", "another-operation"],
    ["Data_Decisao", "2000-01-01T00:00:00.000Z"], ["Material_AprovadoLookupId", "21"],
    ["Observacao_Item", "changed"], ["Codigo_OrcamentoLookupId", "999"],
  ])("não confirma releitura divergente: %s", async (field, value) => {
    const f = setup();
    const read = f.get.getMockImplementation()!;
    f.get.mockImplementation(async path => {
      const row = await read(path);
      if (!path.includes("/items/1?") || !f.patch.mock.calls.length) return row;
      const item = row as { fields: Record<string, unknown> };
      return { ...item, fields: { ...item.fields, [field]: value } };
    });
    await expect(f.repository.saveItemDecision("1", approve, { actor, version: '"v1"' }))
      .rejects.toMatchObject({ code: "DECISION_UNCONFIRMED" });
    expect(f.patch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(securityCommand).mock.calls[1][0][2])).outcome).toBe("unconfirmed");
  });
  it.each([{ id: "2" }, { eTag: '"v1"' }, { eTag: undefined }, { eTag: "*" }])("recusa ID/ETag incorreto na releitura: %j", async override => {
    const f = setup();
    const read = f.get.getMockImplementation()!;
    f.get.mockImplementation(async path => {
      const row = await read(path);
      return path.includes("/items/1?") && f.patch.mock.calls.length ? { ...(row as object), ...override } : row;
    });
    await expect(f.repository.saveItemDecision("1", approve, { actor, version: '"v1"' }))
      .rejects.toMatchObject({ code: "DECISION_UNCONFIRMED" });
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it("resposta HTTP perdida após persistência reconcilia por GET e não repete PATCH", async () => {
    const f = setup();
    const commit = f.patch.getMockImplementation()!;
    f.patch.mockImplementation(async (...args) => { await commit(...args); throw new Error("Response lost"); });
    const result = await f.repository.saveItemDecision("1", approve, { actor, version: '"v1"' });
    expect(result).toMatchObject({ reviewStatus: "APROVADO", version: '"v2"', lastDecision: { personLookupId: "7", actorOid: actor.oid } });
    expect(f.patch).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(securityCommand).mock.calls;
    expect(JSON.parse(String(calls[1][0][2])).outcome).toBe("unconfirmed");
    expect(String(calls[2][0][1])).toMatch(/:reconciled$/);
    expect(JSON.parse(String(calls[2][0][2])).outcome).toBe("confirmed");
  });
  it("Graph indisponível na releitura não confirma nem repete PATCH", async () => {
    const f = setup();
    const read = f.get.getMockImplementation()!;
    f.get.mockImplementation(path => {
      if (path.includes("/items/1?") && f.patch.mock.calls.length) throw new Error("Read timeout");
      return read(path);
    });
    await expect(f.repository.saveItemDecision("1", approve, { actor, version: '"v1"' }))
      .rejects.toMatchObject({ code: "DECISION_UNCONFIRMED" });
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it("duas decisões simultâneas usam If-Match: apenas uma persiste", async () => {
    const f = setup();
    const results = await Promise.allSettled([
      f.repository.saveItemDecision("1", approve, { actor, version: '"v1"' }),
      f.repository.saveItemDecision("1", reject, { actor: { ...actor, oid: "second-operator" }, version: '"v1"' }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });

  it.each([
    ["Descricao_Original", ""], ["Quantidade", null], ["Quantidade", "2"], ["Quantidade", -1],
    ["Unidade_Original", " "], ["Preco_Unitario", 0], ["Preco_Total", null], ["Preco_Total", "20"],
  ])("bloqueia aprovação de extração inválida antes da intenção ou PATCH: %s=%s", async (field, value) => {
    const { repository, get, patch } = setup();
    const original = get.getMockImplementation()!;
    get.mockImplementation(async path => {
      const row = await original(path);
      if (!path.includes("/items/1?")) return row;
      const item = row as { fields: Record<string, unknown> };
      return { ...item, fields: { ...item.fields, [field as string]: value } };
    });
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "APPROVAL_INCOMPLETE" });
    expect(patch).not.toHaveBeenCalled();
    expect(securityCommand).not.toHaveBeenCalled();
  });
  it.each([approve, reject])("grava autoria, data e rastreabilidade no mesmo PATCH: $action", async decision => {
    const { repository, patch } = setup();
    const saved = await repository.saveItemDecision("1", decision, { actor, version: '"v1"' });
    expect(patch).toHaveBeenCalledTimes(1);
    const [path, payload, version] = (patch.mock.calls as unknown as [string, Record<string, unknown>, string][])[0];
    expect(path).toBe("/sites/site/lists/items/items/1/fields");
    expect(version).toBe('"v1"');
    expect(payload).toMatchObject({ Status_Revisao: decision.action === "APPROVE" ? "APROVADO" : "REJEITADO", Material_AprovadoLookupId: decision.action === "APPROVE" ? "22" : null, Responsavel_DecisaoLookupId: "7", Revisado_Por_Oid: actor.oid, Data_Decisao: expect.any(String), Decisao_Id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(new Date(String(payload.Data_Decisao)).toISOString()).toBe(payload.Data_Decisao);
    expect(saved.version).toBe('"v2"');
    const audit = JSON.parse(String(vi.mocked(securityCommand).mock.calls[0][0][2]));
    expect(audit).toMatchObject({ decidedAt: payload.Data_Decisao, decisionId: payload.Decisao_Id, actor, personLookupId: "7" });
    expect(Object.keys(payload)).not.toContain("Material_Sugerido_RefLookupId");
  });

  it.each([
    { candidates: [], code: "PERSON_NOT_FOUND" },
    { candidates: [{ ...actor, siteId: "site", lookupId: "7" }, { ...actor, siteId: "site", lookupId: "8" }], code: "PERSON_AMBIGUOUS" },
    { candidates: [{ ...actor, oid: "service", siteId: "site", lookupId: "7" }], code: "PERSON_IDENTITY_MISMATCH" },
  ])("não grava nada quando a identidade falha: $code", async ({ candidates, code }) => {
    const { repository, patch } = setup({ findCandidates: async () => candidates });
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code });
    expect(patch).not.toHaveBeenCalled();
    expect(securityCommand).not.toHaveBeenCalled();
  });
  it("bloqueia falha do provedor Graph sem PATCH", async () => {
    const { repository, patch } = setup({ findCandidates: async () => { throw new Error("Graph unavailable"); } });
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
    expect(patch).not.toHaveBeenCalled();
  });
  it("bloqueia tenant incorreto sem PATCH", async () => {
    const { repository, patch } = setup();
    await expect(repository.saveItemDecision("1", reject, { actor: { ...actor, tenantId: "other" }, version: '"v1"' })).rejects.toMatchObject({ code: "DECISION_TENANT_MISMATCH" });
    expect(patch).not.toHaveBeenCalled();
  });
  it("o repositório real bloqueia resolução não configurada", async () => {
    const { graph, patch } = setup();
    const repository = new SharePointOperatorRepository(graph, config);
    await expect(repository.saveItemDecision("1", reject, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "PERSON_RESOLUTION_NOT_CONFIGURED" });
    expect(patch).not.toHaveBeenCalled();
  });
  it.each(["missing", "person-as-text", "oid-as-person", "multi-person", "wrong-lookup", "readonly", "wrong-date", "wrong-decision-id", "missing-choice"]) ("valida o schema antes do PATCH: %s", async issue => {
    const { repository, metadata, patch } = setup();
    const cols = metadata.value;
    const find = (name: string) => cols.find(c => c.name === name)!;
    if (issue === "missing") cols.splice(cols.findIndex(c => c.name === "Decisao_Id"), 1);
    if (issue === "person-as-text") Object.assign(find("Responsavel_Decisao"), { personOrGroup: undefined, text: {} });
    if (issue === "oid-as-person") Object.assign(find("Revisado_Por_Oid"), { text: undefined, personOrGroup: {} });
    if (issue === "multi-person") find("Responsavel_Decisao").personOrGroup!.allowMultipleSelection = true;
    if (issue === "wrong-lookup") find("Material_Aprovado").lookup!.listId = "other";
    if (issue === "readonly") Object.assign(find("Data_Decisao"), { readOnly: true });
    if (issue === "wrong-date") Object.assign(find("Data_Decisao"), { dateTime: undefined, text: {} });
    if (issue === "wrong-decision-id") Object.assign(find("Decisao_Id"), { text: undefined, dateTime: {} });
    if (issue === "missing-choice") find("Status_Revisao").choice!.choices = ["PENDENTE"];
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "AUDIT_NOT_CONFIGURED" });
    expect(patch).not.toHaveBeenCalled();
    expect(securityCommand).not.toHaveBeenCalled();
  });
  it("falha de leitura de metadados não produz PATCH", async () => {
    const { repository, get, patch } = setup();
    const original = get.getMockImplementation()!;
    get.mockImplementation(path => path.endsWith("/columns") ? Promise.reject(new Error("Graph unavailable")) : original(path));
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toThrow();
    expect(patch).not.toHaveBeenCalled();
  });
  it.each([undefined, "*", '"old"']) ("ETag inválido não produz PATCH: %s", async version => {
    const { repository, patch } = setup();
    await expect(repository.saveItemDecision("1", approve, { actor, version })).rejects.toThrow();
    expect(patch).not.toHaveBeenCalled();
  });
  it("configuração incompleta não produz PATCH", async () => {
    const { graph, patch } = setup();
    const incomplete = structuredClone(config);
    delete incomplete.fields.items.reviewedByPerson;
    const repository = new SharePointOperatorRepository(graph, incomplete, syntheticPersonResolver);
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "AUDIT_NOT_CONFIGURED" });
    expect(patch).not.toHaveBeenCalled();
  });
  it("Redis indisponível impede qualquer PATCH", async () => {
    vi.mocked(securityCommand).mockRejectedValue(new Error("Redis unavailable"));
    const { repository, patch } = setup();
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toThrow();
    expect(patch).not.toHaveBeenCalled();
  });
  it("material inexistente impede qualquer PATCH", async () => {
    const { repository, patch } = setup();
    await expect(repository.saveItemDecision("1", { ...approve, approvedMaterial: { ...material, id: "999" } }, { actor, version: '"v1"' })).rejects.toThrow(/Material Oficial válido/);
    expect(patch).not.toHaveBeenCalled();
  });
  it("intenção não confirmada no Redis impede qualquer PATCH", async () => {
    vi.mocked(securityCommand).mockResolvedValue(null);
    const { repository, patch } = setup();
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toThrow(/registrar a auditoria/);
    expect(patch).not.toHaveBeenCalled();
  });
  it("falha durante PATCH registra resultado não confirmado sem repetir a escrita", async () => {
    const { repository, patch } = setup();
    patch.mockRejectedValueOnce(new Error("Timeout"));
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "DECISION_UNCONFIRMED" });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(securityCommand).mock.calls[1][0][2]))).toMatchObject({ outcome: "unconfirmed" });
  });
  it("revalida metadados em cada decisão em vez de reutilizar schema antigo", async () => {
    const { repository, metadata, patch } = setup();
    await repository.saveItemDecision("1", approve, { actor, version: '"v1"' });
    metadata.value.splice(metadata.value.findIndex(c => c.name === "Data_Decisao"), 1);
    await expect(repository.saveItemDecision("1", reject, { actor, version: '"v2"' })).rejects.toMatchObject({ code: "AUDIT_NOT_CONFIGURED" });
    expect(patch).toHaveBeenCalledTimes(1);
  });
  it.each(["unavailable", "not-confirmed"])("falha Redis após PATCH exige reconciliação: %s", async mode => {
    const store = vi.mocked(securityCommand);
    store.mockResolvedValueOnce("OK");
    if (mode === "unavailable") store.mockRejectedValueOnce(new Error("Redis unavailable"));
    else store.mockResolvedValueOnce(null);
    const { repository, patch } = setup();
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "AUDIT_OUTCOME_UNCONFIRMED" });
    expect(patch).toHaveBeenCalledTimes(1);
  });
  it("após resultado incerto, repetição do ETag antigo não aprova duas vezes", async () => {
    const { repository, get, patch } = setup();
    let written = false;
    const original = get.getMockImplementation()!;
    get.mockImplementation(async path => {
      const value = await original(path);
      return written && path.includes("/items/1?") ? { ...(value as object), eTag: '"v2"' } : value;
    });
    const commit = patch.getMockImplementation()!;
    patch.mockImplementation(async (...args) => { const result = await commit(...args); written = true; return result; });
    vi.mocked(securityCommand).mockResolvedValueOnce("OK").mockRejectedValueOnce(new Error("Redis after PATCH"));
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "AUDIT_OUTCOME_UNCONFIRMED" });
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "DECISION_CONFLICT" });
    expect(patch).toHaveBeenCalledTimes(1);
  });
});

describe("decisão integrada ao resolvedor Graph real do código, com serviços simulados", () => {
  const verifiedActor = { tenantId: "11111111-1111-1111-1111-111111111111", oid: "22222222-2222-2222-2222-222222222222" };
  const siteId = "example.sharepoint.com,33333333-3333-3333-3333-333333333333,44444444-4444-4444-4444-444444444444";
  const listId = "55555555-5555-5555-5555-555555555555";
  const pair = (lookupId: string) => ({ user: { id: verifiedActor.oid }, siteUser: { id: lookupId } });
  function integrated(identities: unknown[], nextLink?: string) {
    const f = setup();
    const original = f.get.getMockImplementation()!;
    f.get.mockImplementation(path => {
      if (path.includes("/permissions")) return Promise.resolve({ value: [{ grantedToIdentitiesV2: identities }],
        ...(nextLink ? { "@odata.nextLink": nextLink } : {}) });
      if (path.endsWith("?$select=id")) return Promise.resolve({ id: siteId });
      return original(path);
    });
    const resolver = new GraphListPersonResolver(f.graph, { tenantId: verifiedActor.tenantId, siteId, listId });
    return { ...f, repository: new SharePointOperatorRepository(f.graph,
      { ...structuredClone(config), tenantId: verifiedActor.tenantId, siteId, itemsListId: listId }, resolver) };
  }

  it.each([approve, reject])("associação única fornece Pessoa e OID ao mesmo PATCH e à auditoria: $action", async decision => {
    const f = integrated([pair("17")]);
    await f.repository.saveItemDecision("1", decision, { actor: verifiedActor, version: '"v1"' });
    expect(f.patch).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(`/lists/${listId}/items/1/fields`),
      expect.objectContaining({ Responsavel_DecisaoLookupId: "17", Revisado_Por_Oid: verifiedActor.oid,
        Status_Revisao: decision.action === "APPROVE" ? "APROVADO" : "REJEITADO" }), '"v1"');
    expect(JSON.parse(String(vi.mocked(securityCommand).mock.calls[0][0][2])))
      .toMatchObject({ actor: verifiedActor, personLookupId: "17" });
  });

  it.each([
    { identities: [], code: "PERSON_NOT_FOUND" },
    { identities: [pair("17"), pair("18")], code: "PERSON_AMBIGUOUS" },
    { identities: [{ user: { id: verifiedActor.oid } }], code: "PERSON_IDENTITY_MISMATCH" },
    { identities: [{ user: { id: verifiedActor.oid, tenantId: listId }, siteUser: { id: "17" } }], code: "PERSON_IDENTITY_MISMATCH" },
  ])("falha de associação impede intenção e PATCH: $code", async ({ identities, code }) => {
    const f = integrated(identities);
    await expect(f.repository.saveItemDecision("1", approve, { actor: verifiedActor, version: '"v1"' })).rejects.toMatchObject({ code });
    expect(f.patch).not.toHaveBeenCalled();
    expect(securityCommand).not.toHaveBeenCalled();
  });

  it("candidato parcial seguido de paginação inválida não chega à auditoria nem ao PATCH", async () => {
    const f = integrated([pair("17")], "https://graph.microsoft.com/v1.0/users");
    await expect(f.repository.saveItemDecision("1", reject, { actor: verifiedActor, version: '"v1"' }))
      .rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
    expect(f.patch).not.toHaveBeenCalled();
    expect(securityCommand).not.toHaveBeenCalled();
  });
});
