import "server-only";
import { createHash } from "node:crypto";
import { DecisionError } from "../../domain/decision-error";
import type { SessionUser } from "../auth/configuration";
import { RATE_LIMIT_SCRIPT, securityCommand } from "./store";

export async function limitUserRequests(user: SessionUser, write: boolean) {
  const subject = createHash("sha256")
    .update(
      `${process.env.AUTH_APP_ORIGIN}:${process.env.ENTRA_LOGIN_CLIENT_ID}:${user.tenantId}:${user.oid}`,
    )
    .digest("hex");
  const bucket = Math.floor(Date.now() / 60_000);
  const count = await securityCommand([
    "EVAL",
    RATE_LIMIT_SCRIPT,
    1,
    `3p:rate:${subject}:${write ? "write" : "read"}:${bucket}`,
    120,
  ]);
  if (typeof count !== "number" || !Number.isSafeInteger(count))
    throw new DecisionError("Controle de acesso indisponível.", 503);
  if (count > (write ? 20 : 60))
    throw new DecisionError(
      "Muitas solicitações. Aguarde um minuto antes de tentar novamente.",
      429,
      "RATE_LIMITED",
    );
}
