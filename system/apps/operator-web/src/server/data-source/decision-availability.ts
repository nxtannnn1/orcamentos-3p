import type { SessionUser } from "../auth/configuration";
import { canReviewSource } from "../auth/configuration";

type Environment = Record<string, string | undefined>;

export type DecisionAvailability = Readonly<{
  canWrite: boolean;
  writeUnavailableReason: string | null;
}>;

/**
 * UI eligibility only. The backend remains responsible for
 * identity verification, audit, authorization and persistence.
 */
export function resolveDecisionAvailability(
  user: SessionUser,
  env: Environment,
): DecisionAvailability {
  const source = env.DATA_SOURCE?.trim().toLowerCase() || "mock";
  const authorized =
    canReviewSource(user, source) && source !== "operator-api";

  if (!authorized) {
    return {
      canWrite: false,
      writeUnavailableReason:
        "Seu perfil permite somente consulta ou não autoriza decisões nesta fonte.",
    };
  }

  if (source === "sharepoint") {
    const configured =
      env.SHAREPOINT_HUMAN_CORRECTIONS_ENABLED === "true" &&
      !!env.SECURITY_REDIS_REST_URL?.trim() &&
      !!env.SECURITY_REDIS_REST_TOKEN?.trim();

    if (!configured) {
      return {
        canWrite: false,
        writeUnavailableReason:
          "As decisões estão temporariamente indisponíveis neste ambiente. A consulta dos itens continua disponível.",
      };
    }
    if (!user.email) {
      return {
        canWrite: false,
        writeUnavailableReason:
          "Sua sessão não trouxe o e-mail corporativo. Saia e entre novamente com sua conta Microsoft da 3P para decidir.",
      };
    }
  }

  return {
    canWrite: true,
    writeUnavailableReason: null,
  };
}
