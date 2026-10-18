import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
vi.mock("server-only", () => ({}));
const browser = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => { const value = browser.cookies.get(name); return value ? { value } : undefined; },
}) }));
import { keycloakConfig, keycloakClaimsToUser, keycloakIdentity } from "./keycloak";
import { parseKeycloakSession } from "./keycloak-session";
import { authConfig, canReview, canReviewSource } from "./configuration";
import { cookieNames, cookieOptions, getSession, seal, unseal, requireSession, revokeCookieSession } from "./session";
import { revokeUserSessions, securityNamespace } from "../security/session-registry";
import { GET as login } from "../../app/api/auth/keycloak/login/route";
import { GET as callback } from "../../app/api/auth/keycloak/callback/route";
import { POST as logout } from "../../app/api/auth/keycloak/logout/route";
import { GET as budgets } from "../../app/api/orcamentos/route";
import { PATCH as decide } from "../../app/api/itens/[id]/decisao/route";
import { PATCH as correct } from "../../app/api/itens/[id]/correcao/route";
import { createMockOperatorRepository } from "../../mocks/mock-operator-repository";

let server: Server;
let issuer: string;
let signing: Awaited<ReturnType<typeof generateKeyPair>>;
let otherSigning: Awaited<ReturnType<typeof generateKeyPair>>;
let expectedNonce = "";
let verifier = "";
let requests = 0;
let variant = "valid";
let roleNames = ["Consulta"];
let brokerSource: unknown;
const clientId = "3p-operator-web";
const origin = "http://127.0.0.1:13300";
const now = () => Math.floor(Date.now() / 1000);
function claims() {
  return { iss: issuer, sub: "Employee-A", aud: clientId, iat: now(), exp: now() + 600,
    nonce: expectedNonce, name: "Pessoa Fictícia", resource_access: { [clientId]: { roles: roleNames } },
    ...(brokerSource === undefined ? {} : { identity_provider: brokerSource }) };
}
beforeAll(async () => {
  signing = await generateKeyPair("RS256", { extractable: true });
  otherSigning = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...await exportJWK(signing.publicKey), kid: "test-key", alg: "RS256", use: "sig" };
  server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/realms/portal/.well-known/openid-configuration") {
      res.end(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`, end_session_endpoint: `${issuer}/logout`,
        response_types_supported: ["code"], subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"], authorization_response_iss_parameter_supported: true }));
    } else if (req.url === "/realms/portal/jwks") res.end(JSON.stringify({ keys: [jwk] }));
    else if (req.url === "/realms/portal/token") {
      requests++;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const form = new URLSearchParams(Buffer.concat(chunks).toString());
      if (form.get("grant_type") !== "authorization_code" || form.get("code_verifier") !== verifier ||
          form.get("client_id") !== clientId || form.get("client_secret") !== "local-test-client-secret") {
        res.statusCode = 400; res.end(JSON.stringify({ error: "invalid_grant" })); return;
      }
      const payload = { ...claims(),
        ...(variant === "nonce" ? { nonce: "wrong" } : {}),
        ...(variant === "issuer" ? { iss: "https://foreign.example/realm" } : {}),
        ...(variant === "audience" ? { aud: "other-client" } : {}),
        ...(variant === "expired" ? { exp: now() - 300 } : {}),
      };
      const token = await new SignJWT(payload).setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .sign(variant === "signature" ? otherSigning.privateKey : signing.privateKey);
      res.end(JSON.stringify({ access_token: "sensitive-access-token-not-for-cookie", token_type: "Bearer",
        expires_in: 600, id_token: token, refresh_token: "sensitive-refresh-token-not-for-cookie" }));
    } else { res.statusCode = 404; res.end("{}"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(server.address() as { port: number }).port}/realms/portal`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("KEYCLOAK_ENABLED", "true"); vi.stubEnv("KEYCLOAK_ISSUER", issuer);
  vi.stubEnv("KEYCLOAK_CLIENT_ID", clientId); vi.stubEnv("KEYCLOAK_CLIENT_SECRET", "local-test-client-secret");
  vi.stubEnv("AUTH_APP_ORIGIN", origin); vi.stubEnv("AUTH_SESSION_SECRET", "local-test-session-key-over-32-characters");
  vi.stubEnv("AUTH_DISABLED", "false"); vi.stubEnv("DATA_SOURCE", "mock");
  vi.stubEnv("AUTH_CORPORATE_LOGIN_ENABLED", "false"); vi.stubEnv("KEYCLOAK_CORPORATE_IDP_ALIAS", "");
  vi.stubEnv("ENTRA_LOGIN_TENANT_ID", "11111111-1111-1111-1111-111111111111");
  vi.stubEnv("ENTRA_LOGIN_CLIENT_ID", "22222222-2222-2222-2222-222222222222");
  vi.stubEnv("ENTRA_LOGIN_CLIENT_SECRET", "test-only"); vi.stubEnv("ENTRA_MFA_AUTH_CONTEXT_ID", "c1");
  browser.cookies.clear(); variant = "valid"; requests = 0; roleNames = ["Consulta"]; brokerSource = undefined;
});
afterEach(() => vi.unstubAllEnvs());
async function start() {
  const response = await login();
  expect(response.status).toBe(307);
  const url = new URL(response.headers.get("location")!);
  const config = keycloakConfig();
  const value = response.cookies.get(cookieNames(config).transaction)!.value;
  browser.cookies.set(cookieNames(config).transaction, value);
  const pending = await unseal(value, "login", config);
  expectedNonce = String(pending.nonce); verifier = String(pending.verifier);
  return { url, config, pending };
}
function callbackRequest(state: string, extra = "") {
  return new Request(`${origin}/api/auth/keycloak/callback?code=test-code&state=${state}&iss=${encodeURIComponent(issuer)}${extra}`);
}
async function authenticate() {
  const { pending, config } = await start();
  const response = await callback(callbackRequest(String(pending.state)));
  expect(response.headers.get("location")).toBe(origin + "/");
  const cookie = response.cookies.get(cookieNames(config).session)!.value;
  browser.cookies.set(cookieNames(config).session, cookie);
  return { response, cookie, config };
}
describe("Keycloak OIDC and shared session, real signatures and JWKS", () => {
  const corporate = () => {
    vi.stubEnv("AUTH_CORPORATE_LOGIN_ENABLED", "true"); vi.stubEnv("KEYCLOAK_CORPORATE_IDP_ALIAS", "oidc");
  };
  it("routes corporate entry to the fixed broker and binds policy to the pending transaction", async () => {
    corporate();
    const { url, pending } = await start();
    expect(url.searchParams.get("kc_idp_hint")).toBe("oidc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(pending.corporateLoginAlias).toBe("oidc");
  });
  it("issues a corporate-marked JWE only from validated broker provenance without changing identity aliases", async () => {
    corporate(); brokerSource = "oidc"; roleNames = ["Operador"];
    const { cookie, config } = await authenticate();
    expect(await unseal(cookie, "session", config)).toMatchObject({ identityProvider: "oidc", issuer, subject: "Employee-A", tenantId: issuer });
    expect(await getSession()).toMatchObject({ identityProvider: "oidc", authMode: "keycloak" });
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    await expect(requireSession(true)).rejects.toMatchObject({ status: 403 });
  });
  it.each([{ source: undefined }, { source: null }, { source: "local" }, { source: "OIDC" }])("refuses local/test or other IdP login in corporate mode: %j", async ({ source }) => {
    corporate(); brokerSource = source; roleNames = ["Operador"];
    const { pending } = await start();
    const result = await callback(callbackRequest(String(pending.state)));
    expect(result.headers.get("location")).toContain("CORPORATE_ACCOUNT_REQUIRED");
    expect(result.cookies.get("3p-session")).toBeUndefined();
  });
  it("does not authorize a corporate email without broker proof", () => {
    corporate();
    expect(() => keycloakClaimsToUser({ ...claims(), email: "employee@3p.example", email_verified: true }, keycloakConfig()))
      .toThrowError("CORPORATE_ACCOUNT_REQUIRED");
  });
  it("still requires an authorized client role after corporate provenance validation", async () => {
    corporate(); brokerSource = "oidc"; roleNames = [];
    const { pending } = await start();
    expect((await callback(callbackRequest(String(pending.state)))).headers.get("location")).toContain("ROLE_REQUIRED");
  });
  it.each(["nonce", "issuer", "audience", "expired", "signature"])("corporate source never bypasses OIDC validation: %s", async failure => {
    corporate(); brokerSource = "oidc";
    const { pending } = await start(); variant = failure;
    const result = await callback(callbackRequest(String(pending.state)));
    expect(result.headers.get("location")).toContain("LOGIN_FAILED");
    expect(result.cookies.get("3p-session")).toBeUndefined();
  });
  it.each(["enable", "disable", "change-alias"])("rejects policy changes during an in-flight login: %s", async change => {
    if (change !== "enable") corporate();
    const { pending } = await start();
    if (change === "enable") corporate();
    if (change === "disable") vi.stubEnv("AUTH_CORPORATE_LOGIN_ENABLED", "false");
    if (change === "change-alias") vi.stubEnv("KEYCLOAK_CORPORATE_IDP_ALIAS", "different-idp");
    expect((await callback(callbackRequest(String(pending.state)))).headers.get("location")).toContain("LOGIN_EXPIRED");
    expect(requests).toBe(0);
  });
  it("does not upgrade old native sessions; a new corporate login can revoke and replace them", async () => {
    const { cookie } = await authenticate();
    corporate(); expect(await getSession()).toBeNull();
    brokerSource = "oidc"; await authenticate();
    expect(await getSession()).toMatchObject({ identityProvider: "oidc" });
    vi.stubEnv("AUTH_CORPORATE_LOGIN_ENABLED", "false");
    browser.cookies.set("3p-session", cookie); expect(await getSession()).toBeNull();
  });
  it("preserves an existing Microsoft session and MFA contract in corporate UI mode", async () => {
    const config = authConfig();
    const legacy = { oid: "legacy-person", tenantId: config.tenantId, name: "Legacy", roles: ["Consulta"], mfaContext: "c1", authMode: "entra" };
    browser.cookies.set("3p-session", await seal(legacy, "session", now() + 600, config));
    corporate(); expect(await getSession()).toMatchObject(legacy);
    const { pending } = await start(); // No broker proof: must not erase Microsoft session.
    await callback(callbackRequest(String(pending.state)));
    expect(await getSession()).toMatchObject(legacy);
  });
  it("refuses local authentication bypasses in corporate mode", async () => {
    corporate(); vi.stubEnv("AUTH_DISABLED", "true"); vi.stubEnv("NODE_ENV", "development");
    await expect(getSession()).rejects.toMatchObject({ code: "CORPORATE_LOGIN_NOT_CONFIGURED" });
  });
  it("revokes both tabs locally before any Keycloak confirmation or federated logout", async () => {
    corporate(); brokerSource = "oidc";
    const { cookie } = await authenticate();
    expect((await budgets()).status).toBe(200);
    const result = await logout(new Request(origin + "/api/auth/keycloak/logout", {
      method: "POST", headers: { origin, accept: "application/json" },
    }));
    expect(result.status).toBe(200);
    const body = await result.json(); expect(body.logoutUrl).toContain(issuer + "/logout");
    // Simulated second tab retains the old cookie. Never navigate to logoutUrl.
    browser.cookies.set("3p-session", cookie);
    expect(await getSession()).toBeNull(); expect((await budgets()).status).toBe(401);
  });
  it("uses PKCE S256, state, nonce, discovery and safe cookies", async () => {
    const { url, pending, config } = await start();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("nonce")).toBe(pending.nonce);
    expect(url.searchParams.get("state")).toBe(pending.state);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(cookieOptions(config, 600)).toMatchObject({ httpOnly: true, sameSite: "lax", secure: false });
    expect(cookieOptions({ ...config, secure: true }, 600).secure).toBe(true);
  });
  it("creates a provider-bound session with issuer/subject and no provider tokens", async () => {
    const { cookie, config } = await authenticate();
    const payload = await unseal(cookie, "session", config);
    expect(payload).toMatchObject({ authMode: "keycloak", issuer, subject: "Employee-A", roles: ["Consulta"] });
    expect(payload).not.toHaveProperty("access_token"); expect(payload).not.toHaveProperty("id_token");
    expect(payload).not.toHaveProperty("refresh_token");
    expect(JSON.stringify(payload)).not.toContain("sensitive-");
    expect((await getSession())?.subject).toBe("Employee-A");
    await expect(unseal(cookie, "session", authConfig())).rejects.toThrow();
  });
  it("rejects missing transaction before token exchange", async () => {
    expect((await callback(callbackRequest("unknown"))).headers.get("location")).toContain("LOGIN_EXPIRED");
    expect(requests).toBe(0);
  });
  it("rejects incorrect state without consuming the token endpoint", async () => {
    await start();
    expect((await callback(callbackRequest("wrong"))).headers.get("location")).toContain("LOGIN_FAILED");
    expect(requests).toBe(0);
  });
  it.each(["nonce", "issuer", "audience", "expired", "signature"])("rejects %s via the actual OIDC library", async failure => {
    const { pending } = await start(); variant = failure;
    const result = await callback(callbackRequest(String(pending.state)));
    expect(result.headers.get("location")).toContain("LOGIN_FAILED");
    expect(result.cookies.get("3p-session")).toBeUndefined();
    expect(requests).toBe(1);
  });
  it.each(["missing-code", "denied", "origin", "expired-transaction", "microsoft-transaction"])("rejects invalid callback %s", async failure => {
    const { pending, config } = await start();
    const url = new URL(callbackRequest(String(pending.state)).url);
    if (failure === "missing-code") url.searchParams.delete("code");
    if (failure === "denied") url.searchParams.set("error", "access_denied");
    if (failure === "origin") url.hostname = "untrusted.example";
    if (failure === "expired-transaction") browser.cookies.set("3p-login", await seal(pending, "login", now() - 1, config));
    if (failure === "microsoft-transaction") browser.cookies.set("3p-login", await seal(pending, "login", now() + 600, authConfig()));
    const result = await callback(new Request(url));
    expect(result.headers.get("location")).toContain("/login?error=");
    expect(requests).toBe(0);
  });
  it("successful Microsoft session replacement revokes a Keycloak session", async () => {
    const { cookie } = await authenticate();
    await revokeCookieSession(authConfig());
    browser.cookies.set("3p-session", cookie);
    expect(await getSession()).toBeNull();
  });
  it("pins the configured callback behind a Next internal listener hostname", async () => {
    const { pending } = await start();
    const url = new URL(callbackRequest(String(pending.state)).url);
    url.hostname = "localhost";
    const response = await callback(new Request(url, { headers: { host: new URL(origin).host } }));
    expect(response.headers.get("location")).toBe(origin + "/");
  });
  it("does not trust a freely supplied forwarded host", async () => {
    const { pending } = await start();
    const url = new URL(callbackRequest(String(pending.state)).url); url.hostname = "foreign.example";
    const response = await callback(new Request(url, { headers: { "x-forwarded-host": new URL(origin).host } }));
    expect(response.headers.get("location")).toContain("LOGIN_FAILED"); expect(requests).toBe(0);
  });
  it("does not merge employees that reuse an email or username", () => {
    const config = keycloakConfig();
    const first = keycloakClaimsToUser({ ...claims(), email: "functional@example.invalid" }, config);
    const second = keycloakClaimsToUser({ ...claims(), sub: "new-person", email: "functional@example.invalid" }, config);
    expect(first.oid).not.toBe(second.oid); expect(first.subject).not.toBe(second.subject);
  });
  it("rejects response issuer mismatch before exchanging a code", async () => {
    const { pending } = await start();
    const req = callbackRequest(String(pending.state));
    const url = new URL(req.url); url.searchParams.set("iss", "https://foreign.example");
    const result = await callback(new Request(url));
    expect(result.headers.get("location")).toContain("LOGIN_FAILED"); expect(requests).toBe(0);
  });
  it("consumes a login transaction once", async () => {
    const { pending } = await start();
    const request = callbackRequest(String(pending.state));
    await callback(request);
    const replay = await callback(request);
    expect(replay.headers.get("location")).toContain("LOGIN_EXPIRED"); expect(requests).toBe(1);
  });
  it.each(["Operador", "Comprador", "Consulta"])("maps only the explicit portal role %s", async role => {
    roleNames = [role]; await authenticate();
    const user = (await getSession())!;
    expect(user.roles).toEqual([role]); expect(canReview(user)).toBe(role !== "Consulta");
    if (role === "Consulta") await expect(requireSession(true)).rejects.toMatchObject({ status: 403 });
    else await expect(requireSession(true)).resolves.toMatchObject({ roles: [role] });
  });
  it("denies realm-only, default, admin and other-client roles", async () => {
    const config = keycloakConfig();
    for (const raw of [[], ["admin", "default-roles-3p-poc", "operador"], ["__proto__", "constructor"]]) {
      expect(() => keycloakClaimsToUser({ ...claims(), realm_access: { roles: ["Operador"] },
        resource_access: { [clientId]: { roles: raw }, other: { roles: ["Operador"] } } }, config)).toThrowError("ROLE_REQUIRED");
    }
    roleNames = [];
    const { pending } = await start();
    const result = await callback(callbackRequest(String(pending.state)));
    expect(result.headers.get("location")).toContain("ROLE_REQUIRED");
  });
  it("rejects an expired session, changed subject and changed issuer", async () => {
    const { cookie, config } = await authenticate();
    const payload = await unseal(cookie, "session", config);
    for (const change of [{ subject: "employee-a" }, { issuer: "https://other.example" }, { authMode: "entra" }])
      expect(() => parseKeycloakSession({ ...payload, ...change }, config)).toThrow();
    browser.cookies.set("3p-session", await seal(payload, "session", now() - 1, config));
    expect(await getSession()).toBeNull();
  });
  it("keeps case-sensitive subjects and issuer/client namespaces independent", async () => {
    const config = keycloakConfig();
    expect(keycloakIdentity(issuer, "A")).not.toBe(keycloakIdentity(issuer, "a"));
    expect(securityNamespace(config)).not.toBe(securityNamespace(authConfig()));
    await authenticate();
    await revokeUserSessions(keycloakIdentity(issuer, "employee-a"), config);
    expect(await getSession()).not.toBeNull();
    await revokeUserSessions(keycloakIdentity(issuer, "Employee-A"), config);
    expect(await getSession()).toBeNull();
  });
  it("revokes old sessions on successful replacement and preserves them on failed callback", async () => {
    const { cookie, config } = await authenticate();
    const { pending } = await start();
    variant = "nonce"; await callback(callbackRequest(String(pending.state)));
    expect(await getSession()).not.toBeNull();
    variant = "valid";
    await authenticate();
    browser.cookies.set("3p-session", cookie);
    expect(await getSession()).toBeNull();
    expect(config.provider).toBe("keycloak");
  });
  it("accepts legacy Microsoft sessions while Keycloak is enabled", async () => {
    const config = authConfig();
    const legacy = { oid: "legacy-person", tenantId: config.tenantId, name: "Legacy", roles: ["Consulta"], mfaContext: "c1", authMode: "entra" };
    browser.cookies.set("3p-session", await seal(legacy, "session", now() + 600, config));
    expect(await getSession()).toMatchObject(legacy);
    await authenticate();
    const old = await seal(legacy, "session", now() + 600, config);
    browser.cookies.set("3p-session", old);
    const { pending } = await start(); await callback(callbackRequest(String(pending.state)));
    browser.cookies.set("3p-session", old);
    expect(await getSession()).toBeNull();
  });
  it("logout validates origin, revokes server-side and uses the discovered end-session endpoint", async () => {
    const { cookie } = await authenticate();
    expect((await logout(new Request(origin + "/api/auth/keycloak/logout", { method: "POST", headers: { origin: "https://bad.example" } }))).status).toBe(403);
    const response = await logout(new Request(origin + "/api/auth/keycloak/logout", { method: "POST", headers: { origin } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(issuer + "/logout");
    expect(response.headers.get("location")).not.toContain("id_token_hint");
    expect(response.cookies.get("3p-session")?.maxAge).toBe(0);
    browser.cookies.set("3p-session", cookie); expect(await getSession()).toBeNull();
  });
  it("protects reads and prevents Keycloak writes to real sources before association", async () => {
    expect((await budgets()).status).toBe(401);
    roleNames = ["Operador"]; await authenticate();
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    expect(canReviewSource((await getSession())!)).toBe(false);
    await expect(requireSession(true)).rejects.toMatchObject({ status: 403 });
    const context = { params: Promise.resolve({ id: "1" }) };
    expect((await decide(new Request(origin + "/api/itens/1/decisao", { method: "PATCH" }), context)).status).toBe(403);
    expect((await correct(new Request(origin + "/api/itens/1/correcao", { method: "PATCH" }), context)).status).toBe(403);
    vi.stubEnv("DATA_SOURCE", "operator-api");
    await expect(requireSession(true)).rejects.toMatchObject({ status: 403 });
    expect(createMockOperatorRepository()).toBeDefined();
  });
  it("keeps the existing production bypass rejection before evaluating any provider", async () => {
    await authenticate();
    vi.stubEnv("AUTH_DISABLED", "true"); vi.stubEnv("NODE_ENV", "production");
    await expect(getSession()).rejects.toMatchObject({ code: "AUTH_BYPASS_REQUIRES_DEVELOPMENT" });
  });
  it("is disabled by default and production cannot use loopback or HTTP issuers", async () => {
    vi.stubEnv("KEYCLOAK_ENABLED", "false"); expect((await login()).status).toBe(404);
    vi.stubEnv("KEYCLOAK_ENABLED", "true"); vi.stubEnv("NODE_ENV", "production");
    expect(() => keycloakConfig()).toThrowError("KEYCLOAK_NOT_CONFIGURED");
    vi.stubEnv("KEYCLOAK_ISSUER", "https://sso.example/realms/portal");
    vi.stubEnv("AUTH_APP_ORIGIN", "https://portal.example");
    expect(keycloakConfig().secure).toBe(true);
    vi.stubEnv("KEYCLOAK_ISSUER", "https://localhost/realms/portal");
    expect(() => keycloakConfig()).toThrowError("KEYCLOAK_NOT_CONFIGURED");
  });
});
