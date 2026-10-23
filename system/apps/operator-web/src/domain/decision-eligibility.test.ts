import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../server/security/store", () => ({ securityCommand: vi.fn(async () => "OK") }));
import { assertDecidable, isOpenReviewState, normalizeReviewState } from "./decision-eligibility";
import { securityCommand } from "../server/security/store";
import { MockOperatorRepository } from "../mocks/mock-operator-repository";
import { decisionActor as actor, decisionMaterial as material, decisionScenario } from "../server/sharepoint/__test-support__/graph-realistic";
import type { BudgetItem, ItemDecision } from "../types/operator";

// Remediação F-01 (lote L3): somente PENDENTE, EM_REVISAO e CORRIGIR, com Enviado_Historico exatamente "NAO",
// aceitam decisão pelo fluxo comum. Reabertura de itens finalizados não faz parte deste lote.
// 23/10/2026: Status_Revisao passa a ser comparado normalizado (caixa, acentos, espaços, hífen), porque orçamentos
// reais chegam como "Pendente". Enviado_Historico continua exato. Valores desconhecidos continuam bloqueando.
const ABSENT = Symbol("absent");
const allowedStates = ["PENDENTE", "EM_REVISAO", "CORRIGIR"];
const equivalentOpenStates = ["Pendente", "pendente", " PENDENTE ", "Em revisão", "em-revisao", "Corrigir"];
const finalStates = ["APROVADO", "REJEITADO"];
const equivalentFinalStates = ["Aprovado", " rejeitado "];
const unknownStates: unknown[] = ["", "   ", "OUTRO", "PENDENTES", "PEND ENTE", 7, null, ABSENT];
const blockedHistory: unknown[] = ["SIM", "", "nao", "NAO ", "Não", null, ABSENT];
const decisions: [string, ItemDecision][] = [
  ["APPROVE", { action: "APPROVE", approvedMaterial: material, observation: "Conferido" }],
  ["REJECT", { action: "REJECT", approvedMaterial: null, observation: "Justificativa sintética de rejeição" }],
];
const label = (value: unknown) => value === ABSENT ? "ausente" : JSON.stringify(value);
const fieldsOf = (status: unknown, history: unknown) => ({
  ...(status === ABSENT ? {} : { Status_Revisao: status }),
  ...(history === ABSENT ? {} : { Enviado_Historico: history }),
});
const expectedCode = (status: unknown, history: unknown) =>
  history !== "NAO" ? "ITEM_SENT_TO_HISTORY" : finalStates.includes(normalizeReviewState(status) ?? "") ? "ITEM_ALREADY_DECIDED" : "ITEM_STATE_INVALID";

const blocked: [unknown, unknown][] = [
  ...[...allowedStates, ...equivalentOpenStates, ...finalStates, ...unknownStates].flatMap(status => blockedHistory.map(history => [status, history] as [unknown, unknown])),
  ...[...finalStates, ...equivalentFinalStates, ...unknownStates].map(status => [status, "NAO"] as [unknown, unknown]),
];

describe("regra de elegibilidade (domínio)", () => {
  it.each([...allowedStates, ...equivalentOpenStates])("permite %j com Enviado_Historico NAO", status => {
    expect(() => assertDecidable({ status, sentToHistory: "NAO" })).not.toThrow();
  });
  it("normaliza só para comparar e nunca transforma desconhecido em aberto", () => {
    expect(normalizeReviewState(" Em revisão ")).toBe("EM_REVISAO");
    expect(normalizeReviewState("Pendente")).toBe("PENDENTE");
    for (const value of ["", "   ", null, undefined, 7, {}]) expect(normalizeReviewState(value)).toBeNull();
    expect(isOpenReviewState("Pendente")).toBe(true);
    for (const value of ["Concluído", "CONCLUIDO", "Aprovado", "OUTRO", "", null]) expect(isOpenReviewState(value)).toBe(false);
  });
  it.each(blocked.map(([status, history]) => [label(status), label(history), status, history]))(
    "bloqueia status %s com histórico %s", (_s, _h, status, history) => {
      const read = (value: unknown) => value === ABSENT ? undefined : value;
      expect(() => assertDecidable({ status: read(status), sentToHistory: read(history) }))
        .toThrow(expect.objectContaining({ status: 409, code: expectedCode(status, history) }));
    });
});

describe("repositório SharePoint (Graph simulado)", () => {
  beforeEach(() => {
    vi.mocked(securityCommand).mockReset().mockResolvedValue("OK");
    vi.stubEnv("SECURITY_REDIS_REST_URL", "https://redis.invalid/");
    vi.stubEnv("SECURITY_REDIS_REST_TOKEN", "synthetic-token");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  const scenario = (status: unknown, history: unknown) => {
    const f = decisionScenario({ realistic: false });
    // Replace the item's state with the exact (or absent) remote values under test.
    const read = f.get.getMockImplementation()!;
    f.get.mockImplementation(async path => {
      const row = await read(path) as { fields?: Record<string, unknown> };
      if (!path.includes("/items/1?") || f.patch.mock.calls.length) return row;
      const { Status_Revisao: _s, Enviado_Historico: _h, ...rest } = row.fields!; void _s; void _h;
      return { ...row, fields: { ...rest, ...fieldsOf(status, history) } };
    });
    return f;
  };

  describe.each(decisions)("%s", (_name, decision) => {
    it.each(allowedStates)("aceita %s com NAO e grava uma vez", async status => {
      const f = scenario(status, "NAO");
      await f.repository.saveItemDecision("1", decision, { version: '"v1"', actor });
      expect(f.patch).toHaveBeenCalledTimes(1);
    });
    it.each(blocked.map(([status, history]) => [label(status), label(history), status, history]))(
      "recusa status %s com histórico %s sem auditoria nem PATCH", async (_s, _h, status, history) => {
        const f = scenario(status, history);
        await expect(f.repository.saveItemDecision("1", decision, { version: '"v1"', actor }))
          .rejects.toMatchObject({ status: 409, code: expectedCode(status, history) });
        expect(f.patch).not.toHaveBeenCalled();
        expect(vi.mocked(securityCommand)).not.toHaveBeenCalled();
      });
  });

  it("ETag divergente continua prevalecendo sobre a regra de estado", async () => {
    const f = scenario("APROVADO", "SIM");
    await expect(f.repository.saveItemDecision("1", decisions[1][1], { version: '"v0"', actor }))
      .rejects.toMatchObject({ status: 409, code: "DECISION_CONFLICT" });
  });
});

describe("repositório mock — mesma regra", () => {
  type MockItems = { items: (BudgetItem & { version: string })[] };
  const MOCK_ID = "item-demo-01";
  const mockWith = (status: string, sentToHistory = false) => {
    const repository = new MockOperatorRepository({ sentToHistory: sentToHistory ? [MOCK_ID] : [] });
    const item = (repository as unknown as MockItems).items.find(entry => entry.id === MOCK_ID)!;
    item.sourceStatus = status;
    return { repository, item };
  };

  describe.each(decisions)("%s", (_name, decision) => {
    it.each(allowedStates)("aceita %s não enviado", async status => {
      const { repository, item } = mockWith(status);
      const saved = await repository.saveItemDecision(MOCK_ID, decision, { version: item.version, actor });
      expect(saved.reviewStatus).toBe(decision.action === "APPROVE" ? "APROVADO" : "REJEITADO");
    });
    it.each([...finalStates, "OUTRO", ""])("recusa %s não enviado", async status => {
      const { repository, item } = mockWith(status);
      await expect(repository.saveItemDecision(MOCK_ID, decision, { version: item.version, actor }))
        .rejects.toMatchObject({ status: 409, code: expectedCode(status, "NAO") });
      expect(item.sourceStatus).toBe(status);
    });
    it.each([...allowedStates, ...finalStates])("recusa %s enviado ao histórico", async status => {
      const { repository, item } = mockWith(status, true);
      const version = item.version;
      await expect(repository.saveItemDecision(MOCK_ID, decision, { version, actor }))
        .rejects.toMatchObject({ status: 409, code: "ITEM_SENT_TO_HISTORY" });
      expect(item.version).toBe(version);
    });
  });

  it("segunda decisão no mesmo item é recusada", async () => {
    const { repository, item } = mockWith("PENDENTE");
    const first = await repository.saveItemDecision(MOCK_ID, decisions[0][1], { version: item.version, actor });
    await expect(repository.saveItemDecision(MOCK_ID, decisions[1][1], { version: first.version!, actor }))
      .rejects.toMatchObject({ status: 409, code: "ITEM_ALREADY_DECIDED" });
  });

  it("dados iniciais do mock sem sourceStatus usam reviewStatus", async () => {
    const repository = new MockOperatorRepository();
    const items = (repository as unknown as MockItems).items;
    const decided = items.find(entry => entry.reviewStatus !== "PENDENTE" && !entry.sourceStatus && entry.sentToHistory === "NAO");
    const sent = items.find(entry => entry.sentToHistory === "SIM");
    const pending = items.find(entry => entry.reviewStatus === "PENDENTE" && !entry.sourceStatus && entry.sentToHistory === "NAO");
    expect(decided && sent && pending).toBeTruthy();
    await expect(repository.saveItemDecision(decided!.id, decisions[1][1], { version: decided!.version, actor }))
      .rejects.toMatchObject({ code: "ITEM_ALREADY_DECIDED" });
    await expect(repository.saveItemDecision(sent!.id, decisions[1][1], { version: sent!.version, actor }))
      .rejects.toMatchObject({ code: "ITEM_SENT_TO_HISTORY" });
    await expect(repository.saveItemDecision(pending!.id, decisions[1][1], { version: pending!.version, actor }))
      .resolves.toMatchObject({ reviewStatus: "REJEITADO" });
  });

  it("item do mock sem estado de envio é bloqueado (nunca presumido NAO)", async () => {
    const repository = new MockOperatorRepository();
    const target = (repository as unknown as MockItems).items.find(entry => entry.id === MOCK_ID)!;
    delete target.sentToHistory;
    await expect(repository.saveItemDecision(MOCK_ID, decisions[1][1], { version: target.version, actor }))
      .rejects.toMatchObject({ code: "ITEM_SENT_TO_HISTORY" });
  });
});
