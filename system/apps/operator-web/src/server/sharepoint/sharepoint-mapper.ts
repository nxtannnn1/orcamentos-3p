import type { Budget, BudgetItem, OfficialMaterial, ReviewStatus } from "../../types/operator";
import type { GraphListItem, SharePointFieldMap } from "./sharepoint-types";
import { correctionRecord, originalEvidence } from "./correction-state";

const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};
const lookupId = (fields: Record<string, unknown>, internalName: string) => {
  const value = fields[`${internalName}LookupId`] ?? fields[internalName];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : text(value);
};

export const mapReviewStatus = (value: unknown): ReviewStatus => {
  const normalized = text(value).trim().toUpperCase();
  if (normalized === "APROVADO") return "APROVADO";
  if (normalized === "REJEITADO") return "REJEITADO";
  return "PENDENTE";
};

export function mapOfficialMaterial(
  item: GraphListItem,
  fields: SharePointFieldMap["materials"],
): OfficialMaterial {
  return {
    id: item.id,
    code: text(item.fields[fields.code]),
    name: text(item.fields[fields.name]),
    family: fields.family ? text(item.fields[fields.family]) : "",
    unit: fields.unit ? text(item.fields[fields.unit]) : "",
  };
}

export function mapBudget(item: GraphListItem, fields: SharePointFieldMap["budgets"]): Budget {
  const normalizedStatus = text(item.fields[fields.status])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return {
    id: item.id,
    code: text(item.fields[fields.code]),
    number: text(item.fields[fields.number]),
    supplier: text(item.fields[fields.supplier]) || null,
    date: text(item.fields[fields.date]),
    status: ["CONCLUIDO", "FINALIZADO", "ENCERRADO", "APROVADO"].includes(normalizedStatus)
      ? "CONCLUIDO"
      : "EM_REVISAO",
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
  const correction = correctionRecord(item);
  const evidence = originalEvidence(item);
  return {
    id: item.id,
    budgetId: lookupId(item.fields, fields.budgetLookupId),
    version: item.eTag ?? item["@odata.etag"],
    sourceStatus: text(item.fields[fields.status]),
    // Raw value preserved (no trim/case/default); absent or non-text is null and blocks decisions.
    sentToHistory: typeof item.fields.Enviado_Historico === "string" ? item.fields.Enviado_Historico : null,
    correction,
    extractionEvidence: evidence ? { hash: evidence.hash, capturedAt: evidence.capturedAt, values: evidence.snapshot.values } : null,
    documentEvidence: { available: false, reason: typeof item.fields.DriveFileId === "string" && !!item.fields.DriveFileId ? "FILE_REFERENCE_WITHOUT_AUTHORIZED_PREVIEW" : "NO_REFERENCE" },
    itemNumber: number(item.fields[fields.itemNumber]),
    supplier: text(item.fields[fields.supplier ?? "Fornecedor"]).trim() || null,
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
    lastDecision: {
      id: fields.decisionId ? text(item.fields[fields.decisionId]) || null : null,
      at: fields.reviewedAt ? text(item.fields[fields.reviewedAt]) || null : null,
      actorOid: fields.reviewedByOid ? text(item.fields[fields.reviewedByOid]) || null : null,
      personLookupId: fields.reviewedByPerson ? lookupId(item.fields, fields.reviewedByPerson) || null : null,
    },
  };
}
