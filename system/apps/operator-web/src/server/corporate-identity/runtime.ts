import "server-only";
import { DecisionError } from "../../domain/decision-error";
import type { SessionUser } from "../auth/configuration";

/** Production composition deliberately unavailable pending separately authorized
 * verifier, administrative authority, database adapter and dispatch coordination.
 * There is no environment switch that silently enables corporate writes. */
export function assertCorporateWriteRuntime(user: SessionUser) {
  if (user.authMode === "keycloak") throw new DecisionError(
    "Escrita Keycloak em fonte real bloqueada: vínculo, concessões e infraestrutura ainda não homologados.",
    403, "CORPORATE_WRITES_NOT_ACTIVATED",
  );
}
