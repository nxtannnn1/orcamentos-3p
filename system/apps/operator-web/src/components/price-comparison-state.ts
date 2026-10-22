import {
  calculateEstimatedTotalCents,
  evaluatePriceOffer,
  parsePositiveQuantity,
  sumPriceCents,
} from "../domain/price-comparison";
import type { OfficialMaterial } from "../types/operator";
import type { EvaluatedPriceOffer, PriceComparisonResult } from "../types/price-comparison";

export interface PriceComparisonSelectionState {
  material: OfficialMaterial | null;
  selectedOfferIds: Readonly<Record<string, string>>;
  quantityInputs: Readonly<Record<string, string>>;
}

export interface PricePreselectionLine {
  material: OfficialMaterial;
  offer: EvaluatedPriceOffer;
  quantityInput: string;
  subtotalCents: number | null;
}

export interface PricePreselectionSummary {
  lines: PricePreselectionLine[];
  materialsWithoutSelection: OfficialMaterial[];
  totalCents: number | null;
  invalidQuantityCount: number;
}

export const emptyPriceComparisonSelection: PriceComparisonSelectionState = {
  material: null,
  selectedOfferIds: {},
  quantityInputs: {},
};

export function filterPriceComparisonMaterials(
  materials: readonly OfficialMaterial[],
  query: string,
): OfficialMaterial[] {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  if (!normalized) return [...materials];
  return materials.filter((material) =>
    `${material.code} ${material.name} ${material.family}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalized),
  );
}

export function initialPriceComparisonSelection(
  materials: readonly OfficialMaterial[],
  comparison: PriceComparisonResult,
): PriceComparisonSelectionState {
  const material = comparison.offers.length
    ? materials.find((entry) => entry.id === comparison.material.id) ?? null
    : null;
  return {
    material,
    selectedOfferIds: {},
    quantityInputs: material ? { [material.id]: "1" } : {},
  };
}

export function changePriceComparisonMaterial(
  state: PriceComparisonSelectionState,
  material: OfficialMaterial | null,
): PriceComparisonSelectionState {
  if (!material || state.quantityInputs[material.id] !== undefined) {
    return { ...state, material };
  }
  return {
    ...state,
    material,
    quantityInputs: { ...state.quantityInputs, [material.id]: "1" },
  };
}

export function selectPriceComparisonOffer(
  state: PriceComparisonSelectionState,
  selectedOfferId: string,
): PriceComparisonSelectionState {
  if (!state.material) return state;
  return {
    ...state,
    selectedOfferIds: { ...state.selectedOfferIds, [state.material.id]: selectedOfferId },
  };
}

export function changePriceComparisonQuantity(
  state: PriceComparisonSelectionState,
  quantityInput: string,
): PriceComparisonSelectionState {
  if (!state.material) return state;
  return {
    ...state,
    quantityInputs: { ...state.quantityInputs, [state.material.id]: quantityInput },
  };
}

export function selectedOfferIdForMaterial(
  state: PriceComparisonSelectionState,
  materialId: string | undefined,
) {
  return materialId ? state.selectedOfferIds[materialId] ?? null : null;
}

export function summarizePricePreselection(
  materials: readonly OfficialMaterial[],
  comparisons: Readonly<Record<string, PriceComparisonResult>>,
  state: PriceComparisonSelectionState,
): PricePreselectionSummary {
  const lines: PricePreselectionLine[] = [];
  const materialsWithoutSelection: OfficialMaterial[] = [];

  for (const material of materials) {
    const selectedOfferId = state.selectedOfferIds[material.id];
    const entry = comparisons[material.id]?.offers.find(
      (candidate) => candidate.offer.id === selectedOfferId,
    );
    // Revalida o snapshot: dado obsoleto ou adulterado nunca entra no total.
    if (!entry || !entry.eligible || !evaluatePriceOffer(material, entry.offer).eligible) {
      materialsWithoutSelection.push(material);
      continue;
    }
    const quantityInput = state.quantityInputs[material.id] ?? "1";
    lines.push({
      material,
      offer: entry,
      quantityInput,
      subtotalCents: calculateEstimatedTotalCents(
        entry.offer.unitPrice,
        parsePositiveQuantity(quantityInput),
      ),
    });
  }

  return {
    lines,
    materialsWithoutSelection,
    invalidQuantityCount: lines.filter(line => line.subtotalCents === null).length,
    totalCents: lines.some(line => line.subtotalCents === null)
      ? null : sumPriceCents(lines.map(line => line.subtotalCents as number)),
  };
}
