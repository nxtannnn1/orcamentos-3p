import type { PriceComparisonResult } from "../../types/price-comparison";

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: "GET", cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "Não foi possível carregar a comparação de preços.");
  }
  return response.json() as Promise<T>;
}

export class BffPriceComparisonRepository {
  getInitialComparison(): Promise<PriceComparisonResult | null> {
    return readJson<PriceComparisonResult | null>("/api/comparacao-precos");
  }

  getComparison(materialId: string): Promise<PriceComparisonResult> {
    const params = new URLSearchParams({ materialId });
    return readJson<PriceComparisonResult>(`/api/comparacao-precos?${params}`);
  }
}

export const priceComparisonBff = new BffPriceComparisonRepository();
