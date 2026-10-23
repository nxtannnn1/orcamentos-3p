// Opt-in HTTP adapter over the actual route exports. No Next server or external Graph.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";
import type { OperatorRepository } from "../../repositories/operator-repository";
import type { SessionUser } from "../auth/configuration";
vi.mock("server-only", () => ({}));
const injected = vi.hoisted(() => ({
  session: null as null | (() => SessionUser), repository: null as null | OperatorRepository,
}));
vi.mock("../auth/session", async importOriginal => ({
  ...await importOriginal<typeof import("../auth/session")>(),
  requireSession: async () => injected.session!(),
}));
vi.mock("../data-source/operator-repository-factory", () => ({ createServerOperatorRepository: () => injected.repository }));
import { AuthError } from "../auth/configuration";
import { PATCH, POST } from "../../app/api/itens/[id]/correcao/route";
import { SharePointOperatorRepository } from "../sharepoint/sharepoint-operator-repository";
import { correctionFixture, correctionInput, actorM } from "../sharepoint/__test-support__/correction";
import { digest } from "../sharepoint/correction-state";
import { securityCommand } from "./store";

const enabled = process.env.THREEP_RESILIENCE === "1";
const storage = new AsyncLocalStorage<Record<string, string>>();
const exec = promisify(execFile);
const traces: Record<string, unknown>[] = [];
const endpoint = process.env.SECURITY_REDIS_REST_URL!;
const token = process.env.SECURITY_REDIS_REST_TOKEN!;
const control = async (body: Record<string, unknown>) => {
  const response = await fetch(new URL("/__control", endpoint), { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  expect(response.status).toBe(200);
  return response.json();
};
let bff: Server, origin: string, fixture: ReturnType<typeof correctionFixture>, scope: string, oid: string;

describe.skipIf(!enabled)("isolated real HTTP correction route, TCP Redis and simulated identity/Graph", () => {
  beforeAll(async () => {
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    injected.session = () => {
      const headers = storage.getStore()!;
      if (headers.authorization !== "Bearer fictitious-session") throw new AuthError("AUTH_REQUIRED", 401);
      if (headers["x-fixture-role"] === "Consulta") throw new AuthError("FORBIDDEN", 403);
      return { oid: headers["x-fixture-oid"], tenantId: headers["x-fixture-tenant"], name: "Fixture", email: "fixture@example.com", roles: ["Operador"], mfaContext: "c1", authMode: "entra" };
    };
    bff = createServer(async (req, res) => {
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
      const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v ?? ""]));
      const request = new Request(`${origin}${req.url}`, { method: req.method, headers, body: Buffer.concat(chunks) });
      const id = /^\/api\/itens\/([^/]+)\/correcao$/.exec(req.url ?? "")?.[1];
      if (!id || !["PATCH", "POST"].includes(req.method ?? "")) { res.writeHead(404); return res.end(); }
      const started = performance.now();
      const response = await storage.run(headers, () => (req.method === "PATCH" ? PATCH : POST)(request, { params: Promise.resolve({ id }) }));
      traces.push({ layer: "bff_http", method: req.method, status: response.status, elapsedMs: Math.round(performance.now() - started) });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    });
    await new Promise<void>(resolve => bff.listen(0, "127.0.0.1", resolve));
    const address = bff.address(); if (!address || typeof address === "string") throw new Error("Missing fixture address");
    origin = `http://127.0.0.1:${address.port}`;
    vi.stubEnv("AUTH_APP_ORIGIN", origin);
  });
  beforeEach(() => {
    fixture = correctionFixture(); oid = randomUUID();
    fixture.config.siteId = randomUUID();
    scope = `3p:correction:${digest({ site: fixture.config.siteId, list: fixture.config.itemsListId })}`;
    injected.repository = new SharePointOperatorRepository(fixture.graph, fixture.config);
  });
  afterAll(async () => {
    if (bff) { bff.closeAllConnections(); await new Promise<void>(resolve => bff.close(() => resolve())); }
    if (process.env.THREEP_RESILIENCE_EVIDENCE) writeFileSync(path.join(process.env.THREEP_RESILIENCE_EVIDENCE, `http-trace-${process.env.THREEP_DIAG_PHASE ?? "serial"}.json`), JSON.stringify(traces, null, 2));
    vi.unstubAllEnvs();
  });
  const send = async (body: unknown, options: { method?: string; headers?: Record<string, string> } = {}) => {
    const response = await fetch(`${origin}/api/itens/1/correcao`, {
      method: options.method ?? "PATCH", headers: { Authorization: "Bearer fictitious-session", Origin: origin, "Content-Type": "application/json", "If-Match": '"v1"', "x-fixture-oid": oid, "x-fixture-tenant": actorM.tenantId, ...options.headers },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, body: await response.json() };
  };
  const input = () => ({ ...correctionInput, operationId: randomUUID() });
  const lock = () => `${scope}:item:1:pending`;
  const resume = () => control({ action: "resume" });

  describe.skipIf(process.env.THREEP_DIAG_ONLY === "1")("HTTP endpoint matrix", () => {
    it("PATCH, reread, append-only proof, CAS, POST reconcile and same UUID never duplicate PATCH", async () => {
      const value = input();
      expect(await send(value)).toMatchObject({ status: 200, body: { status: "confirmed" } });
      expect((await send(value)).status).toBe(200);
      expect((await send({ operationId: value.operationId }, { method: "POST" })).status).toBe(200);
      expect(fixture.patch).toHaveBeenCalledTimes(1);
      expect(await securityCommand(["GET", lock()])).toBeNull();
      for (const suffix of ["intent", "reconciled"]) expect(typeof await securityCommand(["GET", `${scope}:operation:${value.operationId}:${suffix}`])).toBe("string");
      const key = `${scope}:item:1:original`, original = await securityCommand(["GET", key]);
      expect(typeof original).toBe("string");
      expect(await securityCommand(["SET", key, "overwrite", "NX"])).toBeNull();
      expect(await securityCommand(["GET", key])).toBe(original);
      expect((await send({ ...value, justification: "Conteúdo conflitante para o mesmo UUID" })).status).toBe(409);
    });
    it.each([
      ["missing session", { Authorization: "" }, 401],
      ["read-only role", { "x-fixture-role": "Consulta" }, 403],
      ["foreign tenant", { "x-fixture-tenant": randomUUID() }, 403],
      ["missing identity", { "x-fixture-oid": "" }, 403],
      ["foreign origin", { Origin: "http://foreign.invalid" }, 403],
      ["missing ETag", { "If-Match": "" }, 428],
      ["stale ETag", { "If-Match": '"old"' }, 409],
    ] as const)("rejects %s through HTTP", async (_name, headers, status) => {
      expect((await send(input(), { headers })).status).toBe(status);
      expect(fixture.patch).not.toHaveBeenCalled();
    });
    it("closed state and missing Person binding prevent PATCH", async () => {
      fixture.row.fields.Status_Revisao = "APROVADO";
      expect((await send(input())).status).toBe(409);
      fixture.row.fields.Status_Revisao = "PENDENTE";
      injected.repository = new SharePointOperatorRepository(fixture.graph, fixture.config);
      expect((await send(input())).status).toBe(503);
      expect(fixture.patch).not.toHaveBeenCalled();
    });
    it("TLS hostname failure and invalid gateway bearer fail closed through the BFF HTTP route", async () => {
      try {
        vi.stubEnv("SECURITY_REDIS_REST_URL", endpoint.replace("localhost", "127.0.0.1"));
        expect((await send(input())).status).toBe(503);
        vi.stubEnv("SECURITY_REDIS_REST_URL", endpoint);
        vi.stubEnv("SECURITY_REDIS_REST_TOKEN", "fictitious-invalid-bearer");
        expect((await send(input())).status).toBe(503);
        expect(fixture.patch).not.toHaveBeenCalled();
      } finally {
        vi.stubEnv("SECURITY_REDIS_REST_URL", endpoint);
        vi.stubEnv("SECURITY_REDIS_REST_TOKEN", token);
      }
    });
    it("12 distinct HTTP applicants commit one correction; stale attempts are rejected by ETag", async () => {
      const results = await Promise.all(Array.from({ length: 12 }, () => send(input(), { headers: { "x-fixture-oid": randomUUID() } })));
      // Distinct operations can acquire after an earlier owner released. If-Match
      // must still reject their stale snapshot; count committed writes, not attempts.
      expect(fixture.row.eTag).toBe('"v2"');
      expect(results.filter(result => result.status === 200)).toHaveLength(1);
      expect(results.every(result => [200, 409, 503].includes(result.status))).toBe(true);
      traces.push({ scenario: "distinct_http_applicants", applicants: 12, patchAttempts: fixture.patch.mock.calls.length, committedCorrections: 1, statuses: results.map(result => result.status) });
    });
    it("12 concurrent HTTP submissions of the same UUID never send a second PATCH", async () => {
      const value = input();
      const results = await Promise.all(Array.from({ length: 12 }, () => send(value)));
      expect(fixture.patch).toHaveBeenCalledTimes(1);
      expect(fixture.row.eTag).toBe('"v2"');
      expect(results.some(result => result.status === 200)).toBe(true);
      expect(results.every(result => [200, 503].includes(result.status))).toBe(true);
      traces.push({ scenario: "same_uuid_http_applicants", applicants: 12, patchAttempts: 1, committedCorrections: 1, statuses: results.map(result => result.status) });
    });
    it("lost Graph response reconciles via POST and blocks a different HTTP owner", async () => {
      const value = input(); fixture.setMode("after");
      expect((await send(value)).status).toBe(503);
      expect((await control({ action: "inspect", key: lock() })).ttl).toBe(-1);
      expect((await send(input(), { headers: { "If-Match": '"v2"', "x-fixture-oid": randomUUID() } })).status).toBe(503);
      expect((await send({ operationId: value.operationId }, { method: "POST", headers: { "x-fixture-oid": randomUUID() } })).status).toBe(403);
      fixture.setMode("ok");
      expect((await send({ operationId: value.operationId }, { method: "POST" })).status).toBe(200);
      expect((await send(value)).status).toBe(200);
      expect(fixture.patch).toHaveBeenCalledTimes(1);
    });
    for (const target of ["acquire", "release"]) for (const mode of ["before", "after"]) {
      it(`HTTP correction fails closed on TCP loss ${mode} ${target}`, async () => {
        const value = input();
        await control({ action: "fault", target, mode });
        expect((await send(value)).status).toBe(503);
        await resume();
        expect(fixture.patch).toHaveBeenCalledTimes(target === "acquire" ? 0 : 1);
        if (target === "release") {
          expect((await send({ operationId: value.operationId }, { method: "POST" })).status).toBe(200);
          expect((await send(value)).status).toBe(200);
          expect(fixture.patch).toHaveBeenCalledTimes(1);
        } else {
          // Intent exists; replay reconciles rather than silently issuing an uncertain PATCH.
          expect((await send(value)).status).toBe(503);
          expect(fixture.patch).not.toHaveBeenCalled();
          const result = await control({ action: "inspect", key: lock() });
          expect(result.value).toBe(mode === "after" ? value.operationId : null);
          if (mode === "after") {
            expect(result.ttl).toBe(-1);
            expect(await securityCommand(["SET", lock(), randomUUID(), "NX"])).toBeNull();
          }
        }
      });
    }
  });

  it("diagnostic: three TCP HTTP workflows retain availability and prevent duplicates", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      fixture = correctionFixture(); fixture.config.siteId = randomUUID(); oid = randomUUID();
      injected.repository = new SharePointOperatorRepository(fixture.graph, fixture.config);
      fixture.setMode("after"); const value = input();
      expect((await send(value)).status).toBe(503);
      fixture.setMode("ok");
      expect((await send({ operationId: value.operationId }, { method: "POST" })).status).toBe(200);
      expect((await send(value)).status).toBe(200);
      expect(fixture.patch).toHaveBeenCalledTimes(1);
    }
  }, 30000);

  it("diagnostic: repeat legacy docker-exec bridge with unchanged timeouts", async () => {
    const moduleUrl = pathToFileURL(path.resolve("../../infrastructure/redis-lab/gateway/handler.mjs")).href;
    const { createHandler } = await import(moduleUrl);
    const measurements: Record<string, unknown>[] = [];
    const legacy = createHttpsServer({ cert: readFileSync(process.env.THREEP_TEST_TLS_CERT!), key: readFileSync(process.env.THREEP_TEST_TLS_KEY!) }, createHandler({
      isReady: true,
      sendCommand: async (args: string[]) => {
        const started = performance.now();
        const key = args[0] === "EVAL" ? args[3] : args[1];
        const stage = ["intent", "outcome", "reconciled", "pending", "original"].find(suffix => key.endsWith(`:${suffix}`)) ?? "rate_or_session";
        // Do not log arguments, stdout or raw errors. The disposable identifier is verified.
        const redis = process.env.THREEP_DISPOSABLE_REDIS!;
        if (!/^3p-resilience-[a-f0-9-]+-redis$/.test(redis)) throw new Error("Unexpected disposable Redis");
        try {
          const { stdout } = await exec("docker", ["exec", redis, "redis-cli", "--json", ...args], { timeout: 5000 });
          measurements.push({ layer: "docker_exec", stage, elapsedMs: Math.round(performance.now() - started), outcome: "completed" });
          return JSON.parse(stdout);
        } catch (error) {
          const e = error as { killed?: boolean; code?: string | number };
          measurements.push({ layer: "docker_exec", stage, elapsedMs: Math.round(performance.now() - started), outcome: e.killed ? "infrastructure_timeout" : "transport_error", code: typeof e.code === "number" ? e.code : "sanitized" });
          throw new Error("Legacy bridge unavailable");
        }
      },
    }, token, { onDiagnostic: (event: Record<string, unknown>) => measurements.push({ layer: "legacy_gateway", ...event }) }));
    await new Promise<void>(resolve => legacy.listen(0, "127.0.0.1", resolve));
    const address = legacy.address(); if (!address || typeof address === "string") throw new Error("Missing fixture address");
    vi.stubEnv("SECURITY_REDIS_REST_URL", `https://localhost:${address.port}/`);
    const outcomes = [];
    const observedSend = async (...args: Parameters<typeof send>) => {
      try { return await send(...args); }
      catch (error) {
        const name = error instanceof Error ? error.name : "UnknownError";
        measurements.push({ layer: "http_client", outcome: name === "TimeoutError" ? "client_timeout" : "communication_error" });
        return { status: 0, body: null }; // Explicit missing response, never success.
      }
    };
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        fixture = correctionFixture(); fixture.config.siteId = randomUUID(); oid = randomUUID();
        injected.repository = new SharePointOperatorRepository(fixture.graph, fixture.config);
        fixture.setMode("after"); const value = input();
        const first = await observedSend(value);
        fixture.setMode("ok"); const reconcile = await observedSend({ operationId: value.operationId }, { method: "POST" });
        const replay = await observedSend(value);
        outcomes.push({ first: first.status, reconcile: reconcile.status, replay: replay.status, patchCalls: fixture.patch.mock.calls.length });
      }
    } finally {
      vi.stubEnv("SECURITY_REDIS_REST_URL", endpoint);
      legacy.closeAllConnections(); await new Promise<void>(resolve => legacy.close(() => resolve()));
      writeFileSync(path.join(process.env.THREEP_RESILIENCE_EVIDENCE!, `legacy-diagnostic-${process.env.THREEP_DIAG_PHASE ?? "serial"}.json`), JSON.stringify({ phase: process.env.THREEP_DIAG_PHASE ?? "serial", outcomes, measurements }, null, 2));
    }
    // Availability is measured rather than assumed; safety remains mandatory under load.
    expect(outcomes.every(value => value.patchCalls <= 1)).toBe(true);
    expect(outcomes.every(value => [0, 200, 503].includes(value.reconcile) && [0, 200, 503].includes(value.replay))).toBe(true);
  }, 90000);
});
