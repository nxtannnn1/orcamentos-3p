import { expect, it, vi } from "vitest";
// Framework boundary only: the real app credential transport and Graph GETs are used.
vi.mock("server-only", () => ({}));
import { readSharePointServerConfig } from "../src/server/data-source/configuration";
import { GraphClientCredentialsReadTransport } from "../src/server/sharepoint/graph-read-transport";
import { SharePointOperatorRepository } from "../src/server/sharepoint/sharepoint-operator-repository";
import { SharePointPriceComparisonRepository } from "../src/server/sharepoint/sharepoint-price-comparison-repository";
import { comparePriceOffers } from "../src/domain/price-comparison";
import type { GraphReadTransport } from "../src/server/sharepoint/sharepoint-types";

it.skipIf(process.env.RUN_SHAREPOINT_READ_CHECK !== "true")("leitura Graph real autorizada, sem sessão humana nem qualquer escrita de recursos", async () => {
  const config = readSharePointServerConfig();
  let reads = 0;
  const transport = new GraphClientCredentialsReadTransport(config.graph, async (input, options) => {
    const url = new URL(String(input));
    const oauth = url.origin === "https://login.microsoftonline.com" && url.pathname.endsWith("/oauth2/v2.0/token") && options?.method === "POST";
    const read = url.origin === "https://graph.microsoft.com" && url.pathname.startsWith("/v1.0/sites/") && options?.method === "GET";
    if (!oauth && !read) throw new Error("A operação solicitada não é leitura Graph nem aquisição OAuth.");
    if (read) reads++;
    return fetch(input, options);
  });
  const cache = new Map<string, Promise<unknown>>();
  const graph: GraphReadTransport = { get<T>(path: string): Promise<T> {
    if (!cache.has(path)) cache.set(path, transport.get(path));
    return cache.get(path) as Promise<T>;
  } };
  const repository = new SharePointOperatorRepository(graph, config.repository);
  const comparison = new SharePointPriceComparisonRepository(graph, config.repository);
  const materials = await repository.listOfficialMaterials();
  const budgets = await repository.listBudgets();
  let offers = 0;
  let eligible = 0;
  let materialsWithTwoOffers = 0;
  for (const material of materials.slice(0, 50)) {
    const rows = await comparison.listOffersByMaterial(material.id);
    const result = comparePriceOffers(material, rows);
    offers += rows.length;
    eligible += result.offers.filter(entry => entry.eligible).length;
    if (rows.length >= 2) materialsWithTwoOffers++;
    expect(rows.every(row => row.approvedMaterialId === material.id)).toBe(true);
  }
  console.log(JSON.stringify({ mode: "LIVE_GET_ONLY", materialCount: materials.length, budgetCount: budgets.length, sampledMaterials: Math.min(materials.length, 50), offers, eligibleOffers: eligible, materialsWithTwoOffers, graphGetRequests: reads, humanLoginVerified: false }));
  expect(reads).toBeGreaterThanOrEqual(3);
}, 120000);
