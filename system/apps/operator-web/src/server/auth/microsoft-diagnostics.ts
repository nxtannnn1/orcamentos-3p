import "server-only";
import { AuthError } from "./configuration";

export type MicrosoftLoginStage = "transaction" | "provider" | "code_exchange" | "token_validation" | "session";
export type MicrosoftLoginReason = "COOKIE_MISSING" | "COOKIE_EXPIRED" | "COOKIE_INVALID" |
  "STATE_MISMATCH" | "TRANSACTION_INVALID" | "PROVIDER_REJECTED" | "CODE_MISSING" |
  "TOKEN_MISSING" | "EXCHANGE_FAILED" | "INVALID_CLIENT" | "INVALID_GRANT" | "NONCE_MISMATCH" |
  "TOKEN_INVALID" | "ACCOUNT_NOT_ALLOWED" | "ROLE_REQUIRED" | "MFA_REQUIRED" |
  "SESSION_FAILED" | "SECURITY_STORE_UNAVAILABLE";

// Never forward an SDK error/message, URL, claims or correlation identifiers.
export function microsoftLoginFailure(stage: MicrosoftLoginStage, error: unknown): MicrosoftLoginReason {
  if (stage === "code_exchange") {
    const code = error && typeof error === "object" && "errorCode" in error ? error.errorCode : null;
    if (code === "invalid_client") return "INVALID_CLIENT";
    if (code === "invalid_grant") return "INVALID_GRANT";
    if (code === "nonce_mismatch") return "NONCE_MISMATCH";
    return "EXCHANGE_FAILED";
  }
  if (stage === "token_validation") {
    if (error instanceof AuthError) {
      if (error.code === "ACCOUNT_NOT_ALLOWED") return "ACCOUNT_NOT_ALLOWED";
      if (error.code === "ROLE_REQUIRED") return "ROLE_REQUIRED";
      if (error.code === "MFA_REQUIRED") return "MFA_REQUIRED";
    }
    return "TOKEN_INVALID";
  }
  if (stage === "session" && error instanceof AuthError && error.code.startsWith("SECURITY_STORE_"))
    return "SECURITY_STORE_UNAVAILABLE";
  return "SESSION_FAILED";
}

export function logMicrosoftLoginFailure(stage: MicrosoftLoginStage, reason: MicrosoftLoginReason) {
  console.info("operator-web.microsoft-login", { stage, reason });
}
