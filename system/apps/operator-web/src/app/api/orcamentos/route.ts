import { requireSession } from "../../../server/auth/session";
import { createServerOperatorRepository } from "../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../server/data-source/route-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession(false);
    return Response.json(await createServerOperatorRepository().listBudgets());
  } catch (error) {
    return routeErrorResponse(error);
  }
}
