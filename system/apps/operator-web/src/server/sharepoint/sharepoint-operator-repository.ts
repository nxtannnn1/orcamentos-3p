import type { OperatorRepository } from "../../repositories/operator-repository";
import type { Budget, BudgetItem, ItemDecision, OfficialMaterial } from "../../types/operator";
import { DecisionError } from "../../domain/decision-error";
import { mapBudget, mapBudgetItem, mapOfficialMaterial } from "./sharepoint-mapper";
import type { GraphCollection, GraphListItem, GraphReadTransport, GraphWriteTransport, SharePointRepositoryConfig } from "./sharepoint-types";

const listPath = (siteId: string, listId: string) =>
  `/sites/${encodeURIComponent(siteId)}/lists/${encodeURIComponent(listId)}/items?$expand=fields`;

export class SharePointOperatorRepository implements OperatorRepository {
  constructor(
    private readonly graph: GraphReadTransport & Partial<GraphWriteTransport>,
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

  async saveItemDecision(id: string, decision: ItemDecision): Promise<BudgetItem> {
    if (!/^[1-9]\d*$/.test(id)) throw new DecisionError("ID de item inválido.");
    if (!decision || !["APPROVE", "REJECT"].includes(decision.action) || typeof decision.observation !== "string") {
      throw new DecisionError("Decisão inválida.");
    }
    if (decision.action === "REJECT" && decision.approvedMaterial !== null) {
      throw new DecisionError("Rejeição não pode incluir material aprovado.");
    }
    if (!this.graph.patch) throw new DecisionError("Transporte sem suporte a escrita.", 503);
    const materials = await this.listOfficialMaterials();
    const material = decision.action === "APPROVE"
      ? materials.find((entry) => entry.id === decision.approvedMaterial?.id) : null;
    if (decision.action === "APPROVE" && (!material || !/^[1-9]\d*$/.test(material.id))) {
      throw new DecisionError("Escolha explicitamente um Material Oficial válido antes de aprovar.");
    }
    const path = `/sites/${encodeURIComponent(this.config.siteId)}/lists/${encodeURIComponent(this.config.itemsListId)}/items/${id}`;
    const current = await this.graph.get<GraphListItem>(`${path}?$expand=fields`);
    const status = decision.action === "APPROVE" ? "APROVADO" : "REJEITADO";
    // Lista explícita de campos: Material_Sugerido_Ref nunca participa do PATCH.
    await this.graph.patch(`${path}/fields`, {
      Material_AprovadoLookupId: material?.id ?? null,
      Status_Revisao: status,
      Observacao_Item: decision.observation,
    });
    return {
      ...mapBudgetItem(current, this.config.fields.items, new Map(materials.map((entry) => [entry.id, entry]))),
      approvedMaterial: material ?? null,
      reviewStatus: status,
      observation: decision.observation,
    };
  }
}
