import { afterEach, describe, expect, it, vi } from "vitest";
import { rejectionJustificationIssue, validateRejectionJustification } from "./rejection-justification";
import { ReviewController } from "./review-controller";
import { createMockOperatorRepository } from "../mocks/mock-operator-repository";
import { BffOperatorRepository } from "../repositories/bff/bff-operator-repository";

afterEach(() => vi.restoreAllMocks());
describe("justificativa obrigatória de rejeição", () => {
  it.each([undefined, null, 42, "", " ".repeat(20), "123456789", "   123456789  ", "x".repeat(2001), "a".repeat(10) + "\u0000"])("recusa texto ausente/inválido: %j", value => {
    expect(rejectionJustificationIssue(value)).not.toBeNull();
    expect(() => validateRejectionJustification(value)).toThrow();
  });
  it.each(["1234567890", "x".repeat(2000), "  Justificativa válida  "])("aceita limites e remove espaços externos", value => {
    expect(validateRejectionJustification(value)).toBe(value.trim());
    expect(rejectionJustificationIssue(value)).toBeNull();
  });
  it("controller impede envio inválido e permite corrigir o texto sem exigir releitura", async () => {
    const repository = createMockOperatorRepository();
    const save = vi.spyOn(repository, "saveItemDecision");
    const controller = new ReviewController(repository);
    const before = await controller.load("budget-demo-01");
    await expect(controller.reject("curto")).rejects.toMatchObject({ code: "INVALID_REJECTION_JUSTIFICATION" });
    expect(controller.session).toEqual(before);
    expect(save).not.toHaveBeenCalled();
    await controller.reject("  Material incompatível com a especificação  ");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].observation).toBe("Material incompatível com a especificação");
  });
  it("BFF bloqueia justificativa vazia antes de fetch", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    await expect(new BffOperatorRepository().saveItemDecision("1", { action: "REJECT", approvedMaterial: null, observation: "" }))
      .rejects.toMatchObject({ code: "INVALID_REJECTION_JUSTIFICATION" });
    expect(network).not.toHaveBeenCalled();
  });
  it("mock aplica a mesma validação quando chamado sem frontend", async () => {
    const repository = createMockOperatorRepository();
    const before = await repository.listItemsByBudget("budget-demo-01");
    await expect(repository.saveItemDecision(before[0].id, { action: "REJECT", approvedMaterial: null, observation: "curto" }))
      .rejects.toMatchObject({ code: "INVALID_REJECTION_JUSTIFICATION" });
    expect(await repository.listItemsByBudget("budget-demo-01")).toEqual(before);
  });
});
