import { describe, expect, it, vi } from "vitest";
import { runPreflight, compareColumns } from "./sharepoint-preflight.mjs";

const env = {
  MICROSOFT_TENANT_ID: "synthetic-tenant", MICROSOFT_CLIENT_ID: "synthetic-client", MICROSOFT_CLIENT_SECRET: "synthetic-secret-not-printed",
  SHAREPOINT_SITE_ID: "synthetic-site", SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: "synthetic-items",
};
describe("preflight sem escrita de recursos", () => {
  it("sem --live verifica somente configuração e não usa credenciais", async () => {
    const fetcher = vi.fn();
    const report = await runPreflight(env, { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(report.login.missing).toContain("ENTRA_LOGIN_CLIENT_ID");
    expect(report.personResolution).toContain("BLOCKED");
    expect(JSON.stringify(report)).not.toContain(env.MICROSOFT_CLIENT_SECRET);
  });
  it("nao tenta obter token com configuração incompleta", async () => {
    const fetcher = vi.fn();
    await runPreflight({}, { live: true, fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("faz apenas OAuth POST e GET, reporta permissao ampla e nao imprime token", async () => {
    const token = `header.${Buffer.from(JSON.stringify({ roles: ["Sites.ReadWrite.All", "Lists.SelectedOperations.Selected"] })).toString("base64url")}.signature`;
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      if (String(url).startsWith("https://login.microsoftonline.com/")) {
        expect(options?.method).toBe("POST");
        return Response.json({ access_token: token });
      }
      expect(options?.method).toBe("GET");
      expect(String(url)).toMatch(/^https:\/\/graph.microsoft.com\/v1.0\/sites\//);
      if (String(url).endsWith("/permissions")) return Response.json({ value: [{ roles: ["write"], grantedToV2: { application: { id: env.MICROSOFT_CLIENT_ID } } }] });
      return Response.json({ value: [] });
    });
    const report = await runPreflight(env, { live: true, fetcher });
    expect(report.writePolicy).toBe("BLOCKED_GRAPH_PERMISSION_TOO_BROAD");
    expect(report.listWriteGrant).toBe("WRITE_GRANT_PRESENT_NOT_EXERCISED");
    expect(report.lists.history.status).toBe("LIST_ID_NOT_CONFIGURED");
    expect(JSON.stringify(report)).not.toContain(token);
    expect(JSON.stringify(report)).not.toContain(env.MICROSOFT_CLIENT_SECRET);
  });
  it("rejeita paginação externa antes de transmitir bearer", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("login.microsoftonline.com")) return Response.json({ access_token: "opaque" });
      if (String(url).endsWith("/permissions")) return Response.json({}, { status: 403 });
      return Response.json({ value: [], "@odata.nextLink": "https://attacker.example/v1.0/sites/synthetic-site/lists/synthetic-items/columns" });
    });
    const report = await runPreflight(env, { live: true, fetcher });
    expect(report.lists.items.status).toBe("READ_FAILED_OR_UNSAFE_PAGINATION");
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("attacker.example"))).toBe(false);
  });
  it("valida tipos, lookup, escolhas, Pessoa unica e unicidade do historico", () => {
    expect(compareColumns([{ name: "Pessoa", personOrGroup: { allowMultipleSelection: true, chooseFromType: "peopleOnly" } }], [{ name: "Pessoa", personOrGroup: {} }], {})[0].status).toBe("incompatible");
    expect(compareColumns([{ name: "Material", lookup: { listId: "other", allowMultipleValues: false } }], [{ name: "Material", lookup: { listId: "REPLACE_MATERIALS_LIST_ID" } }], { materials: "expected" })[0].status).toBe("incompatible");
    expect(compareColumns([{ name: "Codigo", text: {} }], [{ name: "Codigo", text: {}, enforceUniqueValues: true }], {})[0].status).toBe("incompatible");
    expect(compareColumns([{ name: "Status", choice: { choices: ["PENDENTE"] } }], [{ name: "Status", choice: { choices: ["APROVADO"] } }], {})[0].missingChoices).toEqual(["APROVADO"]);
  });
  it("descobre somente metadados do historico com nome exato, sem persistir o ID", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("login.microsoftonline.com")) return Response.json({ access_token: "opaque" });
      if (String(url).includes("?$select=id,displayName")) return Response.json({ value: [{ id: "synthetic-history", displayName: "Historico_Precos" }] });
      return Response.json({ value: [] });
    });
    const report = await runPreflight(env, { live: true, discoverHistory: true, fetcher });
    expect(report.historyDiscovery).toBe("EXACT_NAME_MATCH_METADATA_ONLY");
    expect(report.lists.history.status).toBe("READ_OK");
    expect(JSON.stringify(report)).not.toContain("synthetic-history");
  });
  it("nao escolhe arbitrariamente entre listas de historico ambiguas", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes("login.microsoftonline.com")) return Response.json({ access_token: "opaque" });
      if (String(url).includes("?$select=id,displayName")) return Response.json({ value: [{ id: "a", displayName: "Historico_Precos" }, { id: "b", displayName: "Historico_Precos" }] });
      return Response.json({ value: [] });
    });
    const report = await runPreflight(env, { live: true, discoverHistory: true, fetcher });
    expect(report.historyDiscovery).toBe("ABSENT_OR_AMBIGUOUS");
    expect(report.lists.history.status).toBe("LIST_ID_NOT_CONFIGURED");
  });
});
