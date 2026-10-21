import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { DecisionBlockNotice, DecisionButtons, decisionBlockMessages, itemDecisionBlock, type DecisionBlock } from "./decision-actions";
import { mapBudgetItem } from "../server/sharepoint/sharepoint-mapper";
import { decisionFields } from "../server/sharepoint/__test-support__/graph-realistic";
import { MockOperatorRepository } from "../mocks/mock-operator-repository";
import { mockItems } from "../mocks/mock-data";

// Ajuste complementar do L3: a interface reflete status e Enviado_Historico na mesma ordem do servidor,
// que continua sendo a proteção obrigatória. Valor de histórico ausente nunca é tratado como "NAO".
const buttons = (overrides: Partial<React.ComponentProps<typeof DecisionButtons>> = {}) => renderToStaticMarkup(
  <DecisionButtons block={null} locked={false} rejectionIssue={null} hasChosenMaterial extractionIssueCount={0} saving={false}
    onReject={() => {}} onApprove={() => {}} {...overrides} />);
const disabled = (html: string, className: "reject" | "approve") =>
  new RegExp(`<button class="${className}" disabled=""`).test(html);
const actions = (block: DecisionBlock | null) => {
  const html = buttons({ block });
  return { reject: !disabled(html, "reject"), approve: !disabled(html, "approve") };
};
const item = (sourceStatus: string | undefined, sentToHistory?: string | null) =>
  ({ sourceStatus, reviewStatus: "PENDENTE" as const, ...(sentToHistory === undefined ? {} : { sentToHistory }) });

describe("cenários obrigatórios: status × Enviado_Historico", () => {
  it.each(["PENDENTE", "EM_REVISAO", "CORRIGIR"])("%s + NAO: ações disponíveis", status => {
    const block = itemDecisionBlock(item(status, "NAO"));
    expect(block).toBeNull();
    expect(actions(block)).toEqual({ reject: true, approve: true });
  });
  it("CORRIGIR + NAO respeita as demais validações", () => {
    expect(itemDecisionBlock(item("CORRIGIR", "NAO"))).toBeNull();
    expect(disabled(buttons({ hasChosenMaterial: false }), "approve")).toBe(true);
    expect(disabled(buttons({ extractionIssueCount: 2 }), "approve")).toBe(true);
    expect(disabled(buttons({ rejectionIssue: "Informe a justificativa." }), "reject")).toBe(true);
    expect(disabled(buttons({ locked: true }), "reject")).toBe(true);
  });
  it.each(["APROVADO", "REJEITADO"])("%s + NAO: ações bloqueadas", status => {
    const block = itemDecisionBlock(item(status, "NAO"));
    expect(block).toBe("ITEM_ALREADY_DECIDED");
    expect(actions(block)).toEqual({ reject: false, approve: false });
  });
  it.each(["PENDENTE", "EM_REVISAO", "CORRIGIR", "APROVADO"])("%s + SIM: ações bloqueadas", status => {
    const block = itemDecisionBlock(item(status, "SIM"));
    expect(block).toBe("ITEM_SENT_TO_HISTORY");
    expect(actions(block)).toEqual({ reject: false, approve: false });
  });
  it.each([
    ["ausente", undefined], ["null", null], ["vazio", ""], ["minúsculo", "nao"], ["com espaço", "NAO "], ["acentuado", "Não"], ["desconhecido", "TALVEZ"],
  ] as const)("histórico %s: ações bloqueadas", (_label, history) => {
    const block = itemDecisionBlock(item("PENDENTE", history));
    expect(block).toBe("ITEM_SENT_TO_HISTORY");
    expect(actions(block)).toEqual({ reject: false, approve: false });
  });
  it.each(["", "Aprovado", " PENDENTE", "OUTRO"])("status inválido %j + NAO: ações bloqueadas", status => {
    expect(itemDecisionBlock(item(status, "NAO"))).toBe("ITEM_STATE_INVALID");
  });
  it("sem estado de origem usa reviewStatus, com histórico explícito", () => {
    expect(itemDecisionBlock({ reviewStatus: "PENDENTE", sentToHistory: "NAO" })).toBeNull();
    expect(itemDecisionBlock({ reviewStatus: "APROVADO", sentToHistory: "NAO" })).toBe("ITEM_ALREADY_DECIDED");
  });
  it("fonte somente leitura não recebe aviso de estado (já bloqueada pela origem)", () => {
    expect(itemDecisionBlock({ reviewAvailable: false, reviewStatus: "PENDENTE" })).toBeNull();
  });
});

describe("mock: estado de envio explícito", () => {
  it("todo item do mock declara NAO ou SIM, e somente itens aprovados estão enviados", () => {
    expect(mockItems.every(entry => entry.sentToHistory === "NAO" || entry.sentToHistory === "SIM")).toBe(true);
    const sent = mockItems.filter(entry => entry.sentToHistory === "SIM");
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every(entry => entry.reviewStatus === "APROVADO")).toBe(true);
  });
  it("item mockado enviado ao histórico: ações bloqueadas", async () => {
    const repository = new MockOperatorRepository();
    const items = await repository.listItemsByBudget("budget-demo-01");
    const sent = items.find(entry => entry.sentToHistory === "SIM")!;
    expect(itemDecisionBlock(sent)).toBe("ITEM_SENT_TO_HISTORY");
    expect(actions(itemDecisionBlock(sent))).toEqual({ reject: false, approve: false });
    const pending = items.find(entry => entry.reviewStatus === "PENDENTE" && entry.sentToHistory === "NAO")!;
    expect(itemDecisionBlock(pending)).toBeNull();
  });
});

describe("mapeamento SharePoint preserva o estado recebido", () => {
  const map = (fields: Record<string, unknown>) =>
    mapBudgetItem({ id: "1", eTag: '"v1"', fields: { Status_Revisao: "PENDENTE", ...fields } }, decisionFields.items, new Map());
  it.each(["NAO", "SIM", "nao", "NAO ", "", "Não"])("valor textual %j é preservado sem normalização", value => {
    expect(map({ Enviado_Historico: value }).sentToHistory).toBe(value);
  });
  it.each([["ausente", {}], ["null", { Enviado_Historico: null }], ["número", { Enviado_Historico: 0 }], ["objeto", { Enviado_Historico: { Value: "NAO" } }]] as const)(
    "%s vira null (nunca NAO) e bloqueia", (_label, fields) => {
      const mapped = map(fields);
      expect(mapped.sentToHistory).toBeNull();
      expect(itemDecisionBlock(mapped)).toBe("ITEM_SENT_TO_HISTORY");
    });
});

describe("mensagem ao operador", () => {
  it.each(["ITEM_SENT_TO_HISTORY", "ITEM_ALREADY_DECIDED", "ITEM_STATE_INVALID"] as const)("explica o bloqueio %s", block => {
    const html = renderToStaticMarkup(<DecisionBlockNotice block={block} />);
    expect(html).toContain('role="note"');
    expect(html).toContain(decisionBlockMessages[block]);
    expect(html).toContain("indisponíveis");
  });
  it("não exibe aviso em estado permitido", () => {
    expect(renderToStaticMarkup(<DecisionBlockNotice block={null} />)).toBe("");
  });
});
