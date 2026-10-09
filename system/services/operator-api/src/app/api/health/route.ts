import { json } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() { return json({ status: "alive" }); }
