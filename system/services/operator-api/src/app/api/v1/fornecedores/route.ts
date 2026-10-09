import { protectedRead } from "@/server/http";
import { queryOptions } from "@/server/query";
import { repository } from "@/server/repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return protectedRead(request, () => repository.suppliers(queryOptions(request.url, true)));
}
