import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../security/store", () => ({ securityCommand: vi.fn(async () => "OK") }));
import { GraphWriteError } from "./graph-write-error";
import { securityCommand } from "../security/store";
import { ItemCorrectionService } from "./item-correction-service";
import { correctionFixture, correctionInput, actorM } from "./__test-support__/correction";
import { decisionActor as actor, decisionMaterial as material, decisionScenario, sharePointFieldShape } from "./__test-support__/graph-realistic";

const context = { version: '"v1"', actor };
const approve = (observation = "Conferido") => ({ action: "APPROVE" as const, approvedMaterial: material, observation });
const reject = { action: "REJECT" as const, approvedMaterial: null, observation: "Justificativa sintética de rejeição" };
const auditOutcomes = () => vi.mocked(securityCommand).mock.calls
  .filter(([command]) => String(command[1]).endsWith(":outcome")).map(([command]) => JSON.parse(String(command[2])).outcome);

beforeEach(() => {
  vi.mocked(securityCommand).mockReset().mockResolvedValue("OK");
  vi.stubEnv("SECURITY_REDIS_REST_URL", "https://redis.invalid/");
  vi.stubEnv("SECURITY_REDIS_REST_TOKEN", "synthetic-token");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("F-03 decisão confirmada com formato de valores do SharePoint (simulado)", () => {
  it.each([
    ["APPROVE", approve()],
    ["APPROVE com observação vazia", approve("")],
    ["REJECT", reject],
  ] as const)("%s grava uma vez e confirma pela releitura", async (_label, decision) => {
    const f = decisionScenario({ realistic: true });
    const saved = await f.repository.saveItemDecision("1", decision, context);
    expect(f.patch).toHaveBeenCalledTimes(1);
    expect(saved.reviewStatus).toBe(decision.action === "APPROVE" ? "APROVADO" : "REJEITADO");
    expect(auditOutcomes()).toEqual(["confirmed"]);
    const stored = f.persisted();
    expect(stored.Data_Decisao).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    if (decision.action === "REJECT") expect(stored).not.toHaveProperty("Material_AprovadoLookupId");
  });

  it("modo atual (eco literal do payload) continua confirmando", async () => {
    const f = decisionScenario();
    await f.repository.saveItemDecision("1", reject, context);
    expect(auditOutcomes()).toEqual(["confirmed"]);
  });

  // Nenhuma normalização pode transformar divergência real em sucesso.
  it.each([
    ["data em outro segundo", (x: Record<string, unknown>) => ({ ...x, Data_Decisao: String(x.Data_Decisao).replace(/(\d{2})Z$/, (_m, s) => `${String((Number(s) + 1) % 60).padStart(2, "0")}Z`) })],
    ["data com fuso local", (x: Record<string, unknown>) => ({ ...x, Data_Decisao: "2000-01-01T00:00:00-03:00" })],
    ["data ausente", (x: Record<string, unknown>) => { const { Data_Decisao: _d, ...rest } = x; void _d; return rest; }],
    ["Decisao_Id ausente", (x: Record<string, unknown>) => { const { Decisao_Id: _d, ...rest } = x; void _d; return rest; }],
    ["Pessoa ausente", (x: Record<string, unknown>) => { const { Responsavel_DecisaoLookupId: _p, ...rest } = x; void _p; return rest; }],
    ["material mantido na rejeição", (x: Record<string, unknown>) => ({ ...x, Material_AprovadoLookupId: "22" })],
    ["justificativa divergente", (x: Record<string, unknown>) => ({ ...x, Observacao_Item: "Outra" })],
    ["justificativa apagada", (x: Record<string, unknown>) => { const { Observacao_Item: _o, ...rest } = x; void _o; return rest; }],
  ])("REJECT não confirma com %s", async (_label, readBack) => {
    const f = decisionScenario({ realistic: true, readBack });
    await expect(f.repository.saveItemDecision("1", reject, context)).rejects.toMatchObject({ code: "DECISION_UNCONFIRMED" });
    expect(f.patch).toHaveBeenCalledTimes(1);
    expect(auditOutcomes()).toEqual(["unconfirmed"]);
  });

  it("APPROVE não confirma com material ausente na releitura", async () => {
    const f = decisionScenario({ realistic: true, readBack: x => { const { Material_AprovadoLookupId: _m, ...rest } = x; void _m; return rest; } });
    await expect(f.repository.saveItemDecision("1", approve(), context)).rejects.toMatchObject({ code: "DECISION_UNCONFIRMED" });
  });

  it("APPROVE com observação vazia não confirma se a releitura trouxer texto", async () => {
    const f = decisionScenario({ realistic: true, readBack: x => ({ ...x, Observacao_Item: "texto inesperado" }) });
    await expect(f.repository.saveItemDecision("1", approve(""), context)).rejects.toMatchObject({ code: "DECISION_UNCONFIRMED" });
  });

  it("sem a coluna Material_Aprovado no esquema não há escrita nem normalização", async () => {
    const f = decisionScenario({ realistic: true });
    f.columns.value = f.columns.value.filter(column => column.name !== "Material_Aprovado");
    await expect(f.repository.saveItemDecision("1", reject, context)).rejects.toMatchObject({ code: "AUDIT_NOT_CONFIGURED" });
    expect(f.patch).not.toHaveBeenCalled();
  });
});

describe("F-03 correção reconciliada com formato de valores do SharePoint (simulado)", () => {
  function realisticCorrection() {
    const f = correctionFixture();
    f.row.fields = sharePointFieldShape(f.row.fields);
    const original = f.patch.getMockImplementation()!;
    f.patch.mockImplementation(async (path: string, fields: Record<string, unknown>, etag: string) => {
      try { return await original(path, fields, etag); }
      finally { f.row.fields = sharePointFieldShape(f.row.fields); }
    });
    return f;
  }
  const pending = (ledger: Map<string, string>) => [...ledger.keys()].some(key => key.endsWith(":pending"));

  it("grava, reconcilia e libera o lock", async () => {
    const f = realisticCorrection();
    await expect(f.service.save("1", correctionInput, { actor: actorM, version: '"v1"' }))
      .resolves.toEqual({ operationId: correctionInput.operationId, status: "confirmed", requiresReload: true });
    expect(f.row.fields).not.toHaveProperty("Material_AprovadoLookupId");
    expect(pending(f.ledger)).toBe(false);
    expect([...f.ledger.keys()].some(key => key.endsWith(":reconciled"))).toBe(true);
  });

  it("não reconcilia se o material aprovado reaparecer", async () => {
    const f = realisticCorrection(); f.setMode("after");
    await expect(f.service.save("1", correctionInput, { actor: actorM, version: '"v1"' })).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    f.row.fields.Material_AprovadoLookupId = "22";
    await expect(f.service.reconcile("1", correctionInput.operationId, { actor: actorM })).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    expect(pending(f.ledger)).toBe(true);
  });

  it("reconciliação direta (POST) verifica o esquema antes de normalizar", async () => {
    const f = realisticCorrection(); f.setMode("after");
    await expect(f.service.save("1", correctionInput, { actor: actorM, version: '"v1"' })).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    f.columns.splice(f.columns.findIndex(column => column.name === "Material_Aprovado"), 1);
    const reads = f.get.mock.calls.length;
    await expect(f.service.reconcile("1", correctionInput.operationId, { actor: actorM })).rejects.toMatchObject({ code: "CORRECTION_SCHEMA_REQUIRED" });
    expect(f.get.mock.calls.slice(reads).map(([path]) => path).some(path => path.includes("/items/1?"))).toBe(false);
  });

  it("resposta perdida após o commit reconcilia depois pelo POST", async () => {
    const f = realisticCorrection(); f.setMode("after");
    await expect(f.service.save("1", correctionInput, { actor: actorM, version: '"v1"' })).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    await expect(f.service.reconcile("1", correctionInput.operationId, { actor: actorM })).resolves.toMatchObject({ status: "confirmed" });
    expect(pending(f.ledger)).toBe(false);
  });
});

describe("F-01 (corrigido no lote L3)", () => {
  it("decisão não altera item já enviado ao histórico", async () => {
    const f = decisionScenario({ realistic: true, initial: { Status_Revisao: "APROVADO", Material_AprovadoLookupId: "22", Enviado_Historico: "SIM", Observacao_Item: "ok" } });
    await expect(f.repository.saveItemDecision("1", reject, context)).rejects.toMatchObject({ status: 409, code: "ITEM_SENT_TO_HISTORY" });
    expect(f.patch).not.toHaveBeenCalled();
    expect(vi.mocked(securityCommand)).not.toHaveBeenCalled();
  });
});

// Regressão do defeito F-02: somente recusa comprovada permite liberar o lock.
describe("F-02 recuperação de recusa comprovada", () => {
  it("F-02 (lote L4): recusa definitiva do Graph (ex.: 429) deve liberar o lock da correção", async () => {
    const f = correctionFixture();
    f.patch.mockRejectedValueOnce(new GraphWriteError("Limite Graph.", 429, "GRAPH_WRITE_THROTTLED", "rejected", 60));
    const service = new ItemCorrectionService(f.graph, f.config, f.resolver, f.command);
    await expect(service.save("1", correctionInput, { actor: actorM, version: '"v1"' })).rejects.toBeDefined();
    const fresh = { ...correctionInput, operationId: "44444444-4444-4444-8444-444444444444" };
    await expect(service.save("1", fresh, { actor: actorM, version: '"v1"' })).resolves.toMatchObject({ status: "confirmed" });
  });
});

describe("P0 estado verificável do orçamento", () => {
  it.each([undefined, null, "", "UNKNOWN", "APROVADO", "CONCLUIDO"])("bloqueia orçamento %j antes da intenção e do PATCH", async status => {
    const f = decisionScenario(); const get = f.get.getMockImplementation()!;
    f.get.mockImplementation(async path => path.includes("/lists/budgets/") ? { value: [{ id: "10", fields: { Status_Revisao: status } }] } : get(path));
    await expect(f.repository.saveItemDecision("1", approve(), context)).rejects.toMatchObject({ code: "BUDGET_CLOSED" });
    expect(f.patch).not.toHaveBeenCalled();
    expect(vi.mocked(securityCommand)).not.toHaveBeenCalled();
  });
});
