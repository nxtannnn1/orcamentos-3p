import "server-only";
import * as oidc from "openid-client";
import { createHash } from "node:crypto";
import { AuthError, type SessionConfig, type SessionUser, type AppRole } from "./configuration";

const loopback = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
export function keycloakConfig(env: Record<string, string | undefined> = process.env) {
  if (env.KEYCLOAK_ENABLED !== "true") throw new AuthError("KEYCLOAK_DISABLED", 404);
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new AuthError("KEYCLOAK_NOT_CONFIGURED", 503);
    return value;
  };
  try {
    const issuer = new URL(required("KEYCLOAK_ISSUER"));
    const app = new URL(required("AUTH_APP_ORIGIN"));
    const clientId = required("KEYCLOAK_CLIENT_ID");
    const clientSecret = required("KEYCLOAK_CLIENT_SECRET");
    const sessionSecret = required("AUTH_SESSION_SECRET");
    const local = ["development", "test"].includes(env.NODE_ENV ?? "");
    const allowed = (url: URL) => !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === "https:" || (local && url.protocol === "http:" && loopback(url))) &&
      (env.NODE_ENV !== "production" || !loopback(url));
    if (!allowed(issuer) || !allowed(app) || app.pathname !== "/" ||
        sessionSecret.length < 32 || !/^[A-Za-z0-9._:-]{1,128}$/.test(clientId)) throw new Error();
    const settings: SessionConfig = {
      provider: "keycloak", tenantId: issuer.href.replace(/\/$/, ""), clientId,
      sessionSecret, origin: app.origin, secure: app.protocol === "https:",
    };
    return { ...settings, provider: "keycloak" as const, issuer: settings.tenantId,
      clientSecret, redirectUri: `${app.origin}/api/auth/keycloak/callback`,
      allowHttp: local && issuer.protocol === "http:" };
  } catch {
    throw new AuthError("KEYCLOAK_NOT_CONFIGURED", 503);
  }
}
export type KeycloakConfig = ReturnType<typeof keycloakConfig>;

// Only exact client roles issued for this portal grant business permissions.
const roleMap: Readonly<Record<string, AppRole>> = Object.freeze({
  Operador: "Operador", Comprador: "Comprador", Consulta: "Consulta",
});
export const keycloakIdentity = (issuer: string, subject: string) => JSON.stringify([issuer, subject]);
export function keycloakClaimsToUser(claims: Record<string, unknown>, config: KeycloakConfig): SessionUser {
  if (claims.iss !== config.issuer || typeof claims.sub !== "string" || !claims.sub)
    throw new AuthError("ACCOUNT_NOT_ALLOWED", 403);
  const access = claims.resource_access as Record<string, { roles?: unknown }> | undefined;
  const raw = access?.[config.clientId]?.roles;
  const roles = Array.isArray(raw) ? [...new Set(raw.filter((role): role is string =>
    typeof role === "string" && Object.hasOwn(roleMap, role)).map(role => roleMap[role]))] : [];
  if (!roles.length) throw new AuthError("ROLE_REQUIRED", 403);
  return {
    authMode: "keycloak", issuer: config.issuer, subject: claims.sub,
    // Compatibility aliases are NOT Microsoft tenant/OID and cannot authorize real writes.
    tenantId: config.issuer, oid: keycloakIdentity(config.issuer, claims.sub),
    name: typeof claims.name === "string" ? claims.name : "Usuário 3P",
    roles, mfaContext: null,
  };
}

const configurations = new Map<string, Promise<oidc.Configuration>>();
export async function discoverKeycloak(config: KeycloakConfig) {
  const cacheKey = createHash("sha256").update(JSON.stringify([
    config.issuer, config.clientId, config.clientSecret, config.allowHttp,
  ])).digest("hex");
  let pending = configurations.get(cacheKey);
  if (!pending) {
    if (configurations.size >= 8) configurations.clear();
    pending = oidc.discovery(new URL(config.issuer), config.clientId, {
      id_token_signed_response_alg: "RS256", [oidc.clockTolerance]: 0,
    }, oidc.ClientSecretPost(config.clientSecret), {
      timeout: 10,
      execute: config.allowHttp
        ? [oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks]
        : [oidc.enableNonRepudiationChecks],
    }).then(client => {
      const metadata = client.serverMetadata();
      if (metadata.issuer !== config.issuer || !client.serverMetadata().supportsPKCE("S256"))
        throw new AuthError("KEYCLOAK_NOT_CONFIGURED", 503);
      // This deployment uses Keycloak endpoints on the configured issuer origin.
      for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint,
        metadata.jwks_uri, metadata.end_session_endpoint]) {
        if (!endpoint || new URL(endpoint).origin !== new URL(config.issuer).origin)
          throw new AuthError("KEYCLOAK_NOT_CONFIGURED", 503);
      }
      return client;
    });
    configurations.set(cacheKey, pending);
  }
  try { return await pending; }
  catch (error) { configurations.delete(cacheKey); throw error; }
}
export async function keycloakAuthorization(config: KeycloakConfig) {
  const client = await discoverKeycloak(config);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const verifier = oidc.randomPKCECodeVerifier();
  const url = oidc.buildAuthorizationUrl(client, {
    scope: "openid profile", response_type: "code", redirect_uri: config.redirectUri,
    state, nonce, prompt: "login", code_challenge_method: "S256",
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
  });
  return { url, state, nonce, verifier };
}
export async function exchangeKeycloakCode(config: KeycloakConfig, url: URL,
  pending: { state: string; nonce: string; verifier: string }) {
  const client = await discoverKeycloak(config);
  const tokens = await oidc.authorizationCodeGrant(client, url, {
    expectedState: pending.state, expectedNonce: pending.nonce,
    pkceCodeVerifier: pending.verifier, idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims || typeof claims.exp !== "number") throw new AuthError("LOGIN_FAILED");
  const expiresAt = Math.min(claims.exp, Math.floor(Date.now() / 1000) + 900);
  if (expiresAt <= Math.floor(Date.now() / 1000)) throw new AuthError("LOGIN_EXPIRED");
  return { user: keycloakClaimsToUser(claims, config), expiresAt };
  // Access, refresh and ID tokens are deliberately discarded, never put in the cookie.
}
export async function keycloakLogoutUrl(config: KeycloakConfig) {
  return oidc.buildEndSessionUrl(await discoverKeycloak(config), {
    client_id: config.clientId, post_logout_redirect_uri: `${config.origin}/login`,
  });
}
