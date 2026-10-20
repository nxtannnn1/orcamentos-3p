import "server-only";
import { authorize, canonical, ProposalError, type Scope, type ServerSession, type ResolvedPerson } from "../reopening-proposal/contract";

export const actions = ["consult", "correct", "approve", "reject", "requestReopen", "executeReopen", "audit", "reconcile"] as const;
export type Action = typeof actions[number];
/** Proposed roles, not Entra assignments. Existing runtime permissions are unchanged. */
export const grants: Readonly<Record<string, readonly Action[]>> = Object.freeze({
  Consulta: ["consult"],
  Operador: ["consult", "correct", "approve", "reject"],
  Comprador: ["consult", "correct", "approve", "reject"],
  SolicitanteReabertura: ["consult", "requestReopen"],
  ExecutorReabertura: ["consult", "executeReopen"],
  Auditor: ["consult", "audit"],
  Reconciliador: ["consult", "audit", "reconcile"],
});
export type ResourceAttestation = { scope: Scope; oid: string; allowed: boolean };
/** Trusted backend inputs only; does not parse cookies, grant Graph rights, or enable routes. */
export function guard(action: Action, session: ServerSession, person: ResolvedPerson,
  scope: Scope, resource: ResourceAttestation, tenantId: string, now: number) {
  if (!actions.includes(action) || resource.allowed !== true || resource.oid !== session.oid ||
      canonical(resource.scope) !== canonical(scope)) throw new ProposalError("RESOURCE_FORBIDDEN");
  const allowedRoles = Object.entries(grants).filter(([, values]) => values.includes(action)).map(([role]) => role);
  authorize(session, person, { tenantId, allowedRoles }, scope, now);
}
