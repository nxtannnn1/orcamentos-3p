import candidate from "../../../docs/phase-m-decision-fields.candidate.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataSourceConfigurationError, readSharePointServerConfig, resolveDataSource } from "./configuration";

describe("seleção server-side da fonte de dados", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("usa mock como padrão", () => {
    vi.stubEnv("DATA_SOURCE", "");
    expect(resolveDataSource()).toBe("mock");
  });

  it("aceita DATA_SOURCE=mock", () => {
    expect(resolveDataSource("mock")).toBe("mock");
  });

  it("falha com mensagem segura quando SharePoint não está configurado", () => {
    expect(() => readSharePointServerConfig({ DATA_SOURCE: "sharepoint" }))
      .toThrowError(DataSourceConfigurationError);
    expect(() => readSharePointServerConfig({ DATA_SOURCE: "sharepoint" }))
      .toThrow("MICROSOFT_TENANT_ID");
  });
});

describe("nomes de auditoria SharePoint", () => {
  const env = (items: Record<string, string | undefined>) => ({
    MICROSOFT_TENANT_ID: "synthetic-tenant", MICROSOFT_CLIENT_ID: "synthetic-client",
    MICROSOFT_CLIENT_SECRET: "synthetic-secret", SHAREPOINT_SITE_ID: "synthetic-site",
    SHAREPOINT_ORCAMENTOS_LIST_ID: "budgets", SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: "items",
    SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: "materials",
    SHAREPOINT_FIELD_MAP_JSON: JSON.stringify({ budgets: {}, materials: {}, items }),
  });
  it("aceita o mapa candidato de autoria sem preencher automaticamente configurações ausentes", () => {
    expect(readSharePointServerConfig(env(candidate.items)).repository.fields.items).toEqual(candidate.items);
    expect(readSharePointServerConfig(env({})).repository.fields.items.reviewedByPerson).toBeUndefined();
  });
  it("preserva leitura sem mapeamentos de escrita e vincula o tenant no servidor", () => {
    expect(readSharePointServerConfig(env({})).repository.tenantId).toBe("synthetic-tenant");
  });
  it("normaliza chaves de lookup com sufixo LookupId para o nome base da coluna", () => {
    const items = readSharePointServerConfig(env({ budgetLookupId: "Codigo_OrcamentoLookupId",
      suggestedMaterialLookupId: "Material_Sugerido_RefLookupId", approvedMaterialLookupId: "Material_AprovadoLookupId" })).repository.fields.items;
    expect(items).toMatchObject({ budgetLookupId: "Codigo_Orcamento", suggestedMaterialLookupId: "Material_Sugerido_Ref", approvedMaterialLookupId: "Material_Aprovado" });
    expect(readSharePointServerConfig(env({ approvedMaterialLookupId: "Material_Aprovado" })).repository.fields.items.approvedMaterialLookupId).toBe("Material_Aprovado");
    // Only the lookup keys are normalized; a bare "LookupId" is never shortened to an empty name.
    expect(readSharePointServerConfig(env({ approvedMaterialLookupId: "LookupId", observation: "NotaLookupId" })).repository.fields.items)
      .toMatchObject({ approvedMaterialLookupId: "LookupId", observation: "NotaLookupId" });
  });
  it.each([
    { reviewedByPerson: "__proto__" },
    { reviewedByOid: "Person", reviewedByPerson: "Person" },
    { reviewedByPerson: "Status_Revisao" },
    { reviewedByPerson: "Pessoa/Id" },
    { reviewedAt: "Data", reviewedByPerson: "Data" },
  ])("rejeita nomes de pessoa inconsistentes: %j", items => {
    expect(() => readSharePointServerConfig(env(items))).toThrow(DataSourceConfigurationError);
  });
});
