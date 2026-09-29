"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { approveItem, createReviewSession, moveSelection, rejectItem, selectItem, type ReviewSession } from "../domain/review-session";
import { operatorBff } from "../repositories/bff/bff-operator-repository";
import type { Budget, OfficialMaterial } from "../types/operator";
import { ItemList } from "./item-list";
import { MaterialAutocomplete } from "./material-autocomplete";
import { StatusBadge } from "./status-badge";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ValidationWorkspace({ budgetId }: { budgetId: string }) {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [materials, setMaterials] = useState<OfficialMaterial[]>([]);
  const [session, setSession] = useState<ReviewSession>({ items: [], selectedIndex: 0 });
  const [chosen, setChosen] = useState<OfficialMaterial | null>(null);
  const [observation, setObservation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      operatorBff.listItemsByBudget(budgetId),
      operatorBff.getBudget(budgetId),
      operatorBff.listOfficialMaterials(),
    ]).then(([items, foundBudget, officialMaterials]) => {
      const next = createReviewSession(items);
      const selected = next.items[next.selectedIndex];
      setSession(next);
      setBudget(foundBudget);
      setMaterials(officialMaterials);
      setChosen(selected?.approvedMaterial ?? null);
      setObservation(selected?.observation ?? "");
    }).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o orçamento."));
  }, [budgetId]);

  const item = session.items[session.selectedIndex];
  if (error) return <main className="loading">{error}</main>;
  if (!budget || !item) return <main className="loading">Carregando orçamento...</main>;
  const reviewed = session.items.filter((entry) => entry.reviewStatus !== "PENDENTE").length;

  function activate(next: ReviewSession) {
    const selected = next.items[next.selectedIndex];
    setSession(next);
    setChosen(selected?.approvedMaterial ?? null);
    setObservation(selected?.observation ?? "");
    setMessage("");
  }
  function approve() {
    try {
      activate(moveSelection(approveItem(session, chosen, observation), 1));
      setMessage("Decisão preservada nesta sessão de demonstração.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível aprovar.");
    }
  }
  function reject() {
    setSession(rejectItem(session, observation));
    setChosen(null);
    setMessage("Item rejeitado sem criar Material Aprovado.");
  }

  return <main className="validation-shell"><div className="validation-topbar"><div><Link href="/">← Voltar para fila</Link><h1>{budget.code}</h1><p>{budget.supplier} · {session.items.length} itens</p></div><div className="review-progress"><span>Progresso da revisão</span><strong>{reviewed} / {session.items.length}</strong><progress max={session.items.length} value={reviewed} /></div></div><div className="validation-grid"><ItemList items={session.items} selectedId={item.id} onSelect={(id) => activate(selectItem(session, id))} /><section className="detail-panel"><header className="detail-heading"><div><p className="eyebrow">Item {String(item.itemNumber).padStart(2, "0")}</p><h2>Validação do material</h2></div><StatusBadge status={item.reviewStatus} /></header><div className="description"><span>Descrição original</span><strong>{item.originalDescription}</strong></div><div className="metrics"><div><span>Quantidade</span><b>{item.quantity.toLocaleString("pt-BR")}</b></div><div><span>Unidade</span><b>{item.unit}</b></div><div><span>Preço unitário</span><b>{money.format(item.unitPrice)}</b></div><div><span>Preço total</span><b>{money.format(item.totalPrice)}</b></div></div><div className="decision-grid"><section className="suggestion"><label>Sugestão do sistema <em>Somente referência</em></label>{item.suggestedMaterial ? <div className="material-card"><strong>{item.suggestedMaterial.code} · {item.suggestedMaterial.name}</strong><span>{item.suggestedMaterial.family}</span></div> : <div className="empty">Nenhuma sugestão disponível</div>}</section><section className="approval"><label>Material aprovado <em>Decisão humana</em></label><MaterialAutocomplete materials={materials} value={chosen} onChange={setChosen} /><small>A sugestão nunca é selecionada automaticamente. Escolha um material para aprovar.</small></section></div><label className="observation">Observação<textarea value={observation} onChange={(event) => setObservation(event.target.value)} rows={3} placeholder="Registre um comentário para esta decisão..." /></label>{message && <div className="feedback">{message}</div>}<footer className="actions"><div><button onClick={() => activate(moveSelection(session, -1))} disabled={!session.selectedIndex}>← Anterior</button><button onClick={() => activate(moveSelection(session, 1))} disabled={session.selectedIndex === session.items.length - 1}>Próximo →</button></div><div><button className="reject" onClick={reject}>Rejeitar</button><button className="approve" onClick={approve}>Aprovar e próximo →</button></div></footer></section></div></main>;
}
