import "server-only";
import { DecisionError } from "../../domain/decision-error";
import type { GraphReadTransport, SharePointRepositoryConfig } from "./sharepoint-types";

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
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

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
  const expectedPath = decodeURIComponent(`/v1.0${path}`);
  const visited = new Set<string>();
  while (path) {
    let url: URL;
    try {
      url = new URL(path.startsWith("https://") ? path : `https://graph.microsoft.com/v1.0${path}`);
      if (url.origin !== "https://graph.microsoft.com" || url.username || url.password || url.hash ||
          decodeURIComponent(url.pathname) !== expectedPath) fail();
    } catch { return fail(); }
    if (visited.has(url.href) || visited.size >= 100) fail();
    visited.add(url.href);
    const page = await graph.get<unknown>(path);
    if (!record(page) || !Array.isArray(page.value) || columns.length + page.value.length > 10_000) return fail();
    for (const entry of page.value) {
      if (!record(entry) || typeof entry.name !== "string" ||
          (entry.readOnly !== undefined && typeof entry.readOnly !== "boolean") ||
          ["text", "dateTime", "personOrGroup", "lookup", "choice"].some(key => entry[key] !== undefined && !record(entry[key]))) return fail();
      if (record(entry.choice) && entry.choice.choices !== undefined &&
          (!Array.isArray(entry.choice.choices) || entry.choice.choices.some(value => typeof value !== "string"))) return fail();
      columns.push(entry as unknown as Column);
    }
    const next = page["@odata.nextLink"];
    if (next !== undefined && (typeof next !== "string" || !next.startsWith("https://"))) return fail();
    path = next as string | undefined;
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
