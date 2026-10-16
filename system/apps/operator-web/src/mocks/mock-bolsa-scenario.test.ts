import { describe, expect, it } from "vitest";
import {
  calculateMaterialPriceIndicators,
  comparePriceOffers,
  consolidatePriceIndicators,
  parsePositiveQuantity,
} from "../domain/price-comparison";
import { mockMaterials, mockItems } from "./mock-data";
import {
  mockBolsaBudgets,
  mockBolsaItems,
  mockBolsaTargetQuantities,
} from "./mock-bolsa-scenario";
import { createMockPriceComparisonRepository } from "./mock-price-comparison-repository";

const repository = createMockPriceComparisonRepository();

async function comparison(materialId: string) {
  const material = mockMaterials.find((entry) => entry.id === materialId)!;
  return comparePriceOffers(material, await repository.listOffersByMaterial(materialId));
}

describe("cenário fictício adicional da Bolsa de Materiais", () => {
  it("preserva os dez materiais oficiais e os 56 itens da conferência original", () => {
    expect(mockMaterials).toHaveLength(10);
    expect(mockItems).toHaveLength(56);
    expect(new Set(mockItems.map((item) => item.budgetId))).toEqual(new Set(["budget-demo-01"]));
  });

  it("preserva a oferta legada com unidade incompatível", async () => {
    const offer = (await comparison("mat-demo-02")).offers.find(
      (entry) => entry.offer.id === "offer-demo-cu-dalia-incompatible",
    );
    expect(offer?.eligible).toBe(false);
    expect(offer?.issues).toContain("INCOMPATIBLE_UNIT");
  });

  it("usa quatro fornecedores fictícios, seis orçamentos identificáveis e quantidades variadas", () => {
    expect(mockBolsaBudgets).toHaveLength(6);
    expect(new Set(mockBolsaBudgets.map((budget) => budget.supplier))).toEqual(new Set([
      "Fornecedor Fictício Horizonte",
      "Fornecedor Fictício Íris",
      "Fornecedor Fictício Jade",
      "Fornecedor Fictício Lótus",
    ]));
    expect(new Set(mockBolsaItems.map((item) => item.quantity)).size).toBeGreaterThan(4);
    for (const budget of mockBolsaBudgets) {
      const items = mockBolsaItems.filter((item) => item.budgetId === budget.id);
      expect(items).toHaveLength(budget.itemCount);
      expect(budget.reviewedCount).toBe(items.filter((item) => item.reviewStatus !== "PENDENTE").length);
      expect(items.every((item) => item.supplier === budget.supplier)).toBe(true);
    }
  });

  it("distingue cobertura completa, parcial, oferta única e ausência de aprovação", async () => {
    const counts = await Promise.all(
      ["04", "05", "06", "07", "08", "09", "10"].map(async (suffix) =>
        (await comparison(`mat-demo-${suffix}`)).offers.filter((entry) => entry.eligible).length,
      ),
    );
    expect(counts).toEqual([4, 2, 1, 0, 2, 4, 0]);
    expect((await comparison("mat-demo-04")).lowestPrice).toBe(132);
    expect((await comparison("mat-demo-07")).lowestPrice).toBeNull();
  });

  it("nunca promove sugestão incorreta ou item pendente a equivalência aprovada", async () => {
    const wrongSuggestions = mockBolsaItems.filter((item) =>
      item.suggestedMaterial?.id !== item.approvedMaterial?.id,
    );
    expect(wrongSuggestions.length).toBeGreaterThan(0);
    expect(wrongSuggestions.some((item) => item.reviewStatus === "APROVADO")).toBe(true);
    expect(mockBolsaItems.filter((item) => item.reviewStatus === "PENDENTE").every(
      (item) => item.approvedMaterial === null,
    )).toBe(true);
    const correctedSuggestion = wrongSuggestions.find((item) => item.reviewStatus === "APROVADO")!;
    expect(correctedSuggestion.suggestedMaterial?.id).toBe("mat-demo-03");
    expect(correctedSuggestion.approvedMaterial?.id).toBe("mat-demo-04");
    expect((await repository.listOffersByMaterial("mat-demo-04")).find(
      (offer) => offer.id === `offer-${correctedSuggestion.id}`,
    )?.approvedMaterialId).toBe("mat-demo-04");
    expect(await repository.listOffersByMaterial("mat-demo-07")).toEqual([]);
    const offeredIds = new Set((await Promise.all(mockMaterials.map((material) =>
      repository.listOffersByMaterial(material.id),
    ))).flat().map((offer) => offer.id));
    expect(wrongSuggestions.filter((item) => item.reviewStatus === "PENDENTE").every(
      (item) => !offeredIds.has(`offer-${item.id}`),
    )).toBe(true);
  });

  it("converte somente a cotação em centímetros para preço por metro, sem mudar o original", async () => {
    const original = mockBolsaItems.find((item) => item.budgetId === "bolsa-iris-01" && item.itemNumber === 2)!;
    expect(original).toMatchObject({ quantity: 1200, unit: "CM", unitPrice: 0.17, totalPrice: 204 });
    const converted = (await repository.listOffersByMaterial("mat-demo-05"))
      .find((offer) => offer.budgetId === original.budgetId)!;
    expect(converted).toMatchObject({ unit: "M", unitPrice: 17, approvedMaterialId: "mat-demo-05" });
    expect(converted.unitPrice! * (original.quantity! / 100)).toBe(original.totalPrice);
    expect(original.unit).toBe("CM");
  });

  it("calcula custo-alvo e economia potencial somente com ofertas comparáveis", async () => {
    const quadro = calculateMaterialPriceIndicators(
      await comparison("mat-demo-04"), parsePositiveQuantity(mockBolsaTargetQuantities["mat-demo-04"]), null,
    );
    expect(quadro).toMatchObject({
      validOfferCount: 4,
      minimumTotalCents: 52_800,
      maximumTotalCents: 60_000,
      potentialDifferenceCents: 7_200,
    });
    const eletroduto = calculateMaterialPriceIndicators(
      await comparison("mat-demo-05"), parsePositiveQuantity(mockBolsaTargetQuantities["mat-demo-05"]), null,
    );
    expect(eletroduto).toMatchObject({
      validOfferCount: 2,
      minimumTotalCents: 51_000,
      maximumTotalCents: 55_200,
      potentialDifferenceCents: 4_200,
    });
    const caixa = calculateMaterialPriceIndicators(
      await comparison("mat-demo-06"), parsePositiveQuantity(mockBolsaTargetQuantities["mat-demo-06"]), null,
    );
    expect(caixa).toMatchObject({
      validOfferCount: 1,
      minimumTotalCents: 43_200,
      maximumTotalCents: 43_200,
      potentialDifferenceCents: null,
      potentialDifferenceBasisPoints: null,
    });
  });

  it("consolida mínimo e máximo sobre a mesma cobertura e não mistura pré-seleção parcial", async () => {
    const indicators = await Promise.all(["04", "05", "06", "07", "08", "09", "10"].map(
      async (suffix) => {
        const materialId = `mat-demo-${suffix}`;
        const result = await comparison(materialId);
        return calculateMaterialPriceIndicators(
          result,
          parsePositiveQuantity(mockBolsaTargetQuantities[materialId]),
          suffix === "04" ? result.lowestOfferIds[0] : null,
        );
      },
    ));
    const summary = consolidatePriceIndicators(indicators);
    expect(summary).toMatchObject({
      minimumTotalCents: 175_500,
      maximumTotalCents: 191_650,
      potentialDifferenceCents: 16_150,
      coveredMaterialCount: 5,
      excludedMaterialCount: 2,
      selectedCoveredMaterialCount: 1,
      selectedVsMinimumCents: null,
    });
  });
});
