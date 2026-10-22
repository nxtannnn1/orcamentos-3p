import type { OfficialMaterial } from "./operator";

export type PriceOfferIssue =
  | "MATERIAL_NOT_APPROVED"
  | "DIFFERENT_MATERIAL"
  | "INVALID_UNIT_PRICE"
  | "INCOMPATIBLE_UNIT"
  | "SUPPLIER_MISSING"
  | "BUDGET_MISSING"
  | "DUPLICATE_OFFER_ID";

export interface PriceOffer {
  id: string;
  approvedMaterialId: string | null;
  supplier: string | null;
  unit: string | null;
  unitPrice: number | null;
  budgetId: string | null;
  budgetCode: string | null;
  budgetDate: string | null;
}

export interface EvaluatedPriceOffer {
  offer: PriceOffer;
  eligible: boolean;
  issues: PriceOfferIssue[];
  isLowestPrice: boolean;
}

export interface PriceComparisonResult {
  material: OfficialMaterial;
  offers: EvaluatedPriceOffer[];
  lowestPrice: number | null;
  lowestOfferIds: string[];
}
