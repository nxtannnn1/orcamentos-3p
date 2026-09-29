import { createServerOperatorRepository } from "../../../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../../../server/data-source/route-error";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/orcamentos/[id]/itens">) {
  try {
    const { id } = await context.params;
    return Response.json(await createServerOperatorRepository().listItemsByBudget(id));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
