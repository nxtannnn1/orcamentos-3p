import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { exportJWK, generateKeyPair, SignJWT, type JSONWebKeySet } from "jose";
vi.mock("server-only", () => ({}));
const fixture = vi.hoisted(() => ({
  cookies: new Map<string, string>(), jwks: { keys: [] } as JSONWebKeySet,
  client: undefined as unknown as ConfidentialClientApplication,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => fixture.cookies.has(name) ? { value: fixture.cookies.get(name) } : undefined,
}) }));
vi.mock("jose", async original => {
  const actual = await original<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: () => actual.createLocalJWKSet(fixture.jwks) };
});
vi.mock("./microsoft", async original => ({
  ...await original<typeof import("./microsoft")>(), createMicrosoftClient: () => fixture.client,
}));
import { authConfig } from "./configuration";
import { getSession, seal, unseal } from "./session";
import { GET as login } from "../../app/api/auth/login/route";
import { GET as callback } from "../../app/api/auth/callback/route";
const env = {
  NODE_ENV: "development", AUTH_APP_ORIGIN: "http://localhost:13300", AUTH_DISABLED: "false",
  KEYCLOAK_ENABLED: "false", AUTH_CORPORATE_LOGIN_ENABLED: "false",
  ALLOW_LOCAL_OPERATOR_API_BYPASS: "false", ALLOW_LOCAL_SHAREPOINT_BYPASS: "false",
  ENTRA_LOGIN_TENANT_ID: "11111111-1111-1111-1111-111111111111",
  ENTRA_LOGIN_CLIENT_ID: "22222222-2222-2222-2222-222222222222",
  ENTRA_LOGIN_CLIENT_SECRET: "synthetic-only", AUTH_SESSION_SECRET: "synthetic-session-secret-longer-than-32-characters",
  ENTRA_MFA_AUTH_CONTEXT_ID: "c1", SECURITY_REDIS_REST_URL: "", SECURITY_REDIS_REST_TOKEN: "",
};
const config = authConfig(env);
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let claims: Record<string, unknown>;
let providerError: string | undefined;
let postCount: number;
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  fixture.jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: "fixture", alg: "RS256" }] };
});
beforeEach(() => {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  fixture.cookies.clear(); claims = {}; providerError = undefined; postCount = 0;
  vi.spyOn(console, "info").mockImplementation(() => {});
  fixture.client = new ConfidentialClientApplication({
    auth: { clientId: config.clientId, clientSecret: config.clientSecret, authority: config.authority },
    system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} }, networkClient: {
      async sendGetRequestAsync<T>(url: string) {
        const body = url.includes("/discovery/instance")
          ? { tenant_discovery_endpoint: `${config.authority}/v2.0/.well-known/openid-configuration`, metadata: [{
              preferred_network: "login.microsoftonline.com", preferred_cache: "login.windows.net",
              aliases: ["login.microsoftonline.com", "login.windows.net"],
            }] }
          : { authorization_endpoint: `${config.authority}/oauth2/v2.0/authorize`,
              token_endpoint: `${config.authority}/oauth2/v2.0/token`,
              end_session_endpoint: `${config.authority}/oauth2/v2.0/logout`,
              issuer: config.issuer, jwks_uri: `${config.authority}/discovery/v2.0/keys` };
        return { headers: {}, status: 200, body: body as T };
      },
      async sendPostRequestAsync<T>() {
        postCount++;
        if (providerError) return { headers: {}, status: 400, body: {
          error: providerError, error_description: "private-provider-fixture-detail",
        } as T };
        const idToken = await new SignJWT({ tid: config.tenantId, oid: "33333333-3333-3333-3333-333333333333",
          nonce: "fixture-nonce", acct: 0, roles: ["Consulta"], acrs: ["c1"], ...claims,
        }).setProtectedHeader({ alg: "RS256", kid: "fixture" }).setIssuer(config.issuer)
          .setAudience(config.clientId).setSubject("fixture-subject").setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
        return { headers: {}, status: 200, body: { token_type: "Bearer", scope: "openid profile email",
          expires_in: 300, access_token: "synthetic-access-token", id_token: idToken,
          client_info: Buffer.from(JSON.stringify({ uid: "fixture-user", utid: config.tenantId })).toString("base64url"),
        } as T };
      },
    } },
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function transaction() {
  fixture.cookies.set("3p-login", await seal({ state: "fixture-state", nonce: "fixture-nonce", verifier: "fixture-verifier" },
    "login", Math.floor(Date.now() / 1000) + 600, config));
}
const request = () => new Request(`${config.redirectUri}?state=fixture-state&code=synthetic-code`);

describe("MSAL real, transporte simulado, JWT assinado e sessão local", () => {
  it("reproduz nonce_mismatch do SDK anterior à correção, sem rede real", async () => {
    await expect(fixture.client.acquireTokenByCode({ code: "synthetic-code", scopes: ["openid", "profile", "email"],
      redirectUri: config.redirectUri, codeVerifier: "fixture-verifier",
    })).rejects.toMatchObject({ errorCode: "nonce_mismatch" });
  });
  it("cria cookie em localhost com PKCE S256 e recupera a transação", async () => {
    const response = await login(new Request(`${config.origin}/api/auth/login`));
    const url = new URL(response.headers.get("location")!);
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("response_mode")).toBe("query");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const cookie = response.cookies.get("3p-login")!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
    expect(cookie.domain).toBeUndefined();
    const pending = await unseal(cookie.value, "login", config);
    expect(pending.state).toBe(url.searchParams.get("state"));
    expect(pending.nonce).toBe(url.searchParams.get("nonce"));
  });
  it("canonicaliza 127 antes de emitir cookie ou iniciar o SDK", async () => {
    const response = await login(new Request("http://127.0.0.1:13300/api/auth/login"));
    expect(response.headers.get("location")).toBe(`${config.origin}/api/auth/login`);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(postCount).toBe(0);
  });
  it("usa Host mesmo quando Next normaliza a URL interna para localhost", async () => {
    const response = await login(new Request(`${config.origin}/api/auth/login`, { headers: { Host: "127.0.0.1:13300" } }));
    expect(response.headers.get("location")).toBe(`${config.origin}/api/auth/login`);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("callback válido usa nonce no MSAL, valida assinatura e cria sessão ativa", async () => {
    await transaction();
    const response = await callback(request());
    expect(response.headers.get("location")).toBe(`${config.origin}/`);
    const cookie = response.cookies.get("3p-session")!;
    expect(cookie.value).toBeTruthy();
    fixture.cookies.delete("3p-login"); fixture.cookies.set("3p-session", cookie.value);
    expect(await getSession()).toMatchObject({ authMode: "entra", roles: ["Consulta"] });
    expect(response.cookies.get("3p-login")?.maxAge).toBe(0);
    expect(console.info).not.toHaveBeenCalled();
  });
  it.each([
    [{ nonce: "other" }, "LOGIN_FAILED", "code_exchange", "NONCE_MISMATCH"],
    [{ tid: "44444444-4444-4444-4444-444444444444" }, "ACCOUNT_NOT_ALLOWED", "token_validation", "ACCOUNT_NOT_ALLOWED"],
    [{ roles: [] }, "ROLE_REQUIRED", "token_validation", "ROLE_REQUIRED"],
    [{ acrs: [] }, "MFA_REQUIRED", "token_validation", "MFA_REQUIRED"],
    [{ acct: 1 }, "ACCOUNT_NOT_ALLOWED", "token_validation", "ACCOUNT_NOT_ALLOWED"],
  ])("recusa token/identidade não autorizada %j", async (changes, code, stage, reason) => {
    claims = changes; await transaction();
    const response = await callback(request());
    expect(response.headers.get("location")).toBe(`${config.origin}/login?error=${code}`);
    expect(response.cookies.get("3p-session")?.maxAge).toBe(0);
    expect(console.info).toHaveBeenCalledWith("operator-web.microsoft-login", { stage, reason });
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("fixture-nonce");
  });
  it("categoriza credencial inválida sem expor mensagem do SDK", async () => {
    providerError = "invalid_client"; await transaction();
    const response = await callback(request());
    expect(response.headers.get("location")).toBe(`${config.origin}/login?error=LOGIN_FAILED`);
    expect(console.info).toHaveBeenCalledWith("operator-web.microsoft-login", { stage: "code_exchange", reason: "INVALID_CLIENT" });
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("private-provider");
  });
});
