"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReviewSession } from "../domain/review-session";
import { ReviewController } from "../domain/review-controller";
import { operatorBff } from "../repositories/bff/bff-operator-repository";
import type { Budget, OfficialMaterial } from "../types/operator";
import { ItemList } from "./item-list";
import { MaterialAutocomplete } from "./material-autocomplete";
import { StatusBadge } from "./status-badge";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ValidationWorkspace({ budgetId, canWrite = false }: { budgetId: string; canWrite?: boolean }) {
  const [controller] = useState(() => new ReviewController(operatorBff));
  const [saving, setSaving] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [materials, setMaterials] = useState<OfficialMaterial[]>([]);
  const [session, setSession] = useState<ReviewSession>({ items: [], selectedIndex: 0 });
  const [chosen, setChosen] = useState<OfficialMaterial | null>(null);
  const [observation, setObservation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return null;
      setLoading(true);
      setError("");
      return Promise.all([
        controller.load(budgetId),
        operatorBff.getBudget(budgetId),
        operatorBff.listOfficialMaterials(),
      ]);
    }).then((result) => {
      if (!result) return;
      const [next, foundBudget, officialMaterials] = result;
      if (!active) return;
      if (!foundBudget) {
        setError("Orçamento não encontrado.");
        return;
      }
      const selected = next.items[next.selectedIndex];
      setSession(next);
      setBudget(foundBudget);
      setMaterials(officialMaterials);
      setChosen(selected?.approvedMaterial ?? null);
      setObservation(selected?.observation ?? "");
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar o orçamento.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [budgetId, controller]);

  if (loading) return <main className="loading">Carregando orçamento...</main>;
  if (error || !budget) {
    return (
      <main className="loading">
        <p>{error || "Orçamento não encontrado."}</p>
        <p style={{ marginTop: "16px" }}>
          <Link href="/">← Voltar para fila</Link>
        </p>
      </main>
    );
  }
  if (session.items.length === 0) {
    return (
      <main className="validation-shell">
        <div className="validation-topbar">
          <div>
            <Link href="/">← Voltar para fila</Link>
            <h1>{budget.code}</h1>
            <p>{budget.supplier ? `${budget.supplier} · ` : ""}0 itens</p>
          </div>
        </div>
        <div className="empty" style={{ margin: "40px auto", maxWidth: "600px", padding: "32px", fontSize: "14px" }}>
          <p>Este orçamento não possui itens disponíveis para revisão.</p>
        </div>
      </main>
    );
  }

  const item = session.items[session.selectedIndex] ?? session.items[0];
  const reviewed = session.items.filter((entry) => entry.reviewStatus !== "PENDENTE").length;

  function activate(next: ReviewSession) {
    const selected = next.items[next.selectedIndex];
    setSession(next);
    setChosen(selected?.approvedMaterial ?? null);
    setObservation(selected?.observation ?? "");
    setMessage("");
  }
  async function decide(action: "APPROVE" | "REJECT") {
    if (saving || !canWrite) return;
    setSaving(true);
    setMessage("");
    try {
      const next = action === "APPROVE"
        ? await controller.approveAndNext(chosen, observation)
        : await controller.reject(observation);
      activate(next);
      setMessage("Decisão salva.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Não foi possível confirmar a gravação. Recarregue os dados antes de tentar novamente.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="validation-shell"><div className="validation-topbar"><div><Link href="/">← Voltar para fila</Link><h1>{budget.code}</h1><p>{budget.supplier} · {session.items.length} itens</p></div><div className="review-progress"><span>Progresso da revisão</span><strong>{reviewed} / {session.items.length}</strong><progress max={session.items.length} value={reviewed} /></div></div><div className="validation-grid"><ItemList items={session.items} selectedId={item.id} onSelect={(id) => !saving && activate(controller.select(id))} /><section className="detail-panel"><header className="detail-heading"><div><p className="eyebrow">Item {String(item.itemNumber).padStart(2, "0")}</p><h2>Validação do material</h2></div><StatusBadge status={item.reviewStatus} /></header><div className="description"><span>Descrição original</span><strong>{item.originalDescription}</strong></div><div className="metrics"><div><span>Quantidade</span><b>{item.quantity.toLocaleString("pt-BR")}</b></div><div><span>Unidade</span><b>{item.unit}</b></div><div><span>Preço unitário</span><b>{money.format(item.unitPrice)}</b></div><div><span>Preço total</span><b>{money.format(item.totalPrice)}</b></div></div><div className="decision-grid"><section className="suggestion"><label>Sugestão do sistema <em>Somente referência</em></label>{item.suggestedMaterial ? <div className="material-card"><strong>{item.suggestedMaterial.code} · {item.suggestedMaterial.name}</strong><span>{item.suggestedMaterial.family}</span></div> : <div className="empty">Nenhuma sugestão disponível</div>}</section><section className="approval"><label>Material aprovado <em>Decisão humana</em></label><fieldset disabled={saving || !canWrite} style={{ border: 0, padding: 0, margin: 0 }}><MaterialAutocomplete materials={materials} value={chosen} onChange={setChosen} /></fieldset><small>A sugestão nunca é selecionada automaticamente. Escolha um material para aprovar.</small></section></div><label className="observation">Observação<textarea disabled={saving || !canWrite} value={observation} onChange={(event) => setObservation(event.target.value)} rows={3} placeholder="Registre um comentário para esta decisão..." /></label>{message && <div className="feedback" role="status">{message}</div>}<footer className="actions"><div><button onClick={() => activate(controller.move(-1))} disabled={saving || !session.selectedIndex}>← Anterior</button><button onClick={() => activate(controller.move(1))} disabled={saving || session.selectedIndex === session.items.length - 1}>Próximo →</button></div><div><button className="reject" disabled={saving || !canWrite} onClick={() => void decide("REJECT")}>Rejeitar</button><button className="approve" disabled={saving || !canWrite} onClick={() => void decide("APPROVE")}>{saving ? "Salvando..." : "Aprovar e próximo →"}</button></div></footer></section></div></main>;
}
