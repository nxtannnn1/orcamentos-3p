import { requireSession } from "../../../server/auth/session";
import { createServerOperatorRepository } from "../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../server/data-source/route-error";
import { limitUserRequests } from "../../../server/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireSession(false);
    await limitUserRequests(user, false);
    return Response.json(await createServerOperatorRepository().listBudgets(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
