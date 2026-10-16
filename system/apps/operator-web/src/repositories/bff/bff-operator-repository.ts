import type { OperatorRepository } from "../operator-repository";
import type { CorrectionInput, CorrectionResult } from "../../domain/item-correction";
import { CorrectionRequestError } from "./correction-error";
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
  private async correctionRequest(id: string, body: unknown, method: "PATCH" | "POST", version?: string): Promise<CorrectionResult> {
    const response = await fetch(`/api/itens/${encodeURIComponent(id)}/correcao`, {
      method, headers: { "Content-Type": "application/json", Accept: "application/json", ...(version ? { "If-Match": version } : {}) }, body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
      throw new CorrectionRequestError(payload?.message ?? "Correção não confirmada. Releia e reconcilie antes de tentar novamente.", payload?.error);
    }
    const result = await response.json() as CorrectionResult;
    if (result.status !== "confirmed" || result.requiresReload !== true || result.operationId !== (body as { operationId: string }).operationId)
      throw new CorrectionRequestError("Resposta de correção não confirmada.");
    return result;
  }
  saveItemCorrection(id: string, input: CorrectionInput, context: DecisionContext) { return this.correctionRequest(id, input, "PATCH", context.version); }
  reconcileItemCorrection(id: string, operationId: string) { return this.correctionRequest(id, { operationId }, "POST"); }
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
