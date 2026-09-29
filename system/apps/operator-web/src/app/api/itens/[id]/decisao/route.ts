import { requireSession } from "../../../../../server/auth/session";
import { DecisionError } from "../../../../../domain/decision-error";
import { createServerOperatorRepository } from "../../../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../../../server/data-source/route-error";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(true);
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      throw new DecisionError("Origem da solicitação não permitida.", 403);
    }
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new DecisionError("Envie a decisão em JSON.", 415);
    }
    const body: unknown = await request.json().catch(() => { throw new DecisionError("JSON inválido."); });
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new DecisionError("Decisão inválida.");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !["action", "approvedMaterialId", "observation"].includes(key))
      || !["APPROVE", "REJECT"].includes(String(input.action))
      || typeof input.observation !== "string") throw new DecisionError("Decisão inválida.");
    if (input.action === "APPROVE" && (typeof input.approvedMaterialId !== "string" || !input.approvedMaterialId.trim())) {
      throw new DecisionError("Escolha explicitamente um Material Oficial antes de aprovar.");
    }
    if (input.action === "REJECT" && input.approvedMaterialId !== null) throw new DecisionError("Rejeição não pode incluir material aprovado.");
    const { id } = await context.params;
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
