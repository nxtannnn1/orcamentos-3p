import "server-only";
import { DecisionError } from "../../domain/decision-error";
import type { GraphReadTransport } from "./sharepoint-types";
import type { DecisionActor, SharePointPerson, SharePointPersonResolver } from "./person-resolver";
import { GraphReadError } from "./graph-read-error";

/** TEMPORARY: aggregate counters for the local probe only; never identity values. */
export type PersonResolutionDiagnostics = Readonly<{
  siteQueryCompleted: boolean;
  siteVerified: boolean;
  permissionsPagesRequested: number;
  permissionsPagesCompleted: number;
  permissionRecordsAnalyzed: number;
  actorUserMatches: number;
  actorMatchesWithValidSiteUserId: number;
  uniqueCandidates: number;
  nextLinksSeen: number;
  scanCompleted: boolean;
  failureStage: "site" | "permissions" | "pagination" | "identity" | null;
  failureKind: "HTTP" | "NETWORK" | "INVALID_RESPONSE" | "INVALID_TARGET" | "PAGINATION_REJECTED" | "IDENTITY_MISMATCH" | "UNEXPECTED_FAILURE" | null;
  graphOperation: "oauth" | "get" | null;
  httpStatus: number | null;
}>;

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const unavailable = () => new DecisionError("Não foi possível verificar a Pessoa SharePoint.", 503, "PERSON_RESOLUTION_UNAVAILABLE");
const mismatch = () => new DecisionError("Vínculo de identidade SharePoint inválido.", 403, "PERSON_IDENTITY_MISMATCH");

/** A partial, read-only directory: only explicit Graph V2 user/siteUser pairs.
 * The transport must be authenticated in config.tenantId (the factory uses the
 * existing technical client). List permission roles never grant portal roles.
 */
export class GraphListPersonResolver implements SharePointPersonResolver {
  private readonly config: Readonly<{ tenantId: string; siteId: string; listId: string }>;
  constructor(private readonly graph: GraphReadTransport, config: { tenantId: string; siteId: string; listId: string },
    private readonly diagnostics?: (result: PersonResolutionDiagnostics) => void) {
    if (!config || typeof config.tenantId !== "string" || typeof config.siteId !== "string" || typeof config.listId !== "string")
      throw new DecisionError("Configuração da fonte de identidade inválida.", 503, "PERSON_RESOLUTION_NOT_CONFIGURED");
    const parts = config.siteId.split(",");
    if (!guid.test(config.tenantId) || !guid.test(config.listId) || parts.length !== 3 ||
        !/^[a-z0-9][a-z0-9.-]*\.sharepoint\.com$/i.test(parts[0]) || !guid.test(parts[1]) || !guid.test(parts[2]))
      throw new DecisionError("Configuração da fonte de identidade inválida.", 503, "PERSON_RESOLUTION_NOT_CONFIGURED");
    this.config = Object.freeze({ ...config, tenantId: config.tenantId.toLowerCase() });
  }

  async findCandidates(actor: Readonly<DecisionActor>, siteId: string): Promise<readonly SharePointPerson[]> {
    if (!actor || typeof actor.tenantId !== "string" || !guid.test(actor.tenantId) ||
        actor.tenantId.toLowerCase() !== this.config.tenantId || typeof actor.oid !== "string" || !guid.test(actor.oid))
      throw new DecisionError("Identidade não autorizada para este tenant.", 403, "DECISION_TENANT_MISMATCH");
    if (siteId !== this.config.siteId) throw mismatch();
    const sitePath = `/sites/${encodeURIComponent(this.config.siteId)}`;
    const permissionsPath = `${sitePath}/lists/${encodeURIComponent(this.config.listId)}/permissions`;
    const expectedPath = `/v1.0${permissionsPath}`;
    const candidates = new Map<string, SharePointPerson>();
    const visited = new Set<string>();
    let next: string | undefined = permissionsPath;
    let count = 0;
    const summary: { -readonly [K in keyof PersonResolutionDiagnostics]: PersonResolutionDiagnostics[K] } = {
      siteQueryCompleted: false, siteVerified: false, permissionsPagesRequested: 0, permissionsPagesCompleted: 0,
      permissionRecordsAnalyzed: 0, actorUserMatches: 0, actorMatchesWithValidSiteUserId: 0,
      uniqueCandidates: 0, nextLinksSeen: 0, scanCompleted: false,
      failureStage: null, failureKind: null, graphOperation: null, httpStatus: null,
    };
    let stage: NonNullable<PersonResolutionDiagnostics["failureStage"]> = "site";
    const invalidResponse = () => { summary.failureKind = "INVALID_RESPONSE"; return unavailable(); };
    const invalidPagination = () => { summary.failureKind = "PAGINATION_REJECTED"; return unavailable(); };
    try {
      const site = await this.graph.get<unknown>(`${sitePath}?$select=id`);
      summary.siteQueryCompleted = true;
      if (!record(site) || typeof site.id !== "string") throw invalidResponse();
      if (site.id !== this.config.siteId) throw mismatch();
      summary.siteVerified = true;
      while (next) {
        stage = "pagination";
        let url: URL;
        let matchingPath: boolean;
        try {
          url = new URL(next.startsWith("https://") ? next : `https://graph.microsoft.com/v1.0${next}`);
          matchingPath = decodeURIComponent(url.pathname) === decodeURIComponent(expectedPath);
        } catch { throw invalidPagination(); }
        if (url.origin !== "https://graph.microsoft.com" || url.username || url.password || url.hash || !matchingPath || visited.has(url.href) || visited.size >= 20)
          throw invalidPagination();
        visited.add(url.href);
        stage = "permissions";
        summary.permissionsPagesRequested++;
        const page = await this.graph.get<unknown>(next);
        summary.permissionsPagesCompleted++;
        if (!record(page) || !Array.isArray(page.value)) throw invalidResponse();
        if ((count += page.value.length) > 10_000) throw invalidPagination();
        for (const permission of page.value) {
          summary.permissionRecordsAnalyzed++;
          if (!record(permission)) throw invalidResponse();
          const many = permission.grantedToIdentitiesV2;
          if (many !== undefined && (!Array.isArray(many) || many.some(identity => !record(identity)))) throw invalidResponse();
          const identities = [permission.grantedToV2, ...(Array.isArray(many) ? many : [])];
          for (const identity of identities) {
            if (identity === undefined || identity === null) continue;
            if (!record(identity)) throw invalidResponse();
            if (identity.user === undefined || identity.user === null) continue;
            if (!record(identity.user) || (identity.user.id !== undefined && typeof identity.user.id !== "string")) throw invalidResponse();
            if (typeof identity.user.id !== "string" || identity.user.id.toLowerCase() !== actor.oid.toLowerCase()) continue;
            summary.actorUserMatches++;
            stage = "identity";
            // Never join identities from separate records, names, mail or AuthorLookupId.
            if (!record(identity.siteUser) || typeof identity.siteUser.id !== "string" ||
                !/^[1-9]\d*$/.test(identity.siteUser.id) || !Number.isSafeInteger(Number(identity.siteUser.id))) throw mismatch();
            summary.actorMatchesWithValidSiteUserId++;
            if (
                [identity.user.tenantId, identity.siteUser.tenantId].some(value => value !== undefined &&
                  (typeof value !== "string" || value.toLowerCase() !== this.config.tenantId))) throw mismatch();
            const person = Object.freeze({ tenantId: this.config.tenantId, oid: actor.oid, siteId, lookupId: identity.siteUser.id });
            candidates.set(person.lookupId, person);
            summary.uniqueCandidates = candidates.size;
            stage = "permissions";
          }
        }
        const link = page["@odata.nextLink"];
        stage = "pagination";
        if (link !== undefined) summary.nextLinksSeen++;
        if (link !== undefined && (typeof link !== "string" || !link.startsWith("https://"))) throw invalidPagination();
        next = link as string | undefined;
      }
      summary.scanCompleted = true;
    } catch (error) {
      summary.failureStage = stage;
      if (error instanceof GraphReadError) {
        summary.failureKind = error.kind;
        summary.graphOperation = error.operation;
        summary.httpStatus = error.httpStatus;
      } else if (!summary.failureKind) {
        summary.failureKind = error instanceof DecisionError && error.code === "PERSON_IDENTITY_MISMATCH"
          ? "IDENTITY_MISMATCH" : "UNEXPECTED_FAILURE";
      }
      if (error instanceof DecisionError) throw error;
      throw unavailable();
    } finally {
      // Logging must never change candidate selection or mask an existing failure.
      try { this.diagnostics?.(Object.freeze({ ...summary })); } catch { /* diagnostic sink only */ }
    }
    return Object.freeze([...candidates.values()]);
  }
}
