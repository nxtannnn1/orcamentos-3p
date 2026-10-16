import type { BudgetItem } from "../types/operator";

/** Validate the persisted extraction; never fill gaps from a budget or suggestion. */
export function extractionIssues(item: BudgetItem): string[] {
  const issues: string[] = [];
  if (!item.originalDescription.trim()) issues.push("Descrição original ausente");
  if (!item.supplier?.trim()) issues.push("Fornecedor do item ausente");
  if (!item.unit.trim()) issues.push("Unidade ausente");
  for (const [label, value] of [
    ["Quantidade", item.quantity], ["Preço unitário", item.unitPrice], ["Preço total", item.totalPrice],
  ] as const) {
    if (value === null || !Number.isFinite(value) || value <= 0) issues.push(`${label} ausente ou inválido`);
  }
  return issues;
}
