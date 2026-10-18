import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../security/store", () => ({ securityCommand: vi.fn(async () => "OK") }));
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
const reject = { action: "REJECT" as const, approvedMaterial: null, observation: "Synthetic" };

function setup(resolver: SharePointPersonResolver | undefined = syntheticPersonResolver) {
  const metadata = decisionColumns(fields, "materials");
  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path.endsWith("/columns")) return metadata;
    if (path.includes("/items/1?")) return { id: "1", eTag: '"v1"', fields: { Codigo_OrcamentoLookupId: "10", Fornecedor: "Synthetic", Status_Revisao: "PENDENTE", Numero_Item: 1, Descricao_Original: "Synthetic", Quantidade: 2, Unidade_Original: "UN", Preco_Unitario: 10, Preco_Total: 20 } };
    if (path.includes("/lists/materials/")) return { value: [{ id: "22", fields: { Title: "SYNTHETIC", Material: "Synthetic", Unidade_Padrao: "UN" } }] };
    if (path.includes("/lists/budgets/")) return { value: [{ id: "10", fields: { Status_Revisao: "PENDENTE" } }] };
    throw new Error("Unexpected simulated request");
  });
  const patch = vi.fn(async () => ({ "@odata.etag": '"v2"' }));
  const graph = { get: get as GraphReadTransport["get"], patch: patch as GraphWriteTransport["patch"] };
  return { repository: new SharePointOperatorRepository(graph, structuredClone(config), resolver), graph, get, patch, metadata };
}
beforeEach(() => { vi.mocked(securityCommand).mockReset().mockResolvedValue("OK"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("persistência completa da decisão em um PATCH", () => {
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
    await expect(repository.saveItemDecision("1", approve, { actor, version: '"v1"' })).rejects.toThrow("Timeout");
    expect(patch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(securityCommand).mock.calls[1][0][2]))).toMatchObject({ outcome: "unconfirmed" });
  });
  it("revalida metadados em cada decisão em vez de reutilizar schema antigo", async () => {
    const { repository, metadata, patch } = setup();
    await repository.saveItemDecision("1", approve, { actor, version: '"v1"' });
    metadata.value.splice(metadata.value.findIndex(c => c.name === "Data_Decisao"), 1);
    await expect(repository.saveItemDecision("1", reject, { actor, version: '"v1"' })).rejects.toMatchObject({ code: "AUDIT_NOT_CONFIGURED" });
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
    patch.mockImplementation(async () => { written = true; return { "@odata.etag": '"v2"' }; });
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
