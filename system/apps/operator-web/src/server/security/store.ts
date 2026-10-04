import "server-only";
import { AuthError } from "../auth/configuration";

// Produção exige Redis compartilhado com leitura no primário.
// Memória local só é permitida em desenvolvimento e testes.
const memory = new Map<string, { value: string; expiresAt: number }>();
export const RATE_LIMIT_SCRIPT =
  "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";

export async function securityCommand(command: (string | number)[]): Promise<unknown> {
  const endpoint = process.env.SECURITY_REDIS_REST_URL?.trim();
  const token = process.env.SECURITY_REDIS_REST_TOKEN?.trim();
  if (endpoint || token) {
    let url: URL;
    try {
      url = new URL(endpoint ?? "");
    } catch {
      throw new AuthError("SECURITY_STORE_NOT_CONFIGURED", 503);
    }
    if (
      !token ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    ) {
      throw new AuthError("SECURITY_STORE_NOT_CONFIGURED", 503);
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(command),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      const payload = (await response.json()) as { result?: unknown; error?: unknown };
      if (!response.ok || payload.error || !("result" in payload)) throw new Error();
      return payload.result;
    } catch {
      throw new AuthError("SECURITY_STORE_UNAVAILABLE", 503);
    }
  }
  if (!["development", "test"].includes(process.env.NODE_ENV ?? "")) {
    throw new AuthError("SECURITY_STORE_NOT_CONFIGURED", 503);
  }
  const [operation, rawKey, ...args] = command;
  const key = String(operation === "EVAL" ? args[1] : rawKey);
  const entry = memory.get(key);
  if (entry && entry.expiresAt <= Date.now()) memory.delete(key);
  if (operation === "GET") return memory.get(key)?.value ?? null;
  if (operation === "DEL") return memory.delete(key) ? 1 : 0;
  if (operation === "SET") {
    if (args.includes("NX") && memory.has(key)) return null;
    const exIndex = args.indexOf("EX");
    memory.set(key, {
      value: String(args[0]),
      expiresAt: exIndex < 0 ? Infinity : Date.now() + Number(args[exIndex + 1]) * 1000,
    });
    return "OK";
  }
  if (operation === "INCR" || (operation === "EVAL" && rawKey === RATE_LIMIT_SCRIPT)) {
    const old = memory.get(key);
    const value = Number(old?.value ?? 0) + 1;
    if (!Number.isSafeInteger(value)) throw new AuthError("SECURITY_STORE_UNAVAILABLE", 503);
    memory.set(key, {
      value: String(value),
      expiresAt:
        old?.expiresAt ?? (operation === "EVAL" ? Date.now() + Number(args[2]) * 1000 : Infinity),
    });
    return value;
  }
  throw new AuthError("SECURITY_STORE_UNAVAILABLE", 503);
}
