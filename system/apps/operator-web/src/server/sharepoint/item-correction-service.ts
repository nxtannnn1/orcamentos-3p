import "server-only";
import { writeDefinitelyNotApplied } from "./graph-write-error";
import { DecisionError } from "../../domain/decision-error";
import { changedFields, CORRECTION_COLUMNS, OPERATION_ID, validateCorrectionInput, type CorrectionInput, type CorrectionRecord, type CorrectionResult, type ExtractionEvidence } from "../../domain/item-correction";
import type { DecisionContext } from "../../types/operator";
import { securityCommand } from "../security/store";
import { resolveDecisionPerson, unavailablePersonResolver, type SharePointPersonResolver } from "./person-resolver";
import { mapBudget } from "./sharepoint-mapper";
import { correctionRecord, decimalJson, digest, extractionValues, lookupValue, matchesCorrectedFields, originalEvidence, textValue, verifyCorrectionColumns } from "./correction-state";
import { verifiedLookupField, type VerifiedColumns } from "./sharepoint-values";
import type { GraphListItem, GraphWriteTransport, SharePointRepositoryConfig } from "./sharepoint-types";

import { RELEASE_CORRECTION_LOCK } from "../security/scripts";
export { RELEASE_CORRECTION_LOCK } from "../security/scripts";
const unconfirmed = (): never => { throw new DecisionError("Correção não confirmada. Releia e reconcilie a operação; não reenvie com outro identificador.", 503, "CORRECTION_UNCONFIRMED"); };
type Intent = CorrectionRecord & { evidence: ExtractionEvidence };

export class ItemCorrectionService {
  private readonly scope: string;
  constructor(private graph: GraphWriteTransport, private config: SharePointRepositoryConfig,
    private resolver: SharePointPersonResolver = unavailablePersonResolver,
    private command: typeof securityCommand = securityCommand) {
    this.scope = `3p:correction:${digest({ site: config.siteId, list: config.itemsListId })}`;
  }
  private path(id: string) { return `/sites/${encodeURIComponent(this.config.siteId)}/lists/${encodeURIComponent(this.config.itemsListId)}/items/${id}`; }
  private opKey(id: string) { return `${this.scope}:operation:${id}`; }
  private lockKey(id: string) { return `${this.scope}:item:${id}:pending`; }
  private evidenceKey(id: string) { return `${this.scope}:item:${id}:original`; }
  private guard(id: string, context: DecisionContext, enabled = true) {
    if ((enabled && !this.config.humanCorrections) || (process.env.NODE_ENV !== "test" && (!process.env.SECURITY_REDIS_REST_URL || !process.env.SECURITY_REDIS_REST_TOKEN)))
      throw new DecisionError("Correção humana bloqueada até homologar schema, identidade, permissões e auditoria durável.", 503, "CORRECTIONS_NOT_CONFIGURED");
    if (!/^[1-9]\d*$/.test(id) || !context.actor?.oid || !context.actor.tenantId || !this.config.tenantId ||
      context.actor.tenantId.toLowerCase() !== this.config.tenantId.toLowerCase()) throw new DecisionError("Identidade não autorizada.", 403, "CORRECTION_ACTOR_INVALID");
  }
  private async append(key: string, value: unknown) {
    const json = JSON.stringify(value);
    if ((await this.command(["SET", key, json, "NX"])) === "OK") return;
    if ((await this.command(["GET", key])) !== json) return unconfirmed();
  }
  private async release(id: string, operationId: string) {
    const result = await this.command(["EVAL", RELEASE_CORRECTION_LOCK, 1, this.lockKey(id), operationId]);
    if (result !== 0 && result !== 1) return unconfirmed();
  }
  async reconcile(id: string, operationId: string, context: DecisionContext): Promise<CorrectionResult> {
    return this.reconcileWith(id, operationId, context);
  }
  /** `columns` comes from this operation's schema check; otherwise columns are verified here before reading. */
  private async reconcileWith(id: string, operationId: string, context: DecisionContext, columns?: VerifiedColumns): Promise<CorrectionResult> {
    this.guard(id, context);
    if (!OPERATION_ID.test(operationId)) throw new DecisionError("UUID inválido.");
    const stored = await this.command(["GET", `${this.opKey(operationId)}:intent`]);
    if (typeof stored !== "string") return unconfirmed();
    const intent = JSON.parse(stored) as Intent;
    if (intent.itemId !== id || intent.actor.oid !== context.actor!.oid || intent.actor.tenantId !== context.actor!.tenantId)
      throw new DecisionError("Operação não pertence a esta identidade/item.", 403, "CORRECTION_ACTOR_INVALID");
    const outcome = await this.command(["GET", this.opKey(operationId) + ":outcome"]);
    if (typeof outcome === "string" && ["denied", "not_sent_pending"].includes(JSON.parse(outcome).outcome)) {
      // Recover a lost CAS response only after durable terminal evidence. CAS cannot release another operation.
      await this.release(id, operationId);
      throw new DecisionError("Esta operação não foi aplicada. Releia o item antes de iniciar outra correção.", 409, "CORRECTION_NOT_APPLIED");
    }
    const verified = columns ?? await verifyCorrectionColumns(this.graph, this.config);
    const current = await this.graph.get<GraphListItem>(`${this.path(id)}?$expand=fields`);
    const version = current.eTag ?? current["@odata.etag"];
    if (current.id !== id || typeof version !== "string" || !version.trim() || version === "*" ||
        version === intent.previousVersion || version.length > 512 || /[\r\n]/.test(version) ||
        current.fields.Status_Revisao !== "EM_REVISAO" || verifiedLookupField(current.fields, "Material_Aprovado", verified) !== null ||
        current.fields.Enviado_Historico !== "NAO") return unconfirmed();
    const record = correctionRecord(current);
    const original = originalEvidence(current);
    if (!record || !original || record.operationId !== operationId || JSON.stringify(record) !== JSON.stringify(this.recordOnly(intent)) ||
        JSON.stringify(original) !== JSON.stringify(intent.evidence) || !matchesCorrectedFields(current, intent.values, this.config) ||
        (await this.command(["GET", this.evidenceKey(id)])) !== JSON.stringify(original)) return unconfirmed();
    // Append a separate reconciliation proof; never overwrite an uncertain outcome.
    const proof = { operationId, fingerprint: intent.fingerprint, outcome: "confirmed" };
    await this.append(`${this.opKey(operationId)}:reconciled`, proof);
    await this.release(id, operationId);
    return { operationId, status: "confirmed", requiresReload: true };
  }
  private recordOnly(intent: Intent): CorrectionRecord { const { evidence, ...record } = intent; void evidence; return record; }
  // Rejection supplies its own reason; the persisted correction and all its fields still require verification.
  async assertDecisionState(current: GraphListItem, materialId: string | null, observation?: string) {
    const pending = await this.command(["GET", this.lockKey(current.id)]);
    if (pending) return unconfirmed();
    const record = correctionRecord(current);
    const original = originalEvidence(current);
    if (!record && !original && !(await this.command(["GET", this.evidenceKey(current.id)]))) return;
    if (!record || !original || record.originalHash !== original.hash || !matchesCorrectedFields(current, record.values, this.config) ||
        (observation !== undefined && record.values.observation !== observation) || (materialId !== null && record.values.materialId !== materialId)) return unconfirmed();
    const stored = await this.command(["GET", `${this.opKey(record.operationId)}:intent`]);
    const proof = await this.command(["GET", `${this.opKey(record.operationId)}:reconciled`]);
    if (typeof stored !== "string" || typeof proof !== "string" || (await this.command(["GET", this.evidenceKey(current.id)])) !== JSON.stringify(original)) return unconfirmed();
    const intent = JSON.parse(stored) as Intent;
    const result = JSON.parse(proof) as { fingerprint?: string; outcome?: string };
    if (JSON.stringify(record) !== JSON.stringify(this.recordOnly(intent)) || result.fingerprint !== record.fingerprint || result.outcome !== "confirmed") return unconfirmed();
  }
  async save(id: string, raw: CorrectionInput, context: DecisionContext): Promise<CorrectionResult> {
    this.guard(id, context);
    const input = validateCorrectionInput(raw);
    if (!context.version || context.version === "*" || context.version.length > 512 || /[\r\n]/.test(context.version))
      throw new DecisionError("Releia o item antes de corrigir.", 428, "VERSION_REQUIRED");
    const fingerprint = digest({ itemId: id, actor: context.actor, version: context.version, input });
    const operationKey = this.opKey(input.operationId);
    const previousIntent = await this.command(["GET", `${operationKey}:intent`]);
    if (previousIntent) {
      if (typeof previousIntent !== "string" || (JSON.parse(previousIntent) as Intent).fingerprint !== fingerprint)
        throw new DecisionError("UUID já utilizado com outro conteúdo, item ou identidade.", 409, "CORRECTION_OPERATION_CONFLICT");
      return this.reconcile(id, input.operationId, context);
    }
    const current = await this.graph.get<GraphListItem>(`${this.path(id)}?$expand=fields`);
    if ((current.eTag ?? current["@odata.etag"]) !== context.version)
      throw new DecisionError("Item alterado por outra operação. Releia antes de corrigir.", 409, "CORRECTION_CONFLICT");
    if (current.id !== id) throw new DecisionError("Identidade do item divergente.", 409, "CORRECTION_CONFLICT");
    const state = textValue(current.fields[this.config.fields.items.status]);
    if (!["PENDENTE", "EM_REVISAO", "CORRIGIR"].includes(state ?? "") || current.fields.Enviado_Historico !== "NAO")
      throw new DecisionError("Item concluído, enviado ou sem estado verificável. Reabertura exige procedimento separado.", 409, "CORRECTION_STATE_CLOSED");
    const budgetId = lookupValue(current.fields, this.config.fields.items.budgetLookupId);
    if (!budgetId || !/^[1-9]\d*$/.test(budgetId)) throw new DecisionError("Orçamento não identificado.", 409);
    const budget = await this.graph.get<GraphListItem>(`/sites/${encodeURIComponent(this.config.siteId)}/lists/${encodeURIComponent(this.config.budgetsListId)}/items/${budgetId}?$expand=fields`);
    if (mapBudget(budget, this.config.fields.budgets).status === "CONCLUIDO" || !["PENDENTE", "EM_REVISAO", "CORRIGIR"].includes(String(budget.fields[this.config.fields.budgets.status]))) throw new DecisionError("Orçamento concluído ou estado desconhecido.", 409, "BUDGET_CLOSED");
    if (input.values.materialId) {
      const material = await this.graph.get<GraphListItem>(`/sites/${encodeURIComponent(this.config.siteId)}/lists/${encodeURIComponent(this.config.materialsListId)}/items/${input.values.materialId}?$expand=fields`);
      if (material.id !== input.values.materialId || !textValue(material.fields[this.config.fields.materials.name])?.trim())
        throw new DecisionError("Material Oficial não encontrado.", 409, "CORRECTION_MATERIAL_INVALID");
    }
    const person = await resolveDecisionPerson(this.resolver, context.actor!, this.config.siteId, this.config.tenantId);
    const columns = await verifyCorrectionColumns(this.graph, this.config);
    const previous = correctionRecord(current);
    let evidence = originalEvidence(current);
    if (previous) {
      await this.assertDecisionState(current, null, previous.values.observation);
      if (!evidence || previous.originalHash !== evidence.hash) return unconfirmed();
    } else if (evidence) return unconfirmed();
    const before = previous?.values ?? extractionValues(current, this.config);
    if (!changedFields(before, input.values).length) throw new DecisionError("Nenhum campo foi alterado.", 400, "CORRECTION_EMPTY");
    const at = new Date().toISOString();
    if (!evidence) {
      const f = this.config.fields.items;
      const rawFields = [...new Set([f.description, f.quantity, f.unit, f.unitPrice, f.totalPrice, f.supplier ?? "Fornecedor", f.observation, `${f.approvedMaterialLookupId}LookupId`])];
      const snapshot = { itemId: id, budgetId, version: context.version, values: before,
        raw: Object.fromEntries(rawFields.map(field => [field, current.fields[field] ?? null])), documentFileId: textValue(current.fields.DriveFileId) };
      evidence = { schemaVersion: 1, capturedAt: at, snapshot, hash: digest(snapshot) };
      const existing = await this.command(["GET", this.evidenceKey(id)]);
      if (existing) {
        const parsed = typeof existing === "string" ? JSON.parse(existing) as ExtractionEvidence : null;
        if (!parsed || parsed.hash !== evidence.hash) return unconfirmed();
        evidence = parsed;
      } else if ((await this.command(["SET", this.evidenceKey(id), JSON.stringify(evidence), "NX"])) !== "OK") return unconfirmed();
    }
    const changes = changedFields(before, input.values, evidence.snapshot.values);
    if (!changes.length) throw new DecisionError("Nenhum campo foi alterado.", 400, "CORRECTION_EMPTY");
    const record: CorrectionRecord = { ...input, schemaVersion: 1, itemId: id, budgetId, at, actor: { ...context.actor! }, personLookupId: person.lookupId,
      previousVersion: context.version, previousOperationId: previous?.operationId ?? null, originalHash: evidence.hash, fingerprint, changes };
    if (JSON.stringify({ record, evidence }).length > 48000) throw new DecisionError("Evidência excede o limite seguro.", 413);
    const intent: Intent = { ...record, evidence };
    if ((await this.command(["SET", `${operationKey}:intent`, JSON.stringify(intent), "NX"])) !== "OK") {
      const winner = await this.command(["GET", `${operationKey}:intent`]);
      if (typeof winner !== "string" || (JSON.parse(winner) as Intent).fingerprint !== fingerprint)
        throw new DecisionError("UUID concorrente com conteúdo divergente.", 409, "CORRECTION_OPERATION_CONFLICT");
      return this.reconcile(id, input.operationId, context);
    }
    if ((await this.command(["SET", this.lockKey(id), input.operationId, "NX"])) !== "OK") {
      await this.append(`${operationKey}:outcome`, { operationId: input.operationId, outcome: "not_sent_pending" });
      throw new DecisionError("Há correção pendente. Reconcilie antes de editar.", 409, "CORRECTION_PENDING");
    }
    const f = this.config.fields.items;
    try {
      await this.graph.patch(`${this.path(id)}/fields`, {
        [f.description]: input.values.description, [f.quantity]: decimalJson(input.values.quantity), [f.unit]: input.values.unit,
        [f.unitPrice]: decimalJson(input.values.unitPrice), [f.totalPrice]: decimalJson(input.values.totalPrice),
        [f.supplier ?? "Fornecedor"]: input.values.supplier, [f.observation]: input.values.observation,
        Status_Revisao: "EM_REVISAO", Material_AprovadoLookupId: null,
        [CORRECTION_COLUMNS.original]: JSON.stringify(evidence), [CORRECTION_COLUMNS.record]: JSON.stringify(record), [CORRECTION_COLUMNS.operation]: input.operationId,
      }, context.version);
    } catch (error) {
      const denied = writeDefinitelyNotApplied(error);
      await this.append(`${operationKey}:outcome`, { operationId: input.operationId, outcome: denied ? "denied" : "unconfirmed" });
      if (denied) { await this.release(id, input.operationId); throw error; }
      return unconfirmed();
    }
    // A successful HTTP response is not enough: reread state and durable proof.
    return this.reconcileWith(id, input.operationId, context, columns);
  }
}
