import type { OfficialMaterial } from "../types/operator";
import type { PriceComparisonResult } from "../types/price-comparison";

export interface PriceComparisonSelectionState {
  material: OfficialMaterial | null;
  selectedOfferId: string | null;
}

export const emptyPriceComparisonSelection: PriceComparisonSelectionState = {
  material: null,
  selectedOfferId: null,
};

export function initialPriceComparisonSelection(
  materials: readonly OfficialMaterial[],
  comparison: PriceComparisonResult,
): PriceComparisonSelectionState {
  const material = comparison.offers.length
    ? materials.find((entry) => entry.id === comparison.material.id) ?? null
    : null;
  return { material, selectedOfferId: null };
}

export function changePriceComparisonMaterial(
  material: OfficialMaterial | null,
): PriceComparisonSelectionState {
  return { material, selectedOfferId: null };
}

export function selectPriceComparisonOffer(
  state: PriceComparisonSelectionState,
  selectedOfferId: string,
): PriceComparisonSelectionState {
  return { ...state, selectedOfferId };
}
