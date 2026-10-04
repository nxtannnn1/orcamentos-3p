import type { OperatorRepository } from "../operator-repository";
import type {
  Budget,
  BudgetItem,
  ItemDecision,
  OfficialMaterial,
  DecisionContext,
} from "../../types/operator";

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "GET", headers: { Accept: "application/json" } });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "Não foi possível carregar os dados.");
  }
  return response.json() as Promise<T>;
}

export class BffOperatorRepository implements OperatorRepository {
  async saveItemDecision(
    id: string,
    decision: ItemDecision,
    context?: DecisionContext,
  ): Promise<BudgetItem> {
    const response = await fetch(`/api/itens/${encodeURIComponent(id)}/decisao`, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(context?.version ? { "If-Match": context.version } : {}),
      },
      body: JSON.stringify({
        action: decision.action,
        approvedMaterialId: decision.approvedMaterial?.id ?? null,
        observation: decision.observation,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(
        payload?.message ??
          "Não foi possível confirmar a gravação. Recarregue os dados antes de tentar novamente.",
      );
    }
    return response.json() as Promise<BudgetItem>;
  }
  listBudgets() {
    return readJson<Budget[]>("/api/orcamentos");
  }
  async getBudget(id: string) {
    return (await this.listBudgets()).find((budget) => budget.id === id) ?? null;
  }
  listItemsByBudget(id: string) {
    return readJson<BudgetItem[]>(`/api/orcamentos/${encodeURIComponent(id)}/itens`);
  }
  listOfficialMaterials(query = "") {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const suffix = params.size ? `?${params}` : "";
    return readJson<OfficialMaterial[]>(`/api/materiais${suffix}`);
  }
}

export const operatorBff = new BffOperatorRepository();
