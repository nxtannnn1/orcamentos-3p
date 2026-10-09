import "server-only";
import { ApiError } from "./errors";

export interface ApiClient { id: string; sha256: string; scopes: ["read"]; }
export interface Config { clients: ApiClient[]; databaseUrl: string; tls: boolean; }
export function readConfig(env: Record<string, string | undefined> = process.env): Config {
  const invalid = () => new ApiError(503, "CONFIGURATION_UNAVAILABLE", "Serviço não configurado.");
  let clients: ApiClient[];
  try {
    const parsed: unknown = JSON.parse(env.API_CLIENTS_JSON ?? "[]");
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10) throw invalid();
    clients = parsed.map((entry: unknown) => {
      if (!entry || typeof entry !== "object") throw invalid();
      const row = entry as Record<string, unknown>;
      if (Object.keys(row).some(k => !["id", "sha256", "scopes"].includes(k)) ||
          typeof row.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(row.id) ||
          typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256) ||
          !Array.isArray(row.scopes) || row.scopes.length !== 1 || row.scopes[0] !== "read") throw invalid();
      return { id: row.id, sha256: row.sha256, scopes: ["read"] };
    });
    if (new Set(clients.map(c => c.id)).size !== clients.length ||
        new Set(clients.map(c => c.sha256)).size !== clients.length) throw invalid();
  } catch { throw invalid(); }
  const databaseUrl = env.DATABASE_URL ?? "";
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname ||
        !url.username || !url.password || !url.pathname || url.pathname === "/" ||
        url.search || url.hash) throw invalid();
    // Parâmetros SSL/host da URL são proibidos para não sobrescrever a política abaixo.
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!["verify-full", "disable"].includes(env.DATABASE_TLS_MODE ?? "verify-full")) throw invalid();
    if (env.DATABASE_TLS_MODE === "disable" && (!loopback || env.NODE_ENV === "production")) throw invalid();
  } catch { throw invalid(); }
  return { clients, databaseUrl, tls: env.DATABASE_TLS_MODE !== "disable" };
}
