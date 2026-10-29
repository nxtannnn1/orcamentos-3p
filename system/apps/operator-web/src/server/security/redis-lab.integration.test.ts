// Opt-in: real existing lab Redis, candidate HTTPS handler, simulated Graph only.
// Docker redis-cli bridges the private network without publishing a Redis port.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:https";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
vi.mock("server-only", () => ({}));
import { securityCommand } from "./store";
import { authConfig } from "../auth/configuration";
import { registerSession, isSessionActive, revokeSession } from "./session-registry";
import { correctionFixture, correctionInput, actorM } from "../sharepoint/__test-support__/correction";
import { ItemCorrectionService } from "../sharepoint/item-correction-service";

const exec = promisify(execFile);
describe.skipIf(process.env.THREEP_REDIS_INTEGRATION !== "1")("real Redis / candidate HTTPS / Graph fixtures", () => {
  let server: Server;
  const keys = new Set<string>();
  const command = async (args: string[]) => {
    const key = args[0] === "EVAL" ? args[3] : args[1];
    keys.add(key);
    const { stdout } = await exec("docker", ["exec", "3p-redis-lab-redis-1", "redis-cli", "--json", ...args], { timeout: 5000 });
    return JSON.parse(stdout);
  };
  beforeAll(async () => {
    const { stdout } = await exec("docker", ["inspect", "3p-redis-lab-redis-1"]);
    const redis = JSON.parse(stdout)[0];
    if (redis.Config.Labels["com.docker.compose.project"] !== "3p-redis-lab") throw new Error("Not the lab Redis");
    const moduleUrl = pathToFileURL(path.resolve("../../infrastructure/redis-lab/gateway/handler.mjs")).href;
    const { createHandler } = await import(moduleUrl);
    const token = `fictitious-${randomUUID()}`;
    server = createServer({
      cert: readFileSync(process.env.THREEP_TEST_TLS_CERT!),
      key: readFileSync(process.env.THREEP_TEST_TLS_KEY!),
    }, createHandler({ isReady: true, sendCommand: command }, token));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing address");
    vi.stubEnv("SECURITY_REDIS_REST_URL", `https://localhost:${address.port}/`);
    vi.stubEnv("SECURITY_REDIS_REST_TOKEN", token);
  });
  afterAll(async () => {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    // Exact keys observed in this fixture only; never enumerate the Redis DB.
    if (keys.size) await exec("docker", ["exec", "3p-redis-lab-redis-1", "redis-cli", "DEL", ...keys], { timeout: 5000 });
    vi.unstubAllEnvs();
  });
  it("actual securityCommand and registry: HTTPS session, revoke and expiry", async () => {
    const config = authConfig({ ENTRA_LOGIN_TENANT_ID: actorM.tenantId, ENTRA_LOGIN_CLIENT_ID: randomUUID(),
      ENTRA_LOGIN_CLIENT_SECRET: "fixture", AUTH_SESSION_SECRET: randomUUID() + randomUUID(),
      AUTH_APP_ORIGIN: "https://fixture.example", ENTRA_MFA_AUTH_CONTEXT_ID: "c1" });
    const session = await registerSession(actorM.oid, Math.floor(Date.now() / 1000) + 30, config);
    expect(await isSessionActive(session.sid, session.userVersion, actorM.oid, config)).toBe(true);
    await revokeSession(session.sid, config);
    expect(await isSessionActive(session.sid, session.userVersion, actorM.oid, config)).toBe(false);
    const key = `3p:redis-test:${randomUUID()}:expiry`;
    expect(await securityCommand(["SET", key, "fixture", "EX", 1, "NX"])).toBe("OK");
    await new Promise(resolve => setTimeout(resolve, 1200));
    expect(await securityCommand(["GET", key])).toBeNull();
  }, 15000);
  it("actual correction service: uncertain outcome, reread, reconciliation, CAS, duplicate UUID", async () => {
    const f = correctionFixture();
    const config = { ...f.config, siteId: randomUUID() };
    const service = new ItemCorrectionService(f.graph, config, securityCommand);
    const input = { ...correctionInput, operationId: randomUUID() };
    const context = { actor: actorM, version: '"v1"' };
    f.setMode("after");
    await expect(service.save("1", input, context)).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    f.setMode("ok");
    expect((await service.reconcile("1", input.operationId, context)).status).toBe("confirmed");
    expect((await service.save("1", input, context)).status).toBe("confirmed");
    expect(f.patch).toHaveBeenCalledTimes(1);
    await expect(service.save("1", { ...input, justification: "Conteúdo divergente para o mesmo UUID" }, context)).rejects.toMatchObject({ code: "CORRECTION_OPERATION_CONFLICT" });
  }, 30000);
  it("release outage retains real lock and blocks another owner until reconciliation", async () => {
    const f = correctionFixture();
    const config = { ...f.config, siteId: randomUUID() };
    let lockKey = "";
    const unavailableRelease = async (args: (string | number)[]) => {
      if (args[0] === "EVAL") { lockKey = String(args[3]); throw new Error("Simulated release outage"); }
      return securityCommand(args);
    };
    const service = new ItemCorrectionService(f.graph, config, unavailableRelease);
    const input = { ...correctionInput, operationId: randomUUID() };
    const context = { actor: actorM, version: '"v1"' };
    await expect(service.save("1", input, context)).rejects.toThrow("Simulated release outage");
    expect(await securityCommand(["GET", lockKey])).toBe(input.operationId);
    expect(await securityCommand(["SET", lockKey, randomUUID(), "NX"])).toBeNull();
    await expect(service.assertDecisionState(f.row, null, input.values.observation)).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    expect(f.patch).toHaveBeenCalledTimes(1);
    const recovered = new ItemCorrectionService(f.graph, config, securityCommand);
    expect((await recovered.reconcile("1", input.operationId, context)).status).toBe("confirmed");
    expect(await securityCommand(["GET", lockKey])).toBeNull();
    expect(f.patch).toHaveBeenCalledTimes(1);
  }, 30000);
});
