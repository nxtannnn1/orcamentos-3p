import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createHandler } from "./handler.mjs";
import { validCommand, RELEASE_CORRECTION_LOCK as CAS, RATE_LIMIT_SCRIPT } from "./commands.mjs";

const scope = createHash("sha256").update(randomUUID()).digest("hex");
const lock = `3p:correction:${scope}:item:1:pending`;
const owner = randomUUID();
const token = "fictitious-test-token-at-least-32-characters";
const cas = (id = owner) => ["EVAL", CAS, 1, lock, id];

test("Lua bytes match actual Operator Web contracts", () => {
  for (const [path, script] of [
    ["../../../apps/operator-web/src/server/security/scripts.ts", CAS],
    ["../../../apps/operator-web/src/server/security/store.ts", RATE_LIMIT_SCRIPT],
  ]) assert.ok(readFileSync(new URL(path, import.meta.url), "utf8").includes(JSON.stringify(script)));
});
test("allow exact CAS and all existing command shapes", () => {
  for (const command of [cas(), ["GET", lock], ["SET", lock, owner, "NX"],
    ["SET", "3p:test:session", "subject", "EX", 900, "NX"],
    ["SET", `3p:correction:${scope}:operation:${owner}:intent`, "{}", "NX"],
    ["INCR", "3p:test:user"], ["DEL", "3p:test:session"],
    ["EVAL", RATE_LIMIT_SCRIPT, 1, "3p:rate:test", 120]]) assert.ok(validCommand(command));
});
for (const [name, command] of [
  ["arbitrary Lua", ["EVAL", "return redis.call('FLUSHALL')", 1, lock, owner]],
  ["altered Lua", ["EVAL", CAS + " ", 1, lock, owner]],
  ["extra keys", ["EVAL", CAS, 2, lock, owner]],
  ["invalid UUID", cas("not-uuid")], ["UUID v1", cas("11111111-1111-1111-8111-111111111111")],
  ["foreign CAS namespace", ["EVAL", CAS, 1, "3p:test:session", owner]],
  ["raw lock deletion", ["DEL", lock]], ["evidence deletion", ["DEL", `3p:correction:${scope}:original`]],
  ["audit deletion", ["DEL", "3p:audit:test:intent"]],
  ["invalid operation key UUID", ["SET", `3p:correction:${scope}:operation:bad:intent`, "{}", "NX"]],
  ["expiring audit", ["SET", "3p:audit:test:intent", "{}", "EX", 60, "NX"]],
  ["lock INCR", ["INCR", lock]], ["lock rate Lua", ["EVAL", RATE_LIMIT_SCRIPT, 1, lock, 1]],
  ["bad lock owner", ["SET", lock, "bad", "NX"]],
  ["expiring correction lock", ["SET", lock, owner, "EX", 30, "NX"]],
  ["negative TTL", ["SET", "3p:test:s", "v", "EX", -1, "NX"]],
  ["fractional TTL", ["SET", "3p:test:s", "v", "EX", 1.5, "NX"]],
  ["string TTL", ["SET", "3p:test:s", "v", "EX", "30", "NX"]],
  ["unbounded TTL", ["SET", "3p:test:s", "v", "EX", 86401, "NX"]],
  ["overwrite", ["SET", lock, owner]], ["foreign key", ["GET", "other"]],
  ["control character", ["GET", "3p:test:\n"]], ["oversize key", ["GET", "3p:" + "x".repeat(512)]],
  ["FLUSHDB", ["FLUSHDB", "3p:test"]],
  ["audit EXPIRE", ["EXPIRE", "3p:audit:test:intent", 60]],
  ["lowercase bypass", ["eval", CAS, 1, lock, owner]],
  ["invalid rate TTL", ["EVAL", RATE_LIMIT_SCRIPT, 1, "3p:rate:test", 0]],
  ["FLUSHALL", ["FLUSHALL", "3p:test"]], ["CONFIG", ["CONFIG", "GET", "*"]],
  ["oversize value", ["SET", "3p:test", "x".repeat(60001), "NX"]],
]) test(`reject ${name}`, () => assert.equal(validCommand(command), false));

async function withServer(client, action, options) {
  const server = http.createServer(createHandler(client, token, options));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const request = async (command, auth = token, raw = false) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
      method: "POST", headers: { Authorization: `Bearer ${auth}` },
      body: raw ? command : JSON.stringify(command), signal: AbortSignal.timeout(3000),
    });
    return { status: response.status, ...(await response.json()) };
  };
  try { await action(request); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test("authentication, JSON, body limits and rejection never reach Redis", async () => {
  let calls = 0;
  await withServer({ isReady: true, sendCommand: async () => { calls++; return null; } }, async request => {
    assert.equal((await request(["GET", lock], "wrong")).status, 401);
    assert.equal((await request("{", token, true)).status, 400);
    assert.equal((await request("x".repeat(65537), token, true)).status, 413);
    assert.equal((await request(["FLUSHALL"])).status, 400);
    assert.equal(calls, 0);
  });
});
test("unavailability and recovery fail closed without queuing", async () => {
  const client = { isReady: false, sendCommand: async () => "OK" };
  await withServer(client, async request => {
    assert.equal((await request(["GET", lock])).status, 503);
    client.isReady = true;
    assert.equal((await request(["GET", lock])).result, "OK");
    client.sendCommand = async () => { throw new Error("secret must not leak"); };
    assert.deepEqual(await request(["GET", lock]), { status: 503, error: "Command unavailable" });
  });
});
test("bounded timeout does not retry uncertain mutation", async () => {
  let calls = 0;
  await withServer({ isReady: true, sendCommand: () => { calls++; return new Promise(() => {}); } }, async request => {
    const start = Date.now();
    assert.equal((await request(["SET", lock, owner, "NX"])).status, 503);
    assert.ok(Date.now() - start < 1000);
    assert.equal(calls, 1);
  }, { timeoutMs: 25 });
});

test("diagnostics distinguish timeout, command error and readiness without sensitive data", async () => {
  const events = [];
  const client = { isReady: false, sendCommand: async () => { throw new Error("sensitive external error"); } };
  await withServer(client, async request => {
    assert.equal((await request(["GET", lock])).status, 503);
    client.isReady = true;
    assert.equal((await request(["GET", lock])).status, 503);
    client.sendCommand = () => new Promise(() => {});
    assert.equal((await request(["GET", lock])).status, 503);
  }, { timeoutMs: 25, onDiagnostic: event => events.push(event) });
  assert.deepEqual(events.map(event => event.reason), ["redis_not_ready", "redis_command_error", "command_timeout"]);
  for (const event of events) {
    assert.deepEqual(Object.keys(event).sort(), ["elapsedMs", "reason", "status"]);
    assert.ok(Number.isSafeInteger(event.elapsedMs) && event.elapsedMs >= 0);
  }
  assert.ok(!JSON.stringify(events).includes(lock));
  assert.ok(!JSON.stringify(events).includes("sensitive"));
});

test("diagnostic observer errors cannot change a successful command", async () => {
  await withServer({ isReady: true, sendCommand: async () => "OK" }, async request => {
    assert.equal((await request(["GET", lock])).result, "OK");
  }, { onDiagnostic: () => { throw new Error("observer failure"); } });
});

test("REAL Redis: HTTP authentication, atomic CAS, NX, concurrency, TTL, audit and rate limit", { skip: process.env.REDIS_REAL !== "1" }, async () => {
  const { createClient } = await import("redis");
  const client = createClient({ url: "redis://redis:6379", disableOfflineQueue: true, socket: { connectTimeout: 2000 } });
  client.on("error", () => {});
  await client.connect();
  const session = `3p:redis-test:${scope}:session`;
  const audit = `3p:correction:${scope}:operation:${owner}:intent`;
  const rate = `3p:redis-test:${scope}:rate`;
  try {
    await withServer(client, async request => {
      assert.equal((await request(["GET", lock], "wrong")).status, 401);
      const contenders = await Promise.all(Array.from({ length: 16 }, () => request(["SET", lock, owner, "NX"])));
      assert.equal(contenders.filter(r => r.result === "OK").length, 1);
      assert.equal(await client.ttl(lock), -1); // Correction locks deliberately never expire.
      const mismatches = await Promise.all(Array.from({ length: 32 }, () => request(cas(randomUUID()))));
      assert.ok(mismatches.every(r => r.status === 200 && r.result === 0));
      assert.equal((await request(["GET", lock])).result, owner);
      assert.equal((await request(cas(randomUUID()))).result, 0);
      assert.equal((await request(["GET", lock])).result, owner);
      assert.equal((await request(["DEL", lock])).status, 400);
      const releases = await Promise.all(Array.from({ length: 16 }, () => request(cas())));
      assert.equal(releases.filter(r => r.result === 1).length, 1);
      assert.equal((await request(cas())).result, 0);
      const replacement = randomUUID();
      assert.equal((await request(["SET", lock, replacement, "NX"])).result, "OK");
      assert.equal((await request(cas())).result, 0);
      assert.equal((await request(cas(replacement))).result, 1);
      assert.equal((await request(["SET", session, "fictitious-user", "EX", 1, "NX"])).result, "OK");
      assert.equal((await request(["GET", session])).result, "fictitious-user");
      await new Promise(resolve => setTimeout(resolve, 1200));
      assert.equal((await request(["GET", session])).result, null);
      assert.equal((await request(["SET", audit, "{\"outcome\":\"unconfirmed\"}", "NX"])).result, "OK");
      assert.equal((await request(["SET", audit, "overwrite", "NX"])).result, null);
      assert.equal((await request(["GET", audit])).result, "{\"outcome\":\"unconfirmed\"}");
      assert.equal((await request(["EVAL", RATE_LIMIT_SCRIPT, 1, rate, 2])).result, 1);
      assert.equal((await request(["EVAL", RATE_LIMIT_SCRIPT, 1, rate, 2])).result, 2);
      assert.ok(await client.ttl(rate) > 0);
      const counts = await Promise.all(Array.from({ length: 32 }, () => request(["EVAL", RATE_LIMIT_SCRIPT, 1, rate, 2])));
      assert.deepEqual(counts.map(r => r.result).sort((a, b) => a - b), Array.from({ length: 32 }, (_, i) => i + 3));
      assert.ok(await client.ttl(rate) > 0);
    });
  } finally {
    // Only this run's exact random keys; no scans/flushes or pre-existing data.
    await client.del([lock, session, audit, rate]);
    await client.quit();
  }
});
