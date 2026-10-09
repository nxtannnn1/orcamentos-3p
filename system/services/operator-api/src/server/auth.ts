import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ApiClient } from "./config";
import { ApiError } from "./errors";
export function authenticate(request: Request, clients: ApiClient[]): ApiClient {
  // A API é chamada pelo servidor do frontend/n8n, não diretamente por páginas web.
  if (request.headers.has("origin") || request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "Origem não permitida.");
  const value = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(value);
  if (!match) throw new ApiError(401, "UNAUTHORIZED", "Autenticação necessária.");
  const digest = createHash("sha256").update(match[1]).digest();
  let authenticated: ApiClient | undefined;
  // Comparações de tamanho fixo; não interromper o loop no primeiro match.
  for (const client of clients)
    if (timingSafeEqual(digest, Buffer.from(client.sha256, "hex"))) authenticated = client;
  if (!authenticated) throw new ApiError(401, "UNAUTHORIZED", "Autenticação necessária.");
  return authenticated;
}
