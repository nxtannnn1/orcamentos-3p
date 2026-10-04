import { requireSession } from "../../../server/auth/session";
import { DecisionError } from "../../../domain/decision-error";
import { createServerOperatorRepository } from "../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../server/data-source/route-error";
import { limitUserRequests } from "../../../server/security/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireSession(false);
    await limitUserRequests(user, false);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (query.length > 100) throw new DecisionError("Pesquisa muito longa.");
    return Response.json(await createServerOperatorRepository().listOfficialMaterials(query), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return routeErrorResponse(error);
  }
}
