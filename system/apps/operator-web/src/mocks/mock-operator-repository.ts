import { validateRejectionJustification } from "../domain/rejection-justification";
import { DecisionError } from "../domain/decision-error";
import { assertDecidable } from "../domain/decision-eligibility";
import { createHash, randomUUID } from "node:crypto";
import { changedFields, OPERATION_ID, validateCorrectionInput, type CorrectionInput, type CorrectionRecord, type CorrectionResult } from "../domain/item-correction";
import { draftFromItem } from "../domain/correction-draft";
import type { OperatorRepository } from "../repositories/operator-repository";
import type {
  Budget,
  BudgetItem,
  ItemDecision,
  OfficialMaterial,
  DecisionContext,
} from "../types/operator";
import { mockBudgets, mockItems, mockMaterials } from "./mock-data";
const clone = <T>(value: T): T => structuredClone(value);

export class MockOperatorRepository implements OperatorRepository {
  private budgets = clone(mockBudgets);
  private items: (BudgetItem & { version: string })[] = clone(mockItems).map((item) => ({ ...item, version: '"0"', correctionWriteEnabled: true, dataOrigin: "mock" }));
  private materials = clone(mockMaterials);
  // Ephemeral mock audit only; never a corporate identity or SharePoint person.
  private correctionOperations = new Map<string, { fingerprint: string; record: CorrectionRecord }>();
  /** Each mock item carries an explicit Enviado_Historico value (mock-data); ids listed here are forced to "SIM". */
  constructor(options: { sentToHistory?: Iterable<string> } = {}) {
    const sent = new Set(options.sentToHistory ?? []);
    for (const item of this.items) if (sent.has(item.id)) item.sentToHistory = "SIM";
  }

  async saveItemCorrection(id: string, raw: CorrectionInput, context: DecisionContext): Promise<CorrectionResult> {
    const input = validateCorrectionInput(raw, "mock");
    if (!context.actor?.oid || !context.actor.tenantId) throw new DecisionError("Autoria ausente.", 403, "CORRECTION_ACTOR_INVALID");
    if (!context.version || context.version === "*") throw new DecisionError("Releia o item antes de corrigir.", 428, "VERSION_REQUIRED");
    const fingerprint = createHash("sha256").update(JSON.stringify({ id, input, actor: context.actor, version: context.version })).digest("hex");
    const previousOperation = this.correctionOperations.get(input.operationId);
    if (previousOperation) {
      if (previousOperation.fingerprint !== fingerprint) throw new DecisionError("UUID com conteúdo divergente.", 409, "CORRECTION_OPERATION_CONFLICT");
      return this.reconcileItemCorrection(id, input.operationId, context);
    }
    const item = this.items.find(entry => entry.id === id);
    if (!item) throw new DecisionError("Item não encontrado.", 404);
    if (item.version !== context.version) throw new DecisionError("Item alterado. Releia antes de corrigir.", 409, "DECISION_CONFLICT");
    if (!["PENDENTE", "EM_REVISAO", "CORRIGIR"].includes(item.sourceStatus ?? item.reviewStatus))
      throw new DecisionError("Item fora de estado editável.", 409, "CORRECTION_STATE_INVALID");
    const budgetItems = this.items.filter(entry => entry.budgetId === item.budgetId);
    if (budgetItems.every(entry => !["PENDENTE", "EM_REVISAO"].includes(entry.reviewStatus)))
      throw new DecisionError("Orçamento concluído.", 409, "BUDGET_CLOSED");
    const material = this.materials.find(entry => entry.id === input.values.materialId);
    if (input.values.materialId && !material) throw new DecisionError("Material não encontrado.", 409, "CORRECTION_MATERIAL_INVALID");
    const before = draftFromItem(item);
    const original = item.extractionEvidence?.values ?? before;
    const changes = changedFields(before, input.values, original);
    if (!changes.length) throw new DecisionError("Nenhum campo foi alterado.", 400, "CORRECTION_EMPTY");
    const at = new Date().toISOString();
    const evidence = item.extractionEvidence ?? { capturedAt: at, hash: createHash("sha256").update(JSON.stringify(original)).digest("hex"), values: clone(original) };
    const record: CorrectionRecord = { ...clone(input), schemaVersion: 1, itemId: id, budgetId: item.budgetId, at,
      actor: { tenantId: context.actor.tenantId, oid: context.actor.oid },
      ...(context.actor.name && context.actor.email
        ? { approver: { name: context.actor.name, email: context.actor.email } } : { personLookupId: "mock-not-sharepoint" }),
      previousVersion: context.version,
      previousOperationId: item.correction?.operationId ?? null, originalHash: evidence.hash, fingerprint, changes };
    const values = input.values;
    Object.assign(item, { originalDescription: values.description, quantity: Number(values.quantity), unit: values.unit,
      unitPrice: Number(values.unitPrice), totalPrice: Number(values.totalPrice), supplier: values.supplier,
      observation: values.observation, approvedMaterial: null, reviewStatus: "PENDENTE", sourceStatus: "EM_REVISAO",
      correction: record, extractionEvidence: evidence, version: `"${Number(item.version!.slice(1, -1)) + 1}"` });
    this.correctionOperations.set(input.operationId, { fingerprint, record: clone(record) });
    return { operationId: input.operationId, status: "confirmed", requiresReload: true };
  }

  async reconcileItemCorrection(id: string, operationId: string, context: DecisionContext): Promise<CorrectionResult> {
    if (!OPERATION_ID.test(operationId)) throw new DecisionError("UUID inválido.");
    const operation = this.correctionOperations.get(operationId);
    if (!operation) throw new DecisionError("Correção não confirmada.", 503, "CORRECTION_UNCONFIRMED");
    if (operation.record.itemId !== id || operation.record.actor.oid !== context.actor?.oid || operation.record.actor.tenantId !== context.actor?.tenantId)
      throw new DecisionError("Operação de outra identidade/item.", 403, "CORRECTION_ACTOR_INVALID");
    const item = this.items.find(entry => entry.id === id);
    if (JSON.stringify(item?.correction) !== JSON.stringify(operation.record))
      throw new DecisionError("Correção não confirmada.", 503, "CORRECTION_UNCONFIRMED");
    return { operationId, status: "confirmed", requiresReload: true };
  }
  async listBudgets(): Promise<Budget[]> {
    return this.budgets.map((budget) => {
      const budgetItems = this.items.filter((item) => item.budgetId === budget.id);
      return clone({
        ...budget,
        itemCount: budgetItems.length,
        reviewedCount: budgetItems.filter((item) => item.reviewStatus !== "PENDENTE").length,
        status: budgetItems.every((item) => item.reviewStatus !== "PENDENTE")
          ? "CONCLUIDO"
          : "EM_REVISAO",
      });
    });
  }
  async getBudget(id: string) {
    return (await this.listBudgets()).find((budget) => budget.id === id) ?? null;
  }
  async listItemsByBudget(id: string): Promise<BudgetItem[]> {
    return clone(
      this.items
        .filter((item) => item.budgetId === id)
        .sort((left, right) => (left.itemNumber ?? Infinity) - (right.itemNumber ?? Infinity)),
    );
  }
  async listOfficialMaterials(query = ""): Promise<OfficialMaterial[]> {
    const normalizedQuery = query.trim().toLowerCase();
    return clone(
      this.materials.filter(
        (material) =>
          !normalizedQuery ||
          `${material.code} ${material.name} ${material.family}`
            .toLowerCase()
            .includes(normalizedQuery),
      ),
    );
  }
  async saveItemDecision(
    id: string,
    decision: ItemDecision,
    context?: DecisionContext,
  ): Promise<BudgetItem> {
    if (decision.action === "REJECT")
      decision = { ...decision, observation: validateRejectionJustification(decision.observation) };
    const item = this.items.find((entry) => entry.id === id);
    if (!item) throw new Error("Item não encontrado.");
    if (context && context.version !== item.version)
      throw new DecisionError(
        "Este item foi alterado. Recarregue os dados antes de decidir.",
        409,
        "DECISION_CONFLICT",
      );
    assertDecidable({ status: item.sourceStatus ?? item.reviewStatus, sentToHistory: item.sentToHistory });
    if (item.correction && decision.action === "APPROVE" &&
        (item.correction.values.observation !== decision.observation || item.correction.values.materialId !== decision.approvedMaterial.id))
      throw new DecisionError("Decisão diverge da correção persistida.", 409, "CORRECTION_UNCONFIRMED");
    item.version = `"${Number(item.version.slice(1, -1)) + 1}"`;
    item.reviewStatus = decision.action === "APPROVE" ? "APROVADO" : "REJEITADO";
    item.approvedMaterial = decision.action === "APPROVE" ? clone(decision.approvedMaterial) : null;
    item.observation = decision.observation;
    item.sourceStatus = item.reviewStatus;
    if (context?.actor) item.lastDecision = { id: randomUUID(), at: new Date().toISOString(), actorOid: context.actor.oid,
      approverName: context.actor.name ?? null, approverEmail: context.actor.email ?? null, personLookupId: null };
    return clone(item);
  }
}
export const createMockOperatorRepository = () => new MockOperatorRepository();
