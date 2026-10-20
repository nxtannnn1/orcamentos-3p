import { test } from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { RELEASE_CORRECTION_LOCK as CAS } from "./commands.mjs";

const enabled = process.env.THREEP_RESILIENCE === "1";
const endpoint = process.env.SECURITY_REDIS_REST_URL;
const token = process.env.SECURITY_REDIS_REST_TOKEN;
const post = async (body, path = "/", auth = token) => {
  const response = await fetch(new URL(path, endpoint), { method: "POST", headers: auth ? { Authorization: `Bearer ${auth}` } : {}, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json() };
};
const control = async body => (await post(body, "/__control")).body;
async function ready() {
  const end = Date.now() + 10000;
  while (Date.now() < end) { if ((await control({ action: "status" })).ready) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error("Fixture did not recover");
}
function docker(action) {
  assert.match(process.env.THREEP_DISPOSABLE_REDIS ?? "", /^3p-resilience-[a-f0-9-]+-redis$/);
  const inspect = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "3p.resilience"}}', process.env.THREEP_DISPOSABLE_REDIS], { timeout: 10000, encoding: "utf8" });
  assert.equal(inspect.status, 0);
  assert.equal(inspect.stdout.trim(), "disposable");
  const result = spawnSync("docker", [action, process.env.THREEP_DISPOSABLE_REDIS], { timeout: 10000, encoding: "utf8" });
  assert.equal(result.status, 0);
}

test("HTTPS: invalid certificate, wrong hostname, missing/invalid bearer and allowlist", { skip: !enabled }, async () => {
  const tlsError = options => new Promise(resolve => {
    const req = https.request(endpoint, options, res => { res.resume(); resolve("UNEXPECTED_SUCCESS"); });
    req.on("error", error => resolve(error.code)); req.end();
  });
  assert.equal(await tlsError({ ca: [] }), "DEPTH_ZERO_SELF_SIGNED_CERT");
  assert.equal(await tlsError({ ca: readFileSync(process.env.THREEP_TEST_TLS_CERT), servername: "wrong.fixture.invalid" }), "ERR_TLS_CERT_ALTNAME_INVALID");
  assert.equal((await post(["GET", "3p:test:fixture"], "/", "")).status, 401);
  assert.equal((await post(["GET", "3p:test:fixture"], "/", "wrong")).status, 401);
  const before = (await control({ action: "status" })).calls;
  for (const args of [["FLUSHALL"], ["FLUSHDB"], ["EVAL", "return 1", 1, "3p:test:x", 1], ["DEL", "3p:audit:fixture"]]) assert.equal((await post(args)).status, 400);
  assert.equal((await control({ action: "status" })).calls, before);
});

test("real TCP disconnect: node-redis reconnects and preserves a nonexpiring lock", { skip: !enabled }, async () => {
  const key = `3p:correction:${"b".repeat(64)}:item:1:pending`, owner = randomUUID();
  assert.equal((await post(["SET", key, owner, "NX"])).body.result, "OK");
  assert.equal((await control({ action: "inspect", key })).ttl, -1);
  assert.ok(await control({ action: "kill" }) >= 1);
  await ready();
  assert.equal((await post(["GET", key])).body.result, owner);
  const status = await control({ action: "status" });
  assert.ok(status.events.some(event => event.layer === "client" && event.event === "reconnecting"));
  const results = await Promise.all(Array.from({ length: 32 }, () => post(["EVAL", CAS, 1, key, randomUUID()])));
  assert.ok(results.every(result => result.body.result === 0));
  assert.equal((await post(["EVAL", CAS, 1, key, owner])).body.result, 1);
});

test("real Redis unavailability: timeout is uncertain; no automatic mutation retry", { skip: !enabled }, async () => {
  const key = `3p:redis-test:${randomUUID()}:counter`;
  const before = (await control({ action: "status" })).calls;
  docker("pause");
  try {
    const result = await post(["INCR", key]);
    assert.equal(result.status, 503);
  } finally { docker("unpause"); }
  await ready();
  assert.equal((await post(["GET", key])).body.result, "1");
  const status = await control({ action: "status" });
  assert.equal(status.calls - before, 2); // one mutation and the explicit read
  assert.ok(status.events.some(event => event.reason === "command_timeout"));
  console.log("SANITIZED_GATEWAY_DIAGNOSTICS", JSON.stringify(status.events));
});

test("lost HTTP response after Redis mutation is not retried by the client", { skip: !enabled }, async () => {
  const key = `3p:redis-test:${randomUUID()}:lost-response`;
  const before = (await control({ action: "status" })).calls;
  await control({ action: "drop-response" });
  await assert.rejects(post(["INCR", key]));
  assert.equal((await control({ action: "status" })).calls - before, 1);
  assert.equal((await post(["GET", key])).body.result, "1");
});

for (const target of ["acquire", "release"]) for (const mode of ["before", "after"]) {
  test(`real TCP loss ${mode} ${target}: acknowledgement uncertainty is not replayed`, { skip: !enabled }, async () => {
    const key = `3p:correction:${randomUUID().replaceAll("-", "").repeat(2)}:item:1:pending`, owner = randomUUID();
    if (target === "release") assert.equal((await post(["SET", key, owner, "NX"])).body.result, "OK");
    const before = (await control({ action: "status" })).calls;
    await control({ action: "fault", target, mode });
    const command = target === "acquire" ? ["SET", key, owner, "NX"] : ["EVAL", CAS, 1, key, owner];
    assert.equal((await post(command)).status, 503);
    assert.equal((await post(["GET", key])).status, 503);
    await control({ action: "resume" }); await ready();
    const expected = target === "acquire" ? (mode === "after" ? owner : null) : (mode === "before" ? owner : null);
    const state = await control({ action: "inspect", key });
    assert.equal(state.value, expected);
    assert.equal((await control({ action: "status" })).calls - before, 1);
    if (expected) {
      assert.equal(state.ttl, -1);
      assert.equal((await post(["SET", key, randomUUID(), "NX"])).body.result, null);
      assert.equal((await post(["EVAL", CAS, 1, key, owner])).body.result, 1);
    }
  });
}
