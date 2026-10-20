// HTTPS validation of the RUNNING gateway; never turns off certificate checks.
import https from "node:https";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { lookup } from "node:dns";
import { RELEASE_CORRECTION_LOCK as CAS } from "./gateway/commands.mjs";
const endpoint = new URL(process.env.SECURITY_REDIS_REST_URL || "https://localhost:18443/");
const hosts = process.env.THREEP_REDIS_DOCKER_TEST === "1" ? ["redis-lab-caddy"] : ["localhost", "127.0.0.1"];
if (endpoint.protocol !== "https:" || !hosts.includes(endpoint.hostname) ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/") throw new Error("Lab HTTPS loopback endpoint required");
let token = process.env.SECURITY_REDIS_REST_TOKEN;
if (process.env.THREEP_REDIS_GATEWAY_ENV_FILE) {
  const lines = readFileSync(process.env.THREEP_REDIS_GATEWAY_ENV_FILE, "utf8").split(/\r?\n/);
  const line = lines.find(line => /^GATEWAY_BEARER_TOKEN=/.test(line));
  token = line?.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
}
if (!token || token.length < 32 || !process.env.THREEP_REDIS_CA_FILE) throw new Error("Token source and CA file required");
const ca = readFileSync(process.env.THREEP_REDIS_CA_FILE);
export function request(command, credential = token) {
  return new Promise((resolve, reject) => {
    const req = https.request(endpoint, { method: "POST", ca, rejectUnauthorized: true,
      // Private-network DNS is caddy; preserve certificate SNI and HTTP hostname.
      lookup: process.env.THREEP_REDIS_DOCKER_TEST === "1" ? (_name, options, callback) => lookup("caddy", options, callback) : undefined,
      headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" },
    }, res => {
      let body = "";
      res.on("data", chunk => { body += chunk; if (body.length > 131072) req.destroy(); });
      res.on("end", () => { try { resolve({ status: res.statusCode, ...JSON.parse(body) }); } catch { reject(new Error("Invalid response")); } });
    });
    req.setTimeout(5000, () => req.destroy(new Error("Request timeout")));
    req.on("error", () => reject(new Error("TLS or gateway unavailable")));
    req.end(JSON.stringify(command));
  });
}
const results = [];
const check = (name, ok) => { results.push({ name, status: ok ? "PASS" : "FAIL" }); };
const phase = process.argv[2];
try {
  if (phase === "write" || phase === "read" || phase === "cleanup") {
    const key = process.env.THREEP_PERSISTENCE_TEST_KEY;
    if (!/^3p:redis-test:[0-9a-f-]{36}:persistence$/.test(key ?? "")) throw new Error("Isolated persistence key required");
    const command = phase === "write" ? ["SET", key, "persistence-fixture", "NX"] : [phase === "read" ? "GET" : "DEL", key];
    const result = await request(command);
    check(`persistence-${phase}`, result.status === 200 && (phase === "write" ? result.result === "OK" : phase === "read" ? result.result === "persistence-fixture" : result.result === 1));
  } else {
    const scope = createHash("sha256").update(randomUUID()).digest("hex");
    const owner = randomUUID(), other = randomUUID();
    const lock = `3p:correction:${scope}:item:1:pending`;
    const session = `3p:redis-test:${scope}:session`, audit = `3p:redis-test:${scope}:audit`;
    const cas = id => ["EVAL", CAS, 1, lock, id];
    let acquisitionAttempted = false;
    try {
      check("TLS-authenticated", (await request(["GET", session])).status === 200);
      check("invalid-token", (await request(["GET", session], "invalid")).status === 401);
      const preflight = await request(cas(owner));
      check("CAS-preflight-empty-key", preflight.status === 200 && preflight.result === 0);
      if (preflight.status !== 200 || preflight.result !== 0) throw new Error("CAS unavailable; no test locks created");
      acquisitionAttempted = true;
      check("SET-NX", (await request(["SET", lock, owner, "NX"])).result === "OK");
      check("already-locked", (await request(["SET", lock, other, "NX"])).result === null);
      check("wrong-owner", (await request(cas(other))).result === 0);
      check("owner-preserved", (await request(["GET", lock])).result === owner);
      check("correct-owner", (await request(cas(owner))).result === 1);
      check("idempotent-release", (await request(cas(owner))).result === 0);
      const winners = await Promise.all(Array.from({ length: 12 }, () => request(["SET", lock, other, "NX"])));
      check("concurrent-reacquisition", winners.filter(r => r.status === 200 && r.result === "OK").length === 1);
      check("stale-owner", (await request(cas(owner))).result === 0);
      check("replacement-owner", (await request(cas(other))).result === 1);
      check("session-write", (await request(["SET", session, "fictional-session", "EX", 1, "NX"])).result === "OK");
      check("session-read", (await request(["GET", session])).result === "fictional-session");
      await new Promise(resolve => setTimeout(resolve, 1200));
      check("session-expiry", (await request(["GET", session])).result === null);
      check("audit-NX", (await request(["SET", audit, "intent", "NX"])).result === "OK");
      check("audit-duplicate", (await request(["SET", audit, "overwrite", "NX"])).result === null);
      check("audit-original", (await request(["GET", audit])).result === "intent");
      for (const [name, command] of [["arbitrary-Lua", ["EVAL", "return 1", 1, lock, owner]],
        ["destructive-command", ["FLUSHDB"]], ["lock-DEL-bypass", ["DEL", lock]],
        ["invalid-UUID", cas("bad")], ["invalid-TTL", ["SET", session, "x", "EX", -1, "NX"]]])
        check(name, (await request(command)).status === 400);
    } finally {
      // CAS is safe even after ambiguous acquisition; generic test keys are exact.
      if (acquisitionAttempted) {
        check("cleanup-owner", (await request(cas(owner))).status === 200);
        check("cleanup-other-owner", (await request(cas(other))).status === 200);
      }
      check("cleanup-session", (await request(["DEL", session])).status === 200);
      check("cleanup-audit", (await request(["DEL", audit])).status === 200);
    }
  }
} catch (error) {
  check(error.message === "CAS unavailable; no test locks created" ? "running-code-missing-CAS" : "transport-or-configuration", false);
}
console.log(JSON.stringify({ results, status: results.some(r => r.status === "FAIL") ? "FAIL" : "PASS" }));
process.exitCode = results.some(r => r.status === "FAIL") ? 1 : 0;
