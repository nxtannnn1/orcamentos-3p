import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ cookie: undefined as string | undefined, getAuthCodeUrl: vi.fn(), acquireTokenByCode: vi.fn(), validateToken: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => auth.cookie ? { value: auth.cookie } : undefined }) }));
vi.mock("./microsoft", () => ({ createMicrosoftClient: () => auth, validateMicrosoftToken: auth.validateToken }));
import { authConfig } from "./configuration";
import { seal, unseal } from "./session";
import { GET as login } from "../../app/api/auth/login/route";
import { GET as callback } from "../../app/api/auth/callback/route";
import { POST as logout } from "../../app/api/auth/logout/route";
const env = { ENTRA_LOGIN_TENANT_ID: "11111111-1111-1111-1111-111111111111", ENTRA_LOGIN_CLIENT_ID: "22222222-2222-2222-2222-222222222222", ENTRA_LOGIN_CLIENT_SECRET: "fake", AUTH_SESSION_SECRET: "test-only-secret-with-more-than-32-characters", ENTRA_MFA_AUTH_CONTEXT_ID: "c1", AUTH_APP_ORIGIN: "https://portal.example" };
const config = authConfig(env);
const pending = { state: "state", nonce: "nonce", verifier: "verifier" };
beforeEach(() => {
  vi.clearAllMocks(); auth.cookie = undefined;
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  auth.getAuthCodeUrl.mockResolvedValue(`${config.authority}/oauth2/v2.0/authorize`);
  auth.acquireTokenByCode.mockResolvedValue({ idToken: "fake-token-not-returned-to-browser" });
  auth.validateToken.mockResolvedValue({ user: { oid: "employee", tenantId: config.tenantId, name: "Teste", roles: ["Operador"], mfaContext: "c1", authMode: "entra" }, expiresAt: Math.floor(Date.now() / 1000) + 600 });
});
afterEach(() => vi.unstubAllEnvs());
const callbackRequest = (query = "code=code&state=state") => new Request(`https://portal.example/api/auth/callback?${query}`);

describe("fluxo de login e logout", () => {
  it("gera PKCE/state/nonce novos e solicita o contexto configurado", async () => {
    const response = await login(new Request("https://portal.example/api/auth/login?next=https://external.example"));
    const options = auth.getAuthCodeUrl.mock.calls[0][0];
    expect(options).toMatchObject({ redirectUri: config.redirectUri, codeChallengeMethod: "S256" });
    expect(JSON.parse(options.claims)).toEqual({ id_token: { acrs: { essential: true, value: "c1" } } });
    expect(options.state.length).toBeGreaterThan(32);
    expect(options.nonce.length).toBeGreaterThan(32);
    const transaction = response.cookies.get("__Host-3p-login")!.value;
    const payload = await unseal(transaction, "login", config);
    expect(payload.state).toBe(options.state);
    expect(payload.nonce).toBe(options.nonce);
    expect(typeof payload.verifier).toBe("string");
    expect(response.cookies.get("__Host-3p-session")).toBeUndefined();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("nao solicita Authentication Context quando ausente no desenvolvimento local", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("ENTRA_MFA_AUTH_CONTEXT_ID", "");
    await login(new Request("http://localhost:3000/api/auth/login"));
    expect(auth.getAuthCodeUrl.mock.calls[0][0]).not.toHaveProperty("claims");
  });
  it("bloqueia callback sem transação antes da troca do código", async () => {
    const response = await callback(callbackRequest());
    expect(response.headers.get("location")).toContain("LOGIN_EXPIRED");
    expect(auth.acquireTokenByCode).not.toHaveBeenCalled();
  });
  it.each(["code=code&state=wrong", "error=access_denied&state=state", "state=state"])("nega callback inválido: %s", async (query) => {
    auth.cookie = await seal(pending, "login", Math.floor(Date.now() / 1000) + 600, config);
    const response = await callback(callbackRequest(query));
    expect(response.headers.get("location")).toContain("/login?error=");
    expect(auth.acquireTokenByCode).not.toHaveBeenCalled();
    expect(response.cookies.get("__Host-3p-login")?.maxAge).toBe(0);
  });
  it("cria sessão só após validar o token e limpa a transação", async () => {
    auth.cookie = await seal(pending, "login", Math.floor(Date.now() / 1000) + 600, config);
    const response = await callback(callbackRequest());
    expect(auth.acquireTokenByCode).toHaveBeenCalledWith(expect.objectContaining({ code: "code", codeVerifier: "verifier" }));
    expect(auth.validateToken).toHaveBeenCalledWith("fake-token-not-returned-to-browser", "nonce", config);
    expect(response.headers.get("location")).toBe("https://portal.example/");
    expect(response.cookies.get("__Host-3p-login")?.maxAge).toBe(0);
    expect(await unseal(response.cookies.get("__Host-3p-session")!.value, "session", config)).toMatchObject({ oid: "employee" });
    expect(response.headers.get("set-cookie")).not.toContain("fake-token");
  });
  it("não expõe erro do provedor nem cria sessão se o token falhar", async () => {
    auth.cookie = await seal(pending, "login", Math.floor(Date.now() / 1000) + 600, config);
    auth.validateToken.mockRejectedValueOnce(new Error("sensitive-provider-detail"));
    const response = await callback(callbackRequest());
    expect(response.headers.get("location")).toBe("https://portal.example/login?error=LOGIN_FAILED");
    expect(response.cookies.get("__Host-3p-session")?.maxAge).toBe(0);
  });
  it("logout rejeita origem externa e limpa sessão da própria origem", async () => {
    expect((await logout(new Request("https://portal.example/api/auth/logout", { method: "POST", headers: { Origin: "https://external.example" } }))).status).toBe(403);
    const response = await logout(new Request("https://portal.example/api/auth/logout", { method: "POST", headers: { Origin: config.origin } }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain(`${config.authority}/oauth2/v2.0/logout`);
    expect(response.headers.get("set-cookie")).toContain("__Host-3p-session=;");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
