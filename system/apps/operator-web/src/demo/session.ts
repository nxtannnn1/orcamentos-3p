import { mockItems, mockMaterials } from "../mocks/mock-data";
import type { BudgetItem, OfficialMaterial, ReviewStatus } from "../types/operator";

export type DemoItem = Omit<BudgetItem, "quantity" | "unitPrice" | "totalPrice"> & {
  quantity: string; unitPrice: string; totalPrice: string;
};
export type Draft = { quantity: string; unitPrice: string; observation: string; material: OfficialMaterial | null };
const scale = BigInt(10000);
// Deliberately narrower than the import contract: a visual demo, not a financial API.
export function decimal(value: string, positive = false) {
  if (!/^(0|[1-9]\d*)([.,]\d{1,4})?$/.test(value) || value.length > 12)
    throw new Error("Use um decimal sem sinal, com até quatro casas (vírgula ou ponto).");
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const units = BigInt(whole + fraction.padEnd(4, "0"));
  if (units > BigInt(1000000) * scale || (positive && units === BigInt(0)))
    throw new Error("Quantidade deve ser positiva; preço pode ser zero. Limite demo: 1.000.000.");
  return units;
}
export function fixed(units: bigint, places = 4) {
  const text = units.toString().padStart(places + 1, "0");
  return `${text.slice(0, -places)}.${text.slice(-places)}`;
}
export function lineTotal(quantity: string, price: string) {
  return fixed((decimal(quantity, true) * decimal(price) + scale / BigInt(2)) / scale);
}
export function budgetTotal(items: DemoItem[]) {
  return fixed((items.reduce((sum, item) => sum + BigInt(item.totalPrice.replace(".", "")), BigInt(0)) + BigInt(50)) / BigInt(100), 2);
}
export function initialItems(): DemoItem[] {
  return structuredClone(mockItems.slice(0, 3)).map(item => ({
    ...item, quantity: item.quantity.toFixed(4), unitPrice: item.unitPrice.toFixed(4),
    totalPrice: lineTotal(String(item.quantity), String(item.unitPrice)),
    approvedMaterial: null, observation: "", reviewStatus: "PENDENTE", version: undefined,
  }));
}
export function draftFor(item: DemoItem): Draft {
  return { quantity: item.quantity, unitPrice: item.unitPrice, observation: item.observation, material: item.approvedMaterial };
}
export function confirmDraft(item: DemoItem, draft: Draft, status: ReviewStatus = item.reviewStatus): DemoItem {
  const totalPrice = lineTotal(draft.quantity, draft.unitPrice);
  if (draft.observation.length > 1000) throw new Error("Observação: máximo de 1.000 caracteres no demo.");
  const material = draft.material ? mockMaterials.find(entry => entry.id === draft.material?.id) ?? null : null;
  if (status === "APROVADO" && !material) throw new Error("Escolha explicitamente um Material Oficial antes de aprovar.");
  return { ...item, quantity: fixed(decimal(draft.quantity, true)), unitPrice: fixed(decimal(draft.unitPrice)),
    totalPrice, observation: draft.observation, approvedMaterial: status === "REJEITADO" ? null : material, reviewStatus: status };
}
export function asDisplayItem(item: DemoItem): BudgetItem {
  return { ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), totalPrice: Number(item.totalPrice) };
}
