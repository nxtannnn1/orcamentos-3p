import type { ReadOnlyOperatorRepository } from "../../repositories/operator-repository";
import type { Budget, BudgetItem, OfficialMaterial } from "../../types/operator";
import { mapBudget, mapBudgetItem, mapOfficialMaterial } from "./sharepoint-mapper";
import type { GraphCollection, GraphListItem, GraphReadTransport, SharePointRepositoryConfig } from "./sharepoint-types";

const listPath = (siteId: string, listId: string) =>
  `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items?$expand=fields`;

export class SharePointOperatorRepository implements ReadOnlyOperatorRepository {
  constructor(
    private readonly graph: GraphReadTransport,
    private readonly config: SharePointRepositoryConfig,
  ) {}

  private async readList(listId: string): Promise<GraphListItem[]> {
    const result: GraphListItem[] = [];
    let path: string | undefined = listPath(this.config.siteId, listId);
    while (path) {
      const page: GraphCollection<GraphListItem> = await this.graph.get(path);
      result.push(...page.value);
      path = page["@odata.nextLink"];
    }
    return result;
  }

  async listOfficialMaterials(query = ""): Promise<OfficialMaterial[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    const materials = (await this.readList(this.config.materialsListId))
      .map((item) => mapOfficialMaterial(item, this.config.fields.materials));
    return materials.filter((material) =>
      !normalizedQuery || `${material.code} ${material.name} ${material.family}`
        .toLocaleLowerCase("pt-BR").includes(normalizedQuery));
  }

  async listItemsByBudget(id: string): Promise<BudgetItem[]> {
    const materials = await this.listOfficialMaterials();
    const materialIndex = new Map(materials.map((material) => [material.id, material]));
    return (await this.readList(this.config.itemsListId))
      .map((item) => mapBudgetItem(item, this.config.fields.items, materialIndex))
      .filter((item) => item.budgetId === id)
      .sort((left, right) => left.itemNumber - right.itemNumber);
  }

  async listBudgets(): Promise<Budget[]> {
    const budgets = (await this.readList(this.config.budgetsListId))
      .map((item) => mapBudget(item, this.config.fields.budgets));
    return Promise.all(budgets.map(async (budget) => {
      const items = await this.listItemsByBudget(budget.id);
      return {
        ...budget,
        itemCount: items.length,
        reviewedCount: items.filter((item) => item.reviewStatus !== "PENDENTE").length,
      };
    }));
  }

  async getBudget(id: string): Promise<Budget | null> {
    return (await this.listBudgets()).find((budget) => budget.id === id) ?? null;
  }
}
