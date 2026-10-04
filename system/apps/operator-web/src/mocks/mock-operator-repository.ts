import { DecisionError } from "../domain/decision-error";
import type { OperatorRepository } from "../repositories/operator-repository";
import type {
  Budget,
  BudgetItem,
  ItemDecision,
  OfficialMaterial,
  DecisionContext,
} from "../types/operator";
import { mockBudgets, mockItems, mockMaterials } from "./mock-data";
const clone = <T>(value: T): T => structuredClone(value);

export class MockOperatorRepository implements OperatorRepository {
  private budgets = clone(mockBudgets);
  private items = clone(mockItems).map((item) => ({ ...item, version: '"0"' }));
  private materials = clone(mockMaterials);
  async listBudgets(): Promise<Budget[]> {
    return this.budgets.map((budget) => {
      const budgetItems = this.items.filter((item) => item.budgetId === budget.id);
      return clone({
        ...budget,
        itemCount: budgetItems.length,
        reviewedCount: budgetItems.filter((item) => item.reviewStatus !== "PENDENTE").length,
        status: budgetItems.every((item) => item.reviewStatus !== "PENDENTE")
          ? "CONCLUIDO"
          : "EM_REVISAO",
      });
    });
  }
  async getBudget(id: string) {
    return (await this.listBudgets()).find((budget) => budget.id === id) ?? null;
  }
  async listItemsByBudget(id: string): Promise<BudgetItem[]> {
    return clone(
      this.items
        .filter((item) => item.budgetId === id)
        .sort((left, right) => left.itemNumber - right.itemNumber),
    );
  }
  async listOfficialMaterials(query = ""): Promise<OfficialMaterial[]> {
    const normalizedQuery = query.trim().toLowerCase();
    return clone(
      this.materials.filter(
        (material) =>
          !normalizedQuery ||
          `${material.code} ${material.name} ${material.family}`
            .toLowerCase()
            .includes(normalizedQuery),
      ),
    );
  }
  async saveItemDecision(
    id: string,
    decision: ItemDecision,
    context?: DecisionContext,
  ): Promise<BudgetItem> {
    const item = this.items.find((entry) => entry.id === id);
    if (!item) throw new Error("Item não encontrado.");
    if (context && context.version !== item.version)
      throw new DecisionError(
        "Este item foi alterado. Recarregue os dados antes de decidir.",
        409,
        "DECISION_CONFLICT",
      );
    item.version = `"${Number(item.version.slice(1, -1)) + 1}"`;
    item.reviewStatus = decision.action === "APPROVE" ? "APROVADO" : "REJEITADO";
    item.approvedMaterial = decision.action === "APPROVE" ? clone(decision.approvedMaterial) : null;
    item.observation = decision.observation;
    return clone(item);
  }
}
export const createMockOperatorRepository = () => new MockOperatorRepository();
