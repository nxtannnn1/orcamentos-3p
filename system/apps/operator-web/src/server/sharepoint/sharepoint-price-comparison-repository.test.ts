import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SharePointPriceComparisonRepository } from "./sharepoint-price-comparison-repository";
import { comparePriceOffers } from "../../domain/price-comparison";
import type { GraphReadTransport, GraphListItem, SharePointRepositoryConfig } from "./sharepoint-types";

export const comparisonConfig: SharePointRepositoryConfig = {
  siteId: "site", itemsListId: "items", budgetsListId: "budgets", materialsListId: "materials",
  fields: {
    budgets: { code: "Code", number: "Number", supplier: "Supplier", date: "Date", status: "Status" },
    items: { code: "Code", supplier: "Supplier", budgetLookupId: "Budget", itemNumber: "Number", description: "Description", quantity: "Quantity", unit: "Unit", unitPrice: "Price", totalPrice: "Total", status: "Status", approvedMaterialLookupId: "Approved", suggestedMaterialLookupId: "Suggested", observation: "Note" },
    materials: { code: "Title", name: "Material", unit: "Unit" },
  },
};
const material = { id: "1", code: "TEST", name: "Synthetic", family: "", unit: "UN" };
const row = (id = "10", extra: Record<string, unknown> = {}): GraphListItem => ({ id, fields: { Status: "APROVADO", ApprovedLookupId: "1", BudgetLookupId: "2", Supplier: "Synthetic A", Unit: "UN", Price: 10, ...extra } });
function setup(items: GraphListItem[], options: { noBudget?: boolean; pages?: GraphListItem[]; failure?: boolean } = {}) {
  const get = vi.fn(async (path: string) => {
    if (options.failure) throw new Error("Synthetic Graph failure");
    if (path.includes("/lists/materials/")) return { value: [{ id: "1", fields: {} }] };
    if (path.includes("/lists/budgets/")) return { value: options.noBudget ? [] : [{ id: "2", fields: { Code: "TEST-B", Date: "2026-10-01" } }] };
    if (path === "/next") return { value: options.pages };
    return { value: items, ...(options.pages ? { "@odata.nextLink": "/next" } : {}) };
  });
  return { repository: new SharePointPriceComparisonRepository({ get: get as GraphReadTransport["get"] }, comparisonConfig), get };
}
describe("comparação SharePoint somente leitura", () => {
  it("retorna vazio sem ofertas ou material existente", async () => {
    expect(await setup([]).repository.listOffersByMaterial("1")).toEqual([]);
    expect(await setup([row()]).repository.listOffersByMaterial("999")).toEqual([]);
  });
  it("resolve orçamento e preserva os campos de uma oferta", async () => {
    const { repository, get } = setup([row()]);
    expect(await repository.listOffersByMaterial("1")).toEqual([{ id: "item:10", approvedMaterialId: "1", supplier: "Synthetic A", unit: "UN", unitPrice: 10, budgetId: "2", budgetCode: "TEST-B", budgetDate: "2026-10-01" }]);
    expect(get).toHaveBeenCalledTimes(3);
  });
  it("compara duas ofertas reais da fixture sem misturar fornecedor do orçamento", async () => {
    const offers = await setup([row(), row("11", { Supplier: "Synthetic B", Price: 8 })]).repository.listOffersByMaterial("1");
    expect(comparePriceOffers(material, offers).lowestPrice).toBe(8);
    expect(new Set(offers.map(x => x.supplier)).size).toBe(2);
  });
  it.each([null, 0, -1, "10", "invalid"])("preserva exclusão pelo domínio de preço inválido: %s", async Price => {
    const offers = await setup([row("10", { Price })]).repository.listOffersByMaterial("1");
    expect(comparePriceOffers(material, offers).lowestPrice).toBeNull();
  });
  it("não promove pendentes, aprovações por substring nem sugestão", async () => {
    const offers = await setup([row("10", { Status: "PENDENTE" }), row("11", { Status: "NAO_APROVADO" }), row("12", { ApprovedLookupId: null, SuggestedLookupId: "1" }), row("13", { ApprovedLookupId: "99" })]).repository.listOffersByMaterial("1");
    expect(offers).toEqual([]);
  });
  it("incompatibilidade de unidade e orçamento ausente continuam inelegíveis", async () => {
    const offers = await setup([row("10", { Unit: "KG" })], { noBudget: true }).repository.listOffersByMaterial("1");
    expect(comparePriceOffers(material, offers).offers[0].issues).toEqual(expect.arrayContaining(["BUDGET_MISSING", "INCOMPATIBLE_UNIT"]));
  });
  it("pagina e deduplica pela identidade do item", async () => {
    const { repository, get } = setup([row()], { pages: [row(), row("11")] });
    expect(await repository.listOffersByMaterial("1")).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(4);
  });
  it("não escolhe arbitrariamente duplicatas divergentes", async () => {
    await expect(setup([row()], { pages: [row("10", { Price: 20 })] }).repository.listOffersByMaterial("1")).rejects.toMatchObject({ code: "PRICE_OFFER_CONFLICT" });
  });
  it("propaga falha Graph sem fallback", async () => {
    await expect(setup([], { failure: true }).repository.listOffersByMaterial("1")).rejects.toThrow("Synthetic Graph failure");
  });
  it("bloqueia ciclo de paginação", async () => {
    const graph: GraphReadTransport = { async get<T>(): Promise<T> { return { value: [], "@odata.nextLink": "/cycle" } as T; } };
    await expect(new SharePointPriceComparisonRepository(graph, comparisonConfig).listOffersByMaterial("1")).rejects.toMatchObject({ code: "LIST_LIMIT_EXCEEDED" });
  });
  it("não fabrica identidade para um item corrompido", async () => {
    await expect(setup([row("")]).repository.listOffersByMaterial("1")).rejects.toMatchObject({ status: 502 });
  });
});

it.each([null, { value: [null] }, { value: [{ id: "1" }] }, { value: [], "@odata.nextLink": 7 }])(
  "recusa resposta Graph malformada com erro de integração", async page => {
    const get = vi.fn(async () => page);
    const repository = new SharePointPriceComparisonRepository({ get: get as GraphReadTransport["get"] }, comparisonConfig);
    await expect(repository.listOffersByMaterial("1")).rejects.toMatchObject({ status: 502 });
    expect(get).toHaveBeenCalledTimes(1);
  },
);

it("contrato ingestão → conferência → comparação exige aprovação e equivalência", async () => {
  const imported = row("10", { Status: "PENDENTE", ApprovedLookupId: null, SuggestedLookupId: "1" });
  const f = setup([imported]);
  expect(await f.repository.listOffersByMaterial("1")).toEqual([]);
  // Simulates a confirmed reread after human decision, not a real PATCH.
  imported.fields.Status = "APROVADO";
  imported.fields.ApprovedLookupId = "1";
  const offers = await f.repository.listOffersByMaterial("1");
  expect(comparePriceOffers(material, offers).lowestPrice).toBe(10);
  imported.fields.Unit = "CX";
  expect(comparePriceOffers(material, await f.repository.listOffersByMaterial("1")).lowestPrice).toBeNull();
  expect(f.get.mock.calls.every(([path]) => !path.includes("history"))).toBe(true);
});
