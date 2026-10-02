import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const browserCookies = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => browserCookies.value ? { value: browserCookies.value } : undefined }) }));
import { authConfig, canReview } from "./configuration";
import { seal, unseal, parseSession, requireSession, cookieNames, cookieOptions, getSession } from "./session";

export const testEnv = { ENTRA_LOGIN_TENANT_ID: "11111111-1111-1111-1111-111111111111", ENTRA_LOGIN_CLIENT_ID: "22222222-2222-2222-2222-222222222222", ENTRA_LOGIN_CLIENT_SECRET: "fake-client-secret", AUTH_SESSION_SECRET: "a-test-only-secret-with-more-than-32-characters", ENTRA_MFA_AUTH_CONTEXT_ID: "c1", AUTH_APP_ORIGIN: "https://portal.example" };
const config = authConfig(testEnv);
const user = { oid: "employee", tenantId: config.tenantId, name: "Teste", roles: ["Operador"], mfaContext: "c1", authMode: "entra" };
beforeEach(() => { for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value); browserCookies.value = undefined; });
afterEach(() => vi.unstubAllEnvs());

describe("configuracao opcional de Authentication Context", () => {
  it.each([
    ["localhost", "development", "", null],
    ["127.0.0.1", "development", "", null],
    ["[::1]", "development", "", null],
    ["localhost", "development", "c1", "c1"],
  ])("aceita host=%s, NODE_ENV=%s e MFA=%j", (host, nodeEnv, mfaContext, expected) => {
    expect(authConfig({ ...testEnv, NODE_ENV: nodeEnv, AUTH_APP_ORIGIN: `http://${host}:3000`, ENTRA_MFA_AUTH_CONTEXT_ID: mfaContext }).mfaContext).toBe(expected);
  });
  it.each([
    ["development", "http://localhost:3000", "invalid"],
    ["production", "https://portal.example", ""],
    ["production", "https://portal.example", "invalid"],
    ["development", "http://portal.example", ""],
    ["production", "http://localhost:3000", ""],
  ])("rejeita NODE_ENV=%s, origem=%s e MFA=%j", (nodeEnv, origin, mfaContext) => {
    expect(() => authConfig({ ...testEnv, NODE_ENV: nodeEnv, AUTH_APP_ORIGIN: origin, ENTRA_MFA_AUTH_CONTEXT_ID: mfaContext }))
      .toThrowError("AUTH_NOT_CONFIGURED");
  });
  it("aceita producao HTTPS com contexto MFA valido", () => {
    expect(authConfig({ ...testEnv, NODE_ENV: "production", ENTRA_MFA_AUTH_CONTEXT_ID: "c1" }).mfaContext).toBe("c1");
  });
  it("nao inclui secrets nos erros de configuracao", () => {
    const secrets = [testEnv.ENTRA_LOGIN_TENANT_ID, testEnv.ENTRA_LOGIN_CLIENT_ID, testEnv.ENTRA_LOGIN_CLIENT_SECRET, testEnv.AUTH_SESSION_SECRET];
    try {
      authConfig({ ...testEnv, NODE_ENV: "production", ENTRA_MFA_AUTH_CONTEXT_ID: "" });
      throw new Error("expected authConfig to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe("AUTH_NOT_CONFIGURED");
      for (const secret of secrets) expect(message).not.toContain(secret);
    }
  });
});

describe("sessão corporativa", () => {
  it("allows bypass only for development with mock data", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATA_SOURCE", "mock");
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    await expect(getSession()).resolves.toMatchObject({ oid: "dev-local", roles: ["Operador"], authMode: "local-mock-bypass" });
  });
  it("preserva o bypass mock quando a flag de SharePoint esta presente", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("ALLOW_LOCAL_SHAREPOINT_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATA_SOURCE", "mock");
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    await expect(getSession()).resolves.toMatchObject({ oid: "dev-local", roles: ["Operador"], authMode: "local-mock-bypass" });
  });
  it("permite SharePoint local somente como Consulta e bloqueia escrita explicitamente", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("ALLOW_LOCAL_SHAREPOINT_BYPASS", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    await expect(getSession()).resolves.toEqual({
      oid: "dev-local-sharepoint-readonly",
      tenantId: "dev-local-sharepoint",
      name: "SharePoint Local (somente leitura)",
      roles: ["Consulta"],
      mfaContext: null,
      authMode: "local-sharepoint-bypass",
    });
    await expect(requireSession(true)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
  it.each([
    ["production", "http://localhost:3000"],
    ["development", "https://localhost:3000"],
    ["development", "http://portal.example"],
    ["development", "http://user@localhost:3000"],
    ["development", "http://user:password@localhost:3000"],
    ["development", "http://localhost:3000/path"],
    ["development", "http://localhost:3000?query=1"],
    ["development", "http://localhost:3000#hash"],
  ])("rejeita bypass SharePoint fora do desenvolvimento local estrito: %s %s", async (nodeEnv, origin) => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("ALLOW_LOCAL_SHAREPOINT_BYPASS", "true");
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("AUTH_APP_ORIGIN", origin);
    await expect(getSession()).rejects.toMatchObject({ code: "LOCAL_SHAREPOINT_BYPASS_REQUIRES_LOCAL_DEVELOPMENT", status: 503 });
  });
  it("nao cria bypass SharePoint quando AUTH_DISABLED nao e true", async () => {
    vi.stubEnv("AUTH_DISABLED", "false");
    vi.stubEnv("ALLOW_LOCAL_SHAREPOINT_BYPASS", "true");
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    await expect(getSession()).rejects.toMatchObject({ code: "LOCAL_SHAREPOINT_BYPASS_REQUIRES_AUTH_DISABLED", status: 503 });
  });
  it("rejeita a flag ativa com data source diferente de mock ou SharePoint", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("ALLOW_LOCAL_SHAREPOINT_BYPASS", "true");
    vi.stubEnv("DATA_SOURCE", "other");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    await expect(getSession()).rejects.toMatchObject({ code: "LOCAL_SHAREPOINT_BYPASS_REQUIRES_SHAREPOINT", status: 503 });
  });
  it("nao habilita o bypass SharePoint para valor diferente de true", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("ALLOW_LOCAL_SHAREPOINT_BYPASS", "TRUE");
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    await expect(getSession()).rejects.toMatchObject({ code: "AUTH_BYPASS_REQUIRES_MOCK_DATA", status: 503 });
  });
  it("mantem SharePoint sem a flag bloqueado pelo requisito de mock", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("ALLOW_LOCAL_SHAREPOINT_BYPASS", "false");
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    await expect(getSession()).rejects.toMatchObject({ code: "AUTH_BYPASS_REQUIRES_MOCK_DATA", status: 503 });
  });
  it("nao expoe credenciais em erros do bypass SharePoint", async () => {
    const sensitive = ["tenant-sensitive", "client-sensitive", "secret-sensitive"];
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("ALLOW_LOCAL_SHAREPOINT_BYPASS", "true");
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_APP_ORIGIN", "https://portal.example");
    vi.stubEnv("MICROSOFT_TENANT_ID", sensitive[0]);
    vi.stubEnv("MICROSOFT_CLIENT_ID", sensitive[1]);
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", sensitive[2]);
    try {
      await getSession();
      throw new Error("expected getSession to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe("LOCAL_SHAREPOINT_BYPASS_REQUIRES_LOCAL_DEVELOPMENT");
      for (const value of sensitive) expect(message).not.toContain(value);
    }
  });
  it.each([
    ["development", "sharepoint"],
    ["production", "mock"],
    ["staging", "mock"],
    ["test", "mock"],
  ])("rejects bypass for NODE_ENV=%s and DATA_SOURCE=%s", async (nodeEnv, dataSource) => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("DATA_SOURCE", dataSource);
    vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
    await expect(getSession()).rejects.toMatchObject({ status: 503 });
  });
  it("rejects bypass when the configured application origin is not local", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATA_SOURCE", "mock");
    vi.stubEnv("AUTH_APP_ORIGIN", "https://portal.example");
    await expect(getSession()).rejects.toMatchObject({ status: 503 });
  });
  it.each(["false", undefined])("uses normal authentication when AUTH_DISABLED=%s", async (disabled) => {
    if (disabled === undefined) delete process.env.AUTH_DISABLED;
    else vi.stubEnv("AUTH_DISABLED", disabled);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATA_SOURCE", "mock");
    await expect(getSession()).resolves.toBeNull();
  });
  it("falha fechada sem configuração, sem tenant específico ou com HTTP remoto", () => {
    expect(() => authConfig({})).toThrow();
    expect(() => authConfig({ ...testEnv, ENTRA_LOGIN_TENANT_ID: "common" })).toThrow();
    expect(() => authConfig({ ...testEnv, AUTH_APP_ORIGIN: "http://portal.example" })).toThrow();
    expect(() => authConfig({ ...testEnv, AUTH_SESSION_SECRET: "short" })).toThrow();
    expect(() => authConfig({ ...testEnv, ENTRA_MFA_AUTH_CONTEXT_ID: "" })).toThrow();
  });
  it("criptografa sessão e separa sessão de transação OAuth", async () => {
    const encrypted = await seal(user, "session", Math.floor(Date.now() / 1000) + 600, config);
    expect(encrypted).not.toContain("employee");
    expect(parseSession(await unseal(encrypted, "session", config), config)).toMatchObject(user);
    await expect(unseal(encrypted, "login", config)).rejects.toThrow();
    await expect(unseal(encrypted + "x", "session", config)).rejects.toThrow();
    await expect(unseal(encrypted, "session", { ...config, sessionSecret: "another-secret-with-more-than-32-characters" })).rejects.toThrow();
  });
  it("rejeita sessão expirada", async () => {
    const encrypted = await seal(user, "session", Math.floor(Date.now() / 1000) - 1, config);
    await expect(unseal(encrypted, "session", config)).rejects.toThrow();
  });
  it("exige autenticação e distingue Consulta de Operador", async () => {
    await expect(requireSession()).rejects.toMatchObject({ status: 401 });
    browserCookies.value = await seal({ ...user, roles: ["Consulta"] }, "session", Math.floor(Date.now() / 1000) + 600, config);
    expect((await requireSession()).name).toBe("Teste");
    await expect(requireSession(true)).rejects.toMatchObject({ status: 403 });
    browserCookies.value = await seal(user, "session", Math.floor(Date.now() / 1000) + 600, config);
    expect(canReview(await requireSession(true))).toBe(true);
  });
  it("revalida organização e contexto ao abrir uma sessão", async () => {
    for (const changes of [{ tenantId: "other" }, { mfaContext: "c2" }, { roles: [] }, { roles: ["AdminInventado"] }]) {
      browserCookies.value = await seal({ ...user, ...changes }, "session", Math.floor(Date.now() / 1000) + 600, config);
      await expect(requireSession()).rejects.toMatchObject({ status: 401 });
    }
  });
  it("usa cookies HttpOnly, Secure e prefixo __Host em HTTPS", () => {
    expect(cookieNames(config).session).toBe("__Host-3p-session");
    expect(cookieOptions(config, 600)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    expect(cookieOptions(authConfig({ ...testEnv, AUTH_APP_ORIGIN: "http://localhost:3000" }), 600).secure).toBe(false);
  });
});
