import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { buildArtifacts } from "./prepare-homologation.mjs";
import { readSharePointServerConfig } from "../src/server/data-source/configuration";
import { SharePointPriceComparisonRepository } from "../src/server/sharepoint/sharepoint-price-comparison-repository";
import { comparePriceOffers } from "../src/domain/price-comparison";
import type { GraphReadTransport } from "../src/server/sharepoint/sharepoint-types";
import { readFileSync } from "node:fs";

describe("cenario de duas ofertas do pacote isolado", () => {
  it("mantem fixtures pendentes e simula aprovacoes somente neste teste", async () => {
    const fixtures = buildArtifacts()["fixtures.synthetic.json"];
    expect(fixtures.items.every(item => item.Status_Revisao === "PENDENTE")).toBe(true);
    const template = readFileSync(new URL("../docs/homologacao/operator.homolog.env.example", import.meta.url), "utf8");
    const rawMap = template.split("\n").find(line => line.startsWith("SHAREPOINT_FIELD_MAP_JSON="))!.split("=", 2)[1].trim().slice(1, -1);
    const { repository: config } = readSharePointServerConfig({ MICROSOFT_TENANT_ID: "synthetic-tenant", MICROSOFT_CLIENT_ID: "synthetic-app", MICROSOFT_CLIENT_SECRET: "synthetic-only", SHAREPOINT_SITE_ID: "synthetic-site", SHAREPOINT_ORCAMENTOS_LIST_ID: "budgets", SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: "items", SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: "materials", SHAREPOINT_FIELD_MAP_JSON: rawMap });
    const graph: GraphReadTransport = { async get<T>(path: string): Promise<T> {
      const value = path.includes("/materials/") ? [{ id: "1", fields: fixtures.material }]
        : path.includes("/budgets/") ? fixtures.budgets.map((budget, index) => ({ id: String(index + 2), fields: budget }))
        : fixtures.items.map((item, index) => ({ id: String(index + 10), fields: { ...item, Status_Revisao: "APROVADO", Material_AprovadoLookupId: "1", Codigo_OrcamentoLookupId: String(index + 2) } }));
      return { value } as T;
    } };
    const offers = await new SharePointPriceComparisonRepository(graph, config).listOffersByMaterial("1");
    const result = comparePriceOffers({ id: "1", code: fixtures.material.Title, name: fixtures.material.Material, family: "", unit: fixtures.material.Unidade_Padrao }, offers);
    expect(offers).toHaveLength(2);
    expect(new Set(offers.map(offer => offer.supplier)).size).toBe(2);
    expect(result.offers.every(offer => offer.eligible)).toBe(true);
    expect(result.lowestPrice).toBe(8);
    expect(offers.map(offer => offer.budgetDate)).toEqual(fixtures.budgets.map(budget => budget.Data_Orcamento));
  });
});
