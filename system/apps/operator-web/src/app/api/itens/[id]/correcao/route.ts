import { requireSession } from "../../../../../server/auth/session";
import { limitUserRequests } from "../../../../../server/security/rate-limit";
import { assertWriteOrigin, readWriteJson } from "../../../../../server/security/write-request";
import { createServerOperatorRepository } from "../../../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../../../server/data-source/route-error";
import { DecisionError } from "../../../../../domain/decision-error";
import { OPERATION_ID, validateCorrectionInput } from "../../../../../domain/item-correction";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
async function handle(request: Request, context: Context, reconcile: boolean) {
  try {
    const user = await requireSession(true);
    assertWriteOrigin(request);
    await limitUserRequests(user, true);
    const { id } = await context.params;
    if (!/^[1-9]\d*$/.test(id)) throw new DecisionError("Item inválido.");
    const raw = await readWriteJson(request);
    const actor = { tenantId: user.tenantId, oid: user.oid };
    const repository = createServerOperatorRepository();
    if (reconcile) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 1 ||
          !("operationId" in raw) || typeof raw.operationId !== "string" || !OPERATION_ID.test(raw.operationId))
        throw new DecisionError("Operação inválida.");
      if (!repository.reconcileItemCorrection) throw new DecisionError("Fonte sem correção auditável.", 403);
      return Response.json(await repository.reconcileItemCorrection(id, raw.operationId, { actor }), { headers: { "Cache-Control": "no-store" } });
    }
    const input = validateCorrectionInput(raw);
    if (!repository.saveItemCorrection) throw new DecisionError("Fonte sem correção auditável.", 403);
    return Response.json(await repository.saveItemCorrection(id, input, { actor, version: request.headers.get("if-match") ?? undefined }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return routeErrorResponse(error); }
}
export function PATCH(request: Request, context: Context) { return handle(request, context, false); }
export function POST(request: Request, context: Context) { return handle(request, context, true); }
