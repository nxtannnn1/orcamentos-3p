import type { Budget, BudgetItem, ReviewStatus } from "../types/operator";
import { mockMaterials } from "./mock-data";

// Cenário adicional exclusivamente fictício; não representa cotações ou fornecedores reais.
const budgets: Pick<Budget, "id" | "code" | "number" | "supplier" | "date">[] = [
  { id: "bolsa-horizonte-01", code: "COT-FICT-HOR-001", number: "FICT-HOR-001", supplier: "Fornecedor Fictício Horizonte", date: "2026-08-03" },
  { id: "bolsa-horizonte-02", code: "COT-FICT-HOR-002", number: "FICT-HOR-002", supplier: "Fornecedor Fictício Horizonte", date: "2026-08-10" },
  { id: "bolsa-iris-01", code: "COT-FICT-IRI-001", number: "FICT-IRI-001", supplier: "Fornecedor Fictício Íris", date: "2026-08-04" },
  { id: "bolsa-iris-02", code: "COT-FICT-IRI-002", number: "FICT-IRI-002", supplier: "Fornecedor Fictício Íris", date: "2026-08-11" },
  { id: "bolsa-jade-01", code: "COT-FICT-JAD-001", number: "FICT-JAD-001", supplier: "Fornecedor Fictício Jade", date: "2026-08-05" },
  { id: "bolsa-lotus-01", code: "COT-FICT-LOT-001", number: "FICT-LOT-001", supplier: "Fornecedor Fictício Lótus", date: "2026-08-06" },
];

interface FictionalLine {
  budgetId: string;
  itemNumber: number;
  materialId: string;
  suggestedMaterialId?: string;
  approved: boolean;
  quantity: number;
  unit: string;
  unitPrice: number;
}

const lines: FictionalLine[] = [
  { budgetId: "bolsa-horizonte-01", itemNumber: 1, materialId: "mat-demo-04", approved: true, quantity: 2, unit: "UN", unitPrice: 140 },
  { budgetId: "bolsa-horizonte-01", itemNumber: 2, materialId: "mat-demo-05", approved: true, quantity: 15, unit: "M", unitPrice: 18.4 },
  { budgetId: "bolsa-horizonte-01", itemNumber: 3, materialId: "mat-demo-07", suggestedMaterialId: "mat-demo-08", approved: false, quantity: 6, unit: "UN", unitPrice: 32 },
  { budgetId: "bolsa-horizonte-02", itemNumber: 1, materialId: "mat-demo-08", approved: true, quantity: 30, unit: "UN", unitPrice: 4.2 },
  { budgetId: "bolsa-horizonte-02", itemNumber: 2, materialId: "mat-demo-09", approved: true, quantity: 100, unit: "UN", unitPrice: 1.9 },
  { budgetId: "bolsa-iris-01", itemNumber: 1, materialId: "mat-demo-04", suggestedMaterialId: "mat-demo-03", approved: true, quantity: 5, unit: "UN", unitPrice: 132 },
  // 1.200 cm = 12 m; R$ 0,17/cm = R$ 17,00/m. Só o mock converte esta oferta.
  { budgetId: "bolsa-iris-01", itemNumber: 2, materialId: "mat-demo-05", approved: true, quantity: 1200, unit: "CM", unitPrice: 0.17 },
  { budgetId: "bolsa-iris-01", itemNumber: 3, materialId: "mat-demo-09", approved: true, quantity: 60, unit: "UN", unitPrice: 1.8 },
  { budgetId: "bolsa-iris-02", itemNumber: 1, materialId: "mat-demo-08", approved: true, quantity: 20, unit: "UN", unitPrice: 4.5 },
  { budgetId: "bolsa-jade-01", itemNumber: 1, materialId: "mat-demo-04", approved: true, quantity: 3, unit: "UN", unitPrice: 136 },
  { budgetId: "bolsa-jade-01", itemNumber: 2, materialId: "mat-demo-06", approved: true, quantity: 10, unit: "UN", unitPrice: 54 },
  { budgetId: "bolsa-jade-01", itemNumber: 3, materialId: "mat-demo-09", approved: true, quantity: 75, unit: "UN", unitPrice: 2.2 },
  { budgetId: "bolsa-jade-01", itemNumber: 4, materialId: "mat-demo-07", suggestedMaterialId: "mat-demo-06", approved: false, quantity: 3, unit: "UN", unitPrice: 29 },
  { budgetId: "bolsa-lotus-01", itemNumber: 1, materialId: "mat-demo-04", approved: true, quantity: 1, unit: "UN", unitPrice: 150 },
  { budgetId: "bolsa-lotus-01", itemNumber: 2, materialId: "mat-demo-09", approved: true, quantity: 100, unit: "UN", unitPrice: 2 },
  { budgetId: "bolsa-lotus-01", itemNumber: 3, materialId: "mat-demo-07", suggestedMaterialId: "mat-demo-08", approved: false, quantity: 4, unit: "UN", unitPrice: 31 },
];

const materialById = new Map(mockMaterials.map((material) => [material.id, material]));
const budgetById = new Map(budgets.map((budget) => [budget.id, budget]));

export const mockBolsaItems: BudgetItem[] = lines.map((line) => {
  const material = materialById.get(line.materialId)!;
  const budget = budgetById.get(line.budgetId)!;
  const reviewStatus: ReviewStatus = line.approved ? "APROVADO" : "PENDENTE";
  return {
    id: `${line.budgetId}-item-${line.itemNumber}`,
    budgetId: budget.id,
    supplier: budget.supplier,
    itemNumber: line.itemNumber,
    originalDescription: `${material.name} — COTAÇÃO FICTÍCIA`,
    quantity: line.quantity,
    unit: line.unit,
    unitPrice: line.unitPrice,
    totalPrice: Number((line.quantity * line.unitPrice).toFixed(2)),
    suggestedMaterial: materialById.get(line.suggestedMaterialId ?? line.materialId) ?? null,
    approvedMaterial: line.approved ? material : null,
    observation: line.approved ? "Equivalência fictícia aprovada para demonstração." : "Sugestão fictícia não aprovada; excluída da comparação.",
    reviewStatus,
  };
});

export const mockBolsaBudgets: Budget[] = budgets.map((budget) => {
  const items = mockBolsaItems.filter((item) => item.budgetId === budget.id);
  const reviewedCount = items.filter((item) => item.reviewStatus !== "PENDENTE").length;
  return {
    ...budget,
    status: reviewedCount === items.length ? "CONCLUIDO" : "EM_REVISAO",
    itemCount: items.length,
    reviewedCount,
  };
});

// Quantidades-alvo da demonstração, na unidade do material oficial.
export const mockBolsaTargetQuantities: Readonly<Record<string, string>> = {
  "mat-demo-04": "4",
  "mat-demo-05": "30",
  "mat-demo-06": "8",
  "mat-demo-07": "6",
  "mat-demo-08": "25",
  "mat-demo-09": "100",
  "mat-demo-10": "40",
};
