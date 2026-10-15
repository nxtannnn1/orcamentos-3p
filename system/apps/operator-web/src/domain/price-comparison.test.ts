import { describe, expect, it } from "vitest";
import type { OfficialMaterial } from "../types/operator";
import type { PriceOffer } from "../types/price-comparison";
import {
  calculateEstimatedTotalCents,
  comparePriceOffers,
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
});
