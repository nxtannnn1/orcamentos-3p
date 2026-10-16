import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { correctionFixture, actorM, correctionInput } from "./__test-support__/correction";
import { ItemCorrectionService } from "./item-correction-service";
import { CORRECTION_COLUMNS, correctionFields } from "../../domain/item-correction";
import { correctionRecord, originalEvidence, decimalJson } from "./correction-state";
import { mapBudgetItem } from "./sharepoint-mapper";

afterEach(() => vi.unstubAllEnvs());
const context = { actor: actorM, version: '"v1"' };
describe("correção auditável — Graph/Redis sintéticos isolados", () => {
  it("grava todos os campos, preserva original e não aprova", async () => {
    const f = correctionFixture();
    const before = structuredClone(f.row.fields);
    const result = await f.service.save("1", correctionInput, context);
    expect(result).toEqual({ operationId: correctionInput.operationId, status: "confirmed", requiresReload: true });
    expect(result).not.toHaveProperty("version");
    expect(f.patch).toHaveBeenCalledTimes(1);
    expect(f.row.fields).toMatchObject({ Description: correctionInput.values.description, Quantity: 2.5, Unit: "UN", Price: 0.1, Total: 0.25, Supplier: correctionInput.values.supplier, Observation: "Conferido", Status_Revisao: "EM_REVISAO", Material_AprovadoLookupId: null, Enviado_Historico: "NAO" });
    const original = originalEvidence(f.row)!;
    expect(original.snapshot.raw).toMatchObject({ Description: before.Description, Quantity: before.Quantity, Total: before.Total, Supplier: before.Supplier });
    const record = correctionRecord(f.row)!;
    expect(record).toMatchObject({ actor: actorM, personLookupId: "7", previousVersion: '"v1"', budgetId: "10", itemId: "1", originalHash: original.hash });
    expect(new Date(record.at).toISOString()).toBe(record.at);
    expect(record.changes.map(change => change.field)).toEqual(expect.arrayContaining(["description", "quantity", "totalPrice", "supplier", "materialId", "observation"]));
    const projection = mapBudgetItem(f.row, f.config.fields.items, new Map());
    expect(projection.extractionEvidence?.values.description).toBe("Texto IA");
    expect(JSON.stringify(projection)).not.toContain("synthetic-opaque-reference");
    expect(projection.documentEvidence?.available).toBe(false);
    expect([...f.ledger.keys()].some(key => key.endsWith(":reconciled"))).toBe(true);
  });
  it("serializa o número JSON exato sem transformar em string ou calcular com double", () => {
    expect(JSON.stringify({ value: decimalJson("99999999999.9999") })).toBe('{"value":99999999999.9999}');
    expect(JSON.stringify({ value: decimalJson("0.0001") })).toBe('{"value":0.0001}');
  });
  it("não troca o original em correções sucessivas e encadeia operações", async () => {
    const f = correctionFixture();
    await f.service.save("1", correctionInput, context);
    const original = f.row.fields[CORRECTION_COLUMNS.original];
    const next = { ...correctionInput, operationId: "44444444-4444-4444-8444-444444444444", values: { ...correctionInput.values, quantity: "3", totalPrice: "0.3" } };
    await f.service.save("1", next, { ...context, version: '"v2"' });
    expect(f.row.fields[CORRECTION_COLUMNS.original]).toBe(original);
    expect(correctionRecord(f.row)?.previousOperationId).toBe(correctionInput.operationId);
    expect(correctionRecord(f.row)?.changes.find(change => change.field === "quantity")).toEqual({ field: "quantity", previous: "2.5", value: "3", extracted: "2" });
  });
  it("UUID repetido não envia segundo PATCH e conteúdo divergente é recusado", async () => {
    const f = correctionFixture();
    await f.service.save("1", correctionInput, context);
    await f.service.save("1", correctionInput, context);
    expect(f.patch).toHaveBeenCalledTimes(1);
    await expect(f.service.save("1", { ...correctionInput, justification: "Outro conteúdo justificado" }, context)).rejects.toMatchObject({ code: "CORRECTION_OPERATION_CONFLICT" });
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, "*", '"old"'])("ETag inválido/desatualizado não grava: %s", async version => {
    const f = correctionFixture();
    await expect(f.service.save("1", correctionInput, { actor: actorM, version })).rejects.toThrow();
    expect(f.patch).not.toHaveBeenCalled();
    expect([...f.ledger.keys()]).toEqual([]);
  });
  it.each(["APROVADO", "REJEITADO", "UNKNOWN"])("recusa edição informal em %s", async status => {
    const f = correctionFixture(); f.row.fields.Status_Revisao = status;
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTION_STATE_CLOSED" });
    expect(f.patch).not.toHaveBeenCalled();
  });
  it("recusa item enviado e orçamento concluído", async () => {
    const f = correctionFixture(); f.row.fields.Enviado_Historico = "SIM";
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTION_STATE_CLOSED" });
    f.row.fields.Enviado_Historico = "NAO";
    const original = f.get.getMockImplementation()!;
    f.get.mockImplementation(path => path.includes("/budgets/") ? Promise.resolve({ id: "10", fields: { Status: "APROVADO" } }) : original(path));
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "BUDGET_CLOSED" });
    expect(f.patch).not.toHaveBeenCalled();
  });
  it("preserva os bloqueios de Pessoa, schema e feature flag", async () => {
    const f = correctionFixture();
    await expect(new ItemCorrectionService(f.graph, f.config, undefined, f.command).save("1", correctionInput, context)).rejects.toMatchObject({ code: "PERSON_RESOLUTION_NOT_CONFIGURED" });
    f.columns.splice(f.columns.findIndex(column => column.name === CORRECTION_COLUMNS.original), 1);
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTION_SCHEMA_REQUIRED" });
    f.config.humanCorrections = false;
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTIONS_NOT_CONFIGURED" });
    expect(f.patch).not.toHaveBeenCalled(); expect(f.ledger.size).toBe(0);
  });
  it("produção não usa memória de processo sem Redis", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SECURITY_REDIS_REST_URL", ""); vi.stubEnv("SECURITY_REDIS_REST_TOKEN", "");
    const f = correctionFixture();
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTIONS_NOT_CONFIGURED" });
    expect(f.command).not.toHaveBeenCalled(); expect(f.patch).not.toHaveBeenCalled();
  });
  it("sem auditoria antes da intenção não há PATCH", async () => {
    const f = correctionFixture(); f.command.mockRejectedValue(new Error("Audit unavailable"));
    await expect(f.service.save("1", correctionInput, context)).rejects.toThrow();
    expect(f.patch).not.toHaveBeenCalled();
  });
  it("timeout antes do commit fica bloqueado, inclusive com outro UUID", async () => {
    const f = correctionFixture(); f.setMode("before");
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    await expect(f.service.reconcile("1", correctionInput.operationId, { actor: actorM })).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    f.setMode("ok");
    await expect(f.service.save("1", { ...correctionInput, operationId: "44444444-4444-4444-8444-444444444444" }, context)).rejects.toMatchObject({ code: "CORRECTION_PENDING" });
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it("após commit com resposta perdida, releitura reconcilia sem reenviar", async () => {
    const f = correctionFixture(); f.setMode("after");
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    expect(f.row.fields.Status_Revisao).toBe("EM_REVISAO");
    const uncertain = [...f.ledger.entries()].find(([key]) => key.endsWith(":outcome"))![1];
    await expect(f.service.reconcile("1", correctionInput.operationId, { actor: actorM })).resolves.toMatchObject({ status: "confirmed" });
    expect([...f.ledger.entries()].find(([key]) => key.endsWith(":outcome"))![1]).toBe(uncertain);
    await f.service.assertDecisionState(f.row, "22", correctionInput.values.observation);
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it("falha de auditoria após PATCH exige reconciliação durável", async () => {
    const f = correctionFixture(); const command = f.command.getMockImplementation()!;
    f.command.mockImplementation(args => args[0] === "SET" && String(args[1]).endsWith(":reconciled") ? Promise.reject(new Error("Audit after commit")) : command(args));
    await expect(f.service.save("1", correctionInput, context)).rejects.toThrow();
    await expect(f.service.assertDecisionState(f.row, "22", "Conferido")).rejects.toThrow();
    f.command.mockImplementation(command);
    await f.service.reconcile("1", correctionInput.operationId, { actor: actorM });
    await f.service.assertDecisionState(f.row, "22", "Conferido");
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it("corrupção do original, valor alterado fora do contrato e material divergente bloqueiam aprovação", async () => {
    const f = correctionFixture(); await f.service.save("1", correctionInput, context);
    await expect(f.service.assertDecisionState(f.row, "23", "Conferido")).rejects.toThrow();
    f.row.fields.Quantity = 99;
    await expect(f.service.assertDecisionState(f.row, "22", "Conferido")).rejects.toThrow();
    f.row.fields[CORRECTION_COLUMNS.original] = JSON.stringify({ schemaVersion: 1, hash: "fake", snapshot: {} });
    expect(() => originalEvidence(f.row)).toThrow();
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it("outra identidade não pode reconciliar a operação", async () => {
    const f = correctionFixture(); await f.service.save("1", correctionInput, context);
    await expect(f.service.reconcile("1", correctionInput.operationId, { actor: { ...actorM, oid: "someone-else" } })).rejects.toMatchObject({ code: "CORRECTION_ACTOR_INVALID" });
  });
  it.each(correctionFields)("mantém %s explicitamente no contrato corrigido", async field => {
    const f = correctionFixture(); await f.service.save("1", correctionInput, context);
    expect(correctionRecord(f.row)?.values[field]).toBe(correctionInput.values[field]);
  });
});
