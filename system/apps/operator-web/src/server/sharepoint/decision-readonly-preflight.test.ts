import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkDecisionReadOnlyPreflight } from "./decision-readonly-preflight";
import { validateDecisionSchema } from "./decision-schema";
import { decisionColumns } from "./__test-support__/decision";
import { correctionConfig } from "./__test-support__/correction";

function fixture() {
  const config = structuredClone(correctionConfig);
  const metadata = decisionColumns(config.fields, config.materialsListId);
  const get = vi.fn<(path: string) => Promise<unknown>>(async () => metadata);
  const write = vi.fn(() => { throw new Error("Write forbidden in preflight"); });
  const graph = { get: async <T>(path: string) => await get(path) as T, patch: write, post: write, delete: write };
  return { config, metadata, get, graph, write };
}

describe("pré-check de decisão somente de leitura", () => {
  it("verifica o schema real do código sem autorizar escrita ou declarar Redis homologado", async () => {
    const f = fixture();
    const result = await checkDecisionReadOnlyPreflight(f.graph, f.config, {
      SECURITY_REDIS_REST_URL: "https://synthetic.invalid", SECURITY_REDIS_REST_TOKEN: "private-token",
    });
    expect(result).toEqual({ schema: "VERIFIED", auditConfiguration: "PRESENT_NOT_VERIFIED", readOnly: true, writeAuthorized: false });
    expect(Object.isFrozen(result)).toBe(true);
    expect(f.get).toHaveBeenCalledExactlyOnceWith("/sites/site/lists/items/columns");
    expect(f.write).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it.each([{}, { SECURITY_REDIS_REST_URL: "https://synthetic.invalid" },
    { SECURITY_REDIS_REST_URL: " ", SECURITY_REDIS_REST_TOKEN: "private" }])("registra auditoria ausente sem contatar Redis: %j", async env => {
    const f = fixture();
    expect(await checkDecisionReadOnlyPreflight(f.graph, f.config, env)).toMatchObject({ auditConfiguration: "MISSING", writeAuthorized: false });
    expect(f.write).not.toHaveBeenCalled();
  });

  it("distingue schema incompatível de falha de leitura sem expor detalhes", async () => {
    const f = fixture();
    f.metadata.value.splice(0, 1);
    expect(await checkDecisionReadOnlyPreflight(f.graph, f.config, {})).toMatchObject({ schema: "AUDIT_NOT_CONFIGURED" });
    f.get.mockRejectedValue(new Error("private upstream response"));
    const result = await checkDecisionReadOnlyPreflight(f.graph, f.config, {});
    expect(result).toMatchObject({ schema: "UNAVAILABLE", writeAuthorized: false });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(f.write).not.toHaveBeenCalled();
  });
});

describe("schema de decisão restrito à lista configurada", () => {
  it("aceita paginação da mesma lista e valida todas as páginas", async () => {
    const f = fixture();
    f.get.mockResolvedValueOnce({ value: f.metadata.value.slice(0, 3),
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/sites/site/lists/items/columns?$skiptoken=next" })
      .mockResolvedValueOnce({ value: f.metadata.value.slice(3) });
    await expect(validateDecisionSchema(f.graph, f.config)).resolves.toBeUndefined();
    expect(f.get).toHaveBeenCalledTimes(2);
  });

  it.each([
    "https://foreign.invalid/v1.0/sites/site/lists/items/columns",
    "https://graph.microsoft.com/v1.0/sites/site/lists/other/columns",
    "https://graph.microsoft.com/beta/sites/site/lists/items/columns",
    "https://graph.microsoft.com/v1.0/sites/site/lists/items/columns#fragment",
    "https://user:password@graph.microsoft.com/v1.0/sites/site/lists/items/columns",
    "https://graph.microsoft.com/v1.0/sites/site/lists/items/columns",
    "/sites/site/lists/items/columns?$skiptoken=next", "", null, 7,
  ])("recusa continuação inválida antes de consultar outro destino: %s", async next => {
    const f = fixture();
    f.get.mockResolvedValueOnce({ value: f.metadata.value, "@odata.nextLink": next });
    await expect(validateDecisionSchema(f.graph, f.config)).rejects.toMatchObject({ code: "AUDIT_NOT_CONFIGURED" });
    expect(f.get).toHaveBeenCalledTimes(1);
    expect(f.write).not.toHaveBeenCalled();
  });

  it.each([null, {}, { value: null }, { value: [null] }, { value: [{ name: "Oid", text: "text" }] },
    { value: [{ name: "Status", choice: { choices: "APROVADO REJEITADO" } }] },
    { value: [{ name: "Oid", readOnly: "false", text: {} }] }])("falha fechada em metadados malformados: %j", async response => {
    const f = fixture();
    f.get.mockResolvedValue(response);
    await expect(validateDecisionSchema(f.graph, f.config)).rejects.toMatchObject({ code: "AUDIT_NOT_CONFIGURED" });
  });

  it("não aceita schema parcial se a página seguinte falhar", async () => {
    const f = fixture();
    f.get.mockResolvedValueOnce({ value: f.metadata.value,
      "@odata.nextLink": "https://graph.microsoft.com/v1.0/sites/site/lists/items/columns?$skiptoken=next" })
      .mockRejectedValueOnce(new Error("Unavailable"));
    expect(await checkDecisionReadOnlyPreflight(f.graph, f.config, {})).toMatchObject({ schema: "UNAVAILABLE", writeAuthorized: false });
    expect(f.write).not.toHaveBeenCalled();
  });
});
