import { describe, expect, it } from "vitest";
import { createMockOperatorRepository } from "./mock-operator-repository";

describe("MockOperatorRepository em escala operacional", () => {
  it("entrega 56 itens ordenados e atualiza o progresso", async () => {
    const repository = createMockOperatorRepository();
    const items = await repository.listItemsByBudget("budget-demo-01");
    const [budget] = await repository.listBudgets();
    expect(items).toHaveLength(56);
    expect(items.map((item) => item.itemNumber)).toEqual(Array.from({ length: 56 }, (_, index) => index + 1));
    expect(budget.itemCount).toBe(56);
    expect(budget.reviewedCount).toBe(items.filter((item) => item.reviewStatus !== "PENDENTE").length);
  });

  it("mantém sugestão e aprovação independentes", async () => {
    const items = await createMockOperatorRepository().listItemsByBudget("budget-demo-01");
    const pendingWithSuggestion = items.find((item) => item.reviewStatus === "PENDENTE" && item.suggestedMaterial);
    const differentHumanDecision = items.find((item) =>
      item.reviewStatus === "APROVADO" &&
      item.suggestedMaterial &&
      item.approvedMaterial &&
      item.suggestedMaterial.id !== item.approvedMaterial.id);
    expect(pendingWithSuggestion?.approvedMaterial).toBeNull();
    expect(differentHumanDecision).toBeDefined();
  });
});
