import "server-only";
import {
  canonical, validateSnapshot, validateIntent, ProposalError,
  type ItemSnapshot, type Actor, type Scope, type DecisionSnapshot,
} from "../reopening-proposal/contract";
import { validateRejectionJustification } from "../../domain/rejection-justification";
import { CORRECTION_COLUMNS } from "../../domain/item-correction";
import * as correctionValidators from "../sharepoint/correction-state";

/** Isolated persistence proposal, not connected to production repositories. */
export type Snapshot = Omit<ItemSnapshot, "decision"> & { decision: DecisionSnapshot | null };
export type Operation = "APPROVE" | "REJECT" | "REOPEN";
export type Intent = {
  version: 1; operationId: string; operation: Operation; at: string; actor: Actor;
  reason: string; previousDecisionId: string | null; before: Snapshot; intended: Snapshot;
};
export type Observation = {
  delivery: "NOT_SENT" | "REJECTED" | "UNKNOWN" | "ACKNOWLEDGED";
  read: Snapshot | null;
};
type Envelope = {
  version: 1; eventId: string; operationId: string; sequence: number; previousEventId: string | null;
  scope: Scope; at: string; actor: Actor;
};
export type Event = Envelope & (
  { type: "INTENT"; payload: Intent } |
  { type: "DISPATCH"; payload: null } |
  { type: "OBSERVATION" | "RECONCILIATION"; payload: Observation }
);
export type State = "INTENDED" | "UNPROVEN" | "CONFIRMED" | "DIVERGENT" |
  "RECONCILIATION_REQUIRED" | "RECONCILED" | "NOT_PERSISTED" | "DURABLE_AUDIT_FAILURE";
const fail = (): never => { throw new ProposalError("LEDGER_INVALID"); };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const numeric = (v: unknown) => typeof v === "string" && /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v));
const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function exact(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(v)) ||
      Object.keys(v).length !== keys.length || Object.keys(v).some(key => !keys.includes(key))) fail();
}
function actor(v: unknown): asserts v is Actor {
  exact(v, ["tenantId", "oid", "personLookupId"]);
  const guid = (s: unknown) => typeof s === "string" && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);
  if (!guid(v.tenantId) || !guid(v.oid) || !numeric(v.personLookupId)) fail();
}
function rejectSecretKeys(value: unknown, depth = 0) {
  if (depth > 20) fail();
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(authorization|cookie|password|clientsecret|accesstoken|refreshtoken|idtoken|credential)$/i.test(key.replace(/[_-]/g, ""))) fail();
    rejectSecretKeys(child, depth + 1);
  }
}
/** Null decision is valid only for an unreviewed item; no fabricated decision is stored. */
export function snapshot(raw: unknown): Snapshot {
  exact(raw, ["scope", "etag", "status", "budgetStatus", "sentToHistory", "approvedMaterialId", "values", "decision", "correction", "reopeningId"]);
  if (raw.decision !== null) return validateSnapshot(raw);
  exact(raw.scope, ["tenantId", "siteId", "listId", "budgetId", "itemId"]);
  if (typeof raw.scope.tenantId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(raw.scope.tenantId) ||
      !numeric(raw.scope.budgetId) || !numeric(raw.scope.itemId) ||
      ![raw.scope.siteId, raw.scope.listId].every(v => typeof v === "string" && /^[A-Za-z0-9_,.-]{1,512}$/.test(v))) fail();
  if (typeof raw.etag !== "string" || !raw.etag.trim() || raw.etag === "*" || raw.etag.length > 512 || /[\r\n]/.test(raw.etag) ||
      !["PENDENTE", "EM_REVISAO"].includes(String(raw.status)) ||
      typeof raw.budgetStatus !== "string" || raw.budgetStatus.length > 64 ||
      !(raw.sentToHistory === null || typeof raw.sentToHistory === "string" && raw.sentToHistory.length <= 64) ||
      raw.approvedMaterialId !== null || raw.reopeningId !== null) fail();
  const limits = { description: 4000, quantity: 64, unit: 32, unitPrice: 64, totalPrice: 64, supplier: 255, materialId: 32, observation: 2000 };
  exact(raw.values, Object.keys(limits));
  for (const [key, max] of Object.entries(limits)) {
    const value = raw.values[key];
    if (value !== null && (typeof value !== "string" || value.length > max)) fail();
  }
  // Full correction evidence needs the existing M.3 validator; no hash-only substitution.
  if (raw.correction !== null) {
    const { originalEvidence, correctionRecord } = correctionValidators;
    exact(raw.correction, ["operationId", "originalJson", "recordJson"]);
    const c = raw.correction;
    if (!uuid(c.operationId) || typeof c.originalJson !== "string" || c.originalJson.length > 50000 ||
        typeof c.recordJson !== "string" || c.recordJson.length > 50000) fail();
    const item = { id: String(raw.scope.itemId), fields: {
      [CORRECTION_COLUMNS.original]: c.originalJson, [CORRECTION_COLUMNS.record]: c.recordJson, [CORRECTION_COLUMNS.operation]: c.operationId,
    } };
    const original = originalEvidence(item), record = correctionRecord(item);
    if (!original || !record || original.snapshot.budgetId !== raw.scope.budgetId ||
        record.budgetId !== raw.scope.budgetId || record.originalHash !== original.hash) fail();
    for (const json of [c.originalJson, c.recordJson]) rejectSecretKeys(JSON.parse(String(json)));
  }
  return structuredClone(raw) as Snapshot;
}
export function validateIntentRecord(raw: unknown): Intent {
  exact(raw, ["version", "operationId", "operation", "at", "actor", "reason", "previousDecisionId", "before", "intended"]);
  actor(raw.actor);
  if (raw.version !== 1 || !uuid(raw.operationId) || !time(raw.at) ||
      !["APPROVE", "REJECT", "REOPEN"].includes(String(raw.operation))) fail();
  const before = snapshot(raw.before), after = snapshot(raw.intended);
  if (raw.actor.tenantId !== before.scope.tenantId || !same(before.scope, after.scope) ||
      raw.previousDecisionId !== (before.decision?.id ?? null) || after.etag !== before.etag ||
      before.sentToHistory !== "NAO" || !["PENDENTE", "EM_REVISAO"].includes(before.budgetStatus) ||
      before.decision && Date.parse(before.decision.at) > Date.parse(String(raw.at))) fail();
  const intent = raw as Intent;
  if (intent.operationId === before.decision?.id || intent.operationId === before.reopeningId) fail();
  if (intent.operation === "REOPEN") {
    const { etag, ...intended } = after;
    void etag;
    validateIntent({ schemaVersion: 1, type: "REOPEN_INTENT", status: "INTENDED", eventId: intent.operationId,
      at: intent.at, actor: intent.actor, reason: intent.reason, previousDecisionId: intent.previousDecisionId,
      personPolicy: "PRESERVE_PREVIOUS_DECISION", before, after: intended });
  } else {
    if (!["PENDENTE", "EM_REVISAO"].includes(before.status) || typeof intent.reason !== "string" ||
        intent.reason.length > 2000 || intent.reason !== intent.reason.trim()) fail();
    if (intent.operation === "REJECT" && validateRejectionJustification(intent.reason) !== intent.reason) fail();
    const status = intent.operation === "APPROVE" ? "APROVADO" : "REJEITADO";
    if (status === "APROVADO" ? !numeric(after.approvedMaterialId) : after.approvedMaterialId !== null) fail();
    const expected: Snapshot = { ...before, status, approvedMaterialId: after.approvedMaterialId,
      decision: { id: intent.operationId, at: intent.at, actor: intent.actor, status,
        observation: intent.reason, approvedMaterialId: after.approvedMaterialId } };
    if (!same(after, expected)) fail();
  }
  return structuredClone(intent);
}
export function validateEvent(raw: unknown): Event {
  exact(raw, ["version", "eventId", "operationId", "sequence", "previousEventId", "scope", "at", "actor", "type", "payload"]);
  actor(raw.actor);
  if (raw.version !== 1 || !uuid(raw.eventId) || !uuid(raw.operationId) || !time(raw.at) ||
      !Number.isSafeInteger(raw.sequence) || Number(raw.sequence) < 1 ||
      !(raw.previousEventId === null || uuid(raw.previousEventId))) fail();
  const event = raw as Event;
  if (event.type === "INTENT") {
    const intent = validateIntentRecord(event.payload);
    if (intent.operationId !== event.operationId || !same(intent.before.scope, event.scope) ||
        !same(intent.actor, event.actor) || intent.at !== event.at) fail();
  } else if (event.type === "DISPATCH") {
    if (event.payload !== null) fail();
  } else if (event.type === "OBSERVATION" || event.type === "RECONCILIATION") {
    exact(event.payload, ["delivery", "read"]);
    if (!["NOT_SENT", "REJECTED", "UNKNOWN", "ACKNOWLEDGED"].includes(event.payload.delivery)) fail();
    if (event.payload.read !== null) snapshot(event.payload.read);
  } else fail();
  return structuredClone(event);
}
/** Must only receive records verified by the durable adapter. No client-supplied outcomes. */
export function project(records: readonly Event[], auditAvailable: boolean): { state: State; blocked: boolean } {
  if (!auditAvailable) return { state: "DURABLE_AUDIT_FAILURE", blocked: true };
  if (!records.length) return { state: "RECONCILIATION_REQUIRED", blocked: true };
  const events = records.map(validateEvent);
  const first = events[0];
  if (first.type !== "INTENT") return fail();
  const intent = first.payload;
  let dispatched = false;
  let state: State = "INTENDED";
  let blocked = true;
  const ids = new Set<string>();
  for (let index = 0; index < events.length; index++) {
    const event = events[index], previous = events[index - 1];
    if (ids.has(event.eventId) || event.operationId !== intent.operationId ||
        !same(event.scope, intent.before.scope) || event.actor.tenantId !== intent.actor.tenantId ||
        (index === 0 ? event.sequence !== 1 || event.previousEventId !== null :
          event.sequence !== previous.sequence + 1 || event.previousEventId !== previous.eventId || event.at < previous.at)) fail();
    ids.add(event.eventId);
    if (!index) continue;
    if (event.type === "INTENT") return fail();
    if (event.type === "DISPATCH") {
      if (dispatched || state !== "INTENDED" || !same(event.actor, intent.actor)) fail();
      dispatched = true; state = "UNPROVEN"; continue;
    }
    const { read, delivery } = event.payload;
    if ((!dispatched && delivery !== "NOT_SENT") || (dispatched && delivery === "NOT_SENT")) fail();
    blocked = true;
    if (!read) { state = "RECONCILIATION_REQUIRED"; continue; }
    const intended = { ...intent.intended, etag: read.etag };
    if (same(read, intended)) {
      if (delivery === "NOT_SENT" || delivery === "REJECTED") state = "DIVERGENT";
      else if (read.etag === intent.before.etag) state = "RECONCILIATION_REQUIRED";
      else { state = event.type === "RECONCILIATION" ? "RECONCILED" : "CONFIRMED"; blocked = false; }
    } else if (same(read, intent.before)) {
      if (delivery === "NOT_SENT" || delivery === "REJECTED") { state = "NOT_PERSISTED"; blocked = false; }
      else state = "RECONCILIATION_REQUIRED";
    } else state = "DIVERGENT";
  }
  return { state, blocked };
}
