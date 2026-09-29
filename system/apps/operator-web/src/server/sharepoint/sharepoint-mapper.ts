import type { Budget, BudgetItem, OfficialMaterial, ReviewStatus } from "../../types/operator";
import type { GraphListItem, SharePointFieldMap } from "./sharepoint-types";

const text = (value: unknown) => value == null ? "" : String(value);
const number = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const lookupId = (fields: Record<string, unknown>, internalName: string) =>
  text(fields[internalName] ?? fields[`${internalName}LookupId`]);

export const mapReviewStatus = (value: unknown): ReviewStatus => {
  const normalized = text(value).trim().toUpperCase();
  if (normalized.includes("APROV")) return "APROVADO";
  if (normalized.includes("REJEIT")) return "REJEITADO";
  return "PENDENTE";
};

export function mapOfficialMaterial(item: GraphListItem, fields: SharePointFieldMap["materials"]): OfficialMaterial {
  return {
    id: item.id,
    code: text(item.fields[fields.code]),
    name: text(item.fields[fields.name]),
    family: fields.family ? text(item.fields[fields.family]) : "",
    unit: fields.unit ? text(item.fields[fields.unit]) : "",
  };
}

export function mapBudget(item: GraphListItem, fields: SharePointFieldMap["budgets"]): Budget {
  return {
    id: item.id,
    code: text(item.fields[fields.code]),
    number: text(item.fields[fields.number]),
    supplier: text(item.fields[fields.supplier]) || null,
    date: text(item.fields[fields.date]),
    status: mapReviewStatus(item.fields[fields.status]) === "APROVADO" ? "CONCLUIDO" : "EM_REVISAO",
    itemCount: 0,
    reviewedCount: 0,
  };
}

export function mapBudgetItem(
  item: GraphListItem,
  fields: SharePointFieldMap["items"],
  materialsById: ReadonlyMap<string, OfficialMaterial>,
): BudgetItem {
  const suggestedId = lookupId(item.fields, fields.suggestedMaterialLookupId);
  const approvedId = lookupId(item.fields, fields.approvedMaterialLookupId);
  return {
    id: item.id,
    budgetId: lookupId(item.fields, fields.budgetLookupId),
    itemNumber: number(item.fields[fields.itemNumber]),
    originalDescription: text(item.fields[fields.description]),
    quantity: number(item.fields[fields.quantity]),
    unit: text(item.fields[fields.unit]),
    unitPrice: number(item.fields[fields.unitPrice]),
    totalPrice: number(item.fields[fields.totalPrice]),
    suggestedMaterial: materialsById.get(suggestedId) ?? null,
    // Resolvido exclusivamente pelo campo Material_Aprovado real.
    approvedMaterial: materialsById.get(approvedId) ?? null,
    observation: text(item.fields[fields.observation]),
    reviewStatus: mapReviewStatus(item.fields[fields.status]),
  };
}
