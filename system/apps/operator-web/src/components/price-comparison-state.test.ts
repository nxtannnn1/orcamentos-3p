import { describe, expect, it } from "vitest";
import { comparePriceOffers } from "../domain/price-comparison";
import type { OfficialMaterial } from "../types/operator";
import type { PriceOffer } from "../types/price-comparison";
import {
  changePriceComparisonMaterial,
  changePriceComparisonQuantity,
  emptyPriceComparisonSelection,
  filterPriceComparisonMaterials,
  initialPriceComparisonSelection,
  selectPriceComparisonOffer,
  selectedOfferIdForMaterial,
  summarizePricePreselection,
} from "./price-comparison-state";

const materials: OfficialMaterial[] = [
  { id: "material-1", code: "MAT-1", name: "Material 1", family: "Teste", unit: "UN" },
  { id: "material-2", code: "MAT-2", name: "Material 2", family: "Teste", unit: "UN" },
  { id: "material-3", code: "MAT-3", name: "Sem ofertas", family: "Teste", unit: "UN" },
];

function offer(material: OfficialMaterial, id: string, price: number, overrides: Partial<PriceOffer> = {}): PriceOffer {
  return {
    id, approvedMaterialId: material.id, supplier: `Fornecedor ${id}`, unit: material.unit,
    unitPrice: price, budgetId: `budget-${id}`, budgetCode: `COT-${id}`,
    budgetDate: "2026-10-01", ...overrides,
  };
}

const comparisons = {
  "material-1": comparePriceOffers(materials[0], [
    offer(materials[0], "offer-1a", 10), offer(materials[0], "offer-1b", 12),
  ]),
  "material-2": comparePriceOffers(materials[1], [offer(materials[1], "offer-2", 5)]),
  "material-3": comparePriceOffers(materials[2], [offer(materials[2], "invalid", 1, { unit: "CX" })]),
};

describe("estado local da pré-seleção de preços", () => {
  it("lista inicialmente todos os materiais e filtra por código, descrição ou categoria", () => {
    expect(filterPriceComparisonMaterials(materials, "")).toEqual(materials);
    expect(filterPriceComparisonMaterials(materials, "MAT-2")).toEqual([materials[1]]);
    expect(filterPriceComparisonMaterials(materials, "sem ofertas")).toEqual([materials[2]]);
    expect(filterPriceComparisonMaterials(materials, "teste")).toEqual(materials);
    expect(filterPriceComparisonMaterials(materials, "inexistente")).toEqual([]);
  });

  it("seleciona inicialmente o material retornado sem escolher oferta automaticamente", () => {
    expect(initialPriceComparisonSelection(materials, comparisons["material-1"])).toEqual({
      material: materials[0], selectedOfferIds: {}, quantityInputs: { "material-1": "1" },
    });
  });

  it("mantém seleções independentes ao alternar entre materiais", () => {
    let state = changePriceComparisonMaterial(emptyPriceComparisonSelection, materials[0]);
    state = selectPriceComparisonOffer(state, "offer-1a");
    state = changePriceComparisonMaterial(state, materials[1]);
    state = selectPriceComparisonOffer(state, "offer-2");
    state = changePriceComparisonMaterial(state, materials[0]);
    expect(selectedOfferIdForMaterial(state, materials[0].id)).toBe("offer-1a");
    expect(selectedOfferIdForMaterial(state, materials[1].id)).toBe("offer-2");
  });

  it("substitui apenas a oferta anteriormente selecionada para o mesmo material", () => {
    let state = changePriceComparisonMaterial(emptyPriceComparisonSelection, materials[0]);
    state = selectPriceComparisonOffer(state, "offer-1a");
    state = selectPriceComparisonOffer(state, "offer-1b");
    expect(state.selectedOfferIds).toEqual({ "material-1": "offer-1b" });
  });

  it("calcula o total geral das seleções por material", () => {
    let state = changePriceComparisonMaterial(emptyPriceComparisonSelection, materials[0]);
    state = selectPriceComparisonOffer(state, "offer-1a");
    state = changePriceComparisonQuantity(state, "2");
    state = changePriceComparisonMaterial(state, materials[1]);
    state = selectPriceComparisonOffer(state, "offer-2");
    state = changePriceComparisonQuantity(state, "3");
    expect(summarizePricePreselection(materials, comparisons, state).totalCents).toBe(3_500);
  });

  it("exclui ofertas inválidas do resumo e do total", () => {
    let state = changePriceComparisonMaterial(emptyPriceComparisonSelection, materials[2]);
    state = selectPriceComparisonOffer(state, "invalid");
    const summary = summarizePricePreselection(materials, comparisons, state);
    expect(summary.lines).toHaveLength(0);
    expect(summary.totalCents).toBe(0);
    expect(summary.materialsWithoutSelection).toContain(materials[2]);
  });

  it("recalcula o subtotal quando a quantidade muda após a seleção", () => {
    let state = changePriceComparisonMaterial(emptyPriceComparisonSelection, materials[0]);
    state = selectPriceComparisonOffer(state, "offer-1a");
    state = changePriceComparisonQuantity(state, "4.5");
    expect(summarizePricePreselection(materials, comparisons, state).lines[0].subtotalCents).toBe(4_500);
  });

  it("identifica materiais sem oferta selecionada, inclusive sem oferta válida", () => {
    let state = changePriceComparisonMaterial(emptyPriceComparisonSelection, materials[0]);
    state = selectPriceComparisonOffer(state, "offer-1a");
    expect(summarizePricePreselection(materials, comparisons, state).materialsWithoutSelection)
      .toEqual([materials[1], materials[2]]);
  });
});

it("não apresenta quantidade inválida como zero no total das seleções", () => {
  let state = changePriceComparisonMaterial(emptyPriceComparisonSelection, materials[0]);
  state = selectPriceComparisonOffer(state, "offer-1a");
  state = changePriceComparisonQuantity(state, "");
  const summary = summarizePricePreselection(materials, comparisons, state);
  expect(summary.totalCents).toBeNull();
  expect(summary.invalidQuantityCount).toBe(1);
  expect(summary.lines[0].subtotalCents).toBeNull();
  state = changePriceComparisonQuantity(state, "2");
  expect(summarizePricePreselection(materials, comparisons, state).totalCents).toBe(2000);
  expect(state.selectedOfferIds[materials[0].id]).toBe("offer-1a");
});
