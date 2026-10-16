import type {
  Budget,
  BudgetItem,
  ItemDecision,
  OfficialMaterial,
  DecisionContext,
} from "../types/operator";
import type { CorrectionInput, CorrectionResult } from "../domain/item-correction";
export interface OperatorRepository {
  saveItemCorrection?(id: string, input: CorrectionInput, context: DecisionContext): Promise<CorrectionResult>;
  reconcileItemCorrection?(id: string, operationId: string, context: DecisionContext): Promise<CorrectionResult>;
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
export type ReadOnlyOperatorRepository = Omit<OperatorRepository, "saveItemDecision" | "saveItemCorrection" | "reconcileItemCorrection">;
