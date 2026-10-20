// Run the EXISTING smoke from Windows against the published HTTPS loopback port.
// Runtime token stays in this process memory; no secret files or command arguments.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function docker(args) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error("Lab runtime inspection failed");
  return result.stdout;
}

try {
  if (process.platform !== "win32") throw new Error("Windows host required");
  const gateway = JSON.parse(docker(["inspect", "3p-redis-lab-gateway-1"]))[0];
  const caddy = JSON.parse(docker(["inspect", "3p-redis-lab-caddy-1"]))[0];
  for (const [info, service] of [[gateway, "gateway"], [caddy, "caddy"]]) {
    if (!info.State.Running || info.Config.Labels["com.docker.compose.project"] !== "3p-redis-lab" ||
        info.Config.Labels["com.docker.compose.service"] !== service) throw new Error("Unexpected lab identity");
  }
  const binding = caddy.NetworkSettings.Ports["443/tcp"];
  if (binding?.length !== 1 || binding[0].HostIp !== "127.0.0.1" || binding[0].HostPort !== "18443") {
    throw new Error("Unexpected HTTPS publication");
  }
  const token = gateway.Config.Env.find(value => value.startsWith("GATEWAY_BEARER_TOKEN="))?.slice("GATEWAY_BEARER_TOKEN=".length);
  if (!token || token.length < 32) throw new Error("Runtime token missing");
  const ca = docker(["exec", "3p-redis-lab-caddy-1", "cat", "/data/caddy/pki/authorities/local/root.crt"]);
  if (!ca.includes("BEGIN CERTIFICATE")) throw new Error("Lab CA missing");
  const data = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
  const commands = data(readFileSync(new URL("./commands.mjs", import.meta.url), "utf8"));
  const smoke = readFileSync(new URL("../redis-gateway-smoke.mjs", import.meta.url), "utf8")
    .replace('"./gateway/commands.mjs"', JSON.stringify(commands))
    .replace("readFileSync(process.env.THREEP_REDIS_CA_FILE)", JSON.stringify(ca));
  process.env.SECURITY_REDIS_REST_URL = "https://localhost:18443/";
  process.env.SECURITY_REDIS_REST_TOKEN = token;
  process.env.THREEP_REDIS_CA_FILE = "runtime-public-ca";
  delete process.env.THREEP_REDIS_GATEWAY_ENV_FILE;
  delete process.env.THREEP_REDIS_DOCKER_TEST;
  const phase = process.argv[2];
  if (phase) {
    if (!["write", "read", "cleanup"].includes(phase) ||
        !/^3p:redis-test:[0-9a-f-]{36}:persistence$/.test(process.env.THREEP_PERSISTENCE_TEST_KEY ?? "")) {
      throw new Error("An exact synthetic R2 marker is required");
    }
  } else { delete process.env.THREEP_PERSISTENCE_TEST_KEY; }
  await import(data(smoke));
} catch {
  // Never print inspected environment or external errors.
  console.log(JSON.stringify({ status: "FAIL", results: [{ name: "Windows-loopback-preflight", status: "FAIL" }] }));
  process.exitCode = 1;
} finally {
  delete process.env.SECURITY_REDIS_REST_TOKEN;
}
