import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ReopeningSimulator } from "./__test-support__/simulator";
import { assess, prepareIntent, reconciliationEvidence } from "./contract";
import { snapshot, now, session, person, policy, request, adminSession, adminPerson, adminPolicy } from "./__test-support__/fixtures";
const reserve = (model: ReopeningSimulator) => model.reserve(request, session, person, policy);
const reconcile = (model: ReopeningSimulator, unavailable = false) => model.reconcile(request.eventId, adminSession, adminPerson, adminPolicy, unavailable);

describe("M.3 simulação de ledger, CAS e reconciliação: nenhuma rede", () => {
  it("caminho confirmado preserva autoria/material da decisão anterior e snapshot integral", () => {
    const before = snapshot(), model = new ReopeningSimulator(before, now);
    reserve(model);
    const result = model.send(request.eventId);
    expect(result.outcome).toBe("CONFIRMED");
    expect(model.snapshot()).toMatchObject({ status: "EM_REVISAO", approvedMaterialId: null, decision: before.decision });
    expect(model.pendingOperation()).toBeNull();
    expect(model.writes).toBe(1);
    expect(model.events()[0]).toMatchObject({ before });
    const copy = model.events(); copy.splice(0);
    expect(model.events()).toHaveLength(3);
  });
  it("UUID idêntico com mesmo conteúdo é idempotente, inclusive duplo clique", () => {
    const model = new ReopeningSimulator(snapshot(), now);
    expect(reserve(model)).toEqual(reserve(model));
    expect(model.events()).toHaveLength(1);
    model.send(request.eventId);
    reserve(model);
    expect(() => model.send(request.eventId)).toThrow("RECONCILIATION_REQUIRED");
    expect(model.writes).toBe(1);
  });
  it.each(["reason", "etag", "actor"])("UUID repetido com %s diferente é recusado", field => {
    const model = new ReopeningSimulator(snapshot(), now); reserve(model);
    const changed = { ...request };
    const secondSession = { ...session }, secondPerson = { ...person };
    if (field === "reason") changed.reason = "Outra justificativa válida";
    if (field === "etag") changed.expectedEtag = '"other"';
    if (field === "actor") { secondSession.oid = adminSession.oid; secondPerson.oid = adminSession.oid; }
    expect(() => model.reserve(changed, secondSession, secondPerson, policy)).toThrow("UUID_CONTENT_CONFLICT");
    expect(model.writes).toBe(0);
  });
  it("reserva atômica simulada permite somente um de dois operadores", async () => {
    const model = new ReopeningSimulator(snapshot(), now);
    const results = await Promise.allSettled([
      Promise.resolve().then(() => reserve(model)),
      Promise.resolve().then(() => model.reserve({ ...request, eventId: "99999999-9999-4999-8999-999999999999" },
        { ...session, oid: adminSession.oid }, adminPerson, policy)),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(model.events()).toHaveLength(1);
  });
  it.each(["timeout-before", "timeout-after", "read-failure"] as const)("mantém incerteza após %s sem reenviar PATCH", mode => {
    const model = new ReopeningSimulator(snapshot(), now); reserve(model);
    expect(model.send(request.eventId, mode).outcome).toBe("INCONCLUSIVE");
    const previous = model.events();
    expect(() => model.send(request.eventId)).toThrow("RECONCILIATION_REQUIRED");
    const result = reconcile(model);
    expect(result.outcome).toBe(mode === "timeout-before" ? "INCONCLUSIVE" : "CONFIRMED");
    expect(model.writes).toBe(1);
    expect(model.events().slice(0, previous.length)).toEqual(previous);
  });
  it("ausência de alteração após timeout não comprova ausência de persistência", () => {
    const intent = prepareIntent(request, snapshot(), session, person, policy, now);
    expect(assess(intent, { kind: "item", item: snapshot() }, "UNKNOWN")).toBe("INCONCLUSIVE");
    expect(assess(intent, { kind: "missing" }, "UNKNOWN")).toBe("INCONCLUSIVE");
    expect(assess(intent, { kind: "item", item: snapshot() }, "NOT_SENT")).toBe("NOT_PERSISTED");
  });
  it("recusa comprovada de PATCH registra não persistência e não toca decisão anterior", () => {
    const before = snapshot(), model = new ReopeningSimulator(before, now); reserve(model);
    expect(model.send(request.eventId, "denied").outcome).toBe("NOT_PERSISTED");
    expect(model.snapshot()).toEqual(before);
  });
  it("ETag muda entre reserva e envio: CAS impede sobrescrita", () => {
    const model = new ReopeningSimulator(snapshot(), now); reserve(model);
    model.externalChange({ etag: '"concurrent"' });
    expect(model.send(request.eventId).outcome).toBe("DIVERGENT");
    expect(model.snapshot().status).toBe("APROVADO");
    expect(model.pendingOperation()).toBe(request.eventId);
  });
  it.each(["before-intent", "before-dispatch", "after-patch"])("Redis falha em %s: sem confirmação falsa", position => {
    const model = new ReopeningSimulator(snapshot(), now);
    if (position === "before-intent") {
      model.redisAvailable = false;
      expect(() => reserve(model)).toThrow("AUDIT_UNAVAILABLE");
      expect(model.events()).toHaveLength(0); expect(model.writes).toBe(0);
    } else {
      reserve(model);
      if (position === "before-dispatch") model.redisAvailable = false;
      expect(() => model.send(request.eventId, position === "after-patch" ? "redis-after" : "ok")).toThrow("AUDIT_UNAVAILABLE");
      expect(model.writes).toBe(position === "after-patch" ? 1 : 0);
      expect(model.pendingOperation()).toBe(request.eventId);
      model.redisAvailable = true;
      expect(reconcile(model).outcome).toBe(position === "after-patch" ? "CONFIRMED" : "NOT_PERSISTED");
    }
  });
  it("reconciliação exige sessão e permissão administrativa expressa", () => {
    const model = new ReopeningSimulator(snapshot(), now); reserve(model); model.send(request.eventId, "timeout-after");
    const previous = model.events();
    expect(() => model.reconcile(request.eventId, session, person, adminPolicy)).toThrow("REOPEN_FORBIDDEN");
    expect(() => model.reconcile(request.eventId, { ...adminSession, validated: false }, adminPerson, adminPolicy)).toThrow("SESSION_INVALID");
    expect(model.events()).toEqual(previous);
  });
  it("tentativas de reconciliação são novas evidências, sem sobrescrever a anterior", () => {
    const model = new ReopeningSimulator(snapshot(), now); reserve(model); model.send(request.eventId, "timeout-after");
    expect(reconcile(model, true).outcome).toBe("INCONCLUSIVE");
    const previous = model.events();
    expect(reconcile(model).outcome).toBe("CONFIRMED");
    expect(model.events().slice(0, previous.length)).toEqual(previous);
    expect(new Set(model.events().map(e => "evidenceId" in e ? e.evidenceId : e.eventId)).size).toBe(model.events().length);
  });
  it.each(["item", "budget", "status", "person", "material", "etag", "uuid", "content"])("divergência de %s não confirma operação", field => {
    const model = new ReopeningSimulator(snapshot(), now); const intent = reserve(model); model.send(request.eventId, "timeout-after");
    const remote = model.snapshot();
    if (field === "item") remote.scope.itemId = "2";
    if (field === "budget") remote.scope.budgetId = "11";
    if (field === "status") remote.status = "APROVADO";
    if (field === "person") remote.decision.actor.personLookupId = "99";
    if (field === "material") remote.approvedMaterialId = "22";
    if (field === "etag") remote.etag = intent.before.etag;
    if (field === "uuid") remote.reopeningId = intent.previousDecisionId;
    if (field === "content") remote.values.description = "Conteúdo divergente";
    model.externalChange(remote);
    expect(reconcile(model).outcome).not.toBe("CONFIRMED");
    expect(model.pendingOperation()).toBe(request.eventId);
    expect(model.writes).toBe(1);
  });
  it("corpo remoto malformado não é guardado como evidência arbitrária", () => {
    const intent = prepareIntent(request, snapshot(), session, person, policy, now);
    const evidence = reconciliationEvidence(intent, { kind: "item", item: { access_token: "synthetic" } }, "UNKNOWN",
      "88888888-8888-4888-8888-888888888888", intent.actor, intent.at);
    expect(evidence.remote).toEqual({ kind: "unavailable" });
    expect(evidence.outcome).toBe("INCONCLUSIVE");
    expect(JSON.stringify(evidence)).not.toContain("access_token");
  });
});
