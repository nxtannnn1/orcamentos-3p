// TEST SUPPORT ONLY. No Redis, Graph, fetch, real credentials or runtime factory.
import { randomUUID } from "node:crypto";
import {
  authorize, fingerprint, prepareIntent, reconciliationEvidence, validateSnapshot, ProposalError,
  type ItemSnapshot, type ReopeningIntent, type ReopeningRequest, type ServerSession, type ResolvedPerson,
  type ReopeningPolicy, type ReconciliationEvidence, type DispatchEvidence, type Delivery,
} from "../contract";

export class ReopeningSimulator {
  private remote: ItemSnapshot;
  private intents = new Map<string, ReopeningIntent>();
  private requests = new Map<string, string>();
  private journal: (ReopeningIntent | ReconciliationEvidence | DispatchEvidence)[] = [];
  private dispatched = new Map<string, Delivery>();
  private pending: string | null = null;
  writes = 0;
  redisAvailable = true;
  constructor(state: ItemSnapshot, private readonly now: number) { this.remote = validateSnapshot(state); }
  snapshot() { return structuredClone(this.remote); }
  events() { return structuredClone(this.journal); }
  pendingOperation() { return this.pending; }
  /** Represents a competing writer, used exclusively by tests. */
  externalChange(change: Partial<ItemSnapshot>) { this.remote = { ...this.remote, ...structuredClone(change) }; }
  private append(event: ReopeningIntent | ReconciliationEvidence | DispatchEvidence) {
    if (!this.redisAvailable) throw new ProposalError("AUDIT_UNAVAILABLE");
    this.journal.push(structuredClone(event));
  }
  reserve(request: ReopeningRequest, session: ServerSession, person: ResolvedPerson, policy: ReopeningPolicy) {
    const prior = this.intents.get(request.eventId);
    authorize(session, person, policy, prior?.before.scope ?? this.remote.scope, this.now);
    const key = fingerprint({ request, actor: { tenantId: session.tenantId, oid: session.oid, personLookupId: person.personLookupId },
      scope: this.remote.scope });
    if (prior) {
      if (this.requests.get(request.eventId) !== key) throw new ProposalError("UUID_CONTENT_CONFLICT");
      if (!this.redisAvailable) throw new ProposalError("AUDIT_UNAVAILABLE");
      return structuredClone(prior);
    }
    if (this.pending) throw new ProposalError("OPERATION_PENDING");
    const intent = prepareIntent(request, this.remote, session, person, policy, this.now);
    // Atomic reservation of UUID + item lock + intent in the model. A real atomic store contract is still required.
    this.append(intent);
    this.intents.set(intent.eventId, structuredClone(intent));
    this.requests.set(intent.eventId, key);
    this.pending = intent.eventId;
    return structuredClone(intent);
  }
  private get(id: string) {
    const intent = this.intents.get(id);
    if (!intent) throw new ProposalError("OPERATION_NOT_FOUND");
    return intent;
  }
  private observe(id: string, person: ResolvedPerson, unavailable = false) {
    const intent = this.get(id);
    const evidence = reconciliationEvidence(intent,
      unavailable ? { kind: "unavailable" } : { kind: "item", item: this.remote },
      this.dispatched.get(id) ?? "NOT_SENT", randomUUID(),
      { tenantId: person.tenantId, oid: person.oid, personLookupId: person.personLookupId }, new Date(this.now).toISOString());
    this.append(evidence); // No success is returned if this durable proof fails.
    if (["CONFIRMED", "NOT_PERSISTED"].includes(evidence.outcome) && this.pending === id) this.pending = null;
    return structuredClone(evidence);
  }
  send(id: string, mode: "ok" | "denied" | "timeout-before" | "timeout-after" | "read-failure" | "redis-after" = "ok") {
    const intent = this.get(id);
    if (this.dispatched.has(id)) throw new ProposalError("RECONCILIATION_REQUIRED");
    if (this.pending !== id) throw new ProposalError("RESERVATION_REQUIRED");
    this.append({ schemaVersion: 1, type: "REOPEN_DISPATCH", evidenceId: randomUUID(), operationId: id,
      at: new Date(this.now).toISOString(), intentFingerprint: fingerprint(intent), status: "ATTEMPT_STARTED" });
    this.dispatched.set(id, "UNKNOWN");
    this.writes++;
    const person = { ...intent.actor, siteId: intent.before.scope.siteId };
    if (mode === "denied" || this.remote.etag !== intent.before.etag) {
      this.dispatched.set(id, "REJECTED");
      return this.observe(id, person);
    }
    if (mode === "timeout-before") return this.observe(id, person, true);
    this.remote = { ...structuredClone(intent.after), etag: `"simulated-${id}"` };
    if (mode === "timeout-after") return this.observe(id, person, true);
    this.dispatched.set(id, "ACKNOWLEDGED");
    if (mode === "redis-after") this.redisAvailable = false;
    return this.observe(id, person, mode === "read-failure");
  }
  /** Admin observation only: cannot submit a PATCH, inject an outcome or remove a conflicting event. */
  reconcile(id: string, session: ServerSession, person: ResolvedPerson, adminPolicy: ReopeningPolicy, unavailable = false) {
    const intent = this.get(id);
    authorize(session, person, adminPolicy, intent.before.scope, this.now);
    return this.observe(id, person, unavailable);
  }
}
