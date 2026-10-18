import "server-only";
import { AuthError } from "./configuration";

export type CorporateLoginPolicy = Readonly<{ identityProviderAlias: string }>;

/** Unknown nonempty values fail closed into the corporate UI, never legacy choices. */
export const corporateLoginRequested = (env: Record<string, string | undefined> = process.env) =>
  !!env.AUTH_CORPORATE_LOGIN_ENABLED && env.AUTH_CORPORATE_LOGIN_ENABLED !== "false";

export function corporateLoginPolicy(env: Record<string, string | undefined> = process.env): CorporateLoginPolicy | null {
  if (!corporateLoginRequested(env)) return null;
  const alias = env.KEYCLOAK_CORPORATE_IDP_ALIAS?.trim();
  if (env.AUTH_CORPORATE_LOGIN_ENABLED !== "true" || env.KEYCLOAK_ENABLED !== "true" ||
    !alias || !/^[A-Za-z0-9_-]{1,64}$/.test(alias) ||
    env.AUTH_DISABLED === "true" || env.ALLOW_LOCAL_OPERATOR_API_BYPASS === "true" || env.ALLOW_LOCAL_SHAREPOINT_BYPASS === "true")
    throw new AuthError("CORPORATE_LOGIN_NOT_CONFIGURED", 503);
  return { identityProviderAlias: alias };
}

/** Called only AFTER cryptographic OIDC validation (or trusted JWE decryption).
 * The ID token marker must come from Keycloak's server-owned identity_provider
 * session note, not a hardcoded mapper, user attribute, email or browser input.
 * No runtime proof exists until the externally approved mapper is configured.
 * Provider/tenant/member restrictions still require external policy homologation. */
export function requireCorporateIdentityProvider(value: unknown, policy: CorporateLoginPolicy | null) {
  if (policy && value !== policy.identityProviderAlias)
    throw new AuthError("CORPORATE_ACCOUNT_REQUIRED", 403);
}
