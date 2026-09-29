import type { ReadOnlyOperatorRepository } from "../operator-repository";
import type { Budget, BudgetItem, OfficialMaterial } from "../../types/operator";

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "GET", headers: { Accept: "application/json" } });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? "Não foi possível carregar os dados.");
  }
  return response.json() as Promise<T>;
}

export class BffOperatorRepository implements ReadOnlyOperatorRepository {
  listBudgets() { return readJson<Budget[]>("/api/orcamentos"); }
  async getBudget(id: string) { return (await this.listBudgets()).find((budget) => budget.id === id) ?? null; }
  listItemsByBudget(id: string) { return readJson<BudgetItem[]>(`/api/orcamentos/${encodeURIComponent(id)}/itens`); }
  listOfficialMaterials(query = "") {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const suffix = params.size ? `?${params}` : "";
    return readJson<OfficialMaterial[]>(`/api/materiais${suffix}`);
  }
}

export const operatorBff = new BffOperatorRepository();
