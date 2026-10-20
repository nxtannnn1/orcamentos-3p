"use client";
import { useEffect, useRef, useState } from "react";
import type { BudgetItem, OfficialMaterial } from "../types/operator";
import { changedFields, correctionFields, totalDifference, validateCorrectionInput, type CorrectionValues } from "../domain/item-correction";
import { correctionLabels, draftFromItem, hasDraftChanges } from "../domain/correction-draft";
import { operatorBff } from "../repositories/bff/bff-operator-repository";
import { CorrectionRequestError } from "../repositories/bff/correction-error";

type Props = { item: BudgetItem; materials: OfficialMaterial[]; canWrite: boolean; locked: boolean;
  onDirty: (dirty: boolean) => void; onEditing: (editing: boolean) => void; onBusy: (busy: boolean) => void;
  onPending: (pending: boolean) => void; onSaved: () => void; onUncertain: () => void };

export function HumanCorrectionEditor({ item, materials, canWrite, locked, onDirty, onEditing, onBusy, onPending, onSaved, onUncertain }: Props) {
  const storageKey = `3p:correction-pending:${item.budgetId}:${item.id}`;
  const baseline = draftFromItem(item);
  const original = item.extractionEvidence?.values ?? baseline;
  const correctionSource = item.dataOrigin === "mock" ? "mock" : "sharepoint";
  const [draft, setDraft] = useState<CorrectionValues>(() => draftFromItem(item));
  const [editing, setEditing] = useState(false);
  const [justification, setJustification] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(() => {
    try { return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(storageKey); } catch { return null; }
  });
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const dirty = editing && hasDraftChanges(baseline, draft);
  const open = ["PENDENTE", "EM_REVISAO", "CORRIGIR"].includes(item.sourceStatus ?? item.reviewStatus);
  let difference: string | null = null;
  try { difference = totalDifference(draft); } catch { /* input validation is displayed before review/save */ }

  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => { onEditing(editing); }, [editing, onEditing]);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => { onPending(pendingId !== null); }, [pendingId, onPending]);
  useEffect(() => {
    if (!dirty && !pendingId) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (target && !window.confirm(pendingId ? "Há uma operação pendente de reconciliação. Sair desta tela? O UUID será mantido nesta aba." : "Descartar alterações não salvas e sair desta tela?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty, pendingId]);

  const display = (field: typeof correctionFields[number], value: string | null) => field === "materialId"
    ? (materials.find(material => material.id === value)?.name ?? (value ? `ID ${value}` : "Não associado")) : value || "Não informado";
  function review() {
    try {
      const value = validateCorrectionInput({ operationId: crypto.randomUUID(), values: draft, justification, acknowledgeTotalDifference: acknowledge }, correctionSource);
      if (!changedFields(baseline, value.values).length) throw new Error("Nenhum valor foi alterado.");
      setDraft(value.values); setReviewing(true); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Correção inválida."); }
  }
  async function save() {
    if (inFlight.current || pendingId || !reviewing || locked || !canWrite || !item.correctionWriteEnabled) return;
    const operationId = crypto.randomUUID();
    const input = validateCorrectionInput({ operationId, values: draft, justification, acknowledgeTotalDifference: acknowledge }, correctionSource);
    try { sessionStorage.setItem(storageKey, operationId); }
    catch { setError("Não foi possível preservar o UUID nesta aba. Nenhum envio realizado."); return; }
    inFlight.current = true; setBusy(true); setPendingId(operationId); setError("");
    try {
      await operatorBff.saveItemCorrection(item.id, input, { version: item.version });
      sessionStorage.removeItem(storageKey); setPendingId(null); setEditing(false); onSaved();
    } catch (cause) {
      if (cause instanceof CorrectionRequestError && !cause.requiresReconciliation) { sessionStorage.removeItem(storageKey); setPendingId(null); }
      setError(cause instanceof Error ? cause.message : "Correção não confirmada."); onUncertain();
    }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function reconcile() {
    if (!pendingId || inFlight.current || !canWrite) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      await operatorBff.reconcileItemCorrection(item.id, pendingId);
      sessionStorage.removeItem(storageKey); setPendingId(null); setEditing(false); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Reconciliação não confirmada."); onUncertain(); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="human-correction" aria-label="Correção humana auditável">
    {item.dataOrigin === "mock" && <p role="note">Dados fictícios: alterações e auditoria são mantidas neste processo. Reiniciar o servidor apaga esses dados.</p>}
    <header><div><h3>Correção humana</h3><p>Extração original → valor conferido pelo funcionário</p></div><button type="button" disabled={!canWrite || locked || !open || busy || !!pendingId} onClick={() => { setEditing(true); setReviewing(false); }}>Editar item</button></header>
    {!open && <p>Item aprovado, rejeitado ou em estado desconhecido: edição bloqueada. Reabertura exige procedimento auditável separado.</p>}
    {!item.correctionWriteEnabled && <p className="correction-warning">Persistência real bloqueada até homologar as colunas, a identidade, as permissões e a auditoria. O formulário não habilita escrita por si só.</p>}
    <div className="correction-scroll"><table><thead><tr><th>Campo</th><th>Original observado</th><th>{editing ? "Valor corrigido" : "Valor salvo"}</th></tr></thead><tbody>{correctionFields.map(field => <tr key={field} className={original[field] !== draft[field] ? "field-corrected" : ""}><th>{correctionLabels[field]}</th><td>{display(field, original[field])}</td><td>{editing ? field === "materialId"
      ? <select aria-label={correctionLabels[field]} disabled={busy || !!pendingId || locked} value={draft.materialId ?? ""} onChange={event => { setDraft({ ...draft, materialId: event.target.value || null }); setReviewing(false); }}><option value="">Não associado</option>{materials.map(material => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select>
      : <input aria-label={correctionLabels[field]} inputMode={["quantity", "unitPrice", "totalPrice"].includes(field) ? "decimal" : "text"} disabled={busy || !!pendingId || locked} value={draft[field] ?? ""} onChange={event => { setDraft({ ...draft, [field]: event.target.value }); setAcknowledge(false); setReviewing(false); }} />
      : display(field, baseline[field])}</td></tr>)}</tbody></table></div>
    {editing && <>
      <p>Decimais sem milhar, com vírgula ou ponto e até quatro casas. Salvar não aprova o item. Valores zero são preservados, mas a política atual de aprovação/comparação continua exigindo preços positivos.</p>
      {difference !== null && <label className="correction-warning"><input type="checkbox" checked={acknowledge} disabled={busy || !!pendingId || locked} onChange={event => { setAcknowledge(event.target.checked); setReviewing(false); }} /> O total informado difere do produto exato ({difference}). Conferi o valor comercial e justificarei a diferença; nenhum imposto, desconto ou total será recalculado.</label>}
      <label>Justificativa da intervenção<textarea aria-label="Justificativa da correção" minLength={10} maxLength={2000} value={justification} disabled={busy || !!pendingId || locked} onChange={event => { setJustification(event.target.value); setReviewing(false); }} /></label>
      {reviewing && <div className="correction-summary" role="status"><strong>Conferir alterações antes de salvar</strong><ul>{changedFields(baseline, draft, original).map(change => <li key={change.field}>{correctionLabels[change.field]}: {display(change.field, change.previous)} → {display(change.field, change.value)} (original: {display(change.field, change.extracted)})</li>)}</ul><p>Justificativa: {justification}</p></div>}
      <div className="correction-actions"><button disabled={busy || !!pendingId} onClick={() => { setDraft(draftFromItem(item)); setJustification(""); setAcknowledge(false); setEditing(false); setReviewing(false); setError(""); }}>Descartar alterações não salvas</button><button disabled={busy || !!pendingId || locked || !dirty} onClick={review}>Conferir alterações</button><button disabled={busy || !!pendingId || locked || !reviewing || !item.correctionWriteEnabled} onClick={() => void save()}>Salvar correção</button></div>
    </>}
    {pendingId && <div className="correction-warning" role="alert"><p>Operação {pendingId} pendente. A aprovação e novos envios permanecem bloqueados. O UUID foi preservado nesta aba.</p><button disabled={busy || !canWrite} onClick={() => void reconcile()}>Reler e reconciliar operação</button></div>}
    {busy && <p role="status">Processando correção e conferindo a persistência...</p>}
    {error && <p role="alert">{error}</p>}
    <p>Documento de origem: {item.documentEvidence?.reason === "FILE_REFERENCE_WITHOUT_AUTHORIZED_PREVIEW" ? "há referência de arquivo, mas a visualização ainda depende de acesso autorizado. Página e trecho OCR não foram fornecidos." : "nenhuma referência autorizada para visualização. Página e coordenadas não disponíveis."}</p>
  </section>;
}
