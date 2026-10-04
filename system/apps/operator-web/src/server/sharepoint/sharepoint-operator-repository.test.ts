import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { mapBudgetItem } from "./sharepoint-mapper";
import { SharePointOperatorRepository } from "./sharepoint-operator-repository";
import type {
  GraphCollection,
  GraphListItem,
  GraphReadTransport,
  SharePointRepositoryConfig,
} from "./sharepoint-types";
import * as store from "../security/store";
import { DecisionError } from "../../domain/decision-error";
afterEach(() => vi.restoreAllMocks());

const fields: SharePointRepositoryConfig["fields"] = {
  budgets: {
    code: "BudgetCode",
    number: "BudgetNumber",
    supplier: "Supplier",
    date: "BudgetDate",
    status: "ReviewStatus",
  },
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
    reviewedByOid: "ReviewedByOid",
    reviewedAt: "ReviewedAt",
    decisionId: "DecisionId",
  },
  materials: { code: "MaterialCode", name: "MaterialName", family: "Family", unit: "Unit" },
};

describe("mapeamento SharePoint somente leitura", () => {
  it("resolve sugestão e aprovação por campos independentes", () => {
    const suggested = { id: "material-a", code: "A", name: "Sugestão", family: "", unit: "UN" };
    const approved = {
      id: "material-b",
      code: "B",
      name: "Escolha humana",
      family: "",
      unit: "UN",
    };
    const item = mapBudgetItem(
      {
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
      },
      fields.items,
      new Map([
        [suggested.id, suggested],
        [approved.id, approved],
      ]),
    );
    expect(item.suggestedMaterial?.id).toBe(suggested.id);
    expect(item.approvedMaterial?.id).toBe(approved.id);
  });

  it("não usa a sugestão como fallback de Material_Aprovado", () => {
    const suggested = { id: "material-a", code: "A", name: "Sugestão", family: "", unit: "UN" };
    const item = mapBudgetItem(
      {
        id: "item-1",
        fields: {
          BudgetRefLookupId: "budget-1",
          ItemNumber: 1,
          SuggestedRefLookupId: suggested.id,
        },
      },
      fields.items,
      new Map([[suggested.id, suggested]]),
    );
    expect(item.suggestedMaterial?.id).toBe(suggested.id);
    expect(item.approvedMaterial).toBeNull();
  });

  it("preserva a leitura com um transporte somente GET", async () => {
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
    await expect(
      repository.saveItemDecision("1", {
        action: "REJECT",
        approvedMaterial: null,
        observation: "",
      }),
    ).rejects.toThrow("Transporte sem suporte a escrita");
    expect(calls).toHaveLength(1);
  });
});

describe("limites de leitura e integridade de decisões", () => {
  const config = {
    siteId: "site",
    budgetsListId: "budgets",
    itemsListId: "items",
    materialsListId: "materials",
    fields,
  };
  const actor = { oid: "test-operator", tenantId: "test-tenant" };
  const decision = { action: "REJECT" as const, approvedMaterial: null, observation: "Revisado" };
  function setup() {
    let version = '"v1"';
    const current = { id: "1", fields: { BudgetRefLookupId: "10", ReviewStatus: "PENDENTE" } };
    const get = vi.fn(async (path: string) => {
      if (path.includes("/items/1?")) return { ...current, eTag: version };
      if (path.includes("/lists/budgets/"))
        return { value: [{ id: "10", fields: { ReviewStatus: "PENDENTE" } }] };
      if (path.includes("/lists/items/")) return { value: [{ ...current, eTag: version }] };
      return { value: [] };
    });
    const patch = vi.fn(async (_path: string, _fields: Record<string, unknown>, etag: string) => {
      if (etag !== version) throw new DecisionError("Conflito", 409, "DECISION_CONFLICT");
      version = '"v2"';
      return { "@odata.etag": version };
    });
    const graph = {
      get: get as unknown as GraphReadTransport["get"],
      patch: patch as unknown as import("./sharepoint-types").GraphWriteTransport["patch"],
    };
    return { repository: new SharePointOperatorRepository(graph, config), get, patch };
  }
  it("fila lê cada lista uma vez sem reler materiais por orçamento", async () => {
    const { repository, get } = setup();
    const budgets = await repository.listBudgets();
    expect(budgets[0]).toMatchObject({ itemCount: 1, reviewedCount: 0 });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.some(([path]) => path.includes("/materials/"))).toBe(false);
  });
  it("paginação cíclica é rejeitada", async () => {
    const get = vi.fn(async () => ({ value: [], "@odata.nextLink": "/loop" }));
    const repository = new SharePointOperatorRepository(
      { get: get as GraphReadTransport["get"] },
      config,
    );
    await expect(repository.listOfficialMaterials()).rejects.toMatchObject({
      code: "LIST_LIMIT_EXCEEDED",
    });
    expect(get).toHaveBeenCalledTimes(2);
  });
  it("versão ausente ou antiga impede qualquer PATCH", async () => {
    const { repository, patch } = setup();
    await expect(repository.saveItemDecision("1", decision, { actor })).rejects.toMatchObject({
      status: 428,
    });
    await expect(
      repository.saveItemDecision("1", decision, { actor, version: '"old"' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(patch).not.toHaveBeenCalled();
  });
  it("a segunda decisão com a versão anterior é rejeitada", async () => {
    const { repository, patch } = setup();
    await repository.saveItemDecision("1", decision, { actor, version: '"v1"' });
    await expect(
      repository.saveItemDecision("1", decision, { actor, version: '"v1"' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0][1]).toMatchObject({
      ReviewedByOid: actor.oid,
      ReviewedAt: expect.any(String),
      DecisionId: expect.any(String),
    });
    expect(patch.mock.calls[0][2]).toBe('"v1"');
  });
  it("falha da auditoria impede a gravação", async () => {
    const { repository, patch } = setup();
    vi.spyOn(store, "securityCommand").mockRejectedValue(new Error("Unavailable"));
    await expect(
      repository.saveItemDecision("1", decision, { actor, version: '"v1"' }),
    ).rejects.toThrow();
    expect(patch).not.toHaveBeenCalled();
  });
  it("orçamento concluído não aceita decisão", async () => {
    const { repository, patch, get } = setup();
    get.mockImplementation(async (path) =>
      path.includes("/items/1?")
        ? { id: "1", eTag: '"v1"', fields: { BudgetRefLookupId: "10", ReviewStatus: "PENDENTE" } }
        : {
            value: path.includes("/budgets/")
              ? [{ id: "10", fields: { ReviewStatus: "APROVADO" } }]
              : [],
          },
    );
    await expect(
      repository.saveItemDecision("1", decision, { actor, version: '"v1"' }),
    ).rejects.toMatchObject({ code: "BUDGET_CLOSED" });
    expect(patch).not.toHaveBeenCalled();
  });
});
