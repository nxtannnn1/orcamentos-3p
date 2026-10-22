import { describe, expect, it } from "vitest";
import type { OfficialMaterial } from "../types/operator";
import type { PriceOffer } from "../types/price-comparison";
import {
  calculateEstimatedTotalCents,
  calculateMaterialPriceIndicators,
  calculatePercentageBasisPoints,
  comparePriceOffers,
  consolidatePriceIndicators,
  evaluatePriceOffer,
  parsePositiveQuantity,
} from "./price-comparison";

const material: OfficialMaterial = {
  id: "material-1",
  code: "MAT-001",
  name: "Material de teste",
  family: "Teste",
  unit: "UN",
};

function offer(id: string, unitPrice: number | null, overrides: Partial<PriceOffer> = {}): PriceOffer {
  return {
    id,
    approvedMaterialId: material.id,
    supplier: `Fornecedor Fictício ${id}`,
    unit: "UN",
    unitPrice,
    budgetId: `budget-${id}`,
    budgetCode: `COT-${id}`,
    budgetDate: "2026-10-01",
    ...overrides,
  };
}

describe("comparação de preços", () => {
  it("identifica o menor preço entre três fornecedores do mesmo material", () => {
    const result = comparePriceOffers(material, [offer("a", 12), offer("b", 9.5), offer("c", 14)]);
    expect(result.lowestPrice).toBe(9.5);
    expect(result.lowestOfferIds).toEqual(["b"]);
  });

  it("destaca todos os fornecedores empatados no menor preço", () => {
    const result = comparePriceOffers(material, [offer("a", 8), offer("b", 8), offer("c", 9)]);
    expect(result.lowestOfferIds).toEqual(["a", "b"]);
    expect(result.offers.filter((entry) => entry.isLowestPrice)).toHaveLength(2);
  });

  it("ordena ofertas válidas por preço, desempata deterministicamente e deixa inválidas no final", () => {
    const result = comparePriceOffers(material, [
      offer("z", 8, { supplier: "Fornecedor Fictício Zeta" }),
      offer("invalid", 0, { supplier: "Fornecedor Fictício Alfa" }),
      offer("high", 12),
      offer("a", 8, { supplier: "Fornecedor Fictício Alfa" }),
    ]);
    expect(result.offers.map((entry) => entry.offer.id)).toEqual(["a", "z", "high", "invalid"]);
    expect(result.offers.slice(0, 3).every((entry) => entry.eligible)).toBe(true);
    expect(result.offers.at(-1)?.eligible).toBe(false);
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejeita preço unitário inválido: %s",
    (unitPrice) => {
      const result = evaluatePriceOffer(material, offer("invalid", unitPrice));
      expect(result.eligible).toBe(false);
      expect(result.issues).toContain("INVALID_UNIT_PRICE");
    },
  );

  it("aceita diferenças de caixa e espaços, mas rejeita unidades incompatíveis", () => {
    expect(evaluatePriceOffer(material, offer("equivalent", 10, { unit: " un " })).eligible).toBe(true);
    const incompatible = evaluatePriceOffer(material, offer("incompatible", 2, { unit: "CX" }));
    expect(incompatible.issues).toContain("INCOMPATIBLE_UNIT");
  });

  it("não mistura materiais oficiais diferentes, mesmo que tenham descrição semelhante", () => {
    const similarMaterial = { ...material, id: "material-2", name: `${material.name} similar` };
    const different = offer("different", 1, { approvedMaterialId: similarMaterial.id });
    const result = comparePriceOffers(material, [different, offer("same", 10)]);
    expect(result.lowestOfferIds).toEqual(["same"]);
    expect(result.offers.find((entry) => entry.offer.id === "different")?.issues)
      .toContain("DIFFERENT_MATERIAL");
  });

  it("rejeita item sem material aprovado", () => {
    const result = evaluatePriceOffer(material, offer("unapproved", 5, { approvedMaterialId: null }));
    expect(result.eligible).toBe(false);
    expect(result.issues).toContain("MATERIAL_NOT_APPROVED");
  });

  it("exige fornecedor e orçamento identificáveis", () => {
    const result = evaluatePriceOffer(material, offer("missing", 5, {
      supplier: " ",
      budgetId: null,
      budgetCode: "",
    }));
    expect(result.issues).toEqual(expect.arrayContaining(["SUPPLIER_MISSING", "BUDGET_MISSING"]));
  });

  it("retorna ausência de ofertas válidas sem escolher um menor preço", () => {
    const result = comparePriceOffers(material, [offer("zero", 0), offer("unit", 1, { unit: "M" })]);
    expect(result.lowestPrice).toBeNull();
    expect(result.lowestOfferIds).toEqual([]);
  });

  it.each(["", " ", "0", "0.0", "-1", "abc", "Infinity", "1e2"])(
    "rejeita quantidade vazia, não positiva ou inválida: %s",
    (value) => expect(parsePositiveQuantity(value)).toBeNull(),
  );

  it("calcula o total estimado em centavos", () => {
    expect(calculateEstimatedTotalCents(19.9, parsePositiveQuantity("3"))).toBe(5_970);
  });

  it("evita erro binário no cálculo monetário com quantidade decimal", () => {
    expect(calculateEstimatedTotalCents(0.1, parsePositiveQuantity("0.1"))).toBe(1);
  });

  it("não calcula total para oferta ou quantidade inválida", () => {
    expect(calculateEstimatedTotalCents(0, parsePositiveQuantity("2"))).toBeNull();
    expect(calculateEstimatedTotalCents(10, parsePositiveQuantity(""))).toBeNull();
  });

  it("calcula extremos, diferença e percentual sobre custos totais em centavos", () => {
    const comparison = comparePriceOffers(material, [offer("low", 10), offer("high", 15)]);
    const indicators = calculateMaterialPriceIndicators(comparison, parsePositiveQuantity("3"), "high");
    expect(indicators).toMatchObject({
      validOfferCount: 2,
      minimumTotalCents: 3_000,
      maximumTotalCents: 4_500,
      potentialDifferenceCents: 1_500,
      potentialDifferenceBasisPoints: 3_333,
      selectedTotalCents: 4_500,
      selectedVsMinimumCents: 1_500,
    });
  });

  it("trata oferta única sem inventar diferença potencial", () => {
    const indicators = calculateMaterialPriceIndicators(
      comparePriceOffers(material, [offer("only", 10)]), parsePositiveQuantity("2"), null,
    );
    expect(indicators.minimumTotalCents).toBe(2_000);
    expect(indicators.maximumTotalCents).toBe(2_000);
    expect(indicators.potentialDifferenceCents).toBeNull();
    expect(indicators.potentialDifferenceBasisPoints).toBeNull();
  });

  it("mantém todos os IDs empatados nos menores e maiores custos", () => {
    const indicators = calculateMaterialPriceIndicators(
      comparePriceOffers(material, [offer("a", 8), offer("b", 8)]),
      parsePositiveQuantity("1"), "b",
    );
    expect(indicators.lowestOfferIds).toEqual(["a", "b"]);
    expect(indicators.highestOfferIds).toEqual(["a", "b"]);
    expect(indicators.potentialDifferenceCents).toBe(0);
  });

  it("exclui ofertas inválidas dos extremos", () => {
    const indicators = calculateMaterialPriceIndicators(comparePriceOffers(material, [
      offer("valid", 10), offer("cheap-invalid", 1, { unit: "CX" }), offer("zero", 0),
    ]), parsePositiveQuantity("2"), "cheap-invalid");
    expect(indicators.validOfferCount).toBe(1);
    expect(indicators.minimumTotalCents).toBe(2_000);
    expect(indicators.selectedTotalCents).toBeNull();
  });

  it.each(["", "0", "-1", "abc"])("não calcula extremos com quantidade inválida: %s", (value) => {
    const indicators = calculateMaterialPriceIndicators(
      comparePriceOffers(material, [offer("a", 10), offer("b", 12)]),
      parsePositiveQuantity(value), null,
    );
    expect(indicators.minimumTotalCents).toBeNull();
    expect(indicators.validOfferCount).toBe(0);
  });

  it("protege o percentual contra denominador zero", () => {
    expect(calculatePercentageBasisPoints(100, 0)).toBeNull();
    expect(calculatePercentageBasisPoints(25, 100)).toBe(2_500);
  });

  it("consolida mínimo e máximo sobre a mesma cobertura e sinaliza cobertura parcial", () => {
    const first = calculateMaterialPriceIndicators(
      comparePriceOffers(material, [offer("a", 10), offer("b", 12)]),
      parsePositiveQuantity("2"), "b",
    );
    const excluded = calculateMaterialPriceIndicators(
      comparePriceOffers({ ...material, id: "other" }, []), parsePositiveQuantity("2"), null,
    );
    const summary = consolidatePriceIndicators([first, excluded]);
    expect(summary).toEqual({
      minimumTotalCents: 2_000,
      maximumTotalCents: 2_400,
      potentialDifferenceCents: 400,
      selectedTotalCents: 2_400,
      selectedVsMinimumCents: 400,
      coveredMaterialCount: 1,
      excludedMaterialCount: 1,
      selectedCoveredMaterialCount: 1,
    });
  });

  it("não compara total pré-selecionado parcial com mínimo consolidado completo", () => {
    const first = calculateMaterialPriceIndicators(
      comparePriceOffers(material, [offer("a", 10)]), parsePositiveQuantity("1"), "a",
    );
    const otherMaterial = { ...material, id: "other" };
    const second = calculateMaterialPriceIndicators(
      comparePriceOffers(otherMaterial, [offer("b", 20, { approvedMaterialId: "other" })]),
      parsePositiveQuantity("1"), null,
    );
    const summary = consolidatePriceIndicators([first, second]);
    expect(summary.selectedTotalCents).toBe(1_000);
    expect(summary.selectedCoveredMaterialCount).toBe(1);
    expect(summary.selectedVsMinimumCents).toBeNull();
  });
});

it("não publica total consolidado além da precisão inteira segura", () => {
  const indicator = calculateMaterialPriceIndicators(
    comparePriceOffers(material, [offer("a", 40_000_000_000_000)]), parsePositiveQuantity("1"), "a",
  );
  expect(indicator.minimumTotalCents).toBe(4_000_000_000_000_000);
  const summary = consolidatePriceIndicators([indicator, indicator, indicator]);
  expect(summary.minimumTotalCents).toBeNull();
  expect(summary.maximumTotalCents).toBeNull();
  expect(summary.selectedTotalCents).toBeNull();
  expect(summary.selectedVsMinimumCents).toBeNull();
});

describe("precisão decimal das estimativas", () => {
  it.each([[1.005, "1", 101], [0.004, "1000", 400], [1.2345, "10", 1235], [1e-7, "100000", 1]])(
    "arredonda apenas o produto final de %s × %s", (price, quantity, expected) => {
      expect(calculateEstimatedTotalCents(price, parsePositiveQuantity(quantity))).toBe(expected);
    },
  );
  it("recusa razão inválida sem divisão por zero", () => {
    expect(calculateEstimatedTotalCents(10, { numerator: BigInt(1), denominator: BigInt(0) })).toBeNull();
  });
});

it("não conta duas vezes o mesmo registro nem compara duplicatas conflitantes", () => {
  const a = offer("a", 10);
  const result = comparePriceOffers(material, [a, { ...a }]);
  expect(result.offers).toHaveLength(1);
  expect(calculateMaterialPriceIndicators(result, parsePositiveQuantity("1"), null).potentialDifferenceCents).toBeNull();
  const conflict = comparePriceOffers(material, [a, { ...a, unitPrice: 1 }, offer("b", 12)]);
  expect(conflict.lowestOfferIds).toEqual(["b"]);
  expect(conflict.offers.find(x => x.offer.id === "a")?.issues).toContain("DUPLICATE_OFFER_ID");
});

it("detecta divergência em campo presente apenas na repetição e não confunde NaN idêntico", () => {
  const a = offer("a", 10);
  const extra = { ...a, unexpected: "x" } as unknown as PriceOffer;
  expect(comparePriceOffers(material, [a, extra]).offers[0].issues).toContain("DUPLICATE_OFFER_ID");
  const nan = offer("n", Number.NaN);
  const repeated = comparePriceOffers(material, [nan, { ...nan }]).offers[0];
  expect(repeated.issues).toEqual(["INVALID_UNIT_PRICE"]);
  // Conflito permanece mesmo quando a terceira cópia volta a coincidir com a primeira.
  const triple = comparePriceOffers(material, [a, { ...a, unitPrice: 9 }, { ...a }]);
  expect(triple.offers).toHaveLength(1);
  expect(triple.lowestOfferIds).toEqual([]);
});
