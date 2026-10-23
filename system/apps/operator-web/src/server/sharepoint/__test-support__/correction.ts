// Synthetic transport and ledger for isolated tests only. Never imported by production.
import { vi } from "vitest";
import type { SharePointRepositoryConfig, GraphListItem, GraphWriteTransport } from "../sharepoint-types";
import type { CorrectionInput } from "../../../domain/item-correction";
import { DecisionError } from "../../../domain/decision-error";
import { ItemCorrectionService, RELEASE_CORRECTION_LOCK } from "../item-correction-service";
import { CORRECTION_COLUMNS } from "../../../domain/item-correction";

export const actorM = { tenantId: "11111111-1111-4111-8111-111111111111", oid: "22222222-2222-4222-8222-222222222222", name: "Pessoa Sintética", email: "pessoa.sintetica@example.com" };
/** What correction records keep under `actor`; name and e-mail go to `approver`. */
export const actorIdentityM = { tenantId: actorM.tenantId, oid: actorM.oid };
export const correctionConfig: SharePointRepositoryConfig = { humanCorrections: true, tenantId: actorM.tenantId, siteId: "site", itemsListId: "items", budgetsListId: "budgets", materialsListId: "materials",
  fields: { budgets: { code: "Code", number: "Number", supplier: "Supplier", date: "Date", status: "Status" },
    items: { code: "Code", budgetLookupId: "Budget", itemNumber: "Number", description: "Description", quantity: "Quantity", unit: "Unit", unitPrice: "Price", totalPrice: "Total", supplier: "Supplier", status: "Status_Revisao", suggestedMaterialLookupId: "Suggested", approvedMaterialLookupId: "Material_Aprovado", observation: "Observation", reviewedByOid: "Oid", approverName: "ApproverName", approverEmail: "ApproverEmail", reviewedByPerson: "Person", reviewedAt: "At", decisionId: "Decision" },
    materials: { code: "Title", name: "Material", unit: "Unit" } } };
export const correctionInput: CorrectionInput = { operationId: "33333333-3333-4333-8333-333333333333", values: {
  description: "Descrição humana", quantity: "2.5", unit: "UN", unitPrice: "0.1", totalPrice: "0.25", supplier: "Fornecedor sintético", materialId: "22", observation: "Conferido" }, justification: "Corrigir extração OCR conforme documento de teste.", acknowledgeTotalDifference: false };
export function correctionFixture() {
  const config = structuredClone(correctionConfig);
  const row: GraphListItem = { id: "1", eTag: '"v1"', fields: { BudgetLookupId: "10", Number: 1, Description: "Texto IA", Quantity: 2, Unit: "UN", Price: 0.1, Total: 0.2, Supplier: "Fornecedor IA", Observation: "", Status_Revisao: "PENDENTE", Enviado_Historico: "NAO", DriveFileId: "synthetic-opaque-reference" } };
  const ledger = new Map<string, string>();
  const command = vi.fn(async (args: (string | number)[]): Promise<unknown> => {
    const [op, key, value] = args;
    if (op === "GET") return ledger.get(String(key)) ?? null;
    if (op === "SET") { if (args.includes("NX") && ledger.has(String(key))) return null; ledger.set(String(key), String(value)); return "OK"; }
    if (op === "EVAL" && key === RELEASE_CORRECTION_LOCK) { if (ledger.get(String(args[3])) !== String(args[4])) return 0; return ledger.delete(String(args[3])) ? 1 : 0; }
    throw new Error("Unexpected synthetic ledger command");
  });
  const columns = [
    ...["Description", "Unit", "Supplier", "Observation"].map(name => ({ name, text: {} })),
    { name: "Quantity", number: {} }, { name: "Price", currency: {} }, { name: "Total", currency: {} },
    { name: "Status_Revisao", choice: { choices: ["PENDENTE", "EM_REVISAO", "CORRIGIR", "APROVADO", "REJEITADO"] } },
    { name: "Enviado_Historico", choice: { choices: ["NAO", "SIM"] } },
    { name: "Material_Aprovado", lookup: { listId: "materials", allowMultipleValues: false } },
    ...Object.values(CORRECTION_COLUMNS).map(name => ({ name, text: name === CORRECTION_COLUMNS.operation ? {} : { allowMultipleLines: true, textType: "plain" } })),
  ];
  let mode: "ok" | "before" | "after" | "denied" = "ok";
  let version = 1;
  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path.endsWith("/columns")) return { value: columns };
    if (path.includes("/lists/items/items/1?")) return structuredClone(row);
    if (path.includes("/lists/budgets/items/10?")) return { id: "10", fields: { Status: "PENDENTE" } };
    if (path.includes("/lists/materials/items/22?")) return { id: "22", fields: { Title: "SYNTHETIC", Material: "Material sintético", Unit: "UN" } };
    throw new Error(`Unexpected synthetic read: ${path}`);
  });
  const patch = vi.fn(async (_path: string, fields: Record<string, unknown>, etag: string) => {
    if (mode === "denied") throw new DecisionError("Sem permissão de escrita.", 403, "GRAPH_WRITE_FORBIDDEN");
    if (mode === "before") throw new Error("Transport unavailable before commit");
    if (etag !== row.eTag) throw new DecisionError("Concurrent modification", 409, "DECISION_CONFLICT");
    row.fields = { ...row.fields, ...JSON.parse(JSON.stringify(fields)) };
    row.eTag = `"v${++version}"`;
    if (mode === "after") throw new Error("Response lost after commit");
    return { "@odata.etag": row.eTag };
  });
  const graph = { get: get as GraphWriteTransport["get"], patch: patch as GraphWriteTransport["patch"] };
  return { config, row, ledger, command, columns, get, patch, graph,
    service: new ItemCorrectionService(graph, config, command), setMode: (value: typeof mode) => { mode = value; } };
}
