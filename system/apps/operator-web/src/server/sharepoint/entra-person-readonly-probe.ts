import "server-only";
import { randomUUID } from "node:crypto";
import type { SessionUser } from "../auth/configuration";
import { DecisionError } from "../../domain/decision-error";
import { readSharePointServerConfig, type GraphServerConfig } from "../data-source/configuration";
import { GraphClientCredentialsReadTransport } from "./graph-read-transport";
import type { GraphReadTransport } from "./sharepoint-types";
import { GraphListPersonResolver, type PersonResolutionDiagnostics } from "./graph-list-person-resolver";
import { resolveDecisionPerson } from "./person-resolver";
import { checkDecisionReadOnlyPreflight, type DecisionReadOnlyPreflight } from "./decision-readonly-preflight";

const safeErrors = new Set(["PERSON_NOT_FOUND", "PERSON_AMBIGUOUS", "PERSON_IDENTITY_MISMATCH",
  "DECISION_TENANT_MISMATCH", "PERSON_RESOLUTION_UNAVAILABLE", "PERSON_RESOLUTION_NOT_CONFIGURED"]);
type Dependencies = {
  transport: (config: GraphServerConfig) => GraphReadTransport;
  log: (event: string, result: { probeId: string; status: string; readOnly: true; diagnostics?: PersonResolutionDiagnostics; decisionPreflight?: DecisionReadOnlyPreflight }) => void;
};

/** Internal local-only instrument. The page guard supplies an already validated
 * session; this never accepts browser identity parameters or grants permission.
 * No endpoint, response payload or persistent mapping is created.
 */
export async function probeEntraPersonReadOnly(user: SessionUser | null,
  env: Record<string, string | undefined> = process.env,
  dependencies: Dependencies = { transport: config => new GraphClientCredentialsReadTransport(config), log: console.info }) {
  if (env.ENTRA_PERSON_READONLY_PROBE !== "true") return "DISABLED";
  const probeId = randomUUID();
  // TEMPORARY: remove observer wiring and this extra field after diagnosis.
  let diagnostics: PersonResolutionDiagnostics | undefined;
  let decisionPreflight: DecisionReadOnlyPreflight | undefined;
  const finish = (status: string) => {
    dependencies.log("operator-web.entra-person-probe", { probeId, status, readOnly: true, ...(diagnostics ? { diagnostics } : {}),
      ...(decisionPreflight ? { decisionPreflight } : {}) });
    return status;
  };
  let local = false;
  try {
    const origin = new URL(env.AUTH_APP_ORIGIN ?? "");
    local = env.NODE_ENV === "development" && origin.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
      !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/";
  } catch { /* fail closed */ }
  if (!local) return finish("PROBE_NOT_LOCAL");
  if (env.AUTH_DISABLED !== "false" || [env.ALLOW_LOCAL_SHAREPOINT_BYPASS, env.ALLOW_LOCAL_OPERATOR_API_BYPASS,
    env.OPERATOR_WEB_DEMO].includes("true")) return finish("PROBE_AUTH_CONFIGURATION_REQUIRED");
  if (!user || user.authMode !== "entra") return finish("ENTRA_SESSION_REQUIRED");
  if (env.DATA_SOURCE?.trim().toLowerCase() !== "sharepoint") return finish("PROBE_SHAREPOINT_REQUIRED");
  try {
    const config = readSharePointServerConfig(env);
    const transport = dependencies.transport(config.graph);
    if (env.ENTRA_DECISION_READONLY_PREFLIGHT === "true")
      decisionPreflight = await checkDecisionReadOnlyPreflight(transport, config.repository, env);
    // The instrument passes only GET capability to the resolver.
    const resolver = new GraphListPersonResolver({ get: path => transport.get(path) }, {
      tenantId: config.graph.tenantId, siteId: config.repository.siteId, listId: config.repository.itemsListId,
    }, result => { diagnostics = result; });
    await resolveDecisionPerson(resolver, { tenantId: user.tenantId, oid: user.oid }, config.repository.siteId, config.graph.tenantId);
    return finish("VERIFIED");
  } catch (error) {
    return finish(error instanceof DecisionError && safeErrors.has(error.code) ? error.code : "PERSON_RESOLUTION_UNAVAILABLE");
  }
}
