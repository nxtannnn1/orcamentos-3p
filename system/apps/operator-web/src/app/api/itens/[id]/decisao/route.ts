import { requireSession } from "../../../../../server/auth/session";
import { DecisionError } from "../../../../../domain/decision-error";
import { createServerOperatorRepository } from "../../../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../../../server/data-source/route-error";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_OBSERVATION_LENGTH = 2_000;
const SAFE_ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

async function readLimitedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new DecisionError("JSON inválido.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new DecisionError("Solicitação muito grande.", 413, "PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DecisionError("JSON inválido.");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(true);
    const origin = request.headers.get("origin");
    const configuredOrigin = process.env.AUTH_APP_ORIGIN?.trim();
    let expectedOrigin = "";
    try { expectedOrigin = configuredOrigin ? new URL(configuredOrigin).origin : ""; } catch { /* configuração inválida */ }
    if (!expectedOrigin || origin !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new DecisionError("Origem da solicitação não permitida.", 403);
    }
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new DecisionError("Envie a decisão em JSON.", 415);
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      throw new DecisionError("Solicitação muito grande.", 413, "PAYLOAD_TOO_LARGE");
    }
    const rawBody = await readLimitedBody(request);
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new DecisionError("Solicitação muito grande.", 413, "PAYLOAD_TOO_LARGE");
    }
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { throw new DecisionError("JSON inválido."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DecisionError("Decisão inválida.");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["action", "approvedMaterialId", "observation"].includes(key))
      || !["APPROVE", "REJECT"].includes(String(input.action))
      || typeof input.observation !== "string"
      || input.observation.length > MAX_OBSERVATION_LENGTH) throw new DecisionError("Decisão inválida.");
    if (input.action === "APPROVE" && (typeof input.approvedMaterialId !== "string" || !input.approvedMaterialId.trim())) {
      throw new DecisionError("Escolha explicitamente um Material Oficial antes de aprovar.");
    }
    if (input.action === "REJECT" && input.approvedMaterialId !== null) throw new DecisionError("Rejeição não pode incluir material aprovado.");
    const { id } = await context.params;
    if (!SAFE_ROUTE_ID.test(id)) throw new DecisionError("Invalid item ID.", 400, "INVALID_ROUTE_PARAMETER");
    if (!id.trim()) throw new DecisionError("ID de item inválido.");
    const repository = createServerOperatorRepository();
    const material = input.action === "APPROVE"
      ? (await repository.listOfficialMaterials()).find((entry) => entry.id === input.approvedMaterialId) : null;
    if (input.action === "APPROVE" && !material) throw new DecisionError("Material Oficial não encontrado.");
    const decision = input.action === "APPROVE"
      ? { action: "APPROVE" as const, approvedMaterial: material!, observation: input.observation }
      : { action: "REJECT" as const, approvedMaterial: null, observation: input.observation };
    return Response.json(await repository.saveItemDecision(id, decision));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
