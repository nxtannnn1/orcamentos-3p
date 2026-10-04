import type {
  SharePointFieldMap,
  SharePointRepositoryConfig,
} from "../sharepoint/sharepoint-types";

export type DataSource = "mock" | "sharepoint";

export class DataSourceConfigurationError extends Error {
  readonly code = "DATA_SOURCE_CONFIGURATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "DataSourceConfigurationError";
  }
}

export function resolveDataSource(value = process.env.DATA_SOURCE): DataSource {
  const normalized = value?.trim().toLowerCase() || "mock";
  if (normalized === "mock" || normalized === "sharepoint") return normalized;
  throw new DataSourceConfigurationError("DATA_SOURCE deve ser 'mock' ou 'sharepoint'.");
}

type Environment = Record<string, string | undefined>;

const required = (env: Environment, name: string) => {
  const value = env[name]?.trim();
  if (!value)
    throw new DataSourceConfigurationError(
      `Configuração server-side incompleta: variável ${name} ausente.`,
    );
  return value;
};

function parseFieldMap(raw: string): SharePointFieldMap {
  try {
    const parsed = JSON.parse(raw) as SharePointFieldMap;
    if (!parsed.budgets || !parsed.items || !parsed.materials) throw new Error();
    const auditFields = [
      parsed.items.reviewedByOid,
      parsed.items.reviewedAt,
      parsed.items.decisionId,
    ].filter((value) => value !== undefined);
    const protectedFields = Object.entries(parsed.items)
      .filter(([key]) => !["reviewedByOid", "reviewedAt", "decisionId"].includes(key))
      .map(([, value]) => value);
    if (
      auditFields.some(
        (value) =>
          typeof value !== "string" ||
          !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value) ||
          [
            ...protectedFields,
            "Material_AprovadoLookupId",
            "Status_Revisao",
            "Observacao_Item",
            "__proto__",
            "constructor",
            "prototype",
          ].includes(value),
      ) ||
      new Set(auditFields).size !== auditFields.length
    )
      throw new Error();
    return parsed;
  } catch {
    throw new DataSourceConfigurationError(
      "Configuração server-side incompleta: SHAREPOINT_FIELD_MAP_JSON inválido.",
    );
  }
}

export interface GraphServerConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function readSharePointServerConfig(env: Environment = process.env): {
  graph: GraphServerConfig;
  repository: SharePointRepositoryConfig;
} {
  return {
    graph: {
      tenantId: required(env, "MICROSOFT_TENANT_ID"),
      clientId: required(env, "MICROSOFT_CLIENT_ID"),
      clientSecret: required(env, "MICROSOFT_CLIENT_SECRET"),
    },
    repository: {
      siteId: required(env, "SHAREPOINT_SITE_ID"),
      budgetsListId: required(env, "SHAREPOINT_ORCAMENTOS_LIST_ID"),
      itemsListId: required(env, "SHAREPOINT_ITENS_IMPORTADOS_LIST_ID"),
      materialsListId: required(env, "SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID"),
      fields: parseFieldMap(required(env, "SHAREPOINT_FIELD_MAP_JSON")),
    },
  };
}
