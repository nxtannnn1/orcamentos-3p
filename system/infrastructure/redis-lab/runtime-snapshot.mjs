// Builds ONLY an external disposable snapshot. Never edits the real app or secrets.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import https from "node:https";

export function prepareRuntimeSnapshot(web, target) {
  mkdirSync(target);
  for (const file of ["src", "public", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "next-env.d.ts"]) {
    if (existsSync(path.join(web, file))) cpSync(path.join(web, file), path.join(target, file), { recursive: true });
  }
  symlinkSync(path.join(web, "node_modules"), path.join(target, "node_modules"), "junction");
  const configPath = path.join(target, "next.config.ts");
  writeFileSync(configPath, readFileSync(configPath, "utf8").replace('  output: "standalone",', ""));
  const sessionPath = path.join(target, "src/server/auth/session.ts");
  let session = readFileSync(sessionPath, "utf8");
  const marker = "export async function getSession(): Promise<SessionUser | null> {";
  assert.ok(session.includes(marker));
  session = session.replace(marker, marker + `
  // Generated fixture branch exists exclusively in this disposable source copy.
  if (process.env.THREEP_RESILIENCE_RUNTIME === "1") {
    const h = await (await import("next/headers")).headers();
    if (h.get("authorization") !== "Bearer fictitious-session") return null;
    return { oid: h.get("x-fixture-oid") ?? "", tenantId: h.get("x-fixture-tenant") ?? "",
      name: "Fixture", roles: h.get("x-fixture-role") === "Consulta" ? ["Consulta"] : ["Operador"],
      mfaContext: "c1", authMode: "entra" };
  }
`);
  writeFileSync(sessionPath, session);
  const fixturePath = path.join(target, "src/server/sharepoint/__test-support__/correction.ts");
  let fixture = readFileSync(fixturePath, "utf8");
  assert.ok(fixture.includes('import { vi } from "vitest";'));
  fixture = fixture.replace('import { vi } from "vitest";', "").replaceAll("vi.fn(", "(");
  // The synthetic ledger is not used; the real repository uses securityCommand.
  writeFileSync(path.join(path.dirname(fixturePath), "resilience-runtime-fixture.ts"), fixture);
  writeFileSync(path.join(target, "src/server/data-source/operator-repository-factory.ts"), `
import { randomUUID } from "node:crypto";
import { correctionFixture } from "../sharepoint/__test-support__/resilience-runtime-fixture";
import { SharePointOperatorRepository } from "../sharepoint/sharepoint-operator-repository";
import type { DecisionActor } from "../sharepoint/person-resolver";
function create() {
  const f = correctionFixture(); f.config.siteId = randomUUID();
  let attempts = 0;
  const graph = { get: f.graph.get, patch: (async (...args: Parameters<typeof f.graph.patch>) => { attempts++; return f.graph.patch(...args); }) as typeof f.graph.patch };
  const repository = new SharePointOperatorRepository(graph, f.config, {
    findCandidates: async (actor: DecisionActor, siteId: string) => [{ ...actor, siteId, lookupId: "7" }],
  });
  return { f, repository, attempts: () => attempts };
}
const globalFixture = globalThis as typeof globalThis & { __redisResilienceRuntime?: ReturnType<typeof create> };
export function fixtureState() { return globalFixture.__redisResilienceRuntime ??= create(); }
export function resetFixture() { return globalFixture.__redisResilienceRuntime = create(); }
export function createServerOperatorRepository(_env: Record<string, string | undefined> = process.env) {
  if (process.env.THREEP_RESILIENCE_RUNTIME !== "1") throw new Error("Runtime fixture disabled");
  return fixtureState().repository;
}
`);
  const controlDir = path.join(target, "src/app/api/resilience-fixture"); mkdirSync(controlDir, { recursive: true });
  writeFileSync(path.join(controlDir, "route.ts"), `
import { fixtureState, resetFixture } from "../../../server/data-source/operator-repository-factory";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (process.env.THREEP_RESILIENCE_RUNTIME !== "1" || request.headers.get("authorization") !== "Bearer fictitious-control") return new Response(null, { status: 404 });
  const body = await request.json();
  const state = body.reset ? resetFixture() : fixtureState();
  if (body.mode) state.f.setMode(body.mode);
  if (body.state) state.f.row.fields.Status_Revisao = body.state;
  return Response.json({ patchAttempts: state.attempts(), version: state.f.row.eTag });
}
`);
}

export async function runtimeSmoke(origin, gatewayUrl, token, caFile, onProgress = () => {}) {
  const results = [];
  const record = value => { results.push(value); onProgress(results); };
  let oid = randomUUID();
  const tenant = "11111111-1111-4111-8111-111111111111";
  const reset = async extra => {
    oid = randomUUID();
    const response = await fetch(`${origin}/api/resilience-fixture`, { method: "POST", headers: { Authorization: "Bearer fictitious-control", "Content-Type": "application/json" }, body: JSON.stringify({ reset: true, ...extra }) });
    assert.equal(response.status, 200); return response.json();
  };
  const stats = async () => {
    const response = await fetch(`${origin}/api/resilience-fixture`, { method: "POST", headers: { Authorization: "Bearer fictitious-control", "Content-Type": "application/json" }, body: "{}" });
    return response.json();
  };
  const input = () => ({ operationId: randomUUID(), values: { description: "Descrição humana", quantity: "2.5", unit: "UN", unitPrice: "0.1", totalPrice: "0.25", supplier: "Fornecedor sintético", materialId: "22", observation: "Conferido" }, justification: "Correção sintética isolada", acknowledgeTotalDifference: false });
  const send = async (body, headers = {}, method = "PATCH") => {
    const started = performance.now();
    const response = await fetch(`${origin}/api/itens/1/correcao`, { method, headers: { Authorization: "Bearer fictitious-session", Origin: origin, "Content-Type": "application/json", "If-Match": '"v1"', "x-fixture-oid": oid, "x-fixture-tenant": tenant, ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    assert.ok(response.headers.has("content-security-policy")); // actual Next proxy executed
    return { status: response.status, body: await response.json(), elapsedMs: Math.round(performance.now() - started) };
  };
  const control = body => new Promise((resolve, reject) => {
    const request = https.request(new URL("/__control", gatewayUrl), { method: "POST", ca: readFileSync(caFile), headers: { Authorization: `Bearer ${token}` } }, response => {
      let text = ""; response.on("data", data => text += data);
      response.on("end", () => { try { assert.equal(response.statusCode, 200); resolve(JSON.parse(text)); } catch (error) { reject(error); } });
    });
    request.on("error", reject); request.end(JSON.stringify(body));
  });
  await reset(); const value = input();
  assert.equal((await send(value)).status, 200);
  assert.equal((await send(value)).status, 200);
  assert.equal((await send({ operationId: value.operationId }, {}, "POST")).status, 200);
  assert.equal((await stats()).patchAttempts, 1);
  record({ scenario: "Next PATCH + same UUID + POST reconciliation + proxy CSP", status: "PASS", patchAttempts: 1 });
  for (const [scenario, headers, expected] of [
    ["missing bearer", { Authorization: "" }, 401], ["invalid bearer", { Authorization: "Bearer invalid" }, 401],
    ["read-only role", { "x-fixture-role": "Consulta" }, 403], ["foreign tenant", { "x-fixture-tenant": randomUUID() }, 403],
    ["missing identity", { "x-fixture-oid": "" }, 403], ["stale ETag", { "If-Match": '"stale"' }, 409],
    ["missing ETag", { "If-Match": "" }, 428], ["invalid origin", { Origin: "http://wrong.invalid" }, 403],
  ]) {
    await reset(); assert.equal((await send(input(), headers)).status, expected); assert.equal((await stats()).patchAttempts, 0);
    record({ scenario, status: "PASS", expectedHttpStatus: expected });
  }
  await reset({ state: "APROVADO" }); assert.equal((await send(input())).status, 409); assert.equal((await stats()).patchAttempts, 0);
  record({ scenario: "closed state", status: "PASS" });
  await reset({ mode: "after" }); const lost = input();
  assert.equal((await send(lost)).status, 503);
  const recovered = await send({ operationId: lost.operationId }, {}, "POST"); assert.equal(recovered.status, 200);
  assert.equal((await send(lost)).status, 200); assert.equal((await stats()).patchAttempts, 1);
  record({ scenario: "lost simulated Graph acknowledgement and reconcile over Next HTTP", status: "PASS", patchAttempts: 1 });
  await reset(); const same = input();
  const duplicateResults = await Promise.all(Array.from({ length: 12 }, () => send(same)));
  assert.ok(duplicateResults.some(r => r.status === 200)); assert.ok(duplicateResults.every(r => [200, 503].includes(r.status)));
  assert.equal((await stats()).patchAttempts, 1);
  record({ scenario: "12 concurrent same UUID through Next", status: "PASS", patchAttempts: 1, statuses: duplicateResults.map(r => r.status) });
  await reset();
  const applicants = await Promise.all(Array.from({ length: 12 }, () => send(input(), { "x-fixture-oid": randomUUID() })));
  assert.equal(applicants.filter(r => r.status === 200).length, 1); assert.equal((await stats()).version, '"v2"');
  record({ scenario: "12 concurrent owners through Next: one committed correction", status: "PASS", statuses: applicants.map(r => r.status) });
  for (const target of ["acquire", "release"]) for (const mode of ["before", "after"]) {
    await reset(); const operation = input();
    await control({ action: "fault", target, mode });
    assert.equal((await send(operation)).status, 503);
    await control({ action: "resume" });
    assert.equal((await stats()).patchAttempts, target === "acquire" ? 0 : 1);
    const replay = await send({ operationId: operation.operationId }, {}, "POST");
    assert.equal(replay.status, target === "acquire" ? 503 : 200);
    assert.equal((await stats()).patchAttempts, target === "acquire" ? 0 : 1);
    record({ scenario: `Next TCP loss ${mode} ${target}`, status: "PASS", reconcileHttpStatus: replay.status });
  }
  return results;
}
