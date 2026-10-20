import "server-only";
import { createHash } from "node:crypto";
import { validateRejectionJustification } from "../../domain/rejection-justification";
import { CORRECTION_COLUMNS, type ExtractionValues } from "../../domain/item-correction";
import { originalEvidence, correctionRecord } from "../sharepoint/correction-state";

/** Proposed v1 only. No route/factory imports this module. Inputs are server attestations, never browser claims. */
export type Scope = { tenantId: string; siteId: string; listId: string; budgetId: string; itemId: string };
export type Actor = { tenantId: string; oid: string; personLookupId: string };
export type DecisionSnapshot = {
  id: string; at: string; actor: Actor; status: "APROVADO" | "REJEITADO";
  observation: string; approvedMaterialId: string | null;
};
export type ItemSnapshot = {
  scope: Scope; etag: string; status: string; budgetStatus: string; sentToHistory: string | null;
  approvedMaterialId: string | null; values: ExtractionValues; decision: DecisionSnapshot;
  correction: { operationId: string; originalJson: string; recordJson: string } | null;
  reopeningId: string | null;
};
export type IntendedState = Omit<ItemSnapshot, "etag">;
export type ReopeningIntent = {
  schemaVersion: 1; type: "REOPEN_INTENT"; status: "INTENDED"; eventId: string; at: string;
  actor: Actor; reason: string; previousDecisionId: string;
  personPolicy: "PRESERVE_PREVIOUS_DECISION"; before: ItemSnapshot; after: IntendedState;
};
export type ServerSession = {
  validated: boolean; authMode: string; expiresAt: number; tenantId: string; oid: string; roles: string[];
};
export type ResolvedPerson = Actor & { siteId: string };
export type ReopeningRequest = { eventId: string; reason: string; expectedEtag: string };
export type ReopeningPolicy = { tenantId: string; allowedRoles: readonly string[] };
export class ProposalError extends Error {
  constructor(readonly code: string) { super(code); }
}
const fail = (code = "PROPOSAL_INVALID_EVENT"): never => { throw new ProposalError(code); };
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const guid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
const id = (v: unknown) => typeof v === "string" && /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v));
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const tag = (v: unknown) => typeof v === "string" && !!v.trim() && v !== "*" && v.length <= 512 && !/[\r\n]/.test(v);
const time = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function object(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
      Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))) return fail();
  return v as Record<string, unknown>;
}
function actor(v: unknown) {
  const a = object(v, ["tenantId", "oid", "personLookupId"]);
  if (!guid(a.tenantId) || !guid(a.oid) || !id(a.personLookupId)) fail();
}
function scope(v: unknown) {
  const s = object(v, ["tenantId", "siteId", "listId", "budgetId", "itemId"]);
  if (!guid(s.tenantId) || !id(s.itemId) || !id(s.budgetId) ||
      ![s.siteId, s.listId].every(value => typeof value === "string" && /^[A-Za-z0-9_,.-]{1,512}$/.test(value))) fail();
}
// Canonical comparison/hash is an integrity aid; it is not authentication or storage immutability.
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
export const fingerprint = (v: unknown) => createHash("sha256").update(canonical(v)).digest("hex");
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function noSecrets(v: unknown, depth = 0) {
  if (depth > 20) fail();
  if (!v || typeof v !== "object") return;
  for (const [key, value] of Object.entries(v)) {
    if (/^(authorization|cookie|password|clientsecret|accesstoken|refreshtoken|idtoken|credential)$/i.test(key.replace(/[_-]/g, ""))) fail();
    noSecrets(value, depth + 1);
  }
}
export function validateSnapshot(raw: unknown): ItemSnapshot {
  const row = object(raw, ["scope", "etag", "status", "budgetStatus", "sentToHistory", "approvedMaterialId", "values", "decision", "correction", "reopeningId"]);
  scope(row.scope);
  if (!tag(row.etag) || !text(row.status, 64) || !text(row.budgetStatus, 64) ||
      !(row.sentToHistory === null || text(row.sentToHistory, 64)) ||
      !(row.approvedMaterialId === null || id(row.approvedMaterialId)) ||
      !(row.reopeningId === null || uuid(row.reopeningId))) fail();
  const limits = { description: 4000, quantity: 64, unit: 32, unitPrice: 64, totalPrice: 64, supplier: 255, materialId: 32, observation: 2000 };
  const values = object(row.values, Object.keys(limits));
  for (const [key, max] of Object.entries(limits)) if (values[key] !== null && !text(values[key], max)) fail();
  const d = object(row.decision, ["id", "at", "actor", "status", "observation", "approvedMaterialId"]);
  actor(d.actor);
  if (!uuid(d.id) || !time(d.at) || !["APROVADO", "REJEITADO"].includes(String(d.status)) ||
      !text(d.observation, 2000) || !(d.approvedMaterialId === null || id(d.approvedMaterialId))) fail();
  const state = raw as ItemSnapshot;
  if (state.decision.actor.tenantId !== state.scope.tenantId) fail();
  if (row.correction !== null) {
    const c = object(row.correction, ["operationId", "originalJson", "recordJson"]);
    if (!uuid(c.operationId) || !text(c.originalJson, 50000) || !text(c.recordJson, 50000)) fail();
    try {
      noSecrets(JSON.parse(c.originalJson as string)); noSecrets(JSON.parse(c.recordJson as string));
      const item = { id: state.scope.itemId, fields: {
        [CORRECTION_COLUMNS.original]: c.originalJson, [CORRECTION_COLUMNS.record]: c.recordJson, [CORRECTION_COLUMNS.operation]: c.operationId,
      } };
      const original = originalEvidence(item);
      const record = correctionRecord(item);
      if (!original || !record || record.budgetId !== state.scope.budgetId ||
          original.snapshot.budgetId !== state.scope.budgetId || record.originalHash !== original.hash) fail();
    } catch { fail(); }
  }
  return structuredClone(state);
}
export function intendedState(before: ItemSnapshot, eventId: string): IntendedState {
  const { etag, ...rest } = structuredClone(before);
  void etag;
  // Proposed policy: retain previous decision actor and its material snapshot; clear only current association.
  return { ...rest, status: "EM_REVISAO", approvedMaterialId: null, reopeningId: eventId };
}
export function validateIntent(raw: unknown): ReopeningIntent {
  const r = object(raw, ["schemaVersion", "type", "status", "eventId", "at", "actor", "reason", "previousDecisionId", "personPolicy", "before", "after"]);
  if (r.schemaVersion !== 1 || r.type !== "REOPEN_INTENT" || r.status !== "INTENDED" ||
      r.personPolicy !== "PRESERVE_PREVIOUS_DECISION" || !uuid(r.eventId) || !time(r.at)) fail();
  actor(r.actor);
  if (validateRejectionJustification(r.reason) !== r.reason) fail();
  const before = validateSnapshot(r.before);
  const result = raw as ReopeningIntent;
  if (before.decision.id !== r.previousDecisionId || result.actor.tenantId !== before.scope.tenantId ||
      !["APROVADO", "REJEITADO"].includes(before.status) || before.sentToHistory !== "NAO" ||
      !["PENDENTE", "EM_REVISAO"].includes(before.budgetStatus) ||
      before.status !== before.decision.status || before.approvedMaterialId !== before.decision.approvedMaterialId ||
      (before.status === "APROVADO" ? !id(before.approvedMaterialId) : before.approvedMaterialId !== null) ||
      Date.parse(before.decision.at) > Date.parse(result.at) ||
      !same(r.after, intendedState(before, result.eventId))) fail();
  return structuredClone(result);
}
export function authorize(session: ServerSession, person: ResolvedPerson, policy: ReopeningPolicy, scopeValue: Scope, now: number) {
  if (session.validated !== true || session.authMode !== "entra" || !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= now || !Number.isFinite(now)) fail("SESSION_INVALID");
  if (!Array.isArray(policy.allowedRoles) || !policy.allowedRoles.length || !Array.isArray(session.roles) ||
      !session.roles.some(role => policy.allowedRoles.includes(role))) fail("REOPEN_FORBIDDEN");
  actor({ tenantId: person.tenantId, oid: person.oid, personLookupId: person.personLookupId });
  if (session.tenantId !== policy.tenantId || session.tenantId !== scopeValue.tenantId ||
      person.tenantId !== session.tenantId || person.oid !== session.oid || person.siteId !== scopeValue.siteId) fail("IDENTITY_MISMATCH");
}
export function prepareIntent(request: ReopeningRequest, before: ItemSnapshot, session: ServerSession,
  person: ResolvedPerson, policy: ReopeningPolicy, now: number): ReopeningIntent {
  object(request, ["eventId", "reason", "expectedEtag"]);
  const state = validateSnapshot(before);
  authorize(session, person, policy, state.scope, now);
  if (!uuid(request.eventId)) fail();
  if (request.expectedEtag !== state.etag) fail("ETAG_CONFLICT");
  return validateIntent({
    schemaVersion: 1, type: "REOPEN_INTENT", status: "INTENDED", eventId: request.eventId,
    at: new Date(now).toISOString(), actor: { tenantId: person.tenantId, oid: person.oid, personLookupId: person.personLookupId },
    reason: validateRejectionJustification(request.reason), previousDecisionId: state.decision.id,
    personPolicy: "PRESERVE_PREVIOUS_DECISION", before: state, after: intendedState(state, request.eventId),
  });
}
export type RemoteRead = { kind: "item"; item: unknown } | { kind: "missing" | "unavailable" };
export type Delivery = "NOT_SENT" | "REJECTED" | "UNKNOWN" | "ACKNOWLEDGED";
export type Assessment = "CONFIRMED" | "NOT_PERSISTED" | "DIVERGENT" | "INCONCLUSIVE";
export function assess(intentValue: ReopeningIntent, remote: RemoteRead, delivery: Delivery): Assessment {
  const intent = validateIntent(intentValue);
  if (remote.kind !== "item") return "INCONCLUSIVE"; // 404/absence is not proof that a PATCH never happened.
  let state: ItemSnapshot;
  try { state = validateSnapshot(remote.item); } catch { return "INCONCLUSIVE"; }
  if (!same(state.scope, intent.before.scope)) return "DIVERGENT";
  const { etag, ...actual } = state;
  if (same(actual, intent.after)) {
    if (delivery === "NOT_SENT" || delivery === "REJECTED") return "DIVERGENT";
    return etag !== intent.before.etag ? "CONFIRMED" : "INCONCLUSIVE";
  }
  if (same(state, intent.before))
    return delivery === "NOT_SENT" || delivery === "REJECTED" ? "NOT_PERSISTED" : "INCONCLUSIVE";
  return "DIVERGENT";
}
export type ReconciliationEvidence = {
  schemaVersion: 1; type: "REOPEN_RECONCILIATION"; evidenceId: string; operationId: string; at: string;
  reviewer: Actor; intentFingerprint: string; delivery: Delivery; remote: RemoteRead; outcome: Assessment;
};
export type DispatchEvidence = {
  schemaVersion: 1; type: "REOPEN_DISPATCH"; evidenceId: string; operationId: string; at: string;
  intentFingerprint: string; status: "ATTEMPT_STARTED";
};
/** A new append-only evidence record, never a setter for an old outcome. No caller-supplied outcome. */
export function reconciliationEvidence(intent: ReopeningIntent, remote: RemoteRead, delivery: Delivery,
  evidenceId: string, reviewer: Actor, at: string): ReconciliationEvidence {
  if (!uuid(evidenceId) || evidenceId === intent.eventId || !time(at) || Date.parse(at) < Date.parse(intent.at) ||
      !["NOT_SENT", "REJECTED", "UNKNOWN", "ACKNOWLEDGED"].includes(delivery)) fail();
  actor(reviewer);
  if (reviewer.tenantId !== intent.actor.tenantId) fail("IDENTITY_MISMATCH");
  // Malformed provider bodies are discarded, not journaled as arbitrary secret-bearing JSON.
  let safeRemote: RemoteRead = { kind: remote.kind === "missing" ? "missing" : "unavailable" };
  if (remote.kind === "item") {
    try { safeRemote = { kind: "item", item: validateSnapshot(remote.item) }; } catch { /* safe unavailable evidence */ }
  }
  return { schemaVersion: 1, type: "REOPEN_RECONCILIATION", evidenceId, operationId: intent.eventId, at,
    reviewer: structuredClone(reviewer), intentFingerprint: fingerprint(intent), delivery, remote: safeRemote,
    outcome: assess(intent, safeRemote, delivery) };
}
export function validateEvidence(raw: unknown, intent: ReopeningIntent): ReconciliationEvidence {
  const r = object(raw, ["schemaVersion", "type", "evidenceId", "operationId", "at", "reviewer", "intentFingerprint", "delivery", "remote", "outcome"]);
  if (r.schemaVersion !== 1 || r.type !== "REOPEN_RECONCILIATION" || r.operationId !== intent.eventId ||
      r.intentFingerprint !== fingerprint(intent)) fail();
  const e = raw as ReconciliationEvidence;
  object(e.remote, e.remote.kind === "item" ? ["kind", "item"] : ["kind"]);
  if (!["item", "missing", "unavailable"].includes(e.remote.kind)) fail();
  const expected = reconciliationEvidence(intent, e.remote, e.delivery, e.evidenceId, e.reviewer, e.at);
  if (!same(e, expected)) fail();
  return structuredClone(expected);
}
