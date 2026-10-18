import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../server/auth/session", () => ({ requireSession: async () => ({ oid: "synthetic-operator", tenantId: "synthetic", roles: ["Operador"] }), authErrorResponse: () => null }));
vi.mock("../../server/security/rate-limit", () => ({ limitUserRequests: async () => {} }));
import { PATCH, POST } from "./itens/[id]/correcao/route";
import { createServerOperatorRepository } from "../../server/data-source/operator-repository-factory";
import { draftFromItem } from "../../domain/correction-draft";
import { validateCorrectionInput, type CorrectionInput } from "../../domain/item-correction";

beforeEach(() => { vi.stubEnv("DATA_SOURCE", "mock"); vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (id: string, body: unknown, version?: string, method = "PATCH") => new Request(`http://localhost/api/itens/${id}/correcao`, {
  method, headers: { "Content-Type": "application/json", Origin: "http://localhost", ...(version ? { "If-Match": version } : {}) }, body: JSON.stringify(body),
});

describe("correção mock pelo contrato HTTP existente", () => {
  it("salva, relê evidência/auditoria, reconcilia e recusa concorrência sem Graph", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in mock"));
    const repository = createServerOperatorRepository();
    const before = (await repository.listItemsByBudget("budget-demo-01")).find(item => item.reviewStatus === "PENDENTE")!;
    const input: CorrectionInput = { operationId: randomUUID(), values: { ...draftFromItem(before), description: "Descrição fictícia corrigida", materialId: "mat-demo-01" }, justification: "Correção de homologação fictícia", acknowledgeTotalDifference: true };
    const response = await PATCH(request(before.id, input, before.version), context(before.id));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ operationId: input.operationId, status: "confirmed", requiresReload: true });
    const after = (await createServerOperatorRepository().listItemsByBudget(before.budgetId)).find(item => item.id === before.id)!;
    expect(after.originalDescription).toBe(input.values.description);
    expect(after.version).not.toBe(before.version);
    expect(after.correction).toMatchObject({ operationId: input.operationId, actor: { oid: "synthetic-operator" }, justification: input.justification });
    expect(after.extractionEvidence?.values.description).toBe(before.originalDescription);
    expect(after.correction?.originalHash).toBe(after.extractionEvidence?.hash);
    expect((await PATCH(request(before.id, { ...input, operationId: randomUUID() }, before.version), context(before.id))).status).toBe(409);
    expect((await PATCH(request(before.id, input, before.version), context(before.id))).status).toBe(200);
    expect((await POST(request(before.id, { operationId: input.operationId }, undefined, "POST"), context(before.id))).status).toBe(200);
    expect(network).not.toHaveBeenCalled();
  });
  it("mantém IDs fictícios inválidos para o contrato SharePoint padrão", () => {
    expect(() => validateCorrectionInput({ operationId: randomUUID(), values: { description: "Fictício", quantity: "1", unit: "UN", unitPrice: "1", totalPrice: "1", supplier: "Fictício", materialId: "mat-demo-01", observation: "" }, justification: "Correção fictícia de teste", acknowledgeTotalDifference: false })).toThrow();
  });
  it("exige versão e impede reconciliação de outra identidade", async () => {
    const repository = createServerOperatorRepository();
    const item = (await repository.listItemsByBudget("budget-demo-01")).find(entry => entry.reviewStatus === "PENDENTE")!;
    const input: CorrectionInput = { operationId: randomUUID(), values: { ...draftFromItem(item), observation: "Outra correção fictícia" }, justification: "Teste de identidade e versão", acknowledgeTotalDifference: true };
    expect((await PATCH(request(item.id, input), context(item.id))).status).toBe(428);
    expect((await PATCH(request(item.id, input, item.version), context(item.id))).status).toBe(200);
    await expect(repository.reconcileItemCorrection!(item.id, input.operationId, { actor: { tenantId: "synthetic", oid: "other" } })).rejects.toMatchObject({ status: 403 });
  });
});
