import "server-only";
import { DecisionError } from "../../domain/decision-error";
import { validateDecisionSchema } from "./decision-schema";
import type { GraphReadTransport, SharePointRepositoryConfig } from "./sharepoint-types";

export type DecisionReadOnlyPreflight = Readonly<{
  schema: "VERIFIED" | "AUDIT_NOT_CONFIGURED" | "UNAVAILABLE";
  auditConfiguration: "MISSING" | "PRESENT_NOT_VERIFIED";
  readOnly: true;
  writeAuthorized: false;
}>;

/** Metadata only. No item, identity, Redis command or write capability is used.
 * A successful check is not approval of a decision or proof of Redis availability.
 */
export async function checkDecisionReadOnlyPreflight(
  graph: GraphReadTransport,
  config: SharePointRepositoryConfig,
  env: Record<string, string | undefined> = process.env,
): Promise<DecisionReadOnlyPreflight> {
  let schema: DecisionReadOnlyPreflight["schema"];
  try {
    await validateDecisionSchema({ get: path => graph.get(path) }, config);
    schema = "VERIFIED";
  } catch (error) {
    schema = error instanceof DecisionError && error.code === "AUDIT_NOT_CONFIGURED"
      ? "AUDIT_NOT_CONFIGURED" : "UNAVAILABLE";
  }
  return Object.freeze({
    schema,
    auditConfiguration: env.SECURITY_REDIS_REST_URL?.trim() && env.SECURITY_REDIS_REST_TOKEN?.trim()
      ? "PRESENT_NOT_VERIFIED" : "MISSING",
    readOnly: true,
    writeAuthorized: false,
  });
}
