import type {
  Budget,
  BudgetItem,
  ItemDecision,
  OfficialMaterial,
  DecisionContext,
} from "../types/operator";
export interface OperatorRepository {
  listBudgets(): Promise<Budget[]>;
  getBudget(id: string): Promise<Budget | null>;
  listItemsByBudget(id: string): Promise<BudgetItem[]>;
  listOfficialMaterials(query?: string): Promise<OfficialMaterial[]>;
  saveItemDecision(
    id: string,
    decision: ItemDecision,
    context?: DecisionContext,
  ): Promise<BudgetItem>;
}
export type ReadOnlyOperatorRepository = Omit<OperatorRepository, "saveItemDecision">;
