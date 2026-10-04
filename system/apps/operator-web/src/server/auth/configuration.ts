import "server-only";

export class AuthError extends Error {
  constructor(
    readonly code: string,
    readonly status = 401,
  ) {
    super(code);
    this.name = "AuthError";
  }
}
export function authConfig(env: Record<string, string | undefined> = process.env) {
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new AuthError("AUTH_NOT_CONFIGURED", 503);
    return value;
  };
  const tenantId = required("ENTRA_LOGIN_TENANT_ID").toLowerCase();
  const clientId = required("ENTRA_LOGIN_CLIENT_ID").toLowerCase();
  const clientSecret = required("ENTRA_LOGIN_CLIENT_SECRET");
  const sessionSecret = required("AUTH_SESSION_SECRET");
  const rawOrigin = required("AUTH_APP_ORIGIN");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new AuthError("AUTH_NOT_CONFIGURED", 503);
  }
  const localDevelopment =
    env.NODE_ENV === "development" &&
    origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  const rawMfaContext = env.ENTRA_MFA_AUTH_CONTEXT_ID?.trim();
  const mfaContext = rawMfaContext || null;
  if (
    !uuid.test(tenantId) ||
    !uuid.test(clientId) ||
    sessionSecret.length < 32 ||
    (mfaContext === null ? !localDevelopment : !/^c([1-9]|[1-9][0-9])$/.test(mfaContext)) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      ))
  ) {
    throw new AuthError("AUTH_NOT_CONFIGURED", 503);
  }
  return {
    tenantId,
    clientId,
    clientSecret,
    sessionSecret,
    mfaContext,
    origin: origin.origin,
    secure: origin.protocol === "https:",
    authority: `https://login.microsoftonline.com/${tenantId}`,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    redirectUri: `${origin.origin}/api/auth/callback`,
  };
}
export type AuthConfig = ReturnType<typeof authConfig>;
export const appRoles = ["Operador", "Comprador", "Consulta"] as const;
export type AppRole = (typeof appRoles)[number];
export type AuthMode = "entra" | "local-mock-bypass" | "local-sharepoint-bypass";
export type SessionUser = {
  oid: string;
  tenantId: string;
  name: string;
  roles: AppRole[];
  mfaContext: string | null;
  authMode: AuthMode;
};
export const canReview = (user: SessionUser) =>
  user.roles.some((role) => role === "Operador" || role === "Comprador");
