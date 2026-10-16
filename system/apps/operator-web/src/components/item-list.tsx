import type { BudgetItem } from "../types/operator";
import { StatusBadge } from "./status-badge";
export function ItemList({ items, selectedId, onSelect }: { items: BudgetItem[]; selectedId: string; onSelect: (id: string) => void }) {
  return <aside className="item-panel"><header><strong>Itens do orçamento</strong><span>{items.length} itens</span></header><div className="item-list">{items.map(item => <button key={item.id} className={`item-row ${selectedId === item.id ? "selected" : ""}`} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}><b>{item.itemNumber === null ? "—" : String(item.itemNumber).padStart(2, "0")}</b><span><strong>{item.originalDescription || "Descrição não informada"}</strong>{item.reviewAvailable === false ? <span>Somente consulta</span> : <StatusBadge status={item.reviewStatus} compact />}</span></button>)}</div></aside>;
}
