import "server-only";
import { randomUUID } from "node:crypto";
import { readConfig } from "./config";
import { authenticate } from "./auth";
import { ApiError } from "./errors";
import { incoming, clients, concurrency } from "./limits";
export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra,
  } });
}
export async function protectedRead(request: Request, action: () => Promise<unknown>) {
  const requestId = randomUUID();
  let release: (() => void) | undefined;
  try {
    incoming.take("all");
    if (!["GET", "HEAD"].includes(request.method))
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Somente leitura.");
    if ((request.headers.get("authorization")?.length ?? 0) > 160)
      throw new ApiError(401, "UNAUTHORIZED", "Autenticação necessária.");
    const client = authenticate(request, readConfig().clients);
    clients.take(client.id);
    release = concurrency.enter();
    return json(await action(), 200, { "X-Request-Id": requestId });
  } catch (error) {
    const known = error instanceof ApiError;
    // Não registrar mensagem, URL, parâmetros, token ou detalhes do driver.
    const status = known ? error.status : 503;
    if (!known) console.error(JSON.stringify({ event: "read_failed", requestId }));
    return json({ error: { code: known ? error.code : "SERVICE_UNAVAILABLE",
      message: known ? error.message : "Serviço temporariamente indisponível." }, requestId }, status, {
        "X-Request-Id": requestId,
        ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
        ...(status === 429 || status === 503 ? { "Retry-After": "60" } : {}),
    });
  } finally { release?.(); }
}
