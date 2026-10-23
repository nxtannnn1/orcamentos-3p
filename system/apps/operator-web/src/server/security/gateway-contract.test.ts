import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ commands: [] as (string | number)[][], cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => { const value = state.cookies.get(name); return value ? { value } : undefined; },
}) }));
vi.mock("./store", async importOriginal => ({
  ...(await importOriginal<typeof import("./store")>()),
  // Records the wire command and answers like Redis; the Keycloak state key stops the flow before any network call.
  securityCommand: vi.fn(async (command: (string | number)[]) => {
    state.commands.push(JSON.parse(JSON.stringify(command)));
    const [operation, key] = command;
    if (String(key).includes(":login:")) throw new Error("synthetic stop before token exchange");
    if (operation === "GET") return null;
    if (operation === "SET") return "OK";
    if (operation === "INCR" || operation === "EVAL") return 1;
    if (operation === "DEL") return 1;
    throw new Error("Unexpected synthetic command");
  }),
}));
import { isSessionActive, registerSession, revokeSession, revokeUserSessions } from "./session-registry";
import { limitUserRequests } from "./rate-limit";
import { securityCommand } from "./store";
import { ItemCorrectionService } from "../sharepoint/item-correction-service";
import { correctionFixture, correctionInput, actorM } from "../sharepoint/__test-support__/correction";
import { decisionActor, decisionScenario } from "../sharepoint/__test-support__/graph-realistic";
import { GET as keycloakCallback } from "../../app/api/auth/keycloak/callback/route";
import { keycloakConfig } from "../auth/keycloak";
import { cookieNames, seal } from "../auth/session";
import type { SessionConfig, SessionUser } from "../auth/configuration";

// Contract between the BFF and the in-repository Redis REST gateway (system/infrastructure/redis-lab/gateway).
// Loaded by path so the app build does not depend on files outside its own directory.
const gatewayPath = fileURLToPath(new URL("../../../../../infrastructure/redis-lab/gateway/commands.mjs", import.meta.url));
let validCommand: (command: unknown) => boolean;
beforeAll(async () => {
  if (!existsSync(gatewayPath)) throw new Error("Gateway contract source not found");
  ({ validCommand } = await import(/* @vite-ignore */ gatewayPath.replace(/\\/g, "/")));
});
beforeEach(() => { state.commands.length = 0; state.cookies.clear(); });
afterEach(() => { vi.unstubAllEnvs(); });

const sessionConfig: SessionConfig = { tenantId: "11111111-1111-4111-8111-111111111111", clientId: "22222222-2222-4222-8222-222222222222",
  sessionSecret: "synthetic-session-secret-with-32+chars", origin: "https://portal.example.invalid", secure: true };
const user: SessionUser = { oid: "33333333-3333-4333-8333-333333333333", tenantId: sessionConfig.tenantId, name: "Sintético",
  roles: ["Operador"], mfaContext: "c1", authMode: "entra" };
const rejected = () => state.commands.filter(command => !validCommand(command));

describe("contrato BFF → gateway Redis: todo comando emitido é aceito pelo gateway", () => {
  it("registro, verificação e revogação de sessão", async () => {
    const { sid, userVersion } = await registerSession(user.oid, Math.floor(Date.now() / 1000) + 900, sessionConfig);
    await isSessionActive(sid, userVersion, user.oid, sessionConfig);
    await revokeSession(sid, sessionConfig);
    await revokeUserSessions(user.oid, sessionConfig);
    expect(state.commands.length).toBeGreaterThanOrEqual(5);
    expect(rejected()).toEqual([]);
  });

  it("limite de requisições de leitura e escrita", async () => {
    await limitUserRequests(user, false);
    await limitUserRequests(user, true);
    expect(state.commands.map(command => command[0])).toEqual(["EVAL", "EVAL"]);
    expect(rejected()).toEqual([]);
  });

  it("auditoria da decisão SharePoint (intenção e resultado)", async () => {
    vi.stubEnv("SECURITY_REDIS_REST_URL", "https://redis.invalid/");
    vi.stubEnv("SECURITY_REDIS_REST_TOKEN", "synthetic-token");
    const f = decisionScenario({ realistic: true });
    await f.repository.saveItemDecision("1", { action: "REJECT", approvedMaterial: null, observation: "Justificativa sintética" },
      { version: '"v1"', actor: decisionActor });
    expect(state.commands.some(command => String(command[1]).endsWith(":intent"))).toBe(true);
    expect(state.commands.some(command => String(command[1]).endsWith(":outcome"))).toBe(true);
    expect(rejected()).toEqual([]);
  });

  it("correção: evidência, intenção, lock, outcome, reconciliação e liberação CAS", async () => {
    const f = correctionFixture();
    const recorded: (string | number)[][] = [];
    const command = async (args: (string | number)[]) => { recorded.push(JSON.parse(JSON.stringify(args))); return f.command(args); };
    const service = new ItemCorrectionService(f.graph, f.config, command);
    await service.save("1", correctionInput, { actor: actorM, version: '"v1"' });
    const denied = correctionFixture(); denied.setMode("denied");
    const deniedRecorded: (string | number)[][] = [];
    const deniedService = new ItemCorrectionService(denied.graph, denied.config,
      async args => { deniedRecorded.push(JSON.parse(JSON.stringify(args))); return denied.command(args); });
    await expect(deniedService.save("1", correctionInput, { actor: actorM, version: '"v1"' })).rejects.toBeDefined();
    const all = [...recorded, ...deniedRecorded];
    expect(all.some(args => args[0] === "EVAL")).toBe(true);
    expect(all.some(args => String(args[1]).endsWith(":outcome"))).toBe(true);
    expect(all.filter(args => !validCommand(args))).toEqual([]);
  });

  // F-04 (corrigido no lote L2): o callback enviava "NX","EX",600; o gateway aceita somente "EX",ttl,"NX".
  it("F-04: consumo único do state no callback Keycloak é aceito pelo gateway", async () => {
    vi.stubEnv("KEYCLOAK_ENABLED", "true");
    vi.stubEnv("KEYCLOAK_ISSUER", "https://keycloak.example.invalid/realms/3p");
    vi.stubEnv("KEYCLOAK_CLIENT_ID", "operator-web");
    vi.stubEnv("KEYCLOAK_CLIENT_SECRET", "synthetic-client-secret");
    vi.stubEnv("AUTH_APP_ORIGIN", "https://portal.example.invalid");
    vi.stubEnv("AUTH_SESSION_SECRET", "synthetic-session-secret-with-32+chars");
    const config = keycloakConfig();
    state.cookies.set(cookieNames(config).transaction, await seal({ state: "synthetic-state", nonce: "n", verifier: "v",
      provider: "keycloak", issuer: config.issuer, corporateLoginAlias: null }, "login", Math.floor(Date.now() / 1000) + 600, config));
    const response = await keycloakCallback(new Request("https://portal.example.invalid/api/auth/keycloak/callback?state=synthetic-state&code=c"));
    expect(response.status).toBe(307);
    const consume = state.commands.filter(command => String(command[1]).includes(":login:"));
    expect(consume).toHaveLength(1);
    expect(vi.mocked(securityCommand)).toHaveBeenCalled();
    expect(validCommand(consume[0])).toBe(true);
    // Same single-use semantics: set-if-absent with a 600 s expiry.
    expect(consume[0]).toEqual(["SET", expect.stringMatching(/:login:[0-9a-f]{64}$/), "used", "EX", 600, "NX"]);
    expect(rejected()).toEqual([]);
  });

  it("F-04: o store local mantém a semântica de uso único e expiração na nova ordem", async () => {
    const { securityCommand: memoryCommand } = await vi.importActual<typeof import("./store")>("./store");
    const key = `3p:${"a".repeat(64)}:login:${"b".repeat(64)}`;
    expect(await memoryCommand(["SET", key, "used", "EX", 600, "NX"])).toBe("OK");
    expect(await memoryCommand(["SET", key, "used", "EX", 600, "NX"])).toBeNull();
    expect(await memoryCommand(["GET", key])).toBe("used");
  });
});
