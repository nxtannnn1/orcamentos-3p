import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actorM, correctionConfig, correctionFixture, correctionInput } from "./__test-support__/correction";
import { readSharePointServerConfig } from "../data-source/configuration";
import { verifyCorrectionColumns } from "./correction-state";

// Regression (23/10/2026): .env.local mapped lookups as "<Coluna>LookupId"; the correction schema
// check expects the base name and failed with "Tipos ou estado dos campos efetivos incompatíveis."
const fromEnv = (items: Record<string, unknown>) => readSharePointServerConfig({
  MICROSOFT_TENANT_ID: correctionConfig.tenantId, MICROSOFT_CLIENT_ID: "synthetic-client", MICROSOFT_CLIENT_SECRET: "synthetic-secret",
  SHAREPOINT_SITE_ID: correctionConfig.siteId, SHAREPOINT_ORCAMENTOS_LIST_ID: correctionConfig.budgetsListId,
  SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: correctionConfig.itemsListId, SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: correctionConfig.materialsListId,
  SHAREPOINT_HUMAN_CORRECTIONS_ENABLED: "true",
  SHAREPOINT_FIELD_MAP_JSON: JSON.stringify({ ...correctionConfig.fields, items: { ...correctionConfig.fields.items, ...items } }),
}).repository;

describe("mapa de lookups da correção humana", () => {
  it("aceita o mapa com sufixo LookupId vindo do ambiente", async () => {
    const f = correctionFixture();
    const config = fromEnv({ approvedMaterialLookupId: "Material_AprovadoLookupId", budgetLookupId: "BudgetLookupId" });
    expect(config.fields.items).toMatchObject({ approvedMaterialLookupId: "Material_Aprovado", budgetLookupId: "Budget" });
    await expect(verifyCorrectionColumns(f.graph, config)).resolves.toBeDefined();
  });
  it("mantém a recusa para uma coluna de material diferente da homologada", async () => {
    const f = correctionFixture();
    await expect(verifyCorrectionColumns(f.graph, fromEnv({ approvedMaterialLookupId: "Outro_MaterialLookupId" })))
      .rejects.toMatchObject({ code: "CORRECTION_SCHEMA_REQUIRED", message: "Tipos ou estado dos campos efetivos incompatíveis." });
  });
  it("a correção salva com o mapa do ambiente registra o lookup real na evidência original", async () => {
    const f = correctionFixture();
    Object.assign(f.config, fromEnv({ approvedMaterialLookupId: "Material_AprovadoLookupId", budgetLookupId: "BudgetLookupId" }));
    f.row.fields.Material_AprovadoLookupId = 21;
    await f.service.save("1", correctionInput, { actor: actorM, version: '"v1"' });
    const evidence = JSON.parse(String(f.row.fields.Extracao_Original_JSON));
    expect(evidence.snapshot.raw).toHaveProperty("Material_AprovadoLookupId", 21);
    expect(evidence.snapshot.raw).not.toHaveProperty("Material_AprovadoLookupIdLookupId");
  });
});
