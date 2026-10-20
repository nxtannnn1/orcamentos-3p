// Uses the gateway's existing runtime token INSIDE its container. No credential
// export, inspect of environment, secret file or deployment is needed.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const container = "3p-redis-lab-gateway-1";
const info = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', container], { encoding: "utf8" });
if (info.status !== 0 || info.stdout.trim() !== "3p-redis-lab") { console.error("FAIL: unexpected lab identity"); process.exit(1); }
const caResult = spawnSync("docker", ["exec", "3p-redis-lab-caddy-1", "cat", "/data/caddy/pki/authorities/local/root.crt"], { encoding: "utf8" });
if (caResult.status !== 0 || !caResult.stdout.includes("BEGIN CERTIFICATE")) { console.error("FAIL: missing lab CA"); process.exit(1); }
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const commands = readFileSync(new URL("./commands.mjs", import.meta.url), "utf8");
const smoke = readFileSync(new URL("../redis-gateway-smoke.mjs", import.meta.url), "utf8")
  .replace('"./gateway/commands.mjs"', JSON.stringify(data(commands)))
  .replace('readFileSync(process.env.THREEP_REDIS_CA_FILE)', JSON.stringify(caResult.stdout));
const prelude = `process.env.SECURITY_REDIS_REST_URL="https://redis-lab-caddy/";
process.env.SECURITY_REDIS_REST_TOKEN=process.env.GATEWAY_BEARER_TOKEN;
delete process.env.THREEP_REDIS_GATEWAY_ENV_FILE;
process.env.THREEP_REDIS_CA_FILE="runtime-public-ca";
process.env.THREEP_REDIS_DOCKER_TEST="1";
process.env.THREEP_PERSISTENCE_TEST_KEY=${JSON.stringify(process.env.THREEP_PERSISTENCE_TEST_KEY ?? "")};
process.argv[2]=${JSON.stringify(process.argv[2] ?? "")};
await import(${JSON.stringify(data(smoke))});`;
const result = spawnSync("docker", ["exec", "-i", container, "node", "--input-type=module"],
  { input: prelude, encoding: "utf8", timeout: 60000, maxBuffer: 1024 * 1024 });
process.stdout.write(result.stdout ?? "");
if (result.status !== 0 && !result.stdout) console.error("FAIL: live smoke execution");
process.exit(result.status === 0 ? 0 : 1);
