import { describe, expect, it } from "vitest";
import { createMockPriceComparisonRepository } from "./mock-price-comparison-repository";

describe("MockPriceComparisonRepository", () => {
  it("entrega somente ofertas ligadas ao mesmo material aprovado", async () => {
    const offers = await createMockPriceComparisonRepository().listOffersByMaterial("mat-demo-01");
    expect(offers).toHaveLength(5);
    expect(new Set(offers.map((offer) => offer.supplier)).size).toBe(5);
    expect(offers.every((offer) => offer.approvedMaterialId === "mat-demo-01")).toBe(true);
  });

  it("não inventa ofertas para materiais sem dados de demonstração", async () => {
    await expect(
      createMockPriceComparisonRepository().listOffersByMaterial("mat-demo-10"),
    ).resolves.toEqual([]);
  });
});
