import type { OfficialMaterial } from "../types/operator";
import type {
  EvaluatedPriceOffer,
  PriceComparisonResult,
  PriceOffer,
  PriceOfferIssue,
} from "../types/price-comparison";

export interface PositiveQuantity {
  numerator: bigint;
  denominator: bigint;
}

export function normalizeComparisonUnit(value: string | null | undefined): string {
  return value?.trim().toLocaleUpperCase("pt-BR") ?? "";
}

export function evaluatePriceOffer(
  material: OfficialMaterial,
  offer: PriceOffer,
): EvaluatedPriceOffer {
  const issues: PriceOfferIssue[] = [];

  if (!offer.approvedMaterialId) issues.push("MATERIAL_NOT_APPROVED");
  else if (offer.approvedMaterialId !== material.id) issues.push("DIFFERENT_MATERIAL");

  if (
    typeof offer.unitPrice !== "number" ||
    !Number.isFinite(offer.unitPrice) ||
    offer.unitPrice <= 0
  ) {
    issues.push("INVALID_UNIT_PRICE");
  }

  const materialUnit = normalizeComparisonUnit(material.unit);
  const offerUnit = normalizeComparisonUnit(offer.unit);
  if (!materialUnit || !offerUnit || materialUnit !== offerUnit) {
    issues.push("INCOMPATIBLE_UNIT");
  }

  if (!offer.supplier?.trim()) issues.push("SUPPLIER_MISSING");
  if (!offer.budgetId?.trim() || !offer.budgetCode?.trim()) issues.push("BUDGET_MISSING");

  return { offer, eligible: issues.length === 0, issues, isLowestPrice: false };
}

function compareOfferIdentity(left: EvaluatedPriceOffer, right: EvaluatedPriceOffer) {
  const supplierOrder = (left.offer.supplier ?? "").localeCompare(
    right.offer.supplier ?? "",
    "pt-BR",
  );
  return supplierOrder || left.offer.id.localeCompare(right.offer.id);
}

function compareEvaluatedOffers(left: EvaluatedPriceOffer, right: EvaluatedPriceOffer) {
  if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
  if (left.eligible && right.eligible) {
    const priceOrder = (left.offer.unitPrice as number) - (right.offer.unitPrice as number);
    if (priceOrder) return priceOrder;
  }
  return compareOfferIdentity(left, right);
}

export function comparePriceOffers(
  material: OfficialMaterial,
  offers: readonly PriceOffer[],
): PriceComparisonResult {
  const evaluated = offers.map((offer) => evaluatePriceOffer(material, offer));
  const validPrices = evaluated.flatMap((entry) =>
    entry.eligible && typeof entry.offer.unitPrice === "number"
      ? [entry.offer.unitPrice]
      : [],
  );
  const lowestPrice = validPrices.length
    ? validPrices.reduce((lowest, price) => Math.min(lowest, price))
    : null;
  const withLowestPrice = evaluated
    .map((entry) => ({
      ...entry,
      isLowestPrice:
        entry.eligible && lowestPrice !== null && entry.offer.unitPrice === lowestPrice,
    }))
    .sort(compareEvaluatedOffers);

  return {
    material,
    offers: withLowestPrice,
    lowestPrice,
    lowestOfferIds: withLowestPrice
      .filter((entry) => entry.isLowestPrice)
      .map((entry) => entry.offer.id),
  };
}

export function parsePositiveQuantity(value: string): PositiveQuantity | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || normalized.length > 64) return null;
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const [integerPart, decimalPart = ""] = normalized.split(".");
  const numerator = BigInt(`${integerPart}${decimalPart}`);
  if (numerator <= BigInt(0)) return null;
  return { numerator, denominator: BigInt(10) ** BigInt(decimalPart.length) };
}

export function calculateEstimatedTotalCents(
  unitPrice: number | null,
  quantity: PositiveQuantity | null,
): number | null {
  if (
    quantity === null ||
    typeof unitPrice !== "number" ||
    !Number.isFinite(unitPrice) ||
    unitPrice <= 0
  ) {
    return null;
  }

  const priceCents = Math.round(unitPrice * 100);
  if (!Number.isSafeInteger(priceCents) || priceCents <= 0) return null;
  const unrounded = BigInt(priceCents) * quantity.numerator;
  const rounded =
    (unrounded + quantity.denominator / BigInt(2)) / quantity.denominator;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(rounded);
}
