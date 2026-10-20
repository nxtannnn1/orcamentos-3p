import { timingSafeEqual } from "node:crypto";
import { validCommand } from "./commands.mjs";

function reply(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

/**
 * Injected client keeps transport testable without coupling it to connection setup.
 * Redis errors are deliberately sanitized: commands can contain session secrets.
 */
export function createHandler(client, token, { timeoutMs = 3000, onDiagnostic } = {}) {
  if (typeof token !== "string" || token.length < 32) throw new Error("Gateway token not configured");
  const expected = Buffer.from(`Bearer ${token}`);
  return async (req, res) => {
    const started = performance.now();
    // Never expose commands, keys, values, tokens or raw external error messages.
    const diagnostic = (status, reason) => {
      try { onDiagnostic?.({ status, reason, elapsedMs: Math.round(performance.now() - started) }); }
      catch { /* Observability must not change the command outcome. */ }
    };
    if (req.method !== "POST" || req.url !== "/") return reply(res, 404, { error: "Not found" });
    const actual = Buffer.from(req.headers.authorization ?? "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply(res, 401, { error: "Unauthorized" });
    let command;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) return reply(res, 413, { error: "Request too large" });
        chunks.push(chunk);
      }
      command = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { return reply(res, 400, { error: "Invalid JSON" }); }
    if (!validCommand(command)) return reply(res, 400, { error: "Invalid command" });
    if (!client.isReady) {
      diagnostic(503, "redis_not_ready");
      return reply(res, 503, { error: "Command unavailable" });
    }
    let timer;
    let timedOut = false;
    try {
      const result = await Promise.race([
        client.sendCommand(command.map(String)),
        new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, timeoutMs); }),
      ]);
      diagnostic(200, "completed");
      return reply(res, 200, { result });
    } catch {
      diagnostic(503, timedOut ? "command_timeout" : "redis_command_error");
      // The timer does not cancel a command already received by Redis.
      // A timeout is an uncertain outcome. Never retry a mutation automatically.
      return reply(res, 503, { error: "Command unavailable" });
    } finally { clearTimeout(timer); }
  };
}
