import { describe, expect, it } from "vitest";
import { mapBudgetItem } from "./sharepoint-mapper";
import { SharePointOperatorRepository } from "./sharepoint-operator-repository";
import type { GraphCollection, GraphListItem, GraphReadTransport, SharePointRepositoryConfig } from "./sharepoint-types";

const fields: SharePointRepositoryConfig["fields"] = {
  budgets: { code: "BudgetCode", number: "BudgetNumber", supplier: "Supplier", date: "BudgetDate", status: "ReviewStatus" },
  items: {
    code: "ItemCode",
    budgetLookupId: "BudgetRef",
    itemNumber: "ItemNumber",
    description: "Description",
    quantity: "Quantity",
    unit: "Unit",
    unitPrice: "UnitPrice",
    totalPrice: "TotalPrice",
    status: "ReviewStatus",
    suggestedMaterialLookupId: "SuggestedRef",
    approvedMaterialLookupId: "ApprovedRef",
    observation: "Observation",
  },
  materials: { code: "MaterialCode", name: "MaterialName", family: "Family", unit: "Unit" },
};

describe("mapeamento SharePoint somente leitura", () => {
  it("resolve sugestão e aprovação por campos independentes", () => {
    const suggested = { id: "material-a", code: "A", name: "Sugestão", family: "", unit: "UN" };
    const approved = { id: "material-b", code: "B", name: "Escolha humana", family: "", unit: "UN" };
    const item = mapBudgetItem({
      id: "item-1",
      fields: {
        BudgetRefLookupId: "budget-1",
        ItemNumber: 1,
        Description: "Item fictício",
        Quantity: 2,
        Unit: "UN",
        UnitPrice: 10,
        TotalPrice: 20,
        ReviewStatus: "Aprovado",
        SuggestedRefLookupId: suggested.id,
        ApprovedRefLookupId: approved.id,
        Observation: "Conferido",
      },
    }, fields.items, new Map([[suggested.id, suggested], [approved.id, approved]]));
    expect(item.suggestedMaterial?.id).toBe(suggested.id);
    expect(item.approvedMaterial?.id).toBe(approved.id);
  });

  it("não usa a sugestão como fallback de Material_Aprovado", () => {
    const suggested = { id: "material-a", code: "A", name: "Sugestão", family: "", unit: "UN" };
    const item = mapBudgetItem({
      id: "item-1",
      fields: { BudgetRefLookupId: "budget-1", ItemNumber: 1, SuggestedRefLookupId: suggested.id },
    }, fields.items, new Map([[suggested.id, suggested]]));
    expect(item.suggestedMaterial?.id).toBe(suggested.id);
    expect(item.approvedMaterial).toBeNull();
  });

  it("expõe apenas operações de leitura", async () => {
    const calls: string[] = [];
    const transport: GraphReadTransport = {
      async get<T>(path: string): Promise<T> {
        calls.push(path);
        return { value: [] } as GraphCollection<GraphListItem> as T;
      },
    };
    const repository = new SharePointOperatorRepository(transport, {
      siteId: "site-placeholder",
      budgetsListId: "budgets-placeholder",
      itemsListId: "items-placeholder",
      materialsListId: "materials-placeholder",
      fields,
    });
    await repository.listOfficialMaterials();
    expect(calls).toHaveLength(1);
    expect("saveItemDecision" in repository).toBe(false);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(repository))).not.toContain("saveItemDecision");
  });
});
