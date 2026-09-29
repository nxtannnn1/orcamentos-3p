import type { Budget, BudgetItem, OfficialMaterial, ReviewStatus } from "../types/operator";

export const mockMaterials: OfficialMaterial[] = [
  { id: "mat-demo-01", code: "MAT-AL-035", name: "Cabo de alumínio isolado 35 mm²", family: "Cabos", unit: "M" },
  { id: "mat-demo-02", code: "MAT-CU-016", name: "Cabo de cobre flexível 16 mm²", family: "Cabos", unit: "M" },
  { id: "mat-demo-03", code: "MAT-DIS-70", name: "Disjuntor tripolar 70 A", family: "Proteção", unit: "UN" },
  { id: "mat-demo-04", code: "MAT-QD-12", name: "Quadro de distribuição 12 polos", family: "Quadros", unit: "UN" },
  { id: "mat-demo-05", code: "MAT-EL-050", name: "Eletroduto galvanizado 50 mm", family: "Infraestrutura", unit: "M" },
  { id: "mat-demo-06", code: "MAT-CX-400", name: "Caixa de passagem 400 x 400 mm", family: "Infraestrutura", unit: "UN" },
  { id: "mat-demo-07", code: "MAT-HST-24", name: "Haste de aterramento 2,4 m", family: "Aterramento", unit: "UN" },
  { id: "mat-demo-08", code: "MAT-CON-35", name: "Conector de derivação 35 mm²", family: "Conectores", unit: "UN" },
  { id: "mat-demo-09", code: "MAT-TER-16", name: "Terminal de compressão 16 mm²", family: "Conectores", unit: "UN" },
  { id: "mat-demo-10", code: "MAT-ID-025", name: "Identificador termorretrátil 25 mm", family: "Identificação", unit: "UN" },
];

const approvedMaterialByItem: Record<number, string> = {
  2: "mat-demo-02", 4: "mat-demo-04", 9: "mat-demo-09",
  15: "mat-demo-01", 21: "mat-demo-07", 28: "mat-demo-05",
  34: "mat-demo-08", 41: "mat-demo-03", 47: "mat-demo-10",
};
const rejectedItems = new Set([8, 18, 31, 45]);
const itemsWithoutSuggestion = new Set([6, 9, 14, 20, 27, 33, 40, 48, 53, 56]);
const descriptions = [
  "CABO DE ALUMÍNIO ISOLADO PARA INSTALAÇÃO",
  "CABO FLEXÍVEL DE COBRE PARA PAINEL",
  "DISJUNTOR TRIPOLAR CURVA C",
  "QUADRO METÁLICO COM BARRAMENTO",
  "ELETRODUTO GALVANIZADO PESADO",
  "CAIXA DE PASSAGEM COM TAMPA",
  "HASTE COBREADA PARA ATERRAMENTO",
  "CONECTOR DE DERIVAÇÃO PERFURANTE",
  "TERMINAL DE COMPRESSÃO PARA CABO",
  "IDENTIFICADOR TERMORRETRÁTIL",
];

const material = (id: string | undefined) => mockMaterials.find((entry) => entry.id === id) ?? null;
const statusFor = (itemNumber: number): ReviewStatus =>
  approvedMaterialByItem[itemNumber] ? "APROVADO" : rejectedItems.has(itemNumber) ? "REJEITADO" : "PENDENTE";

export const mockItems: BudgetItem[] = Array.from({ length: 56 }, (_, index) => {
  const itemNumber = index + 1;
  const descriptionIndex = index % descriptions.length;
  const suggestedId = itemsWithoutSuggestion.has(itemNumber)
    ? undefined
    : mockMaterials[(index + 2) % mockMaterials.length].id;
  const approvedId = approvedMaterialByItem[itemNumber];
  const quantity = (index % 7 + 1) * 12;
  const unitPrice = Number((8.75 + (index % 11) * 13.4).toFixed(2));

  return {
    id: `item-demo-${String(itemNumber).padStart(2, "0")}`,
    budgetId: "budget-demo-01",
    itemNumber,
    originalDescription: `${descriptions[descriptionIndex]} - VARIAÇÃO ${String(itemNumber).padStart(2, "0")}`,
    quantity,
    unit: mockMaterials[descriptionIndex].unit,
    unitPrice,
    totalPrice: Number((quantity * unitPrice).toFixed(2)),
    suggestedMaterial: material(suggestedId),
    // A decisão aprovada vem de um mapa independente e explícito; nunca da sugestão.
    approvedMaterial: material(approvedId),
    observation: approvedId
      ? itemNumber === 4
        ? "Decisão humana diferente da sugestão automática."
        : "Material conferido manualmente."
      : rejectedItems.has(itemNumber)
        ? "Item rejeitado durante a revisão humana."
        : "",
    reviewStatus: statusFor(itemNumber),
  };
});

export const mockBudgets: Budget[] = [{
  id: "budget-demo-01",
  code: "ORC-DEMO-2026-014",
  number: "2026-014",
  supplier: "Fornecedor Fictício de Demonstração",
  date: "2026-09-22",
  status: "EM_REVISAO",
  itemCount: mockItems.length,
  reviewedCount: mockItems.filter((item) => item.reviewStatus !== "PENDENTE").length,
}];
