import type { OperatorRepository } from "../../repositories/operator-repository";
import type {
  Budget,
  BudgetItem,
  ItemDecision,
  OfficialMaterial,
  DecisionContext,
} from "../../types/operator";
import { createHash, randomUUID } from "node:crypto";
import { securityCommand } from "../security/store";
import { DecisionError } from "../../domain/decision-error";
import { mapBudget, mapBudgetItem, mapOfficialMaterial } from "./sharepoint-mapper";
import type {
  GraphCollection,
  GraphListItem,
  GraphReadTransport,
  GraphWriteTransport,
  SharePointRepositoryConfig,
} from "./sharepoint-types";

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
    const visited = new Set<string>();
    while (path) {
      if (visited.has(path) || visited.size >= 100 || result.length >= 50_000) {
        throw new DecisionError(
          "Lista excede o limite de leitura segura.",
          503,
          "LIST_LIMIT_EXCEEDED",
        );
      }
      visited.add(path);
      const page: GraphCollection<GraphListItem> = await this.graph.get(path);
      if (!Array.isArray(page.value) || result.length + page.value.length > 50_000)
        throw new DecisionError("Resposta de lista inválida ou muito grande.", 502);
      result.push(...page.value);
      path = page["@odata.nextLink"];
    }
    return result;
  }

  async listOfficialMaterials(query = ""): Promise<OfficialMaterial[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    const materials = (await this.readList(this.config.materialsListId)).map((item) =>
      mapOfficialMaterial(item, this.config.fields.materials),
    );
    return materials.filter(
      (material) =>
        !normalizedQuery ||
        `${material.code} ${material.name} ${material.family}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedQuery),
    );
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
    const budgets = (await this.readList(this.config.budgetsListId)).map((item) =>
      mapBudget(item, this.config.fields.budgets),
    );
    const counts = new Map<string, { itemCount: number; reviewedCount: number }>();
    // As contagens dispensam materiais e não precisam reler a lista por orçamento.
    for (const item of await this.readList(this.config.itemsListId)) {
      const mapped = mapBudgetItem(item, this.config.fields.items, new Map());
      const count = counts.get(mapped.budgetId) ?? { itemCount: 0, reviewedCount: 0 };
      count.itemCount++;
      if (mapped.reviewStatus !== "PENDENTE") count.reviewedCount++;
      counts.set(mapped.budgetId, count);
    }
    return budgets.map((budget) => {
      return {
        ...budget,
        ...(counts.get(budget.id) ?? { itemCount: 0, reviewedCount: 0 }),
      };
    });
  }

  async getBudget(id: string): Promise<Budget | null> {
    return (await this.listBudgets()).find((budget) => budget.id === id) ?? null;
  }

  async saveItemDecision(
    id: string,
    decision: ItemDecision,
    context?: DecisionContext,
  ): Promise<BudgetItem> {
    if (!/^[1-9]\d*$/.test(id)) throw new DecisionError("ID de item inválido.");
    if (
      !decision ||
      !["APPROVE", "REJECT"].includes(decision.action) ||
      typeof decision.observation !== "string"
    ) {
      throw new DecisionError("Decisão inválida.");
    }
    if (decision.action === "REJECT" && decision.approvedMaterial !== null) {
      throw new DecisionError("Rejeição não pode incluir material aprovado.");
    }
    if (!this.graph.patch) throw new DecisionError("Transporte sem suporte a escrita.", 503);
    if (
      process.env.NODE_ENV !== "test" &&
      (!process.env.SECURITY_REDIS_REST_URL || !process.env.SECURITY_REDIS_REST_TOKEN)
    ) {
      throw new DecisionError(
        "Configure auditoria compartilhada antes de liberar escrita.",
        503,
        "AUDIT_NOT_CONFIGURED",
      );
    }
    if (
      !context?.version ||
      context.version === "*" ||
      context.version.length > 512 ||
      /[\r\n]/.test(context.version)
    ) {
      throw new DecisionError("Recarregue o item antes de decidir.", 428, "VERSION_REQUIRED");
    }
    if (!context.actor?.oid || !context.actor.tenantId)
      throw new DecisionError("Autoria da decisão ausente.", 403);
    const { reviewedByOid, reviewedAt, decisionId: decisionIdField } = this.config.fields.items;
    if (!reviewedByOid || !reviewedAt || !decisionIdField) {
      throw new DecisionError(
        "Configure as colunas de autoria, data e identificador da decisão antes de liberar escrita.",
        503,
        "AUDIT_NOT_CONFIGURED",
      );
    }
    const materials = await this.listOfficialMaterials();
    const material =
      decision.action === "APPROVE"
        ? materials.find((entry) => entry.id === decision.approvedMaterial?.id)
        : null;
    if (decision.action === "APPROVE" && (!material || !/^[1-9]\d*$/.test(material.id))) {
      throw new DecisionError(
        "Escolha explicitamente um Material Oficial válido antes de aprovar.",
      );
    }
    const path = `/sites/${encodeURIComponent(this.config.siteId)}/lists/${encodeURIComponent(this.config.itemsListId)}/items/${id}`;
    const current = await this.graph.get<GraphListItem>(`${path}?$expand=fields`);
    if ((current.eTag ?? current["@odata.etag"]) !== context.version) {
      throw new DecisionError(
        "Este item foi alterado. Recarregue os dados antes de decidir.",
        409,
        "DECISION_CONFLICT",
      );
    }
    const currentItem = mapBudgetItem(
      current,
      this.config.fields.items,
      new Map(materials.map((entry) => [entry.id, entry])),
    );
    if (
      decision.action === "APPROVE" &&
      (typeof current.fields.Fornecedor !== "string" || !current.fields.Fornecedor.trim())
    ) {
      throw new DecisionError(
        "Informe o fornecedor do item antes de aprovar.",
        409,
        "SUPPLIER_REQUIRED",
      );
    }
    const budget = (await this.readList(this.config.budgetsListId)).find(
      (entry) => entry.id === currentItem.budgetId,
    );
    if (!budget || mapBudget(budget, this.config.fields.budgets).status === "CONCLUIDO") {
      throw new DecisionError("O orçamento não está aberto para revisão.", 409, "BUDGET_CLOSED");
    }
    const status = decision.action === "APPROVE" ? "APROVADO" : "REJEITADO";
    const decisionId = randomUUID();
    const decidedAt = new Date().toISOString();
    const auditKey = `3p:audit:${createHash("sha256").update(`${this.config.siteId}:${this.config.itemsListId}`).digest("hex")}:${decisionId}`;
    const audit = {
      decisionId,
      decidedAt,
      actor: context.actor,
      itemId: id,
      budgetId: currentItem.budgetId,
      previousVersion: context.version,
      previousStatus: currentItem.reviewStatus,
      previousMaterialId: currentItem.approvedMaterial?.id ?? null,
      status,
      materialId: material?.id ?? null,
      observationHash: createHash("sha256").update(decision.observation).digest("hex"),
    };
    // Registre a intenção antes de gravar. Se a resposta falhar, o ID da decisão
    // no SharePoint permite conferir o que realmente foi persistido.
    if (
      (await securityCommand(["SET", `${auditKey}:intent`, JSON.stringify(audit), "NX"])) !== "OK"
    ) {
      throw new DecisionError(
        "Não foi possível registrar a auditoria. Nenhuma gravação foi enviada.",
        503,
      );
    }
    // Lista explícita de campos: Material_Sugerido_Ref nunca participa do PATCH.
    let updated: Record<string, unknown>;
    try {
      updated = await this.graph.patch<Record<string, unknown>>(
        `${path}/fields`,
        {
          Material_AprovadoLookupId: material?.id ?? null,
          Status_Revisao: status,
          Observacao_Item: decision.observation,
          [reviewedByOid]: context.actor.oid,
          [reviewedAt]: decidedAt,
          [decisionIdField]: decisionId,
        },
        context.version,
      );
    } catch (error) {
      const outcome =
        error instanceof DecisionError && [403, 404, 409].includes(error.status)
          ? "denied"
          : "unconfirmed";
      await securityCommand([
        "SET",
        `${auditKey}:outcome`,
        JSON.stringify({ outcome, at: new Date().toISOString() }),
        "NX",
      ]);
      throw error;
    }
    await securityCommand([
      "SET",
      `${auditKey}:outcome`,
      JSON.stringify({ outcome: "confirmed", at: new Date().toISOString() }),
      "NX",
    ]);
    return {
      ...currentItem,
      // Nunca reutilize a versão anterior. Se o Graph não devolver a nova versão,
      // uma próxima decisão exige recarregar o item.
      version: typeof updated["@odata.etag"] === "string" ? updated["@odata.etag"] : undefined,
      approvedMaterial: material ?? null,
      reviewStatus: status,
      observation: decision.observation,
    };
  }
}
