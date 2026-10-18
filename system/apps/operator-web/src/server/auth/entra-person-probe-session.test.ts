import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("REDIRECT_TO_LOGIN"); } }));
vi.mock("../sharepoint/graph-read-transport", () => ({ GraphClientCredentialsReadTransport: class {
  get<T>(path: string): Promise<T> { return state.get(path); }
} }));
import { authConfig, type SessionUser } from "./configuration";
import { seal, requirePageSession } from "./session";
import { revokeSession } from "../security/session-registry";
import { unseal } from "./session";
const tenant = "11111111-1111-1111-1111-111111111111", oid = "22222222-2222-2222-2222-222222222222";
const site = "example.sharepoint.com,33333333-3333-3333-3333-333333333333,44444444-4444-4444-4444-444444444444";
const user: SessionUser = { oid, tenantId: tenant, name: "Fictitious session", authMode: "entra", roles: ["Consulta"], mfaContext: "c1" };
beforeEach(() => {
  const env = { NODE_ENV: "development", ENTRA_PERSON_READONLY_PROBE: "true", AUTH_APP_ORIGIN: "http://127.0.0.1:13300",
    AUTH_DISABLED: "false", ALLOW_LOCAL_SHAREPOINT_BYPASS: "false", ALLOW_LOCAL_OPERATOR_API_BYPASS: "false", AUTH_CORPORATE_LOGIN_ENABLED: "false", KEYCLOAK_ENABLED: "false", DATA_SOURCE: "sharepoint",
    ENTRA_LOGIN_TENANT_ID: tenant, ENTRA_LOGIN_CLIENT_ID: oid, ENTRA_LOGIN_CLIENT_SECRET: "synthetic", ENTRA_MFA_AUTH_CONTEXT_ID: "c1",
    AUTH_SESSION_SECRET: "synthetic-session-key-only-over-32-chars", SECURITY_REDIS_REST_URL: "", SECURITY_REDIS_REST_TOKEN: "",
    MICROSOFT_TENANT_ID: tenant, MICROSOFT_CLIENT_ID: oid, MICROSOFT_CLIENT_SECRET: "synthetic", SHAREPOINT_SITE_ID: site,
    SHAREPOINT_ORCAMENTOS_LIST_ID: oid, SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: oid, SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: oid, SHAREPOINT_FIELD_MAP_JSON: JSON.stringify({ budgets: {}, items: {}, materials: {} }) };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  state.cookie = undefined;
  state.get.mockImplementation(async (path: string) => path.includes("/permissions") ? { value: [{ grantedToV2: { user: { id: oid }, siteUser: { id: "7" } } }] } : { id: site });
});
afterEach(() => { state.get.mockReset(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("guard real da página antes do probe interno", () => {
  it("valida JWE e registro ativo antes de resolver a Pessoa", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    state.cookie = await seal(user, "session", Math.floor(Date.now() / 1000) + 60, authConfig());
    expect((await requirePageSession()).oid).toBe(oid);
    expect(state.get).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith("operator-web.entra-person-probe", expect.objectContaining({ status: "VERIFIED", readOnly: true }));
  });
  it.each(["absent", "expired", "revoked"])("não consulta Graph com sessão %s", async kind => {
    if (kind !== "absent") state.cookie = await seal(user, "session", Math.floor(Date.now() / 1000) + (kind === "expired" ? -60 : 60), authConfig());
    if (kind === "revoked") await revokeSession((await unseal(state.cookie!, "session", authConfig())).sid, authConfig());
    await expect(requirePageSession()).rejects.toThrow("REDIRECT_TO_LOGIN");
    expect(state.get).not.toHaveBeenCalled();
  });
});
