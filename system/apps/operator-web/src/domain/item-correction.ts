import { DecisionError } from "./decision-error";

export const correctionFields = ["description", "quantity", "unit", "unitPrice", "totalPrice", "supplier", "materialId", "observation"] as const;
export type CorrectionField = typeof correctionFields[number];
export type ExtractionValues = Record<CorrectionField, string | null>;
export interface CorrectionValues extends ExtractionValues {
  description: string; quantity: string; unit: string; unitPrice: string; totalPrice: string;
  supplier: string; materialId: string | null; observation: string;
}
export interface CorrectionInput {
  operationId: string;
  values: CorrectionValues;
  justification: string;
  acknowledgeTotalDifference: boolean;
}
export interface CorrectionChange { field: CorrectionField; previous: string | null; value: string | null; extracted: string | null; }
export interface CorrectionRecord extends CorrectionInput {
  schemaVersion: 1; itemId: string; budgetId: string; at: string;
  actor: { tenantId: string; oid: string }; personLookupId: string;
  previousVersion: string; previousOperationId: string | null;
  originalHash: string; fingerprint: string; changes: CorrectionChange[];
}
export interface ExtractionEvidence {
  schemaVersion: 1; capturedAt: string; hash: string;
  snapshot: { itemId: string; budgetId: string; version: string; values: ExtractionValues; raw: Record<string, unknown>; documentFileId: string | null };
}
export interface CorrectionResult { operationId: string; status: "confirmed"; requiresReload: true; }
export const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CORRECTION_COLUMNS = { original: "Extracao_Original_JSON", record: "Correcao_Humana_JSON", operation: "Correcao_Operacao_Id" } as const;

const fail = (message: string): never => { throw new DecisionError(message, 400, "INVALID_CORRECTION"); };

/** Decimal transport is text; arithmetic is BigInt with four fractional places. */
export function exactDecimal(value: unknown, positive = false): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,10})([.,]\d{1,4})?$/.test(value))
    return fail("Use decimal sem separador de milhar, até 11 inteiros e quatro casas decimais.");
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  if (positive && BigInt(whole + fraction.padEnd(4, "0")) === BigInt(0)) return fail("Quantidade deve ser positiva.");
  const trimmed = fraction.replace(/0+$/, "");
  return whole + (trimmed ? `.${trimmed}` : "");
}
const scaled = (value: string) => { const [whole, fraction = ""] = exactDecimal(value).split("."); return BigInt(whole + fraction.padEnd(4, "0")); };
export function totalDifference(values: Pick<CorrectionValues, "quantity" | "unitPrice" | "totalPrice">): string | null {
  const product = scaled(values.quantity) * scaled(values.unitPrice);
  if (product === scaled(values.totalPrice) * BigInt(10000)) return null;
  const text = product.toString().padStart(9, "0");
  return `${text.slice(0, -8)}.${text.slice(-8)}`.replace(/\.?0+$/, "");
}
export function observedDecimal(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  try { return exactDecimal(String(value)); } catch { return null; }
}
export function validateCorrectionInput(raw: unknown): CorrectionInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Correção inválida.");
  const input = raw as Record<string, unknown>;
  if (Object.keys(input).some(key => !["operationId", "values", "justification", "acknowledgeTotalDifference"].includes(key)) ||
      typeof input.operationId !== "string" || !OPERATION_ID.test(input.operationId) ||
      typeof input.justification !== "string" || input.justification.trim().length < 10 || input.justification.length > 2000 ||
      typeof input.acknowledgeTotalDifference !== "boolean" || !input.values || typeof input.values !== "object" || Array.isArray(input.values))
    return fail("Informe UUID da operação, valores e justificativa de 10 a 2.000 caracteres.");
  const row = input.values as Record<string, unknown>;
  if (Object.keys(row).length !== correctionFields.length || Object.keys(row).some(key => !correctionFields.includes(key as CorrectionField)))
    return fail("Campos de correção inválidos.");
  const text = (key: CorrectionField, max: number, optional = false) => {
    const value = row[key];
    if (typeof value !== "string" || value.length > max || (!optional && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return fail(`Campo ${key} inválido.`);
    return value.trim();
  };
  const unit = text("unit", 32);
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._/%²³-]{0,31}$/u.test(unit)) return fail("Unidade de medida inválida.");
  if (row.materialId !== null && (typeof row.materialId !== "string" || !/^[1-9]\d{0,9}$/.test(row.materialId))) return fail("Material Oficial inválido.");
  const values: CorrectionValues = { description: text("description", 4000), quantity: exactDecimal(row.quantity, true), unit,
    unitPrice: exactDecimal(row.unitPrice), totalPrice: exactDecimal(row.totalPrice), supplier: text("supplier", 255),
    materialId: row.materialId as string | null, observation: text("observation", 2000, true) };
  if (totalDifference(values) !== null && !input.acknowledgeTotalDifference)
    return fail("O total difere de quantidade × preço unitário. Confira e reconheça a diferença; nenhum valor será recalculado.");
  return { operationId: input.operationId.toLowerCase(), values, justification: input.justification.trim(), acknowledgeTotalDifference: input.acknowledgeTotalDifference };
}
export function changedFields(previous: ExtractionValues, values: CorrectionValues, original = previous): CorrectionChange[] {
  return correctionFields.filter(field => previous[field] !== values[field]).map(field => ({ field, previous: previous[field], value: values[field], extracted: original[field] }));
}
export function parseCorrectionRecord(raw: unknown): CorrectionRecord | null {
  if (raw === null || raw === undefined || raw === "") return null;
  try {
    if (typeof raw !== "string" || raw.length > 50000) throw new Error();
    const value = JSON.parse(raw) as CorrectionRecord;
    validateCorrectionInput({ operationId: value.operationId, values: value.values, justification: value.justification, acknowledgeTotalDifference: value.acknowledgeTotalDifference });
    if (value.schemaVersion !== 1 || !value.itemId || !value.budgetId || !value.actor?.tenantId || !value.actor.oid ||
        !value.personLookupId || !value.previousVersion || !/^[a-f0-9]{64}$/.test(value.originalHash) ||
        !/^[a-f0-9]{64}$/.test(value.fingerprint) || !Array.isArray(value.changes) || !value.changes.length || value.changes.length > 8 ||
        !Number.isFinite(Date.parse(value.at))) throw new Error();
    return value;
  } catch { throw new DecisionError("Evidência de correção inválida. Escrita bloqueada para reconciliação.", 503, "CORRECTION_EVIDENCE_INVALID"); }
}
