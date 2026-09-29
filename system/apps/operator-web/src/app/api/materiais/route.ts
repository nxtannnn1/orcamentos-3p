import { createServerOperatorRepository } from "../../../server/data-source/operator-repository-factory";
import { routeErrorResponse } from "../../../server/data-source/route-error";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json(await createServerOperatorRepository().listOfficialMaterials(query));
  } catch (error) {
    return routeErrorResponse(error);
  }
}
