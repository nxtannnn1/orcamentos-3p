import "server-only";
import type { PriceComparisonRepository } from "../../repositories/price-comparison-repository";
import type { PriceOffer } from "../../types/price-comparison";
import { DecisionError } from "../../domain/decision-error";
import { CORRECTION_COLUMNS } from "../../domain/item-correction";
import { correctionRecord, matchesCorrectedFields, originalEvidence } from "./correction-state";
import type { GraphCollection, GraphListItem, GraphReadTransport, SharePointRepositoryConfig } from "./sharepoint-types";

const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const lookup = (fields: Record<string, unknown>, name: string) => {
  const value = fields[`${name}LookupId`] ?? fields[name];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
};

/** GET-only adapter. No reference to a write transport or historical ingestion. */
export class SharePointPriceComparisonRepository implements PriceComparisonRepository {
  constructor(private readonly graph: GraphReadTransport, private readonly config: SharePointRepositoryConfig) {}

  private async readList(listId: string) {
    const rows: GraphListItem[] = [];
    const visited = new Set<string>();
    let path: string | undefined = `/sites/${encodeURIComponent(this.config.siteId)}/lists/${encodeURIComponent(listId)}/items?$expand=fields`;
    while (path) {
      if (visited.has(path) || visited.size >= 100) throw new DecisionError("Limite de paginação excedido.", 503, "LIST_LIMIT_EXCEEDED");
      visited.add(path);
      const page: GraphCollection<GraphListItem> = await this.graph.get(path);
      if (!page || !Array.isArray(page.value) || rows.length + page.value.length > 50_000 ||
          page.value.some(row => !row || typeof row.id !== "string" || !row.fields || typeof row.fields !== "object" || Array.isArray(row.fields)) ||
          (page["@odata.nextLink"] !== undefined && (typeof page["@odata.nextLink"] !== "string" || !page["@odata.nextLink"]?.trim())))
        throw new DecisionError("Resposta de lista inválida ou muito grande.", 502);
      rows.push(...page.value);
      path = page["@odata.nextLink"];
    }
    return rows;
  }

  async listOffersByMaterial(materialId: string): Promise<PriceOffer[]> {
    if (!/^[1-9]\d*$/.test(materialId)) throw new DecisionError("ID de material inválido.");
    const materials = await this.readList(this.config.materialsListId);
    if (!materials.some(row => row.id === materialId)) return [];
    const budgets = new Map((await this.readList(this.config.budgetsListId)).map(row => [row.id, row]));
    const items = await this.readList(this.config.itemsListId);
    const { items: f, budgets: b } = this.config.fields;
    const offers = new Map<string, PriceOffer>();
    for (const row of items) {
      if (row.fields[f.status] !== "APROVADO" || lookup(row.fields, f.approvedMaterialLookupId) !== materialId) continue;
      if (Object.values(CORRECTION_COLUMNS).some(field => !!row.fields[field])) {
        const record = correctionRecord(row);
        const original = originalEvidence(row);
        if (!record || !original || record.originalHash !== original.hash || record.values.materialId !== materialId || !matchesCorrectedFields(row, record.values, this.config))
          throw new DecisionError("Oferta corrigida sem proveniência consistente. Reconciliation necessária.", 503, "CORRECTION_EVIDENCE_INVALID");
      }
      if (typeof row.id !== "string" || !/^[1-9]\d*$/.test(row.id))
        throw new DecisionError("Identidade de item inválida na fonte de dados.", 502);
      const budgetId = lookup(row.fields, f.budgetLookupId);
      const budget = budgetId ? budgets.get(budgetId) : undefined;
      const offer: PriceOffer = {
        id: `item:${row.id}`, approvedMaterialId: materialId,
        supplier: text(row.fields[f.supplier ?? "Fornecedor"]),
        unit: text(row.fields[f.unit]),
        unitPrice: typeof row.fields[f.unitPrice] === "number" && Number.isFinite(row.fields[f.unitPrice]) ? row.fields[f.unitPrice] as number : null,
        budgetId: budget?.id ?? null,
        budgetCode: budget ? text(budget.fields[b.code]) : null,
        budgetDate: budget ? text(budget.fields[b.date]) : null,
      };
      const previous = offers.get(offer.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(offer))
        throw new DecisionError("Item repetido com dados divergentes. Recarregue a comparação.", 409, "PRICE_OFFER_CONFLICT");
      offers.set(offer.id, offer);
    }
    return [...offers.values()];
  }
}
