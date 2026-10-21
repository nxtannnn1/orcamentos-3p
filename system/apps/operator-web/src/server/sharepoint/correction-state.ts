import "server-only";
import { createHash } from "node:crypto";
import { DecisionError } from "../../domain/decision-error";
import { CORRECTION_COLUMNS, exactDecimal, observedDecimal, parseCorrectionRecord, type ExtractionEvidence, type ExtractionValues, type CorrectionValues } from "../../domain/item-correction";
import type { GraphListItem, GraphReadTransport, SharePointRepositoryConfig } from "./sharepoint-types";
import { issueColumnProof, type VerifiedColumns } from "./sharepoint-values";

export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const textValue = (value: unknown): string | null => typeof value === "string" ? value : null;
export const lookupValue = (row: Record<string, unknown>, field: string): string | null => {
  const value = row[`${field}LookupId`] ?? row[field];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? String(value) : textValue(value);
};
export function extractionValues(row: GraphListItem, config: SharePointRepositoryConfig): ExtractionValues {
  const f = config.fields.items;
  return { description: textValue(row.fields[f.description]), quantity: observedDecimal(row.fields[f.quantity]), unit: textValue(row.fields[f.unit]),
    unitPrice: observedDecimal(row.fields[f.unitPrice]), totalPrice: observedDecimal(row.fields[f.totalPrice]), supplier: textValue(row.fields[f.supplier ?? "Fornecedor"]),
    materialId: lookupValue(row.fields, f.approvedMaterialLookupId), observation: textValue(row.fields[f.observation]) ?? "" };
}
export function originalEvidence(row: GraphListItem): ExtractionEvidence | null {
  const raw = row.fields[CORRECTION_COLUMNS.original];
  if (raw === undefined || raw === null || raw === "") return null;
  try {
    if (typeof raw !== "string" || raw.length > 50000) throw new Error();
    const evidence = JSON.parse(raw) as ExtractionEvidence;
    if (evidence.schemaVersion !== 1 || evidence.hash !== digest(evidence.snapshot) || evidence.snapshot.itemId !== row.id ||
        !evidence.snapshot.values || !evidence.snapshot.version || !Number.isFinite(Date.parse(evidence.capturedAt))) throw new Error();
    return evidence;
  } catch { throw new DecisionError("Extração original inconsistente. Reconciliação necessária.", 503, "ORIGINAL_EVIDENCE_INVALID"); }
}
export function correctionRecord(row: GraphListItem) {
  const record = parseCorrectionRecord(row.fields[CORRECTION_COLUMNS.record]);
  const marker = row.fields[CORRECTION_COLUMNS.operation];
  if ((record && (record.operationId !== marker || record.itemId !== row.id)) || (!record && marker))
    throw new DecisionError("Marcador de correção divergente.", 503, "CORRECTION_EVIDENCE_INVALID");
  return record;
}
export function matchesCorrectedFields(row: GraphListItem, values: CorrectionValues, config: SharePointRepositoryConfig) {
  const current = extractionValues(row, config);
  // Pending correction selects a material in its record; it never pre-approves a lookup.
  return Object.entries(values).every(([field, value]) => field === "materialId" || current[field as keyof ExtractionValues] === value);
}
export function decimalJson(value: string): unknown {
  const api = JSON as typeof JSON & { rawJSON?: (value: string) => unknown };
  if (!api.rawJSON) throw new DecisionError("Runtime sem transporte decimal exato.", 503, "EXACT_DECIMAL_RUNTIME_REQUIRED");
  return api.rawJSON(exactDecimal(value));
}
export async function validateCorrectionSchema(graph: GraphReadTransport, config: SharePointRepositoryConfig) {
  await verifyCorrectionColumns(graph, config);
}
/** Same validation, returning proof of the verified columns for read-back normalization. */
export async function verifyCorrectionColumns(graph: GraphReadTransport, config: SharePointRepositoryConfig): Promise<VerifiedColumns> {
  type Column = { name: string; readOnly?: boolean; text?: { allowMultipleLines?: boolean; textType?: string }; number?: object; currency?: object; choice?: { choices?: string[] }; lookup?: { listId?: string; allowMultipleValues?: boolean } };
  const rows: Column[] = [];
  const visited = new Set<string>();
  let path: string | undefined = `/sites/${encodeURIComponent(config.siteId)}/lists/${encodeURIComponent(config.itemsListId)}/columns`;
  while (path) {
    if (visited.has(path) || visited.size >= 20) throw new DecisionError("Metadados de correção indisponíveis.", 503, "CORRECTION_SCHEMA_REQUIRED");
    visited.add(path);
    const page: { value: Column[]; "@odata.nextLink"?: string } = await graph.get(path);
    if (!Array.isArray(page.value) || rows.length + page.value.length > 2000) throw new DecisionError("Metadados inválidos.", 503, "CORRECTION_SCHEMA_REQUIRED");
    rows.push(...page.value); path = page["@odata.nextLink"];
  }
  for (const name of Object.values(CORRECTION_COLUMNS)) {
    const matches = rows.filter(column => column.name === name);
    const column = matches[0];
    if (matches.length !== 1 || column.readOnly || !column.text ||
      (name !== CORRECTION_COLUMNS.operation && (column.text.allowMultipleLines !== true || column.text.textType !== "plain")) ||
      (name === CORRECTION_COLUMNS.operation && column.text.allowMultipleLines === true))
      throw new DecisionError("Colunas de correção ainda não homologadas. Nenhuma gravação enviada.", 503, "CORRECTION_SCHEMA_REQUIRED");
  }
  const names = [config.fields.items.description, config.fields.items.quantity, config.fields.items.unit, config.fields.items.unitPrice,
    config.fields.items.totalPrice, config.fields.items.supplier ?? "Fornecedor", config.fields.items.observation];
  if (new Set(names).size !== names.length || names.some(name => Object.values(CORRECTION_COLUMNS).includes(name as typeof CORRECTION_COLUMNS[keyof typeof CORRECTION_COLUMNS])))
    throw new DecisionError("Mapa de campos de correção conflitante.", 503, "CORRECTION_SCHEMA_REQUIRED");
  const f = config.fields.items;
  const column = (name: string) => rows.find(value => value.name === name && !value.readOnly);
  if (!column(f.description)?.text || !column(f.unit)?.text || !column(f.supplier ?? "Fornecedor")?.text || !column(f.observation)?.text ||
      !column(f.quantity)?.number || !column(f.unitPrice)?.currency || !column(f.totalPrice)?.currency ||
      f.status !== "Status_Revisao" || f.approvedMaterialLookupId !== "Material_Aprovado" ||
      !column("Status_Revisao")?.choice?.choices?.includes("EM_REVISAO") ||
      !column("Enviado_Historico")?.choice?.choices?.includes("NAO"))
    throw new DecisionError("Tipos ou estado dos campos efetivos incompatíveis.", 503, "CORRECTION_SCHEMA_REQUIRED");
  const lookup = column("Material_Aprovado")?.lookup;
  if (!lookup?.listId || lookup.allowMultipleValues !== false || lookup.listId.replace(/[{}]/g, "").toLowerCase() !== config.materialsListId.replace(/[{}]/g, "").toLowerCase())
    throw new DecisionError("Lookup de material incompatível.", 503, "CORRECTION_SCHEMA_REQUIRED");
  return issueColumnProof([...names, ...Object.values(CORRECTION_COLUMNS), "Status_Revisao", "Enviado_Historico", "Material_Aprovado"]);
}
