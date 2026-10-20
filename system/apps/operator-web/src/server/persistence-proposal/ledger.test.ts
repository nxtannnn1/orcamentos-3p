import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { randomUUID } from "node:crypto";
import { snapshot as previous, session, person, now, request, tenant } from "../reopening-proposal/__test-support__/fixtures";
import { prepareIntent } from "../reopening-proposal/contract";
import { guard, actions, grants, type Action } from "./permissions";
import { project, snapshot, validateEvent, validateIntentRecord, type Event, type Intent, type Operation, type Snapshot } from "./ledger";
import { MemoryLedger } from "./__test-support__/memory-ledger";
import { correctionFixture, correctionInput, actorM } from "../sharepoint/__test-support__/correction";
import { CORRECTION_COLUMNS } from "../../domain/item-correction";

function intent(operation: Operation = "REOPEN"): Intent {
  const before: Snapshot = previous();
  const actor = { tenantId: person.tenantId, oid: person.oid, personLookupId: person.personLookupId };
  let intended: Snapshot;
  if (operation === "REOPEN") {
    const proposal = prepareIntent(request, previous(), session, person, { tenantId: tenant, allowedRoles: session.roles }, now);
    intended = { ...proposal.after, etag: before.etag };
  } else {
    before.status = "EM_REVISAO"; before.decision = null; before.approvedMaterialId = null;
    const status = operation === "APPROVE" ? "APROVADO" : "REJEITADO";
    const material = operation === "APPROVE" ? "22" : null;
    intended = { ...before, status, approvedMaterialId: material,
      decision: { id: request.eventId, at: new Date(now).toISOString(), actor, status, observation: request.reason, approvedMaterialId: material } };
  }
  return { version: 1, operationId: request.eventId, operation, at: new Date(now).toISOString(), actor,
    reason: request.reason, previousDecisionId: before.decision?.id ?? null, before, intended };
}
function begin(value = intent()): Event {
  return { version: 1, eventId: randomUUID(), operationId: value.operationId, sequence: 1, previousEventId: null,
    scope: value.before.scope, at: value.at, actor: value.actor, type: "INTENT", payload: value };
}
function next(first: Event, type: "DISPATCH" | "OBSERVATION" | "RECONCILIATION", read: Snapshot | null = null,
  delivery: "UNKNOWN" | "REJECTED" | "NOT_SENT" | "ACKNOWLEDGED" = "UNKNOWN"): Event {
  const base = { ...first, eventId: randomUUID(), sequence: first.sequence + 1, previousEventId: first.eventId };
  return type === "DISPATCH" ? { ...base, type, payload: null } : { ...base, type, payload: { read, delivery } };
}
const remote = (value: Intent) => ({ ...structuredClone(value.intended), etag: '"v2"' });

describe("M.4 permissions proposal", () => {
  for (const [role, permissions] of Object.entries(grants)) {
    it.each(actions)(`${role}: %s follows explicit matrix`, action => {
      const run = () => guard(action, { ...session, roles: [role] }, person, previous().scope,
        { scope: previous().scope, oid: session.oid, allowed: true }, tenant, now);
      if (permissions.includes(action)) expect(run).not.toThrow(); else expect(run).toThrow();
    });
  }
  it.each(["scope", "oid", "denied", "expired", "tenant", "person", "bypass", "unknown"])("fails closed: %s", issue => {
    const s = { ...session, roles: ["Reconciliador"] }, p = { ...person };
    const resource = { scope: previous().scope, oid: session.oid, allowed: true };
    if (issue === "scope") resource.scope = { ...resource.scope, budgetId: "99" };
    if (issue === "oid") resource.oid = randomUUID();
    if (issue === "denied") resource.allowed = false;
    if (issue === "expired") s.expiresAt = now;
    if (issue === "tenant") s.tenantId = randomUUID();
    if (issue === "person") p.oid = randomUUID();
    if (issue === "bypass") s.authMode = "bypass";
    if (issue === "unknown") s.roles = ["Administrador"];
    expect(() => guard("reconcile", s, p, previous().scope, resource, tenant, now)).toThrow();
  });
  it("no role can force a confirmation", () => {
    expect(() => guard("forceConfirm" as Action, { ...session, roles: Object.keys(grants) }, person,
      previous().scope, { scope: previous().scope, oid: session.oid, allowed: true }, tenant, now)).toThrow();
  });
});
describe("M.4 ledger contracts and simulated durability", () => {
  it.each(["APPROVE", "REJECT", "REOPEN"] as const)("validates full %s intent", operation => {
    expect(validateIntentRecord(intent(operation))).toEqual(intent(operation));
  });
  it("preserves original decision actor/date/UUID/content on reopening", () => {
    const value = intent();
    expect(value.intended.decision).toEqual(value.before.decision);
    expect(value.intended.decision?.actor).not.toEqual(value.actor);
    expect(value.intended.approvedMaterialId).toBeNull();
    expect(value.intended.values).toEqual(value.before.values);
  });
  it.each(["version", "secret", "author", "history", "previous", "etag", "date", "status"])("rejects malformed intent: %s", issue => {
    const value = intent();
    const bad = value as unknown as Record<string, unknown>;
    if (issue === "version") bad.version = 2;
    if (issue === "secret") bad.access_token = "synthetic";
    if (issue === "author") value.intended.decision!.actor = value.actor;
    if (issue === "history") value.before.sentToHistory = null;
    if (issue === "previous") value.previousDecisionId = randomUUID();
    if (issue === "etag") value.intended.etag = '"invented"';
    if (issue === "date") value.at = "yesterday";
    if (issue === "status") value.intended.status = "APROVADO";
    expect(() => validateIntentRecord(bad)).toThrow();
  });
  it.each(["", "short", "x".repeat(2001)])("reject requires bounded justification", reason => {
    const value = intent("REJECT"); value.reason = reason; value.intended.decision!.observation = reason;
    expect(() => validateIntentRecord(value)).toThrow();
  });
  it("does not fabricate history for first approval", () => {
    expect(snapshot(intent("APPROVE").before).decision).toBeNull();
    expect(() => snapshot({ ...intent("APPROVE").before, status: "APROVADO" })).toThrow();
  });
  it.each(["APPROVE", "REJECT", "REOPEN"] as const)("confirms %s only after matching reread", operation => {
    const value = intent(operation), first = begin(value), dispatch = next(first, "DISPATCH");
    expect(project([first], true)).toEqual({ state: "INTENDED", blocked: true });
    expect(project([first, dispatch], true)).toEqual({ state: "UNPROVEN", blocked: true });
    expect(project([first, dispatch, next(dispatch, "OBSERVATION", remote(value), "ACKNOWLEDGED")], true))
      .toEqual({ state: "CONFIRMED", blocked: false });
  });
  it.each(["uuid", "person", "item", "budget", "material", "status", "content"])("reread divergence: %s", issue => {
    const value = intent(), first = begin(value), dispatch = next(first, "DISPATCH"), read = remote(value);
    if (issue === "uuid") read.reopeningId = randomUUID();
    if (issue === "person") read.decision!.actor.personLookupId = "99";
    if (issue === "item") read.scope.itemId = "99";
    if (issue === "budget") read.scope.budgetId = "99";
    if (issue === "material") read.approvedMaterialId = "99";
    if (issue === "status") read.status = "REJEITADO";
    if (issue === "content") read.values.description = "changed";
    expect(project([first, dispatch, next(dispatch, "RECONCILIATION", read)], true).state).toBe("DIVERGENT");
  });
  it("timeout blocks new UUID; reconciliation appends proof without dispatch", () => {
    const value = intent(), first = begin(value), dispatch = next(first, "DISPATCH");
    const uncertain = next(dispatch, "OBSERVATION");
    const store = new MemoryLedger(value.before.scope);
    store.append(first, null); store.append(dispatch, first.eventId); store.append(uncertain, dispatch.eventId);
    expect(project(store.events(), true).state).toBe("RECONCILIATION_REQUIRED");
    expect(() => store.append(begin({ ...value, operationId: randomUUID() }), uncertain.eventId)).toThrow();
    const proof = next(uncertain, "RECONCILIATION", remote(value));
    store.append(proof, uncertain.eventId);
    expect(project(store.events(), true)).toEqual({ state: "RECONCILED", blocked: false });
    expect(store.events()[2]).toEqual(uncertain);
    expect(store.events().filter(e => e.type === "DISPATCH")).toHaveLength(1);
  });
  it.each([null, "before", "same-etag"] as const)("missing/old read cannot prove success: %s", mode => {
    const value = intent(), first = begin(value), dispatch = next(first, "DISPATCH");
    const read = mode === null ? null : mode === "before" ? value.before : value.intended;
    expect(project([first, dispatch, next(dispatch, "RECONCILIATION", read)], true).blocked).toBe(true);
  });
  it("explicit rejection plus unchanged state proves non-persistence", () => {
    const value = intent(), first = begin(value), dispatch = next(first, "DISPATCH");
    expect(project([first, dispatch, next(dispatch, "OBSERVATION", value.before, "REJECTED")], true))
      .toEqual({ state: "NOT_PERSISTED", blocked: false });
  });
  it("audit outage masks even matching success", () => {
    const value = intent(), first = begin(value), dispatch = next(first, "DISPATCH");
    expect(project([first, dispatch, next(dispatch, "OBSERVATION", remote(value))], false))
      .toEqual({ state: "DURABLE_AUDIT_FAILURE", blocked: true });
  });
  it.each(["sequence", "parent", "duplicate", "second-dispatch", "false-not-sent", "forced-outcome"])("rejects invalid stream: %s", issue => {
    const first = begin(), dispatch = next(first, "DISPATCH"), observation = next(dispatch, "OBSERVATION");
    const events: Event[] = [first, dispatch, observation];
    if (issue === "sequence") observation.sequence++;
    if (issue === "parent") observation.previousEventId = randomUUID();
    if (issue === "duplicate") observation.eventId = first.eventId;
    if (issue === "second-dispatch") events[2] = next(dispatch, "DISPATCH");
    if (issue === "false-not-sent") events[2] = next(dispatch, "OBSERVATION", null, "NOT_SENT");
    if (issue === "forced-outcome") (observation as unknown as Record<string, unknown>).outcome = "CONFIRMED";
    expect(() => project(events, true)).toThrow();
  });
  it("duplicate same event returns original; changed content conflicts", () => {
    const first = begin(), store = new MemoryLedger(first.scope);
    store.append(first, null);
    expect(store.append(first, null)).toEqual(first);
    expect(store.events()).toHaveLength(1);
    expect(() => store.append({ ...first, at: "2026-10-21T15:00:00.000Z",
      payload: { ...(first as Event & { type: "INTENT" }).payload, at: "2026-10-21T15:00:00.000Z" } }, null)).toThrow("UUID_CONTENT_CONFLICT");
  });
  it("two appenders contend via expected head; rejected event is not stored", () => {
    const first = begin(), store = new MemoryLedger(first.scope);
    store.append(first, null);
    expect(() => store.append(next(first, "DISPATCH"), null)).toThrow("CAS_CONFLICT");
    expect(store.events()).toEqual([first]);
  });
  it.each(["before", "after"] as const)("lost audit response: %s commit", failure => {
    const first = begin(), store = new MemoryLedger(first.scope);
    expect(() => store.append(first, null, failure)).toThrow("DURABLE_AUDIT_FAILURE");
    expect(store.events()).toHaveLength(failure === "after" ? 1 : 0);
    store.append(first, null);
    expect(store.events()).toEqual([first]);
  });
  it("immutable snapshots and unknown event types", () => {
    const first = begin(), store = new MemoryLedger(first.scope);
    store.append(first, null); const copy = store.events(); copy[0].actor.oid = randomUUID();
    expect(store.events()[0]).toEqual(first);
    expect(() => validateEvent({ ...first, type: "FORCE_CONFIRM" })).toThrow();
  });
  it("first decision preserves full human correction evidence", async () => {
    const correction = correctionFixture();
    await correction.service.save("1", correctionInput, { actor: actorM, version: '"v1"' });
    const value = intent("APPROVE");
    const evidence = { operationId: correctionInput.operationId,
      originalJson: String(correction.row.fields[CORRECTION_COLUMNS.original]),
      recordJson: String(correction.row.fields[CORRECTION_COLUMNS.record]) };
    value.before.correction = evidence; value.intended.correction = structuredClone(evidence);
    expect(validateIntentRecord(value).before.correction).toEqual(evidence);
    value.intended.correction = null;
    expect(() => validateIntentRecord(value)).toThrow();
  });
  it("cannot reuse the prior decision UUID for reopening", () => {
    const value = intent();
    value.operationId = value.before.decision!.id; value.intended.reopeningId = value.operationId;
    expect(() => validateIntentRecord(value)).toThrow();
  });
  it("cannot dispatch after contradictory evidence, even if no attempt was sent", () => {
    const first = begin(), read = previous(); read.values.description = "changed";
    const observation = next(first, "OBSERVATION", read, "NOT_SENT");
    expect(project([first, observation], true).state).toBe("DIVERGENT");
    expect(() => project([first, observation, next(observation, "DISPATCH")], true)).toThrow();
  });
  it("a new decision requires terminal proof and the exact last observed snapshot", () => {
    const value = intent(), first = begin(value), dispatch = next(first, "DISPATCH"), read = remote(value);
    const proof = next(dispatch, "OBSERVATION", read);
    const store = new MemoryLedger(first.scope);
    store.append(first, null); store.append(dispatch, first.eventId); store.append(proof, dispatch.eventId);
    const second = intent("REJECT");
    second.operationId = randomUUID(); second.before = read; second.previousDecisionId = read.decision!.id;
    second.intended = { ...structuredClone(read), status: "REJEITADO", approvedMaterialId: null,
      decision: { ...second.intended.decision!, id: second.operationId } };
    const event = begin(second);
    expect(() => store.append(event, proof.eventId)).not.toThrow();
    expect(store.events()[0]).toEqual(first);
  });
});
