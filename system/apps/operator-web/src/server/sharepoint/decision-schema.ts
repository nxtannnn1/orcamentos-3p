import "server-only";
import { DecisionError } from "../../domain/decision-error";
import type { GraphCollection, GraphReadTransport, SharePointRepositoryConfig } from "./sharepoint-types";

interface Column {
  name: string;
  readOnly?: boolean;
  text?: object;
  dateTime?: object;
  personOrGroup?: { allowMultipleSelection?: boolean; chooseFromType?: string };
  lookup?: { listId?: string; allowMultipleValues?: boolean };
  choice?: { choices?: string[] };
}

const fail = (): never => {
  throw new DecisionError("Colunas de decisão ausentes, incompatíveis ou sem configuração válida.", 503, "AUDIT_NOT_CONFIGURED");
};

export function decisionFieldNames(config: SharePointRepositoryConfig) {
  const { reviewedByOid, reviewedByPerson, reviewedAt, decisionId } = config.fields.items;
  const names = [reviewedByOid, reviewedByPerson, reviewedAt, decisionId];
  const protectedNames = Object.entries(config.fields.items)
    .filter(([key]) => !["reviewedByOid", "reviewedByPerson", "reviewedAt", "decisionId"].includes(key))
    .map(([, value]) => value);
  const reserved = ["Material_Aprovado", "Material_AprovadoLookupId", "Status_Revisao", "Observacao_Item", "__proto__", "constructor", "prototype"];
  if (names.some(name => typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name) ||
      protectedNames.includes(name) || reserved.includes(name)) || new Set(names).size !== names.length)
    fail();
  const writeKeys = [reviewedByOid!, `${reviewedByPerson!}LookupId`, reviewedAt!, decisionId!];
  if (new Set(writeKeys).size !== writeKeys.length || writeKeys.some(key => reserved.includes(key))) fail();
  return { reviewedByOid: reviewedByOid!, reviewedByPerson: reviewedByPerson!, reviewedAt: reviewedAt!, decisionId: decisionId! };
}

/** Fresh metadata before each write; no persistent cache that can hide schema changes. */
export async function validateDecisionSchema(graph: GraphReadTransport, config: SharePointRepositoryConfig) {
  const names = decisionFieldNames(config);
  const columns: Column[] = [];
  let path: string | undefined = `/sites/${encodeURIComponent(config.siteId)}/lists/${encodeURIComponent(config.itemsListId)}/columns`;
  const visited = new Set<string>();
  while (path) {
    if (visited.has(path) || visited.size >= 100) fail();
    visited.add(path);
    const page: GraphCollection<Column> = await graph.get(path);
    if (!Array.isArray(page.value) || columns.length + page.value.length > 10_000) fail();
    columns.push(...page.value);
    path = page["@odata.nextLink"];
  }
  const column = (name: string) => {
    const matches = columns.filter(c => c.name === name);
    if (matches.length !== 1 || matches[0].readOnly) return fail();
    return matches[0];
  };
  const oid = column(names.reviewedByOid);
  const date = column(names.reviewedAt);
  const id = column(names.decisionId);
  const person = column(names.reviewedByPerson);
  if (!oid.text || oid.personOrGroup || !date.dateTime || !id.text ||
      !person.personOrGroup || person.personOrGroup.allowMultipleSelection !== false ||
      person.personOrGroup.chooseFromType !== "peopleOnly") fail();
  const lookup = column("Material_Aprovado").lookup;
  const normalize = (value: string) => value.replace(/[{}]/g, "").toLowerCase();
  if (!lookup?.listId || lookup.allowMultipleValues !== false ||
      normalize(lookup.listId) !== normalize(config.materialsListId)) fail();
  const choices = column("Status_Revisao").choice?.choices;
  if (!choices?.includes("APROVADO") || !choices.includes("REJEITADO") || !column("Observacao_Item").text) fail();
}
