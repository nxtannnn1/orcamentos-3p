import "server-only";
import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  appRoles,
  authConfig,
  AuthError,
  canReview,
  type AuthConfig,
  type SessionUser,
} from "./configuration";
import { isSessionActive, registerSession, revokeSession } from "../security/session-registry";

export const cookieNames = (config: AuthConfig) => ({
  session: config.secure ? "__Host-3p-session" : "3p-session",
  transaction: config.secure ? "__Host-3p-login" : "3p-login",
});
export const cookieOptions = (config: AuthConfig, maxAge: number) => ({
  httpOnly: true,
  secure: config.secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});
const key = async (config: AuthConfig) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.sessionSecret)),
  );
export async function seal(
  payload: JWTPayload,
  purpose: "session" | "login",
  expiresAt: number,
  config: AuthConfig,
) {
  if (purpose === "session") {
    if (typeof payload.oid !== "string") throw new AuthError("UNAUTHENTICATED");
    expiresAt = Math.min(expiresAt, Math.floor(Date.now() / 1000) + 900);
    // Expired payloads are never registered as active sessions.
    if (expiresAt > Math.floor(Date.now() / 1000))
      payload = { ...payload, ...(await registerSession(payload.oid, expiresAt, config)) };
  }
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer(config.origin)
    .setAudience(`${config.clientId}:${purpose}`)
    .setExpirationTime(expiresAt)
    .encrypt(await key(config));
}
export async function unseal(value: string, purpose: "session" | "login", config: AuthConfig) {
  return (
    await jwtDecrypt(value, await key(config), {
      issuer: config.origin,
      audience: `${config.clientId}:${purpose}`,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
      requiredClaims: ["exp", "iat"],
    })
  ).payload;
}
export function parseSession(payload: JWTPayload, config: AuthConfig): SessionUser {
  if (
    payload.authMode !== "entra" ||
    payload.tenantId !== config.tenantId ||
    typeof payload.oid !== "string" ||
    !payload.oid ||
    typeof payload.name !== "string" ||
    (config.mfaContext !== null && payload.mfaContext !== config.mfaContext) ||
    !Array.isArray(payload.roles) ||
    !payload.roles.length ||
    !payload.roles.every((role) => appRoles.includes(role))
  )
    throw new AuthError("UNAUTHENTICATED");
  return payload as unknown as SessionUser;
}
export async function getSession(): Promise<SessionUser | null> {
  if (process.env.ALLOW_LOCAL_OPERATOR_API_BYPASS === "true") {
    let valid = false;
    try {
      const origin = new URL(process.env.AUTH_APP_ORIGIN ?? "");
      const api = new URL(process.env.OPERATOR_API_BASE_URL ?? "");
      const local = (url: URL) => url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
      valid = process.env.NODE_ENV === "development" && process.env.AUTH_DISABLED === "true" &&
        process.env.DATA_SOURCE === "operator-api" && local(origin) && local(api);
    } catch { /* rejeitar configuração */ }
    if (!valid) throw new AuthError("LOCAL_OPERATOR_API_BYPASS_REQUIRES_LOCAL_DEVELOPMENT", 503);
    return { oid: "dev-local-operator-api-readonly", tenantId: "dev-local-operator-api",
      name: "Consulta local PostgreSQL", roles: ["Consulta"], mfaContext: null,
      authMode: "local-operator-api-bypass" };
  }
  const allowLocalSharePointBypass = process.env.ALLOW_LOCAL_SHAREPOINT_BYPASS === "true";
  if (allowLocalSharePointBypass && process.env.DATA_SOURCE === "sharepoint") {
    if (process.env.AUTH_DISABLED !== "true") {
      throw new AuthError("LOCAL_SHAREPOINT_BYPASS_REQUIRES_AUTH_DISABLED", 503);
    }
    let origin: URL;
    try {
      origin = new URL(process.env.AUTH_APP_ORIGIN ?? "");
    } catch {
      throw new AuthError("LOCAL_SHAREPOINT_BYPASS_REQUIRES_LOCAL_DEVELOPMENT", 503);
    }
    if (
      process.env.NODE_ENV !== "development" ||
      origin.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/"
    ) {
      throw new AuthError("LOCAL_SHAREPOINT_BYPASS_REQUIRES_LOCAL_DEVELOPMENT", 503);
    }
    return {
      oid: "dev-local-sharepoint-readonly",
      tenantId: "dev-local-sharepoint",
      name: "SharePoint Local (somente leitura)",
      roles: ["Consulta"],
      mfaContext: null,
      authMode: "local-sharepoint-bypass",
    };
  }
  if (allowLocalSharePointBypass && process.env.DATA_SOURCE !== "mock") {
    throw new AuthError("LOCAL_SHAREPOINT_BYPASS_REQUIRES_SHAREPOINT", 503);
  }
  if (process.env.AUTH_DISABLED === "true") {
    if (process.env.NODE_ENV !== "development") {
      throw new AuthError("AUTH_BYPASS_REQUIRES_DEVELOPMENT", 503);
    }
    if (process.env.DATA_SOURCE !== "mock") {
      throw new AuthError("AUTH_BYPASS_REQUIRES_MOCK_DATA", 503);
    }
    let origin: URL;
    try {
      origin = new URL(process.env.AUTH_APP_ORIGIN ?? "");
    } catch {
      throw new AuthError("AUTH_BYPASS_REQUIRES_LOCAL_ORIGIN", 503);
    }
    if (
      origin.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
    ) {
      throw new AuthError("AUTH_BYPASS_REQUIRES_LOCAL_ORIGIN", 503);
    }
    return {
      oid: "dev-local",
      tenantId: "dev-local",
      name: "Desenvolvimento Local",
      roles: ["Operador"],
      mfaContext: "dev",
      authMode: "local-mock-bypass",
    };
  }

  try {
    const config = authConfig();
    const value = (await cookies()).get(cookieNames(config).session)?.value;

    if (!value) return null;
    const payload = await unseal(value, "session", config);
    const user = parseSession(payload, config);
    return (await isSessionActive(payload.sid, payload.userVersion, user.oid, config))
      ? user
      : null;
  } catch (error) {
    if (error instanceof AuthError && error.code.startsWith("SECURITY_STORE_")) throw error;
    return null;
  }
}
export async function revokeCookieSession(config: AuthConfig) {
  const value = (await cookies()).get(cookieNames(config).session)?.value;
  if (!value) return;
  let payload: JWTPayload;
  try {
    payload = await unseal(value, "session", config);
  } catch {
    return;
  }
  await revokeSession(payload.sid, config);
}
export async function requireSession(write = false) {
  const user = await getSession();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  if (write && user.authMode === "local-sharepoint-bypass") throw new AuthError("FORBIDDEN", 403);
  if (write && !canReview(user)) throw new AuthError("FORBIDDEN", 403);
  return user;
}
export async function requirePageSession() {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}
export function authErrorResponse(error: unknown) {
  if (!(error instanceof AuthError)) return null;
  return Response.json(
    {
      error: error.code,
      message:
        error.status === 503
          ? "O controle de acesso está temporariamente indisponível."
          : error.status === 403
            ? "Seu perfil não permite esta operação."
            : "Entre com sua conta Microsoft da 3P para continuar.",
    },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}
