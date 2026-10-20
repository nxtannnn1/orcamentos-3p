// Opt-in persistence drill. No shared volume/network is ever mounted or modified.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import { validCommand, RELEASE_CORRECTION_LOCK as CAS } from "./gateway/commands.mjs";

if (!process.argv[2]) throw new Error("Supply a dedicated evidence directory");
const evidence = path.resolve(process.argv[2]); mkdirSync(evidence, { recursive: true });
const prefix = `3p-operational-${randomUUID()}`;
const containers = new Set(), volumes = new Set(), rows = [], actions = [];
let image, initial = [], final = [], backupHash;
function docker(args, tolerate = false) {
  const start = performance.now();
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 30000, maxBuffer: 4e6 });
  actions.push({ action: args[0], status: result.status, elapsedMs: Math.round(performance.now() - start), error: result.error?.code });
  if (result.status !== 0) actions.at(-1).readOnlyFilesystemError = /read.only file system/i.test((result.stdout ?? "") + (result.stderr ?? ""));
  if (result.status !== 0 && !tolerate) throw new Error(`Isolated Docker ${args[0]} failed`);
  return { status: result.status, output: result.stdout?.trim() ?? "" };
}
const inspect = name => JSON.parse(docker(["inspect", name]).output)[0];
function snapshot() {
  const ids = docker(["ps", "-q"]).output.split(/\s+/).filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse(docker(["inspect", ...ids]).output).map(x => ({ id: x.Id, image: x.Image, startedAt: x.State.StartedAt }));
}
function check(name, action) {
  const start = performance.now();
  try { action(); rows.push({ name, status: "PASS", elapsedMs: Math.round(performance.now() - start) }); }
  catch (error) { rows.push({ name, status: "FAIL", elapsedMs: Math.round(performance.now() - start) }); throw error; }
  console.log(`${name}: PASS`);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(name) {
  for (let i = 0; i < 40; i++) {
    const result = docker(["exec", name, "redis-cli", "--raw", "PING"], true);
    if (result.status === 0 && result.output === "PONG") return;
    if (!inspect(name).State.Running) throw new Error("Disposable Redis exited during loading");
    await sleep(200);
  }
  throw new Error("Disposable Redis readiness timeout");
}
function ownContainer(name) {
  assert.ok(containers.has(name));
  assert.equal(inspect(name).Config.Labels["3p.operational"], prefix);
}
function mutateContainer(action, name, ...extra) { ownContainer(name); return docker([action, ...extra, name]); }
const redis = (name, args) => {
  // redis-cli prints INFO as text even with --json in this Redis image.
  if (args[0] === "INFO") return docker(["exec", name, "redis-cli", "--raw", ...args.map(String)]).output;
  return JSON.parse(docker(["exec", name, "redis-cli", "--json", ...args.map(String)]).output);
};
function gatewayContract(name, args) { assert.ok(validCommand(args)); return redis(name, args); }
function volume(suffix) {
  const name = `${prefix}-${suffix}`;
  docker(["volume", "create", "--label", `3p.operational=${prefix}`, name]); volumes.add(name); return name;
}
function start(suffix, data, strict = false) {
  assert.ok(volumes.has(data));
  const name = `${prefix}-${suffix}`;
  docker(["create", "--name", name, "--label", `3p.operational=${prefix}`, "--network", "none", "--memory", "128m", "--cpus", "0.5", "--mount", `type=volume,src=${data},dst=/data`, image,
    "redis-server", "--appendonly", "yes", "--appendfsync", "always", "--maxmemory-policy", "noeviction", "--maxmemory", "64mb", "--protected-mode", "no", ...(strict ? ["--aof-load-truncated", "no"] : [])]);
  containers.add(name); mutateContainer("start", name); return name;
}
function helper(mounts, script) {
  for (const [name] of mounts) assert.ok(volumes.has(name));
  return docker(["run", "--rm", "--network", "none", "--label", `3p.operational=${prefix}`, ...mounts.flatMap(([name, destination, ro]) => ["--mount", `type=volume,src=${name},dst=${destination}${ro ? ",readonly" : ""}`]), image, "sh", "-c", script]);
}
const scope = createHash("sha256").update(randomUUID()).digest("hex"), owner = randomUUID(), settledOwner = randomUUID();
const lock = `3p:correction:${scope}:item:1:pending`, settled = `3p:correction:${scope}:item:2:pending`;
const lateLock = `3p:correction:${scope}:item:3:pending`, tail = `3p:redis-test:${scope}:tail`;
const values = new Map([
  [lock, owner], [`3p:correction:${scope}:item:1:original`, '{"synthetic":true,"original":"preserve"}'],
  [`3p:correction:${scope}:operation:${owner}:intent`, '{"synthetic":true,"stage":"intent"}'],
  [`3p:correction:${scope}:operation:${owner}:outcome`, '{"synthetic":true,"outcome":"unconfirmed"}'],
  [`3p:correction:${scope}:operation:${settledOwner}:intent`, '{"synthetic":true,"stage":"intent"}'],
  [`3p:correction:${scope}:operation:${settledOwner}:reconciled`, '{"synthetic":true,"outcome":"confirmed"}'],
  [`3p:audit:${scope}:intent`, '{"synthetic":true,"audit":"append-only"}'], [tail, "acknowledged-synthetic-tail"],
]);
function exact(name) {
  for (const [key, value] of values) { assert.equal(redis(name, ["GET", key]), value); assert.equal(redis(name, ["TTL", key]), -1); }
  assert.equal(redis(name, ["GET", settled]), null);
}
const truncateTail = 'file=$(awk \'$NF=="i" {print $2}\' /data/appendonlydir/appendonly.aof.manifest | tail -n 1); case "$file" in appendonly.aof.*.incr.aof) ;; *) exit 1;; esac; size=$(wc -c < "/data/appendonlydir/$file"); test "$size" -gt 5; truncate -s "$((size - 5))" "/data/appendonlydir/$file"';
try {
  initial = snapshot();
  // Read immutable image identity only. No command is executed in shared Redis.
  const reference = inspect("3p-redis-lab-redis-1");
  assert.equal(reference.Config.Labels["com.docker.compose.project"], "3p-redis-lab"); image = reference.Image;
  const data = volume("data"), backup = volume("backup"), restoredData = volume("restored"), emptyData = volume("empty"), invalidData = volume("invalid"), truncatedData = volume("truncated"), strictData = volume("strict");
  const source = start("source", data); await ready(source);
  check("exclusive-volumes-no-network-no-published-ports", () => {
    const info = inspect(source);
    assert.equal(info.HostConfig.NetworkMode, "none"); assert.ok(Object.values(info.NetworkSettings.Ports ?? {}).every(value => value === null || value.length === 0));
    assert.equal(info.Mounts.length, 1); assert.equal(info.Mounts[0].Name, data);
  });
  check("AOF-always-noeviction-runtime", () => {
    const config = redis(source, ["CONFIG", "GET", "appendonly", "appendfsync", "maxmemory-policy", "aof-load-truncated"]);
    assert.equal(config.appendonly, "yes"); assert.equal(config.appendfsync, "always"); assert.equal(config["maxmemory-policy"], "noeviction"); assert.equal(config["aof-load-truncated"], "yes");
  });
  check("synthetic-lock-and-evidence-append-only", () => {
    for (const [key, value] of values) assert.equal(gatewayContract(source, ["SET", key, value, "NX"]), "OK");
    assert.equal(gatewayContract(source, ["SET", settled, settledOwner, "NX"]), "OK");
    assert.equal(gatewayContract(source, ["EVAL", CAS, 1, settled, settledOwner]), 1);
    exact(source);
  });
  mutateContainer("restart", source); await ready(source);
  check("graceful-restart-lock-and-evidence-byte-exact", () => exact(source));
  mutateContainer("kill", source, "--signal", "KILL"); mutateContainer("start", source); await ready(source);
  check("SIGKILL-recovery-lock-and-evidence-byte-exact", () => exact(source));
  const startedRewrite = redis(source, ["BGREWRITEAOF"]); assert.ok(typeof startedRewrite === "string");
  for (let attempt = 0; attempt < 50; attempt++) {
    const info = redis(source, ["INFO", "persistence"]);
    if (info.includes("aof_rewrite_in_progress:0") && info.includes("aof_last_bgrewrite_status:ok")) break;
    if (attempt === 49) throw new Error("Disposable AOF rewrite timeout");
    await sleep(200);
  }
  check("multipart-AOF-rewrite-preserves-state", () => exact(source));
  const expiring = `3p:redis-test:${scope}:session`;
  assert.equal(gatewayContract(source, ["SET", expiring, "synthetic-session", "EX", 1, "NX"]), "OK");
  await sleep(1200);
  check("session-expiry-does-not-expire-correction-lock", () => { assert.equal(redis(source, ["GET", expiring]), null); assert.equal(redis(source, ["TTL", lock]), -1); });
  // Ensure a known acknowledged SET is the final incremental AOF command.
  assert.equal(redis(source, ["DEL", tail]), 1);
  assert.equal(gatewayContract(source, ["SET", tail, values.get(tail), "NX"]), "OK");
  mutateContainer("stop", source);
  check("offline-backup-complete-data-directory", () => {
    const result = helper([[data, "/source", true], [backup, "/backup"]], "cd /source && tar cf /backup/redis-data.tar . && sha256sum /backup/redis-data.tar");
    backupHash = result.output.split(/\s+/)[0]; assert.match(backupHash, /^[a-f0-9]{64}$/);
  });
  mutateContainer("rm", source); containers.delete(source);
  const replacement = start("replacement", data); await ready(replacement);
  check("replacement-container-same-named-volume", () => exact(replacement));
  assert.equal(gatewayContract(replacement, ["SET", lateLock, randomUUID(), "NX"]), "OK");
  mutateContainer("stop", replacement);
  for (const target of [restoredData, invalidData, truncatedData, strictData]) {
    helper([[backup, "/backup", true], [target, "/data"]], "cd /data && tar xf /backup/redis-data.tar");
  }
  check("restored-multipart-manifest-validated-without-repair", () => {
    // The checker opens files for update even without --fix. Use only the new
    // disposable restore volume and prove that validation changed no file bytes.
    helper([[restoredData, "/data"]], 'before=$(find /data/appendonlydir -type f -exec sha256sum {} \\; | sort | sha256sum); redis-check-aof /data/appendonlydir/appendonly.aof.manifest && after=$(find /data/appendonlydir -type f -exec sha256sum {} \\; | sort | sha256sum) && test "$before" = "$after"');
  });
  const restored = start("restored", restoredData); await ready(restored);
  check("backup-restore-byte-exact-pending-and-settled-operations", () => exact(restored));
  check("backup-staleness-is-not-detected-by-PING", () => { assert.equal(redis(restored, ["PING"]), "PONG"); assert.equal(redis(restored, ["GET", lateLock]), null); });
  check("restored-audit-NX-and-owner-comparison", () => {
    const audit = `3p:audit:${scope}:intent`;
    assert.equal(gatewayContract(restored, ["SET", audit, "overwrite", "NX"]), null);
    assert.equal(gatewayContract(restored, ["EVAL", CAS, 1, lock, randomUUID()]), 0);
    assert.equal(gatewayContract(restored, ["GET", lock]), owner);
  });
  const empty = start("empty", emptyData); await ready(empty);
  check("data-loss-empty-volume-can-be-healthy-without-evidence", () => {
    assert.equal(redis(empty, ["PING"]), "PONG"); assert.equal(redis(empty, ["GET", lock]), null);
    assert.equal(redis(empty, ["GET", `3p:audit:${scope}:intent`]), null);
    assert.equal(gatewayContract(empty, ["SET", lock, randomUUID(), "NX"]), "OK");
    assert.equal(gatewayContract(empty, ["EVAL", CAS, 1, lock, owner]), 0);
  });
  helper([[invalidData, "/data"]], "printf 'invalid-manifest\\n' > /data/appendonlydir/appendonly.aof.manifest");
  const invalid = start("invalid", invalidData);
  for (let i = 0; i < 30 && inspect(invalid).State.Running; i++) await sleep(100);
  check("invalid-AOF-manifest-refuses-startup-no-auto-repair", () => { const state = inspect(invalid).State; assert.equal(state.Running, false); assert.notEqual(state.ExitCode, 0); });
  helper([[truncatedData, "/data"]], truncateTail);
  const truncated = start("truncated", truncatedData); await ready(truncated);
  check("default-load-truncated-can-lose-acknowledged-tail-while-healthy", () => { assert.equal(redis(truncated, ["PING"]), "PONG"); assert.equal(redis(truncated, ["GET", tail]), null); assert.equal(redis(truncated, ["GET", lock]), owner); });
  helper([[strictData, "/data"]], truncateTail);
  const strict = start("strict", strictData, true);
  for (let i = 0; i < 30 && inspect(strict).State.Running; i++) await sleep(100);
  check("strict-load-truncated-no-refuses-the-same-damage", () => { const state = inspect(strict).State; assert.equal(state.Running, false); assert.notEqual(state.ExitCode, 0); });
} catch (error) {
  rows.push({ name: "operational-drill-execution", status: "FAIL", errorKind: error instanceof SyntaxError ? "response_parse" : error instanceof assert.AssertionError ? "assertion" : "execution" });
} finally {
  for (const name of [...containers].reverse()) {
    try { ownContainer(name); docker(["rm", "-f", name]); containers.delete(name); } catch { rows.push({ name: "disposable-container-cleanup", status: "FAIL" }); }
  }
  for (const name of [...volumes].reverse()) {
    try {
      const label = docker(["volume", "inspect", "--format", '{{index .Labels "3p.operational"}}', name]).output;
      assert.equal(label, prefix); docker(["volume", "rm", name]); volumes.delete(name);
    } catch { rows.push({ name: "disposable-volume-cleanup", status: "FAIL" }); }
  }
  try { final = snapshot(); } catch { rows.push({ name: "final-inventory", status: "FAIL" }); }
  const preserved = initial.every(info => final.some(current => JSON.stringify(info) === JSON.stringify(current)));
  rows.push({ name: "shared-containers-identity-image-startedAt-preserved", status: preserved ? "PASS" : "FAIL" });
  writeFileSync(path.join(evidence, "persistence-report.json"), JSON.stringify({ scope: "synthetic-disposable-only", image, backupSha256: backupHash, initialContainers: initial, finalContainers: final, sharedContainersPreserved: preserved, remainingOwnContainers: containers.size, remainingOwnVolumes: volumes.size, results: rows, actions,
    limitations: ["No host/disk loss or definitive storage exercised", "Synthetic records validate Redis bytes, not the full correction domain schema", "No shared container or volume was restarted/restored", "Healthy data-loss and tail-truncation cases are intentionally reproduced risks, not readiness approvals"] }, null, 2));
}
process.exitCode = rows.some(row => row.status === "FAIL") ? 1 : 0;
