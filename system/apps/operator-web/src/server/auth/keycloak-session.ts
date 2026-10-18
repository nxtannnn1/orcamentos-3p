import "server-only";
import { cookies } from "next/headers";
import type { JWTPayload } from "jose";
import { AuthError, appRoles, authConfig, type SessionUser } from "./configuration";
import { keycloakConfig, keycloakIdentity, type KeycloakConfig } from "./keycloak";
import { cookieNames, unseal, revokeCookieSession } from "./session";
import { isSessionActive, revokeSession } from "../security/session-registry";
import { requireCorporateIdentityProvider } from "./corporate-login";

export function parseKeycloakSession(payload: JWTPayload, config: KeycloakConfig): SessionUser {
  if (payload.authMode !== "keycloak" || payload.issuer !== config.issuer ||
      typeof payload.subject !== "string" || !payload.subject ||
      payload.oid !== keycloakIdentity(config.issuer, payload.subject) ||
      payload.tenantId !== config.issuer || payload.mfaContext !== null ||
      typeof payload.name !== "string" || !Array.isArray(payload.roles) || !payload.roles.length ||
      !payload.roles.every(role => appRoles.includes(role))) throw new AuthError("UNAUTHENTICATED");
  requireCorporateIdentityProvider(payload.identityProvider, config.corporateLogin);
  return payload as unknown as SessionUser;
}
export async function getKeycloakSession(): Promise<SessionUser | null> {
  try {
    const config = keycloakConfig();
    const value = (await cookies()).get(cookieNames(config).session)?.value;
    if (!value) return null;
    const payload = await unseal(value, "session", config);
    const user = parseKeycloakSession(payload, config);
    return await isSessionActive(payload.sid, payload.userVersion, user.oid, config) ? user : null;
  } catch (error) {
    if (error instanceof AuthError && error.code.startsWith("SECURITY_STORE_")) throw error;
    return null;
  }
}
export async function revokeKeycloakSession() {
  const config = keycloakConfig();
  const value = (await cookies()).get(cookieNames(config).session)?.value;
  if (!value) return;
  let payload: JWTPayload;
  try { payload = await unseal(value, "session", config); }
  catch { return; }
  // Revoke legacy/native sessions during replacement without accepting them as corporate.
  parseKeycloakSession(payload, { ...config, corporateLogin: null });
  await revokeSession(payload.sid, config);
}
/** A successful login replaces one application identity and revokes its old session. */
export async function revokePriorPortalSession() {
  await revokeKeycloakSession();
  let config;
  try { config = authConfig(); }
  catch (error) {
    if (error instanceof AuthError && error.code === "AUTH_NOT_CONFIGURED") return;
    throw error;
  }
  await revokeCookieSession(config);
}
