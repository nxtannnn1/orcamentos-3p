import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const browser = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (browser.cookie ? { value: browser.cookie } : undefined) }),
}));
import { authConfig } from "../auth/configuration";
import { getSession, seal } from "../auth/session";
import { POST as logout } from "../../app/api/auth/logout/route";
import { revokeUserSessions } from "./session-registry";
import { limitUserRequests } from "./rate-limit";
import { securityCommand } from "./store";

const env = {
  ENTRA_LOGIN_TENANT_ID: "11111111-1111-1111-1111-111111111111",
  ENTRA_LOGIN_CLIENT_ID: "22222222-2222-2222-2222-222222222222",
  ENTRA_LOGIN_CLIENT_SECRET: "fake",
  AUTH_SESSION_SECRET: "fictitious-32-character-test-secret-only",
  AUTH_APP_ORIGIN: "https://portal.example",
  ENTRA_MFA_AUTH_CONTEXT_ID: "c1",
};
const config = authConfig(env);
const user = {
  oid: "registry-test-user",
  tenantId: config.tenantId,
  name: "Test",
  roles: ["Operador" as const],
  mfaContext: "c1",
  authMode: "entra" as const,
};
afterEach(() => {
  browser.cookie = undefined;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function configure() {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

describe("revogação e controles compartilhados", () => {
  it("logout invalida cópia do cookie no servidor", async () => {
    configure();
    browser.cookie = await seal(user, "session", Math.floor(Date.now() / 1000) + 600, config);
    expect(await getSession()).not.toBeNull();
    const response = await logout(
      new Request(`${config.origin}/api/auth/logout`, {
        method: "POST",
        headers: { Origin: config.origin },
      }),
    );
    expect(response.status).toBe(303);
    // Simulate an attacker presenting the original cookie, ignoring Set-Cookie.
    expect(await getSession()).toBeNull();
  });
  it("revoga todas as sessões antigas do usuário e permite novo login", async () => {
    configure();
    browser.cookie = await seal(user, "session", Math.floor(Date.now() / 1000) + 600, config);
    const original = browser.cookie;
    await revokeUserSessions(user.oid, config);
    expect(await getSession()).toBeNull();
    browser.cookie = await seal(user, "session", Math.floor(Date.now() / 1000) + 600, config);
    expect(await getSession()).not.toBeNull();
    browser.cookie = original;
    expect(await getSession()).toBeNull();
  });
  it("produção não aceita memória como armazenamento compartilhado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(securityCommand(["GET", "test"])).rejects.toMatchObject({
      code: "SECURITY_STORE_NOT_CONFIGURED",
    });
  });
  it("falha de Redis bloqueia acesso e não permite redirect com credencial", async () => {
    vi.stubEnv("SECURITY_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("SECURITY_REDIS_REST_TOKEN", "test-secret");
    const fetcher = vi.fn(async () => Response.json({ error: "unavailable" }, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(securityCommand(["GET", "test"])).rejects.toMatchObject({
      code: "SECURITY_STORE_UNAVAILABLE",
    });
    expect(fetcher.mock.calls[0]).toBeDefined();
  });
  it("limita leitura mesmo para Consulta e separa limite de escrita", async () => {
    const subject = { ...user, oid: "rate-test-user", roles: ["Consulta" as const] };
    for (let i = 0; i < 60; i++) await limitUserRequests(subject, false);
    await expect(limitUserRequests(subject, false)).rejects.toMatchObject({ status: 429 });
    await expect(limitUserRequests(subject, true)).resolves.toBeUndefined();
  });
  it("registros NX não sobrescrevem a auditoria existente", async () => {
    expect(await securityCommand(["SET", "audit-test", "first", "NX"])).toBe("OK");
    expect(await securityCommand(["SET", "audit-test", "second", "NX"])).toBeNull();
    expect(await securityCommand(["GET", "audit-test"])).toBe("first");
  });
});
