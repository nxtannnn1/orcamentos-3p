import { protectedRead } from "@/server/http";
import { positiveId, requireEmptyQuery } from "@/server/query";
import { repository } from "@/server/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return protectedRead(request, async () => {
    requireEmptyQuery(request.url);
    const { id } = await context.params;
    return repository.budget(positiveId(id));
  });
}
