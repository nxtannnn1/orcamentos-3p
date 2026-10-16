import "server-only";
import { createMockPriceComparisonRepository } from "../../mocks/mock-price-comparison-repository";
import type { PriceComparisonRepository } from "../../repositories/price-comparison-repository";
import { GraphClientCredentialsReadTransport } from "../sharepoint/graph-read-transport";
import { SharePointPriceComparisonRepository } from "../sharepoint/sharepoint-price-comparison-repository";
import { DecisionError } from "../../domain/decision-error";
import { DataSourceConfigurationError, readSharePointServerConfig, resolveDataSource } from "./configuration";

function readComparisonConfig(env: Record<string, string | undefined>) {
  const config = readSharePointServerConfig(env);
  const { items, budgets, materials } = config.repository.fields;
  const requiredFields = [items.status, items.approvedMaterialLookupId, items.budgetLookupId, items.unitPrice, items.unit, budgets.code, budgets.date, materials.code, materials.name, materials.unit];
  if (items.supplier !== undefined) requiredFields.push(items.supplier);
  if (requiredFields.some(value => typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value)))
    throw new DataSourceConfigurationError("Mapeamento de comparação incompleto ou inválido.");
  return config;
}

export function createServerPriceComparisonRepository(env: Record<string, string | undefined> = process.env): PriceComparisonRepository {
  const source = resolveDataSource(env.DATA_SOURCE);
  if (source === "mock") return createMockPriceComparisonRepository();
  if (source !== "sharepoint") throw new DecisionError("Comparação indisponível para esta fonte.", 404, "PRICE_COMPARISON_UNAVAILABLE");
  const config = readComparisonConfig(env);
  return new SharePointPriceComparisonRepository(new GraphClientCredentialsReadTransport(config.graph), config.repository);
}

export function comparisonSource() {
  const source = resolveDataSource();
  if (source === "sharepoint") readComparisonConfig(process.env);
  return source;
}
