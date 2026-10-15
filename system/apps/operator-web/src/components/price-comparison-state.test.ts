import { describe, expect, it } from "vitest";
import type { OfficialMaterial } from "../types/operator";
import type { PriceComparisonResult } from "../types/price-comparison";
import {
  changePriceComparisonMaterial,
  initialPriceComparisonSelection,
  selectPriceComparisonOffer,
} from "./price-comparison-state";

const materials: OfficialMaterial[] = [
  { id: "without-offers", code: "MAT-0", name: "Sem ofertas", family: "Teste", unit: "UN" },
  { id: "with-offers", code: "MAT-1", name: "Com ofertas", family: "Teste", unit: "UN" },
];
const comparison = {
  material: materials[1],
  offers: [{ offer: { id: "offer-1" } }],
} as PriceComparisonResult;

describe("estado local da comparação de preços", () => {
  it("seleciona inicialmente o material retornado pela comparação com ofertas", () => {
    expect(initialPriceComparisonSelection(materials, comparison)).toEqual({
      material: materials[1],
      selectedOfferId: null,
    });
  });

  it("permite trocar o material e limpa a oferta anteriormente escolhida", () => {
    const selected = selectPriceComparisonOffer(
      { material: materials[1], selectedOfferId: null },
      "offer-1",
    );
    expect(changePriceComparisonMaterial(materials[0])).toEqual({
      material: materials[0],
      selectedOfferId: null,
    });
    expect(selected.selectedOfferId).toBe("offer-1");
  });

  it("permite limpar completamente o material selecionado", () => {
    expect(changePriceComparisonMaterial(null)).toEqual({
      material: null,
      selectedOfferId: null,
    });
  });
});
