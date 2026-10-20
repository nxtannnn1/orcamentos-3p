// Local-only opt-in runner. Creates its own Redis, network and fixture gateway.
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, unlinkSync, rmdirSync, cpSync, symlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { prepareRuntimeSnapshot, runtimeSmoke } from "./runtime-snapshot.mjs";

const lab = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(lab, "../../.."), web = path.join(repo, "system/apps/operator-web");
const evidence = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Supply a dedicated evidence directory");
mkdirSync(evidence, { recursive: true });
const name = `3p-resilience-${randomUUID()}`, redis = `${name}-redis`, gateway = `${name}-gateway`;
const fixture = path.resolve(evidence, name);
if (path.dirname(fixture) !== evidence) throw new Error("Unexpected fixture path");
mkdirSync(fixture);
const token = `fictitious-${randomUUID()}`;
const timings = [], results = [];
function docker(args, tolerate = false) {
  const start = performance.now();
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 30000, maxBuffer: 4e6 });
  timings.push({ action: args[0], elapsedMs: Math.round(performance.now() - start), status: result.status, error: result.error?.code });
  if (result.status !== 0 && !tolerate) throw new Error(`Docker ${args[0]} failed (${result.error?.code ?? result.status})`);
  return result.stdout?.trim();
}
function snapshot() {
  const ids = docker(["ps", "-q"]).split(/\s+/).filter(Boolean);
  const format = '{"id":{{json .Id}},"name":{{json .Name}},"startedAt":{{json .State.StartedAt}},"image":{{json .Image}}}';
  return ids.length ? docker(["inspect", "--format", format, ...ids]).split("\n").map(line => JSON.parse(line)) : [];
}
async function child(label, args, extra = {}, cwd = web) {
  const started = performance.now();
  const proc = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env, ...extra }, windowsHide: true });
  let stdout = "", stderr = "";
  proc.stdout.on("data", chunk => stdout += chunk);
  proc.stderr.on("data", chunk => stderr += chunk);
  const code = await new Promise(resolve => { proc.once("error", () => resolve(-1)); proc.once("close", resolve); });
  writeFileSync(path.join(evidence, `${label}.log`), stdout + stderr);
  results.push({ label, code, elapsedMs: Math.round(performance.now() - started) });
  console.log(JSON.stringify(results.at(-1)));
  return code;
}
let env = {}, initial = [], final = [];
let createdNetwork = false, createdEdge = false, createdRedis = false, createdGateway = false;
try {
  initial = snapshot();
  const certResult = spawnSync("C:/Program Files/Git/usr/bin/openssl.exe", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(fixture, "cert.key"), "-out", path.join(fixture, "cert.crt"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { timeout: 15000, windowsHide: true });
  if (certResult.status !== 0) throw new Error("Fixture certificate generation failed");
  docker(["network", "create", "--internal", "--label", "3p.resilience=disposable", name]);
  createdNetwork = true;
  docker(["network", "create", "--label", "3p.resilience=disposable", `${name}-edge`]);
  createdEdge = true;
  docker(["run", "-d", "--name", redis, "--label", "3p.resilience=disposable", "--network", name, "--network-alias", "redis", "redis:7.4-alpine", "redis-server", "--save", "", "--appendonly", "no"]);
  createdRedis = true;
  docker(["create", "--name", gateway, "--label", "3p.resilience=disposable", "--network", `${name}-edge`, "-p", "127.0.0.1::8443", "-v", `${path.join(lab, "gateway")}:/candidate:ro`, "-v", `${fixture}:/fixture:ro`, "-e", `FIXTURE_TOKEN=${token}`, "--entrypoint", "node", "3p-redis-lab-gateway:r1-20261019", "/candidate/resilience-fixture.mjs"]);
  createdGateway = true;
  docker(["network", "connect", name, gateway]);
  docker(["start", gateway]);
  const ports = JSON.parse(docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", gateway]));
  writeFileSync(path.join(evidence, "fixture-ports.json"), JSON.stringify(ports));
  const binding = ports["8443/tcp"];
  if (binding?.length !== 1 || binding[0].HostIp !== "127.0.0.1") throw new Error("Unexpected fixture publication");
  env = { THREEP_RESILIENCE: "1", THREEP_DISPOSABLE_REDIS: redis, SECURITY_REDIS_REST_URL: `https://localhost:${binding[0].HostPort}/`, SECURITY_REDIS_REST_TOKEN: token, THREEP_TEST_TLS_CERT: path.join(fixture, "cert.crt"), THREEP_TEST_TLS_KEY: path.join(fixture, "cert.key"), NODE_EXTRA_CA_CERTS: path.join(fixture, "cert.crt"), THREEP_RESILIENCE_EVIDENCE: evidence };
  // Process-only readiness check with certificate validation, never an insecure probe.
  const probe = "const r=await fetch(process.env.SECURITY_REDIS_REST_URL,{method:'POST',headers:{Authorization:'Bearer '+process.env.SECURITY_REDIS_REST_TOKEN},body:JSON.stringify(['GET','3p:redis-test:readiness'])}); if(r.status!==200)process.exit(1);";
  let available = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe], { env: { ...process.env, ...env }, timeout: 3000, windowsHide: true });
    if (r.status === 0) { available = true; break; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!available) throw new Error("Isolated gateway not ready");
  if (process.env.THREEP_NEXT_ONLY !== "1") {
  await child("tcp-https", ["--test", path.join(lab, "gateway/resilience.test.mjs")]);
  const vitest = path.join(web, "node_modules/vitest/vitest.mjs");
  const testFile = "src/server/security/redis-resilience-http.integration.test.ts";
  await child("http-and-diagnostic-serial", [vitest, "run", testFile, "--reporter=verbose"]);
  // Reproduce original competing workload; no source changes or service restarts.
  // Optional copy avoids OneDrive reparse-point EPERM without touching ignored files.
  let buildCwd = web;
  const buildArgs = [path.join(web, "node_modules/next/dist/bin/next"), "build"];
  if (process.env.THREEP_BUILD_SNAPSHOT === "1") {
    buildCwd = path.join(evidence, "build-snapshot"); mkdirSync(buildCwd);
    for (const file of ["src", "public", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "next-env.d.ts"]) {
      if (existsSync(path.join(web, file))) cpSync(path.join(web, file), path.join(buildCwd, file), { recursive: true });
    }
    symlinkSync(path.join(web, "node_modules"), path.join(buildCwd, "node_modules"), "junction");
    buildArgs.push("--webpack");
  }
  await Promise.all([
    child("build-concurrent", buildArgs, {}, buildCwd),
    child("diagnostic-concurrent", [vitest, "run", testFile, "--reporter=verbose"], { THREEP_DIAG_ONLY: "1", THREEP_DIAG_PHASE: "concurrent-build" }),
  ]);
  }
  if (process.env.THREEP_NEXT_RUNTIME === "1") {
    const runtimeDir = path.resolve(process.env.THREEP_NEXT_REUSE_SNAPSHOT ?? path.join(evidence, "next-runtime-snapshot"));
    if (process.env.THREEP_NEXT_REUSE_SNAPSHOT) {
      const relative = path.relative(path.dirname(evidence), runtimeDir);
      if (relative.startsWith("..") || path.basename(runtimeDir) !== "next-runtime-snapshot" || !existsSync(path.join(runtimeDir, ".next/BUILD_ID")) || !existsSync(path.join(runtimeDir, "src/server/sharepoint/__test-support__/resilience-runtime-fixture.ts"))) throw new Error("Unexpected reusable fixture snapshot");
      results.push({ label: "next-runtime-build-reused", code: 0 });
    } else {
      prepareRuntimeSnapshot(web, runtimeDir);
      const buildCode = await child("next-runtime-build", [path.join(web, "node_modules/next/dist/bin/next"), "build", "--webpack"], {}, runtimeDir);
      if (buildCode !== 0) throw new Error("Disposable Next runtime build failed");
    }
    const reservation = net.createServer();
    await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const runtime = spawn(process.execPath, [path.join(web, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
      cwd: runtimeDir, env: { ...process.env, ...env, DATA_SOURCE: "sharepoint", AUTH_APP_ORIGIN: origin, THREEP_RESILIENCE_RUNTIME: "1" }, windowsHide: true,
    });
    let runtimeLog = "";
    runtime.stdout.on("data", data => runtimeLog += data); runtime.stderr.on("data", data => runtimeLog += data);
    try {
      let available = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          const response = await fetch(`${origin}/api/resilience-fixture`, { method: "POST", headers: { Authorization: "Bearer fictitious-control" }, body: "{}", signal: AbortSignal.timeout(1000) });
          if (response.status === 200) { await response.json(); available = true; break; }
        } catch { /* bounded startup only; no mutation retries */ }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (!available) throw new Error("Disposable Next fixture control endpoint unavailable");
      const scenarios = await runtimeSmoke(origin, env.SECURITY_REDIS_REST_URL, token, env.THREEP_TEST_TLS_CERT, progress => writeFileSync(path.join(evidence, "next-runtime-scenarios.json"), JSON.stringify(progress, null, 2)));
      writeFileSync(path.join(evidence, "next-runtime-scenarios.json"), JSON.stringify(scenarios, null, 2));
      results.push({ label: "next-runtime-http", code: 0, scenarios: scenarios.length });
      console.log(JSON.stringify(results.at(-1)));
    } finally {
      runtime.kill();
      writeFileSync(path.join(evidence, "next-runtime.log"), runtimeLog);
    }
  }
  const collect = "const r=await fetch(new URL('/__control',process.env.SECURITY_REDIS_REST_URL),{method:'POST',headers:{Authorization:'Bearer '+process.env.SECURITY_REDIS_REST_TOKEN},body:JSON.stringify({action:'status'})});console.log(JSON.stringify(await r.json()));";
  const status = spawnSync(process.execPath, ["--input-type=module", "-e", collect], { encoding: "utf8", env: { ...process.env, ...env }, timeout: 5000 });
  writeFileSync(path.join(evidence, "gateway-diagnostics.json"), status.stdout || "{}");
} catch (error) {
  // Fixture code never logs request contents or environment.
  if (createdGateway) writeFileSync(path.join(evidence, "fixture-startup.log"), docker(["logs", gateway], true) || "");
  results.push({ label: "runner", code: 1, error: error.message });
  console.log(JSON.stringify(results.at(-1)));
} finally {
  // Only exact resources created above. No shared container is stopped/restarted.
  if (createdRedis) docker(["unpause", redis], true);
  if (createdGateway) docker(["rm", "-f", gateway], true);
  if (createdRedis) docker(["rm", "-f", redis], true);
  if (createdNetwork) docker(["network", "rm", name], true);
  if (createdEdge) docker(["network", "rm", `${name}-edge`], true);
  for (const file of ["cert.key", "cert.crt"]) { try { unlinkSync(path.join(fixture, file)); } catch {} }
  try { rmdirSync(fixture); } catch {}
  try { final = snapshot(); } catch {}
  writeFileSync(path.join(evidence, "run-summary.json"), JSON.stringify({ initialContainers: initial, finalContainers: final, sharedContainersPreserved: initial.every(info => final.some(current => JSON.stringify(info) === JSON.stringify(current))), results, dockerTimings: timings }, null, 2));
}
process.exitCode = results.some(result => result.code !== 0) ? 1 : 0;
