import "server-only";
import { DecisionError } from "../../domain/decision-error";

export interface DecisionApprover {
  readonly tenantId: string;
  readonly oid: string;
  readonly name: string;
  readonly email: string;
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Identity recorded in the plain-text approver columns. The actor is built by the
 * route from the sealed server session, never from the request body; this check
 * keeps the tenant binding and refuses to write without a usable name and e-mail.
 */
export function resolveDecisionApprover(
  actor: { tenantId?: string; oid?: string; name?: string; email?: string } | undefined,
  expectedTenantId: string | undefined,
): DecisionApprover {
  if (typeof expectedTenantId !== "string" || !expectedTenantId.trim())
    throw new DecisionError("Tenant de escrita não configurado.", 503, "AUDIT_NOT_CONFIGURED");
  if (!actor || typeof actor.oid !== "string" || !actor.oid.trim() || typeof actor.tenantId !== "string" ||
      actor.tenantId.toLowerCase() !== expectedTenantId.toLowerCase())
    throw new DecisionError("Identidade não autorizada para este tenant.", 403, "DECISION_TENANT_MISMATCH");
  const name = typeof actor.name === "string" ? actor.name.trim() : "";
  const email = typeof actor.email === "string" ? actor.email.trim().toLowerCase() : "";
  if (!name || name.length > 255 || CONTROL.test(name) || email.length > 254 || !EMAIL.test(email))
    throw new DecisionError(
      "Sua sessão não contém nome e e-mail corporativos verificados. Saia e entre novamente com sua conta Microsoft da 3P. Nenhuma decisão foi gravada.",
      401, "APPROVER_IDENTITY_UNAVAILABLE",
    );
  return Object.freeze({ tenantId: actor.tenantId, oid: actor.oid, name, email });
}
