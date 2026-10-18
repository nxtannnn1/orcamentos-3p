import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { SessionUser } from "../auth/configuration";
import { probeEntraPersonReadOnly } from "./entra-person-readonly-probe";
import { GraphClientCredentialsReadTransport } from "./graph-read-transport";
import { decisionColumns } from "./__test-support__/decision";
import { correctionConfig } from "./__test-support__/correction";
const tenant = "11111111-1111-1111-1111-111111111111";
const oid = "22222222-2222-2222-2222-222222222222";
const site = "example.sharepoint.com,33333333-3333-3333-3333-333333333333,44444444-4444-4444-4444-444444444444";
const env = { ENTRA_PERSON_READONLY_PROBE: "true", NODE_ENV: "development", AUTH_APP_ORIGIN: "http://127.0.0.1:13300",
  AUTH_DISABLED: "false", DATA_SOURCE: "sharepoint", MICROSOFT_TENANT_ID: tenant, MICROSOFT_CLIENT_ID: oid,
  MICROSOFT_CLIENT_SECRET: "synthetic-secret-never-log", SHAREPOINT_SITE_ID: site,
  SHAREPOINT_ORCAMENTOS_LIST_ID: oid, SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: oid,
  SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: oid, SHAREPOINT_FIELD_MAP_JSON: JSON.stringify({ budgets: {}, items: {}, materials: {} }) };
const user: SessionUser = { authMode: "entra", oid, tenantId: tenant, name: "Fictitious name never log", roles: ["Consulta"], mfaContext: "c1" };
const identity = { user: { id: oid }, siteUser: { id: "7" } };
function fixture(identities = [identity]) {
  const get = vi.fn(async (path: string): Promise<unknown> => path.includes("/permissions") ? { value: [{ grantedToIdentitiesV2: identities }] } : { id: site });
  const write = vi.fn();
  const transport = vi.fn(() => ({ get: async <T>(path: string) => await get(path) as T, patch: write, post: write, delete: write }));
  const log = vi.fn();
  return { get, write, transport, log };
}
afterEach(() => vi.restoreAllMocks());
describe("instrumento interno de identidade, somente leitura", () => {
  it("usa identidade de sessão e configuração do servidor sem logar identificadores", async () => {
    const f = fixture();
    expect(await probeEntraPersonReadOnly(user, env, f)).toBe("VERIFIED");
    expect(f.get).toHaveBeenCalledTimes(2);
    expect(f.write).not.toHaveBeenCalled();
    expect(f.log).toHaveBeenCalledWith("operator-web.entra-person-probe", expect.objectContaining({ probeId: expect.any(String), status: "VERIFIED", readOnly: true,
      diagnostics: expect.objectContaining({ siteQueryCompleted: true, siteVerified: true, permissionsPagesRequested: 1,
        permissionsPagesCompleted: 1, permissionRecordsAnalyzed: 1, actorUserMatches: 1,
        actorMatchesWithValidSiteUserId: 1, uniqueCandidates: 1, scanCompleted: true, failureKind: null }) }));
    const logs = JSON.stringify(f.log.mock.calls);
    for (const privateValue of [oid, tenant, site, user.name, env.MICROSOFT_CLIENT_SECRET]) expect(logs).not.toContain(privateValue);
  });
  it("é inerte por padrão", async () => {
    const f = fixture();
    expect(await probeEntraPersonReadOnly(user, { ...env, ENTRA_PERSON_READONLY_PROBE: "false" }, f)).toBe("DISABLED");
    expect(f.transport).not.toHaveBeenCalled(); expect(f.log).not.toHaveBeenCalled();
  });
  it("pré-check opt-in distingue schema de Pessoa ausente e mantém escrita bloqueada", async () => {
    const f = fixture([]);
    expect(await probeEntraPersonReadOnly(user, { ...env, ENTRA_DECISION_READONLY_PREFLIGHT: "true" }, f)).toBe("PERSON_NOT_FOUND");
    // Missing audit mappings fail before GET columns; identity still gets checked.
    expect(f.get).toHaveBeenCalledTimes(2);
    expect(f.log).toHaveBeenCalledWith("operator-web.entra-person-probe", expect.objectContaining({
      status: "PERSON_NOT_FOUND", decisionPreflight: {
        schema: "AUDIT_NOT_CONFIGURED", auditConfiguration: "MISSING", readOnly: true, writeAuthorized: false,
      },
    }));
    expect(f.write).not.toHaveBeenCalled();
  });
  it("pré-check não contorna os guards nem executa sem o probe de identidade", async () => {
    const f = fixture();
    expect(await probeEntraPersonReadOnly(user, { ...env, ENTRA_PERSON_READONLY_PROBE: "false", ENTRA_DECISION_READONLY_PREFLIGHT: "true" }, f)).toBe("DISABLED");
    expect(f.transport).not.toHaveBeenCalled();
    expect(await probeEntraPersonReadOnly(user, { ...env, NODE_ENV: "production", ENTRA_DECISION_READONLY_PREFLIGHT: "true" }, f)).toBe("PROBE_NOT_LOCAL");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("schema válido não esconde Pessoa ausente e não dispara escrita", async () => {
    const f = fixture([]);
    const original = f.get.getMockImplementation()!;
    f.get.mockImplementation(path => path.endsWith("/columns")
      ? Promise.resolve(decisionColumns(correctionConfig.fields, oid)) : original(path));
    const probeEnv = { ...env, ENTRA_DECISION_READONLY_PREFLIGHT: "true",
      SHAREPOINT_FIELD_MAP_JSON: JSON.stringify(correctionConfig.fields) };
    expect(await probeEntraPersonReadOnly(user, probeEnv, f)).toBe("PERSON_NOT_FOUND");
    expect(f.get).toHaveBeenCalledTimes(3);
    expect(f.log).toHaveBeenCalledWith("operator-web.entra-person-probe", expect.objectContaining({
      status: "PERSON_NOT_FOUND", decisionPreflight: expect.objectContaining({ schema: "VERIFIED", writeAuthorized: false }),
    }));
    expect(f.write).not.toHaveBeenCalled();
  });
  it.each([null, { ...user, authMode: "keycloak" as const }, { ...user, authMode: "local-sharepoint-bypass" as const }])("não usa identidade ausente ou de outro provedor", async account => {
    const f = fixture();
    expect(await probeEntraPersonReadOnly(account, env, f)).toBe("ENTRA_SESSION_REQUIRED");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it.each([{ AUTH_DISABLED: "true" }, { ALLOW_LOCAL_SHAREPOINT_BYPASS: "true" }, { ALLOW_LOCAL_OPERATOR_API_BYPASS: "true" }])("não executa em bypass: %j", async override => {
    const f = fixture();
    expect(await probeEntraPersonReadOnly(user, { ...env, ...override }, f)).toBe("PROBE_AUTH_CONFIGURATION_REQUIRED");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it.each([{ NODE_ENV: "production" }, { AUTH_APP_ORIGIN: "http://public.example" }, { AUTH_APP_ORIGIN: "https://portal.example" }])("recusa fora do laboratório local: %j", async override => {
    const f = fixture();
    expect(await probeEntraPersonReadOnly(user, { ...env, ...override }, f)).toBe("PROBE_NOT_LOCAL");
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("não converte acesso por grupo/herança sem par em associação", async () => {
    const f = fixture([]);
    f.get.mockImplementation(async path => path.includes("/permissions") ? { value: [{ grantedToV2: { group: { id: oid }, siteGroup: { id: "7" } } }] } : { id: site });
    expect(await probeEntraPersonReadOnly(user, env, f)).toBe("PERSON_NOT_FOUND");
    expect(f.write).not.toHaveBeenCalled();
  });
  it("recusa ambiguidade", async () => {
    const f = fixture([identity, { user: { id: oid }, siteUser: { id: "8" } }]);
    expect(await probeEntraPersonReadOnly(user, env, f)).toBe("PERSON_AMBIGUOUS");
  });
  it.each(["403 accessDenied private", "network private"])("não expõe falhas da fonte: %s", async message => {
    const f = fixture(); f.get.mockRejectedValue(new Error(message));
    expect(await probeEntraPersonReadOnly(user, env, f)).toBe("PERSON_RESOLUTION_UNAVAILABLE");
    expect(JSON.stringify(f.log.mock.calls)).not.toContain(message); expect(f.write).not.toHaveBeenCalled();
  });
  it("não procura em outro site e recusa metadados divergentes", async () => {
    const f = fixture(); f.get.mockResolvedValue({ id: "different-site" });
    expect(await probeEntraPersonReadOnly(user, env, f)).toBe("PERSON_IDENTITY_MISMATCH");
  });
  it.each([200, 403])("integra transporte e resumo do probe com permissões HTTP %s", async status => {
    const log = vi.fn();
    const transportLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = String(input);
      if (url.includes("login.microsoftonline.com")) return Response.json({ access_token: "private-token", expires_in: 300 });
      if (!url.includes("/permissions")) return Response.json({ id: site });
      return status === 200 ? Response.json({ value: [{ grantedToV2: { application: { id: oid } } }] })
        : Response.json({ error: { code: "accessDenied", message: `private ${oid}` } }, { status });
    });
    const result = await probeEntraPersonReadOnly(user, env, { transport: config => new GraphClientCredentialsReadTransport(config, fetcher), log });
    expect(result).toBe(status === 200 ? "PERSON_NOT_FOUND" : "PERSON_RESOLUTION_UNAVAILABLE");
    expect(log).toHaveBeenCalledExactlyOnceWith("operator-web.entra-person-probe", expect.objectContaining({
      status: result, diagnostics: expect.objectContaining({ siteQueryCompleted: true, siteVerified: true,
        permissionsPagesRequested: 1, permissionsPagesCompleted: status === 200 ? 1 : 0,
        permissionRecordsAnalyzed: status === 200 ? 1 : 0, actorUserMatches: 0, actorMatchesWithValidSiteUserId: 0,
        scanCompleted: status === 200, failureKind: status === 200 ? null : "HTTP", httpStatus: status === 200 ? null : 403 }),
    }));
    const output = JSON.stringify([log.mock.calls, transportLog.mock.calls]);
    for (const value of [oid, tenant, site, "private-token", env.MICROSOFT_CLIENT_SECRET, "https://"]) expect(output).not.toContain(value);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "GET"]);
  });
});
