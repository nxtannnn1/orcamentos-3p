import { describe, expect, it, vi } from "vitest";
import { mockMaterials } from "../mocks/mock-data";
import { budgetTotal, confirmDraft, decimal, draftFor, initialItems, lineTotal } from "./session";
import { isDemoEnabled } from "./configuration";

describe("demo local sem persistência", () => {
  it("isola snapshots e reinicia decisões sem rede", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const original = initialItems();
      const saved = confirmDraft(original[0], { ...draftFor(original[0]), material: mockMaterials[0], observation: "Fictício" }, "APROVADO");
      expect(saved.reviewStatus).toBe("APROVADO");
      expect(original[0].reviewStatus).toBe("PENDENTE");
      expect(initialItems()[0].observation).toBe("");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
  it.each(["NaN", "Infinity", "-1", "1e3", "1.00001", "", " ", "1000001", "01", "1,2.3"])("recusa decimal inválido: %s", value => {
    expect(() => decimal(value)).toThrow();
  });
  it("quantidade positiva, preço zero e vírgula", () => {
    expect(() => lineTotal("0", "1")).toThrow();
    expect(lineTotal("2,5", "0")).toBe("0.0000");
    expect(lineTotal("2,5", "10,125")).toBe("25.3125");
  });
  it("half-up no produto e soma antes de arredondar o total", () => {
    expect(lineTotal("0.0001", "0.5")).toBe("0.0001");
    expect(lineTotal("0.1", "0.2")).toBe("0.0200");
    const items = initialItems().slice(0, 2).map(item => ({ ...item, totalPrice: "0.0049" }));
    expect(budgetTotal(items)).toBe("0.01");
    expect(budgetTotal(initialItems())).toBe("1916.40");
  });
  it("confirma financeiro e observação sem mutar o original", () => {
    const items = initialItems();
    const saved = confirmDraft(items[0], { ...draftFor(items[0]), quantity: "2.5", unitPrice: "10", observation: "Teste" });
    expect(saved.totalPrice).toBe("25.0000");
    expect(saved.observation).toBe("Teste");
    expect(items[0].quantity).toBe("12.0000");
    expect(budgetTotal([saved, ...items.slice(1)])).toBe("1836.40");
  });
  it("não aprova sugestão implícita e rejeição limpa associação", () => {
    const item = initialItems()[0];
    expect(() => confirmDraft(item, draftFor(item), "APROVADO")).toThrow("Escolha explicitamente");
    const draft = { ...draftFor(item), material: mockMaterials[0] };
    expect(confirmDraft(item, draft, "APROVADO").approvedMaterial).toEqual(mockMaterials[0]);
    expect(confirmDraft(item, draft, "REJEITADO").approvedMaterial).toBeNull();
    expect(() => confirmDraft(item, { ...draft, observation: "x".repeat(1001) })).toThrow();
  });
  it("desabilita rota em produção ou com fontes reais", () => {
    const env = { NODE_ENV: "development", OPERATOR_WEB_DEMO: "true", DATA_SOURCE: "mock" };
    expect(isDemoEnabled(env)).toBe(true);
    expect(isDemoEnabled({ ...env, NODE_ENV: "production" })).toBe(false);
    expect(isDemoEnabled({ ...env, DATA_SOURCE: "sharepoint" })).toBe(false);
    expect(isDemoEnabled({ ...env, DATA_SOURCE: "operator-api" })).toBe(false);
    expect(isDemoEnabled({ ...env, OPERATOR_WEB_DEMO: "false" })).toBe(false);
  });
});
