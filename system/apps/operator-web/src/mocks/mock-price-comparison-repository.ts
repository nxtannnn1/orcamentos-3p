import type { PriceComparisonRepository } from "../repositories/price-comparison-repository";
import type { PriceOffer } from "../types/price-comparison";
import { mockPriceOffers } from "./mock-price-offers";

const clone = <T>(value: T): T => structuredClone(value);

export class MockPriceComparisonRepository implements PriceComparisonRepository {
  async listOffersByMaterial(materialId: string): Promise<PriceOffer[]> {
    return clone(mockPriceOffers.filter((offer) => offer.approvedMaterialId === materialId));
  }
}

export const createMockPriceComparisonRepository = () => new MockPriceComparisonRepository();
