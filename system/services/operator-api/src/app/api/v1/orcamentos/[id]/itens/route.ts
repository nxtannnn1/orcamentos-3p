import { protectedRead } from "@/server/http";
import { positiveId, queryOptions } from "@/server/query";
import { repository } from "@/server/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return protectedRead(request, async () => {
    const { id } = await context.params;
    return repository.items(positiveId(id), queryOptions(request.url));
  });
}
