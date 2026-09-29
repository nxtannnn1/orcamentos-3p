import "server-only";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { appRoles, AuthError, type AuthConfig, type SessionUser } from "./configuration";

export const createMicrosoftClient = (config: AuthConfig) => new ConfidentialClientApplication({
  auth: { clientId: config.clientId, clientSecret: config.clientSecret, authority: config.authority },
  system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } },
});
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export function claimsToUser(claims: JWTPayload, nonce: string, config: AuthConfig): SessionUser {
  if (claims.tid !== config.tenantId || claims.nonce !== nonce || typeof claims.oid !== "string" || !claims.oid
    || ![0, "0"].includes(claims.acct as string | number)) throw new AuthError("ACCOUNT_NOT_ALLOWED", 403);
  const roles = appRoles.filter((role) => Array.isArray(claims.roles) && claims.roles.includes(role));
  if (!roles.length) throw new AuthError("ROLE_REQUIRED", 403);
  if (!Array.isArray(claims.acrs) || !claims.acrs.includes(config.mfaContext)) throw new AuthError("MFA_REQUIRED", 403);
  return { oid: claims.oid, tenantId: config.tenantId, name: typeof claims.name === "string" ? claims.name : "Usuário 3P", roles, mfaContext: config.mfaContext };
}
export async function validateMicrosoftToken(token: string, nonce: string, config: AuthConfig) {
  let keys = keySets.get(config.tenantId);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${config.authority}/discovery/v2.0/keys`));
    keySets.set(config.tenantId, keys);
  }
  const { payload } = await jwtVerify(token, keys, { issuer: config.issuer, audience: config.clientId, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "nonce"] });
  return { user: claimsToUser(payload, nonce, config), expiresAt: Math.min(payload.exp!, Math.floor(Date.now() / 1000) + 3600) };
}
