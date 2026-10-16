"use client";
import { useEffect, useState } from "react";
import { mockMaterials } from "../mocks/mock-data";
import { asDisplayItem, budgetTotal, confirmDraft, draftFor, initialItems, lineTotal, type Draft } from "../demo/session";
import type { ReviewStatus } from "../types/operator";
import { ItemList } from "./item-list";
import { MaterialAutocomplete } from "./material-autocomplete";
import { StatusBadge } from "./status-badge";

const money = (value: string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
export function DemoWorkspace() {
  const [items, setItems] = useState(initialItems);
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => draftFor(initialItems()[0]));
  const [detail, setDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [failNext, setFailNext] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const item = items[selected];
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFor(item));
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, [revision]);
  let preview = "";
  let validation = "";
  try { preview = lineTotal(draft.quantity, draft.unitPrice); }
  catch (error) { validation = (error as Error).message; }
  const previewItems = preview ? items.map((entry, index) => index === selected ? { ...entry, totalPrice: preview } : entry) : items;
  function navigate(index: number | null) {
    if (dirty) { setMessage("Há alterações locais. Confirme ou descarte antes de navegar."); return; }
    setMessage("");
    if (index === null) setDetail(false);
    else { setSelected(index); setDraft(draftFor(items[index])); setDetail(true); }
  }
  function confirm(status?: ReviewStatus) {
    try {
      const saved = confirmDraft(item, draft, status);
      if (failNext) { setFailNext(false); throw new Error("Falha simulada: nenhuma alteração foi confirmada. Seu rascunho foi preservado."); }
      setItems(items.map((entry, index) => index === selected ? saved : entry));
      setDraft(draftFor(saved)); setConfirmed(true);
      setMessage("Alterações confirmadas somente no demo (memória do navegador).");
    } catch (error) { setMessage((error as Error).message); }
  }
  function reload(error: boolean) { setLoading(true); setLoadError(error); setRevision(revision + 1); }
  return <main className="page-shell demo-shell">
    <div className="demo-banner"><strong>DEMONSTRAÇÃO LOCAL · Dados fictícios</strong><p>Sem persistência ou chamadas às APIs. Atualizar a página reinicia todos os dados e decisões.</p>
      <div className="demo-states"><span className="demo-pending">{dirty ? "Alterações locais não confirmadas" : "Sem rascunho pendente"}</span><span className="demo-confirmed">{confirmed ? "Há alterações confirmadas no demo" : "Dados fictícios iniciais"}</span><span>Operações reais indisponíveis</span></div>
    </div>
    <div className="demo-controls"><button onClick={() => reload(false)}>Simular carregamento</button><button onClick={() => reload(true)}>Simular erro de leitura</button><label><input type="checkbox" checked={failNext} onChange={event => setFailNext(event.target.checked)} /> Falhar próxima confirmação</label></div>
    {loading ? <p role="status" className="loading">Carregando dados fictícios...</p> : loadError ? <div role="alert" className="feedback"><p>Erro de leitura simulado. Nenhuma conexão externa foi realizada.</p><button onClick={() => reload(false)}>Tentar novamente</button></div> : !detail ? <>
      <div className="page-heading"><div><p className="eyebrow">Fila demonstrativa</p><h1>Orçamentos fictícios</h1></div></div>
      <section className="queue-card"><table><thead><tr><th>Orçamento</th><th>Fornecedor fictício</th><th>Itens</th><th>Revisados</th><th>Total demo</th><th>Ação</th></tr></thead><tbody><tr><td>ORC-DEMO-2026-014</td><td>Fornecedor Fictício de Demonstração</td><td>{items.length}</td><td>{items.filter(entry => entry.reviewStatus !== "PENDENTE").length} / {items.length}</td><td>{money(budgetTotal(items))}</td><td><button onClick={() => navigate(selected)}>Abrir orçamento fictício</button></td></tr></tbody></table></section>
    </> : <>
      <div className="validation-topbar"><div><button onClick={() => navigate(null)}>← Voltar para fila demo</button><h1>ORC-DEMO-2026-014</h1><p>Três itens simulam uma importação. Não foi importado nenhum arquivo real.</p></div><strong>Total confirmado no demo: {money(budgetTotal(items))}</strong></div>
      <div className="validation-grid demo-grid"><ItemList items={items.map(asDisplayItem)} selectedId={item.id} onSelect={id => navigate(items.findIndex(entry => entry.id === id))} />
        <section className="detail-panel"><header className="detail-heading"><h2>Item {item.itemNumber} · Revisão demo</h2><StatusBadge status={item.reviewStatus} /></header>
          <div className="description"><span>Descrição fictícia importada</span><strong>{item.originalDescription}</strong></div>
          <div className="demo-fields"><label>Quantidade (demo)<input aria-label="Quantidade (demo)" inputMode="decimal" value={draft.quantity} onChange={event => setDraft({ ...draft, quantity: event.target.value })} /></label><label>Preço unitário (demo)<input aria-label="Preço unitário (demo)" inputMode="decimal" value={draft.unitPrice} onChange={event => setDraft({ ...draft, unitPrice: event.target.value })} /></label><span>Unidade: {item.unit}</span></div>
          <p>Até quatro casas decimais; quantidade positiva, preço zero permitido. Limite demo: 1.000.000.</p>
          {validation ? <p role="alert" className="feedback">{validation}</p> : <div className="demo-totals"><p>Subtotal do item (prévia): <strong>{preview.replace(".", ",")}</strong></p><p>Total do orçamento (prévia local): <strong>{money(budgetTotal(previewItems))}</strong></p><small>Frete, desconto e tributos fictícios: zero. Soma dos itens com quatro casas, total arredondado a duas.</small></div>}
          <div className="decision-grid"><section className="suggestion"><label>Sugestão · Somente referência</label><p>{item.suggestedMaterial?.name ?? "Sem sugestão"}</p></section><section className="approval"><label>Material Oficial · Catálogo fictício</label><MaterialAutocomplete materials={mockMaterials} value={draft.material} onChange={material => setDraft({ ...draft, material })} /></section></div>
          <label className="observation">Observação (demo)<textarea aria-label="Observação (demo)" rows={3} maxLength={1000} value={draft.observation} onChange={event => setDraft({ ...draft, observation: event.target.value })} /></label>
          {message && <div role="status" className="feedback">{message}</div>}
          <footer className="actions"><div><button onClick={() => { setDraft(draftFor(item)); setMessage("Rascunho descartado; alterações já confirmadas no demo foram mantidas."); }}>Descartar alterações locais</button><button disabled={!dirty || !!validation} onClick={() => confirm()}>Confirmar alterações no demo</button></div><div><button className="reject" disabled={!!validation} onClick={() => confirm("REJEITADO")}>Rejeitar matching (demo)</button><button className="approve" disabled={!!validation} onClick={() => confirm("APROVADO")}>Aprovar matching (demo)</button></div></footer>
          <p className="demo-note">Quantidade e preço: edição visual simulada, sem endpoint de escrita. Confirmar, aprovar ou rejeitar também confirma os campos válidos deste rascunho; rejeitar limpa a associação. Nenhuma regra de autorização corporativa é comprovada por esta tela.</p>
        </section></div>
    </>}
  </main>;
}
