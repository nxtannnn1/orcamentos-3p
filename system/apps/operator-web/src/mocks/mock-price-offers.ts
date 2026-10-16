import type { PriceOffer } from "../types/price-comparison";
import { mockBolsaBudgets, mockBolsaItems } from "./mock-bolsa-scenario";

// Dados exclusivos da demonstração. Todos os nomes são deliberadamente fictícios.
export const mockPriceOffers: PriceOffer[] = [
  { id: "offer-demo-al-aurora", approvedMaterialId: "mat-demo-01", supplier: "Fornecedor Fictício Aurora", unit: "M", unitPrice: 12.5, budgetId: "quote-demo-aurora-01", budgetCode: "COT-DEMO-AURORA-001", budgetDate: "2026-09-10" },
  { id: "offer-demo-al-boreal", approvedMaterialId: "mat-demo-01", supplier: "Fornecedor Fictício Boreal", unit: "m", unitPrice: 11.9, budgetId: "quote-demo-boreal-01", budgetCode: "COT-DEMO-BOREAL-001", budgetDate: "2026-09-11" },
  { id: "offer-demo-al-cobalto", approvedMaterialId: "mat-demo-01", supplier: "Fornecedor Fictício Cobalto", unit: " M ", unitPrice: 11.9, budgetId: "quote-demo-cobalto-01", budgetCode: "COT-DEMO-COBALTO-001", budgetDate: "2026-09-12" },
  { id: "offer-demo-al-dalia", approvedMaterialId: "mat-demo-01", supplier: "Fornecedor Fictício Dália", unit: "M", unitPrice: 13.2, budgetId: "quote-demo-dalia-01", budgetCode: "COT-DEMO-DALIA-001", budgetDate: "2026-09-13" },
  { id: "offer-demo-al-estrela-invalid", approvedMaterialId: "mat-demo-01", supplier: "Fornecedor Fictício Estrela", unit: "M", unitPrice: null, budgetId: "quote-demo-estrela-01", budgetCode: "COT-DEMO-ESTRELA-001", budgetDate: null },
  { id: "offer-demo-cu-aurora", approvedMaterialId: "mat-demo-02", supplier: "Fornecedor Fictício Aurora", unit: "M", unitPrice: 29.4, budgetId: "quote-demo-aurora-02", budgetCode: "COT-DEMO-AURORA-002", budgetDate: "2026-09-20" },
  { id: "offer-demo-cu-boreal", approvedMaterialId: "mat-demo-02", supplier: "Fornecedor Fictício Boreal", unit: "M", unitPrice: 27.85, budgetId: "quote-demo-boreal-02", budgetCode: "COT-DEMO-BOREAL-002", budgetDate: "2026-09-21" },
  { id: "offer-demo-cu-dalia-incompatible", approvedMaterialId: "mat-demo-02", supplier: "Fornecedor Fictício Dália", unit: "UN", unitPrice: 19.5, budgetId: "quote-demo-dalia-02", budgetCode: "COT-DEMO-DALIA-002", budgetDate: "2026-09-22" },
  { id: "offer-demo-dis-aurora", approvedMaterialId: "mat-demo-03", supplier: "Fornecedor Fictício Aurora", unit: "UN", unitPrice: 86, budgetId: "quote-demo-aurora-03", budgetCode: "COT-DEMO-AURORA-003", budgetDate: "2026-10-01" },
  { id: "offer-demo-dis-cobalto", approvedMaterialId: "mat-demo-03", supplier: "Fornecedor Fictício Cobalto", unit: "UN", unitPrice: 91.35, budgetId: "quote-demo-cobalto-03", budgetCode: "COT-DEMO-COBALTO-003", budgetDate: "2026-10-02" },
  { id: "offer-demo-dis-estrela", approvedMaterialId: "mat-demo-03", supplier: "Fornecedor Fictício Estrela", unit: "UN", unitPrice: 84.7, budgetId: "quote-demo-estrela-03", budgetCode: "COT-DEMO-ESTRELA-003", budgetDate: "2026-10-03" },
  ...mockBolsaItems.flatMap((item): PriceOffer[] => {
    if (item.reviewStatus !== "APROVADO" || !item.approvedMaterial) return [];
    const budget = mockBolsaBudgets.find((entry) => entry.id === item.budgetId)!;
    const centimetersToMeters = item.unit === "CM" && item.approvedMaterial.unit === "M";
    return [{
      id: `offer-${item.id}`,
      approvedMaterialId: item.approvedMaterial.id,
      supplier: budget.supplier,
      unit: centimetersToMeters ? "M" : item.unit,
      unitPrice: centimetersToMeters ? Number(((item.unitPrice as number) * 100).toFixed(2)) : item.unitPrice,
      budgetId: budget.id,
      budgetCode: budget.code,
      budgetDate: budget.date,
    }];
  }),
];
