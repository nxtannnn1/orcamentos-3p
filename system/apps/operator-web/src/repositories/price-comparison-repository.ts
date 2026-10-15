import type { PriceOffer } from "../types/price-comparison";

export interface PriceComparisonRepository {
  listOffersByMaterial(materialId: string): Promise<PriceOffer[]>;
}
