import "server-only";
import { DecisionError } from "../../domain/decision-error";

export interface DecisionActor {
  readonly tenantId: string;
  readonly oid: string;
}

export interface SharePointPerson extends DecisionActor {
  readonly siteId: string;
  /** Site-local user lookup ID. Never an Entra OID or a display name. */
  readonly lookupId: string;
}

/** An implementation must verify the binding using an authorized identity source.
 * No directory grant or site-user provisioning is performed by this contract.
 */
export interface SharePointPersonResolver {
  findCandidates(actor: Readonly<DecisionActor>, siteId: string): Promise<readonly SharePointPerson[]>;
}

export const unavailablePersonResolver: SharePointPersonResolver = {
  async findCandidates() {
    throw new DecisionError(
      "Resolução da Pessoa SharePoint ainda não configurada. Nenhuma decisão foi gravada.",
      503, "PERSON_RESOLUTION_NOT_CONFIGURED",
    );
  },
};

export async function resolveDecisionPerson(
  resolver: SharePointPersonResolver,
  actor: DecisionActor,
  siteId: string,
  expectedTenantId: string | undefined,
): Promise<SharePointPerson> {
  if (typeof expectedTenantId !== "string" || !expectedTenantId.trim() || typeof siteId !== "string" || !siteId.trim())
    throw new DecisionError("Tenant de escrita não configurado.", 503, "AUDIT_NOT_CONFIGURED");
  if (!actor || typeof actor.oid !== "string" || !actor.oid.trim() || typeof actor.tenantId !== "string" ||
      actor.tenantId.toLowerCase() !== expectedTenantId.toLowerCase())
    throw new DecisionError("Identidade não autorizada para este tenant.", 403, "DECISION_TENANT_MISMATCH");
  let candidates: readonly SharePointPerson[];
  try {
    candidates = await resolver.findCandidates(Object.freeze({ ...actor }), siteId);
  } catch (error) {
    if (error instanceof DecisionError) throw error;
    throw new DecisionError("Não foi possível verificar a Pessoa SharePoint.", 503, "PERSON_RESOLUTION_UNAVAILABLE");
  }
  if (!Array.isArray(candidates))
    throw new DecisionError("Resposta inválida da fonte de identidade SharePoint.", 503, "PERSON_RESOLUTION_UNAVAILABLE");
  if (candidates.length !== 1)
    throw new DecisionError(
      candidates.length ? "A fonte retornou mais de uma Pessoa SharePoint para esta identidade."
        : "Vínculo da identidade não localizado na fonte configurada. Solicite a verificação administrativa do vínculo Entra/SharePoint.", 409,
      candidates?.length ? "PERSON_AMBIGUOUS" : "PERSON_NOT_FOUND",
    );
  const person = candidates[0];
  if (!person || typeof person.oid !== "string" || typeof person.tenantId !== "string" ||
      person.oid.toLowerCase() !== actor.oid.toLowerCase() ||
      person.tenantId.toLowerCase() !== expectedTenantId.toLowerCase() ||
      person.siteId !== siteId || typeof person.lookupId !== "string" ||
      !/^[1-9]\d*$/.test(person.lookupId) || !Number.isSafeInteger(Number(person.lookupId)))
    throw new DecisionError("Vínculo de identidade SharePoint inválido.", 403, "PERSON_IDENTITY_MISMATCH");
  return Object.freeze({ ...person });
}
