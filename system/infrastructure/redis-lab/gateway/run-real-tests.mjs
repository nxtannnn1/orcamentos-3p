// Runs the candidate handler against the EXISTING lab Redis. No build, copy,
// restart, new container, persistent container file or service replacement.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const container = "3p-redis-lab-gateway-1";
const inspect = spawnSync("docker", ["inspect", container], { encoding: "utf8" });
if (inspect.status !== 0) { console.error("FAIL: lab gateway unavailable"); process.exit(1); }
const info = JSON.parse(inspect.stdout)[0];
if (info.Config.Labels["com.docker.compose.project"] !== "3p-redis-lab" ||
    info.Config.Labels["com.docker.compose.service"] !== "gateway" || !info.State.Running) {
  console.error("FAIL: unexpected lab identity"); process.exit(1);
}
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const commands = data(read("./commands.mjs"));
const handler = data(read("./handler.mjs").replace('"./commands.mjs"', JSON.stringify(commands)));
const contracts = Object.fromEntries([
  "../../../apps/operator-web/src/server/security/scripts.ts",
  "../../../apps/operator-web/src/server/security/store.ts",
].map(path => [path, read(path)]));
const tests = read("./gateway.test.mjs")
  .replace('"./handler.mjs"', JSON.stringify(handler))
  .replace('"./commands.mjs"', JSON.stringify(commands))
  .replace('readFileSync(new URL(path, import.meta.url), "utf8")', `(${JSON.stringify(contracts)})[path]`)
  .replace('await import("redis")', 'await import("file:///app/node_modules/redis/dist/index.js")');
const result = spawnSync("docker", ["exec", "-i", "-e", "REDIS_REAL=1", container, "node", "--input-type=module"],
  { input: tests, encoding: "utf8", timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
// The test runner prints fixed assertion labels and fictitious values only.
process.stdout.write(result.stdout ?? "");
if (result.status !== 0) console.error("FAIL: candidate integration tests");
process.exit(result.status === 0 ? 0 : 1);
