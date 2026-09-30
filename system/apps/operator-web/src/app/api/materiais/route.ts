import { requireSession } from "../../../server/auth/session";
import { DecisionError } from "../../../domain/decision-error";
import { createServerOperatorRepository } from "../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../server/data-source/route-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSession(false);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (query.length > 100) throw new DecisionError("Pesquisa muito longa.");
    return Response.json(await createServerOperatorRepository().listOfficialMaterials(query));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
