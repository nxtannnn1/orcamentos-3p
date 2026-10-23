"use client";
import { rejectionJustificationIssue, validateRejectionJustification } from "../domain/rejection-justification";
import Link from "next/link";
import { decisionConfirmationNotice, decisionSuccessMessage } from "./decision-messages";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewSession } from "../domain/review-session";
import { ReviewController } from "../domain/review-controller";
import { extractionIssues } from "../domain/approval-validation";
import { operatorBff } from "../repositories/bff/bff-operator-repository";
import type { Budget, OfficialMaterial } from "../types/operator";
import { ItemList } from "./item-list";
import { MaterialAutocomplete } from "./material-autocomplete";
import { StatusBadge } from "./status-badge";
import { HumanCorrectionEditor } from "./human-correction-editor";
import { DecisionBlockNotice, DecisionButtons, itemDecisionBlock } from "./decision-actions";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numeric = (value: number | null, currency = false) =>
  value === null || !Number.isFinite(value) ? "Não informado / inválido" : currency ? money.format(value) : value.toLocaleString("pt-BR");
const dateTime = (value: string | null) =>
  value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("pt-BR") : value || "Não informada";

export function ValidationWorkspace({ budgetId, canWrite = false, writeUnavailableReason = null }: { budgetId: string; canWrite?: boolean; writeUnavailableReason?: string | null }) {
  const [controller] = useState(() => new ReviewController(operatorBff));
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [materials, setMaterials] = useState<OfficialMaterial[]>([]);
  const [session, setSession] = useState<ReviewSession>({ items: [], selectedIndex: 0 });
  const [chosen, setChosen] = useState<OfficialMaterial | null>(null);
  const [observation, setObservation] = useState("");
  const [rejectionJustification, setRejectionJustification] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [draftDirty, setDraftDirty] = useState(false);
  const [editingCorrection, setEditingCorrection] = useState(false);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionPending, setCorrectionPending] = useState(false);
  const onCorrectionDirty = useCallback((dirty: boolean) => { setDraftDirty(dirty); controller.setUnsavedChanges(dirty); }, [controller]);
  const onCorrectionSaved = useCallback(() => {
    controller.setUnsavedChanges(false); controller.requireReload(); setDraftDirty(false); setEditingCorrection(false);
    setReloadRequired(true); setMessage("Correção confirmada pela fonte atual. Releia os dados antes de aprovar ou rejeitar.");
  }, [controller]);
  const onCorrectionUncertain = useCallback(() => { controller.requireReload(); setReloadRequired(true); }, [controller]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return null;
      setLoading(true);
      setError("");
      return Promise.all([controller.load(budgetId), operatorBff.getBudget(budgetId), operatorBff.listOfficialMaterials()]);
    }).then((result) => {
      if (!result || !active) return;
      const [next, foundBudget, officialMaterials] = result;
      if (!foundBudget) { setError("Orçamento não encontrado."); return; }
      const selected = next.items[next.selectedIndex];
      setSession(next);
      setBudget(foundBudget);
      setMaterials(officialMaterials);
      setChosen(officialMaterials.find(material => material.id === selected?.correction?.values.materialId) ?? selected?.approvedMaterial ?? null);
      setObservation(selected?.observation ?? "");
      setRejectionJustification("");
      setReloadRequired(false);
      setMessage("");
      setDraftDirty(false); setEditingCorrection(false);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o orçamento.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [budgetId, controller, reloadVersion]);

  if (loading) return <main className="loading" role="status">Carregando orçamento...</main>;
  if (error || !budget) return <main className="loading"><p role="alert">{error || "Orçamento não encontrado."}</p><button onClick={() => setReloadVersion(value => value + 1)}>Tentar carregar novamente</button><p><Link href="/">← Voltar para fila</Link></p></main>;
  if (!session.items.length) return <main className="validation-shell"><Link href="/">← Voltar para fila</Link><h1>{budget.code}</h1><p className="empty">Este orçamento não possui itens disponíveis para revisão.</p></main>;

  const item = session.items[session.selectedIndex] ?? session.items[0];
  const reviewed = session.items.filter(entry => entry.reviewStatus !== "PENDENTE").length;
  const issues = extractionIssues(item);
  const rejectionIssue = rejectionJustificationIssue(rejectionJustification);
  const editorLocked = saving || reloadRequired || budget.readOnly === true || budget.status === "CONCLUIDO";
  // Display only: the backend enforces the same rule (status and Enviado_Historico) independently.
  const decisionBlock = itemDecisionBlock(item);
  const locked = editorLocked || !canWrite || draftDirty || editingCorrection || correctionBusy || correctionPending || decisionBlock !== null;

  function navigate(action: () => void) {
    if (saving || correctionBusy) return;
    if (draftDirty && !window.confirm("Descartar alterações locais não salvas antes de navegar/reler?")) return;
    controller.setUnsavedChanges(false); setDraftDirty(false); setEditingCorrection(false); action();
  }

  function activate(next: ReviewSession) {
    const selected = next.items[next.selectedIndex];
    setSession(next);
    setChosen(materials.find(material => material.id === selected?.correction?.values.materialId) ?? selected?.approvedMaterial ?? null);
    setObservation(selected?.observation ?? "");
    setRejectionJustification("");
    if (!reloadRequired) setMessage("");
  }
  async function decide(action: "APPROVE" | "REJECT") {
    if (pending.current || locked || (action === "APPROVE" && (!chosen || issues.length))) return;
    let decisionObservation = observation;
    if (action === "REJECT") {
      try { decisionObservation = validateRejectionJustification(rejectionJustification); }
      catch (cause) { setMessage(cause instanceof Error ? cause.message : "Justificativa inválida."); return; }
    }
    const summary = action === "APPROVE" ? `Aprovar o item ${item.itemNumber ?? item.id} como ${chosen!.code} · ${chosen!.name}?` : `Rejeitar o item ${item.itemNumber ?? item.id}?`;
    if (!window.confirm(`${summary}\n\n${item.originalDescription}\nQuantidade: ${numeric(item.quantity)} ${item.unit}\nPreço unitário: ${numeric(item.unitPrice, true)}\nPreço total: ${numeric(item.totalPrice, true)}\nFornecedor: ${item.supplier || "Não informado"}\nObservação: ${decisionObservation || "Sem observação"}\n\n${decisionConfirmationNotice(item.dataOrigin)}`)) return;
    pending.current = true;
    setSaving(true);
    setMessage("");
    try {
      const next = action === "APPROVE" ? await controller.approveAndNext(chosen, observation) : await controller.reject(decisionObservation);
      activate(next);
      // Shown only after the backend confirmed the write by read-back; the approver comes from the persisted item.
      const decided = next.items.find(entry => entry.id === item.id)?.lastDecision;
      setMessage(`${decisionSuccessMessage(action, item.itemNumber ?? item.id, item.dataOrigin)}${decided?.approverName ? ` Registrado por ${decided.approverName}${decided.approverEmail ? ` (${decided.approverEmail})` : ""}.` : ""}`);
    } catch (cause) {
      setReloadRequired(true);
      setMessage(`${cause instanceof Error ? cause.message : "Não foi possível confirmar a gravação."} Releia os dados antes de decidir novamente.`);
    } finally { pending.current = false; setSaving(false); }
  }

  return <main className="validation-shell" aria-busy={saving}>
    <div className="validation-topbar"><div><Link href="/">← Voltar para fila</Link><h1>{budget.code || "Código não informado"}</h1><p>{budget.supplier || "Fornecedor do orçamento não informado"} · {session.items.length} itens</p></div>
      <div className="review-progress"><span>{budget.reviewAvailable === false ? "Consulta PostgreSQL — decisões indisponíveis" : "Progresso da revisão"}</span>{budget.reviewAvailable !== false && <><strong>{reviewed} / {session.items.length}</strong><progress max={session.items.length} value={reviewed} /></>}</div></div>
    <div className="validation-grid">
      <ItemList items={session.items} selectedId={item.id} onSelect={id => id !== item.id && navigate(() => activate(controller.select(id)))} />
      <section className="detail-panel">
        <header className="detail-heading"><div><p className="eyebrow">Item {item.itemNumber === null ? "sem número" : String(item.itemNumber).padStart(2, "0")}</p><h2>Conferência do material</h2></div>{item.reviewAvailable === false ? <span>Revisão não disponível</span> : <StatusBadge status={item.reviewStatus} />}</header>
        <div className="description"><span>{item.correction ? "Descrição conferida" : "Descrição original"}</span><strong>{item.originalDescription || "Não informada"}</strong><span>Fornecedor do item: {item.supplier || "Não informado"}</span></div>
        <div className="metrics"><div><span>Quantidade</span><b>{numeric(item.quantity)}</b></div><div><span>Unidade</span><b>{item.unit || "Não informada"}</b></div><div><span>Preço unitário</span><b>{numeric(item.unitPrice, true)}</b></div><div><span>Preço total</span><b>{numeric(item.totalPrice, true)}</b></div></div>
        {!!issues.length && <div className="feedback" role="note"><strong>Conferência pendente</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p>A aprovação exige dados completos. Use a correção auditável quando autorizada; a extração original será preservada como evidência.</p></div>}
        {budget.reviewAvailable !== false && <HumanCorrectionEditor key={`${item.id}:${item.version ?? "none"}`} item={item} materials={materials} canWrite={canWrite} locked={editorLocked} onDirty={onCorrectionDirty} onEditing={setEditingCorrection} onBusy={setCorrectionBusy} onPending={setCorrectionPending} onSaved={onCorrectionSaved} onUncertain={onCorrectionUncertain} />}
        <div className="decision-grid">
          <section className="suggestion"><label>{budget.reviewAvailable === false ? "Material associado" : "Sugestão do sistema"} <em>Somente referência</em></label>{item.suggestedMaterial ? <div className="material-card"><strong>{item.suggestedMaterial.code} · {item.suggestedMaterial.name}</strong><span>{item.suggestedMaterial.family}</span></div> : <div className="empty">Nenhuma sugestão disponível</div>}</section>
          <section className="approval"><label>Material aprovado <em>Decisão humana</em></label><fieldset disabled={locked || !!item.correction} style={{ border: 0, padding: 0, margin: 0 }}><MaterialAutocomplete materials={materials} value={chosen} onChange={setChosen} /></fieldset><small>{item.correction ? "Seleção persistida na correção. Para mudar, edite e salve nova correção antes de aprovar." : "A sugestão nunca é selecionada automaticamente. Escolha um material para aprovar."}</small></section>
        </div>
        <label className="observation">Observação<textarea disabled={locked || !!item.correction} value={observation} onChange={event => setObservation(event.target.value)} rows={3} maxLength={2000} placeholder="Registre um comentário para esta decisão..." /></label>
        <label className="observation">Justificativa da rejeição<textarea aria-describedby="rejection-help" disabled={locked} value={rejectionJustification} onChange={event => setRejectionJustification(event.target.value)} rows={3} minLength={10} maxLength={2000} placeholder="Explique por que o item deve ser rejeitado..." /></label>
        <small id="rejection-help">{rejectionIssue ?? "Justificativa válida para rejeição."} A justificativa da rejeição é independente da observação da correção.</small>
        <DecisionBlockNotice block={decisionBlock} />
        {item.lastDecision && <section className="description" aria-label="Última decisão registrada"><strong>Última decisão registrada</strong><span>Status: {item.reviewStatus}</span><span>Responsável: {item.lastDecision.approverName || "Não informado"}{item.lastDecision.approverEmail ? ` (${item.lastDecision.approverEmail})` : ""}</span><span>Data registrada: {dateTime(item.lastDecision.at)}</span><span>Identificador: {item.lastDecision.id || "Não informado"}</span><span>Responsável (OID): {item.lastDecision.actorOid || "Não informado"}</span>{!item.lastDecision.approverName && item.lastDecision.personLookupId && <span>Registro anterior — Pessoa no site: {item.lastDecision.personLookupId}</span>}<small>Este é o registro atual do item. O histórico completo de decisões ainda depende de consulta auditável; não é reconstruído a partir de Editor ou Modified.</small></section>}
        {budget.status === "CONCLUIDO" && <p className="feedback">Orçamento concluído: decisões bloqueadas.</p>}
        {!canWrite && <p className="feedback">{writeUnavailableReason || "Seu acesso permite somente consulta."}</p>}
        {message && <div className="feedback" role={reloadRequired ? "alert" : "status"}>{message}</div>}
        <footer className="actions"><div><button onClick={() => navigate(() => activate(controller.move(-1)))} disabled={saving || correctionBusy || !session.selectedIndex}>← Anterior</button><button onClick={() => navigate(() => activate(controller.move(1)))} disabled={saving || correctionBusy || session.selectedIndex === session.items.length - 1}>Próximo →</button><button disabled={saving || correctionBusy} onClick={() => navigate(() => setReloadVersion(value => value + 1))}>Reler dados</button></div><DecisionButtons block={decisionBlock} locked={locked} rejectionIssue={rejectionIssue} hasChosenMaterial={!!chosen} extractionIssueCount={issues.length} saving={saving} onReject={() => void decide("REJECT")} onApprove={() => void decide("APPROVE")} /></footer>
      </section>
    </div>
  </main>;
}
