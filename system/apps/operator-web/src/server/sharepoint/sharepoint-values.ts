import "server-only";
import { DecisionError } from "../../domain/decision-error";

/** Columns whose existence and type were verified by a fresh metadata read in this operation.
 * Issued only by the schema validators; a column outside the proof is never normalized. */
export type VerifiedColumns = Readonly<{ names: ReadonlySet<string> }>;
const issued = new WeakSet<VerifiedColumns>();

export function issueColumnProof(names: Iterable<string>): VerifiedColumns {
  const proof = Object.freeze({ names: new Set(names) });
  issued.add(proof);
  return proof;
}
function requireColumn(proof: VerifiedColumns, column: string) {
  if (!issued.has(proof) || !proof.names.has(column))
    throw new DecisionError("Coluna sem verificação de esquema nesta operação.", 503, "SCHEMA_PROOF_REQUIRED");
}

/** Graph omits empty fields from listItem.fields. Only for a verified lookup column,
 * an absent `<column>LookupId` is the empty lookup (null); any present value is returned as-is. */
export function verifiedLookupField(fields: Record<string, unknown>, column: string, proof: VerifiedColumns): unknown {
  requireColumn(proof, column);
  const key = `${column}LookupId`;
  return Object.hasOwn(fields, key) ? fields[key] : null;
}

/** For a verified text column, absent and null both mean the empty text; other values are returned as-is. */
export function verifiedTextField(fields: Record<string, unknown>, column: string, proof: VerifiedColumns): unknown {
  requireColumn(proof, column);
  const value = Object.hasOwn(fields, column) ? fields[column] : null;
  return value === null ? "" : value;
}

/** SharePoint DateTime has second precision. Writing whole seconds (canonical ISO, ".000Z")
 * keeps the read-back instant comparison exact. */
export function decisionTimestamp(now = Date.now()): string {
  return new Date(Math.floor(now / 1000) * 1000).toISOString();
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
/** Exact instant equality between two explicit UTC ISO strings; no tolerance window. */
export function sameUtcInstant(read: unknown, written: string): boolean {
  return typeof read === "string" && UTC_INSTANT.test(read) && UTC_INSTANT.test(written) &&
    Number.isFinite(Date.parse(written)) && Date.parse(read) === Date.parse(written);
}
