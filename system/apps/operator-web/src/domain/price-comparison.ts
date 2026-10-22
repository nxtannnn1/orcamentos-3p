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

export interface MaterialPriceIndicators {
  validOfferCount: number;
  lowestOfferIds: string[];
  highestOfferIds: string[];
  minimumTotalCents: number | null;
  maximumTotalCents: number | null;
  potentialDifferenceCents: number | null;
  potentialDifferenceBasisPoints: number | null;
  selectedTotalCents: number | null;
  selectedVsMinimumCents: number | null;
}

export interface ConsolidatedPriceIndicators {
  minimumTotalCents: number | null;
  maximumTotalCents: number | null;
  potentialDifferenceCents: number | null;
  selectedTotalCents: number | null;
  selectedVsMinimumCents: number | null;
  coveredMaterialCount: number;
  excludedMaterialCount: number;
  selectedCoveredMaterialCount: number;
}

/** Never return a rounded/unsafe aggregate as a monetary total. */
export function sumPriceCents(values: readonly number[]): number | null {
  let total = BigInt(0);
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    total += BigInt(value);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(total);
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

export function calculatePercentageBasisPoints(
  differenceCents: number,
  denominatorCents: number,
): number | null {
  if (
    !Number.isSafeInteger(differenceCents) || differenceCents < 0 ||
    !Number.isSafeInteger(denominatorCents) || denominatorCents <= 0
  ) return null;
  const denominator = BigInt(denominatorCents);
  const rounded = (BigInt(differenceCents) * BigInt(10_000) + denominator / BigInt(2)) /
    denominator;
  return rounded > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(rounded);
}

export function calculateMaterialPriceIndicators(
  comparison: PriceComparisonResult,
  quantity: PositiveQuantity | null,
  selectedOfferId: string | null,
): MaterialPriceIndicators {
  const comparable = comparison.offers.flatMap((entry) => {
    if (!entry.eligible || !evaluatePriceOffer(comparison.material, entry.offer).eligible) return [];
    const totalCents = calculateEstimatedTotalCents(entry.offer.unitPrice, quantity);
    return totalCents === null ? [] : [{ entry, totalCents }];
  });
  const totals = comparable.map(({ totalCents }) => totalCents);
  const minimumTotalCents = totals.length ? Math.min(...totals) : null;
  const maximumTotalCents = totals.length ? Math.max(...totals) : null;
  const hasComparableRange = comparable.length >= 2 &&
    minimumTotalCents !== null && maximumTotalCents !== null;
  const potentialDifferenceCents = hasComparableRange
    ? maximumTotalCents - minimumTotalCents
    : null;
  const selected = comparable.find(({ entry }) => entry.offer.id === selectedOfferId);
  const selectedTotalCents = selected?.totalCents ?? null;

  return {
    validOfferCount: comparable.length,
    lowestOfferIds: minimumTotalCents === null ? [] : comparable
      .filter(({ totalCents }) => totalCents === minimumTotalCents)
      .map(({ entry }) => entry.offer.id),
    highestOfferIds: maximumTotalCents === null ? [] : comparable
      .filter(({ totalCents }) => totalCents === maximumTotalCents)
      .map(({ entry }) => entry.offer.id),
    minimumTotalCents,
    maximumTotalCents,
    potentialDifferenceCents,
    potentialDifferenceBasisPoints:
      potentialDifferenceCents === null || maximumTotalCents === null
        ? null
        : calculatePercentageBasisPoints(potentialDifferenceCents, maximumTotalCents),
    selectedTotalCents,
    selectedVsMinimumCents:
      selectedTotalCents === null || minimumTotalCents === null
        ? null
        : selectedTotalCents - minimumTotalCents,
  };
}

export function consolidatePriceIndicators(
  indicators: readonly MaterialPriceIndicators[],
): ConsolidatedPriceIndicators {
  const covered = indicators.filter(
    (entry) => entry.minimumTotalCents !== null && entry.maximumTotalCents !== null,
  );
  const selected = covered.filter((entry) => entry.selectedTotalCents !== null);
  if (!covered.length) {
    return {
      minimumTotalCents: null, maximumTotalCents: null, potentialDifferenceCents: null,
      selectedTotalCents: null, selectedVsMinimumCents: null, coveredMaterialCount: 0,
      excludedMaterialCount: indicators.length, selectedCoveredMaterialCount: 0,
    };
  }
  const minimumTotalCents = sumPriceCents(covered.map(entry => entry.minimumTotalCents as number));
  const maximumTotalCents = sumPriceCents(covered.map(entry => entry.maximumTotalCents as number));
  const selectedTotalCents = sumPriceCents(selected.map(entry => entry.selectedTotalCents as number));
  const completeSelectedCoverage = selected.length === covered.length;
  const hasComparableRange = covered.some(
    (entry) => entry.potentialDifferenceCents !== null,
  );
  return {
    minimumTotalCents,
    maximumTotalCents,
    potentialDifferenceCents: hasComparableRange && maximumTotalCents !== null && minimumTotalCents !== null
      ? maximumTotalCents - minimumTotalCents
      : null,
    selectedTotalCents: selected.length ? selectedTotalCents : null,
    selectedVsMinimumCents: completeSelectedCoverage && selectedTotalCents !== null && minimumTotalCents !== null
      ? selectedTotalCents - minimumTotalCents
      : null,
    coveredMaterialCount: covered.length,
    excludedMaterialCount: indicators.length - covered.length,
    selectedCoveredMaterialCount: selected.length,
  };
}
