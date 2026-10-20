import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { prepareIntent, validateIntent, validateSnapshot, validateEvidence, reconciliationEvidence, canonical, fingerprint } from "./contract";
import { snapshot, now, session, person, policy, request } from "./__test-support__/fixtures";
import { correctionFixture, correctionInput, actorM } from "../sharepoint/__test-support__/correction";
import { CORRECTION_COLUMNS } from "../../domain/item-correction";

const prepare = () => prepareIntent(request, snapshot(), session, person, policy, now);
describe("M.3 contrato proposto, sem integração real", () => {
  it.each(["APROVADO", "REJEITADO"] as const)("prepara reabertura autorizada de %s preservando a decisão anterior", status => {
    const before = snapshot();
    before.status = before.decision.status = status;
    before.approvedMaterialId = before.decision.approvedMaterialId = status === "APROVADO" ? "22" : null;
    const intent = prepareIntent(request, before, session, person, policy, now);
    expect(intent.after.status).toBe("EM_REVISAO");
    expect(intent.after.approvedMaterialId).toBeNull();
    expect(intent.after.decision).toEqual(before.decision);
    expect(intent.actor.oid).not.toBe(intent.after.decision.actor.oid);
    expect(intent.previousDecisionId).toBe(before.decision.id);
    expect(intent.before.values).toEqual(before.values);
  });
  it.each(["", " ", "123456789", "x".repeat(2001)])("rejeita justificativa inválida", reason => {
    expect(() => prepareIntent({ ...request, reason }, snapshot(), session, person, policy, now)).toThrow();
  });
  it.each([10, 2000])("aceita limite de %s caracteres", length => {
    expect(prepareIntent({ ...request, reason: "x".repeat(length) }, snapshot(), session, person, policy, now).reason).toHaveLength(length);
  });
  it.each(["Consulta", "Operador", "Comprador", "ReconciliarOperacoes"])("não infere permissão de reabrir do papel %s", role => {
    expect(() => prepareIntent(request, snapshot(), { ...session, roles: [role] }, person, policy, now)).toThrow("REOPEN_FORBIDDEN");
  });
  it("lista de perfis vazia bloqueia mesmo um usuário conhecido", () => {
    expect(() => prepareIntent(request, snapshot(), session, person, { ...policy, allowedRoles: [] }, now)).toThrow("REOPEN_FORBIDDEN");
  });
  it.each([{ validated: false }, { authMode: "bypass" }, { authMode: "keycloak" }, { expiresAt: now }, { expiresAt: NaN }])("bloqueia sessão inválida: %j", override => {
    expect(() => prepareIntent(request, snapshot(), { ...session, ...override }, person, policy, now)).toThrow("SESSION_INVALID");
  });
  it.each(["tenant", "oid", "site", "lookup"])("bloqueia Pessoa de contexto divergente: %s", field => {
    const candidate = { ...person };
    if (field === "tenant") candidate.tenantId = "99999999-9999-4999-8999-999999999999";
    if (field === "oid") candidate.oid = "99999999-9999-4999-8999-999999999999";
    if (field === "site") candidate.siteId = "other-site";
    if (field === "lookup") candidate.personLookupId = session.oid;
    expect(() => prepareIntent(request, snapshot(), session, candidate, policy, now)).toThrow();
  });
  it.each(["PENDENTE", "EM_REVISAO", "CORRIGIR", "", "UNKNOWN"])("não reabre estado %s", status => {
    expect(() => prepareIntent(request, { ...snapshot(), status }, session, person, policy, now)).toThrow();
  });
  it.each(["SIM", "", "NAO ", "UNKNOWN", null])("exige Enviado_Historico exatamente NAO: %j", sentToHistory => {
    expect(() => prepareIntent(request, { ...snapshot(), sentToHistory }, session, person, policy, now)).toThrow();
  });
  it.each(["CONCLUIDO", "", "UNKNOWN"])("bloqueia orçamento fechado/desconhecido: %s", budgetStatus => {
    expect(() => prepareIntent(request, { ...snapshot(), budgetStatus }, session, person, policy, now)).toThrow();
  });
  it("não aceita ETag antigo ou wildcard", () => {
    for (const expectedEtag of ['"old"', "*", ""]) expect(() => prepareIntent({ ...request, expectedEtag }, snapshot(), session, person, policy, now)).toThrow("ETAG_CONFLICT");
  });
  it.each(["schema", "type", "unknown", "missing", "previous-id", "after", "actor", "date", "secret"])("valida envelope/evento armazenado: %s", issue => {
    const intent = prepare();
    const bad = structuredClone(intent) as unknown as Record<string, unknown>;
    if (issue === "schema") bad.schemaVersion = 2;
    if (issue === "type") bad.type = "FORCE_CONFIRM";
    if (issue === "unknown") bad.email = "unnecessary@example.invalid";
    if (issue === "missing") delete bad.before;
    if (issue === "previous-id") bad.previousDecisionId = request.eventId;
    if (issue === "after") bad.after = { ...intent.after, approvedMaterialId: "22" };
    if (issue === "actor") bad.actor = { ...intent.actor, personLookupId: "user-name" };
    if (issue === "date") bad.at = "2026-02-31T15:00:00.000Z";
    if (issue === "secret") bad.access_token = "synthetic-token-must-not-be-stored";
    expect(() => validateIntent(bad)).toThrow();
  });
  it("recusa autoria extra informada na requisição", () => {
    expect(() => prepareIntent({ ...request, actor: session } as typeof request, snapshot(), session, person, policy, now)).toThrow();
  });
  it("clona o conteúdo completo, em vez de substituir snapshot por hashes", async () => {
    const correction = correctionFixture();
    await correction.service.save("1", correctionInput, { actor: actorM, version: '"v1"' });
    const before = snapshot();
    before.correction = { operationId: correctionInput.operationId,
      originalJson: String(correction.row.fields[CORRECTION_COLUMNS.original]),
      recordJson: String(correction.row.fields[CORRECTION_COLUMNS.record]) };
    const intent = prepareIntent(request, before, session, person, policy, now);
    expect(intent.before.correction).toEqual(before.correction);
    expect(intent.after.correction).toEqual(before.correction);
    before.values.description = "mutated";
    expect(intent.before.values.description).toBe("Descrição integral sintética");
    expect(() => validateSnapshot({ ...before, correction: { ...before.correction, originalJson: "{}" } })).toThrow();
  });
  it("não aceita credenciais em evidência JSON da correção", () => {
    const before = snapshot();
    before.correction = { operationId: request.eventId, originalJson: '{"access_token":"synthetic"}', recordJson: "{}" };
    expect(() => validateSnapshot(before)).toThrow();
  });
  it("ordem de chaves não muda o hash, mas conteúdo altera o hash", () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
  it("evidência recalcula outcome e não permite forçar confirmação", () => {
    const intent = prepare();
    const reviewer = intent.actor;
    const evidence = reconciliationEvidence(intent, { kind: "unavailable" }, "UNKNOWN",
      "88888888-8888-4888-8888-888888888888", reviewer, intent.at);
    expect(validateEvidence(evidence, intent).outcome).toBe("INCONCLUSIVE");
    expect(() => validateEvidence({ ...evidence, outcome: "CONFIRMED" }, intent)).toThrow();
    expect(() => validateEvidence({ ...evidence, intentFingerprint: "forged" }, intent)).toThrow();
    expect(() => validateEvidence({ ...evidence, operationId: evidence.evidenceId }, intent)).toThrow();
  });
});
