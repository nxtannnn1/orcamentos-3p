import type { BudgetItem } from "../types/operator";
import { correctionFields, observedDecimal, type CorrectionValues, type ExtractionValues } from "./item-correction";

export function draftFromItem(item: BudgetItem): CorrectionValues {
  if (item.correction) return structuredClone(item.correction.values);
  return { description: item.originalDescription, quantity: observedDecimal(item.quantity) ?? "", unit: item.unit,
    unitPrice: observedDecimal(item.unitPrice) ?? "", totalPrice: observedDecimal(item.totalPrice) ?? "",
    supplier: item.supplier ?? "", materialId: item.approvedMaterial?.id ?? null, observation: item.observation };
}
export function hasDraftChanges(original: ExtractionValues, current: ExtractionValues) {
  return correctionFields.some(field => original[field] !== current[field]);
}
export const correctionLabels = { description: "Descrição", quantity: "Quantidade", unit: "Unidade", unitPrice: "Preço unitário", totalPrice: "Preço total",
  supplier: "Fornecedor do item", materialId: "Material oficial", observation: "Observação técnica/comercial" } as const;
