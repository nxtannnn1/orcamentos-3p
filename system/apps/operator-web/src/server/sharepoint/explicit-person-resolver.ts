import "server-only";
import { DecisionError } from "../../domain/decision-error";
import type { DecisionActor, SharePointPerson, SharePointPersonResolver } from "./person-resolver";

/** Proposed contract. Source ownership/access and refresh policy require TI approval.
 * The source must return a complete authoritative snapshot, never browser input.
 */
export interface ExplicitPersonBinding extends SharePointPerson {
  readonly status: "active" | "revoked";
  readonly evidenceId: string;
  readonly verifiedAt: string;
  readonly expiresAt: string;
}

export interface PersonBindingSource {
  readBindings(): Promise<unknown>;
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const utc = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function validBinding(value: unknown): value is ExplicitPersonBinding {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  return typeof b.tenantId === "string" && guid.test(b.tenantId) &&
    typeof b.oid === "string" && guid.test(b.oid) &&
    typeof b.siteId === "string" && !!b.siteId.trim() && b.siteId === b.siteId.trim() &&
    typeof b.lookupId === "string" && /^[1-9]\d*$/.test(b.lookupId) &&
    Number.isSafeInteger(Number(b.lookupId)) &&
    (b.status === "active" || b.status === "revoked") &&
    typeof b.evidenceId === "string" && !!b.evidenceId.trim() && b.evidenceId.length <= 200 &&
    utc(b.verifiedAt) && utc(b.expiresAt) && Date.parse(b.verifiedAt) < Date.parse(b.expiresAt);
}

/** Deliberately not wired into the factory or environment configuration. */
export class ExplicitPersonResolver implements SharePointPersonResolver {
  constructor(private readonly source: PersonBindingSource, private readonly now = () => Date.now()) {}

  async findCandidates(actor: Readonly<DecisionActor>, siteId: string): Promise<readonly SharePointPerson[]> {
    const unavailable = () => new DecisionError("Fonte de vínculos indisponível ou inválida.", 503, "PERSON_RESOLUTION_UNAVAILABLE");
    if (!guid.test(actor.tenantId) || !guid.test(actor.oid) || !siteId.trim())
      throw new DecisionError("Identidade inválida para resolução.", 403, "PERSON_IDENTITY_MISMATCH");
    let rows: unknown;
    try { rows = await this.source.readBindings(); } catch { throw unavailable(); }
    if (!Array.isArray(rows) || rows.length > 10_000 || !rows.every(validBinding)) throw unavailable();
    const matches = rows.filter(b => b.tenantId.toLowerCase() === actor.tenantId.toLowerCase() &&
      b.oid.toLowerCase() === actor.oid.toLowerCase() && b.siteId === siteId);
    // Even an active + revoked duplicate needs administrative reconciliation.
    if (matches.length > 1) throw new DecisionError("Vínculo duplicado exige conferência administrativa.", 409, "PERSON_AMBIGUOUS");
    const binding = matches[0];
    if (!binding || binding.status === "revoked") return [];
    const now = this.now();
    if (!Number.isFinite(now) || Date.parse(binding.verifiedAt) > now || Date.parse(binding.expiresAt) <= now) throw unavailable();
    // One local Pessoa cannot silently identify two different corporate OIDs.
    if (rows.some(b => b !== binding && b.status === "active" && b.siteId === siteId && b.lookupId === binding.lookupId))
      throw new DecisionError("Pessoa vinculada a identidades conflitantes.", 409, "PERSON_AMBIGUOUS");
    return [Object.freeze({ tenantId: binding.tenantId, oid: binding.oid, siteId, lookupId: binding.lookupId })];
  }
}
