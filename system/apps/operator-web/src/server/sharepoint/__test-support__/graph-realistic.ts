// Synthetic Graph simulator for isolated tests only. Never imported by production.
import { vi } from "vitest";
import { DecisionError } from "../../../domain/decision-error";
import { SharePointOperatorRepository } from "../sharepoint-operator-repository";
import type { SharePointPersonResolver } from "../person-resolver";
import type { GraphReadTransport, GraphWriteTransport, SharePointRepositoryConfig } from "../sharepoint-types";
import { decisionColumns, syntheticPersonResolver } from "./decision";

/** Value shapes assumed for SharePoint listItem.fields (to be confirmed by read-only homologation, step A):
 * empty values (null, undefined, "") are omitted and DateTime columns have second precision. */
export function sharePointFieldShape(fields: Record<string, unknown>, dateTimeColumns: readonly string[] = []) {
  const shaped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === "") continue;
    shaped[key] = dateTimeColumns.includes(key) && typeof value === "string"
      ? value.replace(/\.\d{1,3}Z$/, "Z") : value;
  }
  return shaped;
}

export const decisionFields = {
  budgets: { code: "Codigo_Orcamento", number: "Numero_Orcamento", supplier: "Fornecedor", date: "Data_Orcamento", status: "Status_Revisao" },
  items: { code: "Codigo_Item", budgetLookupId: "Codigo_Orcamento", itemNumber: "Numero_Item", description: "Descricao_Original", quantity: "Quantidade", unit: "Unidade_Original", unitPrice: "Preco_Unitario", totalPrice: "Preco_Total", status: "Status_Revisao", suggestedMaterialLookupId: "Material_Sugerido_Ref", approvedMaterialLookupId: "Material_Aprovado", observation: "Observacao_Item", reviewedByOid: "Revisado_Por_Oid", reviewedByPerson: "Responsavel_Decisao", reviewedAt: "Data_Decisao", decisionId: "Decisao_Id" },
  materials: { code: "Title", name: "Material", unit: "Unidade_Padrao" },
};
export const decisionConfig: SharePointRepositoryConfig = { tenantId: "tenant", siteId: "site", itemsListId: "items", budgetsListId: "budgets", materialsListId: "materials", fields: decisionFields };
export const decisionActor = { tenantId: "tenant", oid: "human-oid" };
export const decisionMaterial = { id: "22", code: "SYNTHETIC", name: "Synthetic", family: "", unit: "UN" };

type Options = {
  /** Persist like SharePoint (see sharePointFieldShape) instead of echoing the payload verbatim. */
  realistic?: boolean;
  initial?: Record<string, unknown>;
  /** Applied to the persisted fields returned by item reads after the PATCH. */
  readBack?: (fields: Record<string, unknown>) => Record<string, unknown>;
  resolver?: SharePointPersonResolver;
};

/** Single item "1" in budget "10"; ETag increments on every accepted PATCH. */
export function decisionScenario({ realistic = false, initial = {}, readBack, resolver = syntheticPersonResolver }: Options = {}) {
  const base = { Codigo_OrcamentoLookupId: "10", Fornecedor: "Synthetic", Numero_Item: 1, Descricao_Original: "Synthetic",
    Quantidade: 2, Unidade_Original: "UN", Preco_Unitario: 10, Preco_Total: 20, Status_Revisao: "PENDENTE", Enviado_Historico: "NAO" };
  const shape = (fields: Record<string, unknown>) => realistic ? sharePointFieldShape(fields, ["Data_Decisao"]) : fields;
  let persisted = shape({ ...base, ...initial });
  let version = 1;
  const columns = decisionColumns(decisionFields, "materials");
  const get = vi.fn(async (path: string): Promise<unknown> => {
    if (path.endsWith("/columns")) return structuredClone(columns);
    if (path.includes("/items/1?")) {
      const fields = readBack && patch.mock.calls.length ? readBack(structuredClone(persisted)) : structuredClone(persisted);
      return { id: "1", eTag: `"v${version}"`, fields };
    }
    if (path.includes("/lists/materials/")) return { value: [{ id: "22", fields: { Title: "SYNTHETIC", Material: "Synthetic", Unidade_Padrao: "UN" } }] };
    if (path.includes("/lists/budgets/")) return { value: [{ id: "10", fields: { Status_Revisao: "PENDENTE" } }] };
    throw new Error("Unexpected simulated request");
  });
  const patch = vi.fn(async (_path: string, payload: Record<string, unknown>, etag: string) => {
    if (etag !== `"v${version}"`) throw new DecisionError("Conflito", 409, "DECISION_CONFLICT");
    persisted = shape({ ...persisted, ...structuredClone(payload) });
    version++;
    return {};
  });
  const graph = { get: get as GraphReadTransport["get"], patch: patch as GraphWriteTransport["patch"] };
  return { repository: new SharePointOperatorRepository(graph, structuredClone(decisionConfig), resolver), get, patch, columns,
    persisted: () => structuredClone(persisted) };
}
