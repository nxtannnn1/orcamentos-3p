import { ApiError } from "./errors";
function invalid(): never { throw new ApiError(400, "INVALID_QUERY", "Parâmetros inválidos."); }
export function positiveId(value: string) {
  if (!/^[1-9][0-9]{0,9}$/.test(value)) invalid();
  const parsed = Number(value);
  if (parsed > 2_147_483_647) invalid();
  return parsed;
}
export function queryOptions(url: string, searchable = false) {
  if (url.length > 2048) invalid();
  const params = new URL(url).searchParams;
  const allowed = searchable ? ["limit", "after", "q"] : ["limit", "after"];
  for (const key of params.keys())
    if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid();
  const rawLimit = params.get("limit") ?? "50";
  if (!/^[1-9][0-9]{0,2}$/.test(rawLimit) || Number(rawLimit) > 100) invalid();
  const after = params.has("after") ? positiveId(params.get("after")!) : 0;
  const q = params.get("q")?.trim() ?? "";
  if (q.length > 100 || /[\u0000-\u001f\u007f]/.test(q)) invalid();
  return { limit: Number(rawLimit), after, q };
}
export function requireEmptyQuery(url: string) {
  if (url.length > 2048 || new URL(url).search) invalid();
}
export function literalSearch(value: string) {
  return "%" + value.replace(/[\\%_]/g, character => "\\" + character) + "%";
}
export function page<T extends { id: number }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const data = rows.slice(0, limit);
  return { data, pagination: { limit, nextAfter: more ? String(data.at(-1)!.id) : null } };
}
