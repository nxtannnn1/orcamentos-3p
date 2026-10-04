import { requireSession } from "../../../../../server/auth/session";
import { createServerOperatorRepository } from "../../../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../../../server/data-source/route-error";
import { limitUserRequests } from "../../../../../server/security/rate-limit";

export const dynamic = "force-dynamic";
const SAFE_ROUTE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export async function GET(_request: Request, context: RouteContext<"/api/orcamentos/[id]/itens">) {
  try {
    const user = await requireSession(false);
    await limitUserRequests(user, false);
    const { id } = await context.params;
    if (!SAFE_ROUTE_ID.test(id)) {
      return Response.json(
        { error: "INVALID_ROUTE_PARAMETER", message: "ID de orcamento invalido." },
        { status: 400 },
      );
    }
    return Response.json(await createServerOperatorRepository().listItemsByBudget(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
