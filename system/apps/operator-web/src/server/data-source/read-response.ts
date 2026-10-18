import "server-only";
import { randomUUID } from "node:crypto";
import { resolveDataSource } from "./configuration";
import { routeErrorResponse } from "./route-error";

type Resource = "budgets" | "items" | "materials" | "comparison";

/** Only fixed labels and a server-generated correlation ID reach the log. */
export async function dataSourceReadResponse(resource: Resource, read: () => Promise<Response>) {
  const correlationId = randomUUID();
  let source: string = "invalid";
  let adapter: string | null = null;
  let response: Response;
  try {
    source = resolveDataSource();
    adapter = source === "mock" ? "mock" : source === "sharepoint" ? "sharepoint-graph" : "operator-api";
    response = await read();
  } catch (error) {
    response = routeErrorResponse(error);
  }
  console.info("operator-web.data-read", {
    correlationId, resource, configuredSource: source, selectedSource: source === "invalid" ? null : source,
    adapter, status: response.status, result: response.ok ? "success" : "error",
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Correlation-Id", correlationId);
  return response;
}
