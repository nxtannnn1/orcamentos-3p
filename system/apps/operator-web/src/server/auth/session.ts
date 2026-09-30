import "server-only";
import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appRoles, authConfig, AuthError, canReview, type AuthConfig, type SessionUser } from "./configuration";

export const cookieNames = (config: AuthConfig) => ({
  session: config.secure ? "__Host-3p-session" : "3p-session",
  transaction: config.secure ? "__Host-3p-login" : "3p-login",
});
export const cookieOptions = (config: AuthConfig, maxAge: number) => ({ httpOnly: true, secure: config.secure, sameSite: "lax" as const, path: "/", maxAge });
const key = async (config: AuthConfig) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.sessionSecret)));
export async function seal(payload: JWTPayload, purpose: "session" | "login", expiresAt: number, config: AuthConfig) {
  return new EncryptJWT(payload).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt()
    .setIssuer(config.origin).setAudience(`${config.clientId}:${purpose}`).setExpirationTime(expiresAt).encrypt(await key(config));
}
export async function unseal(value: string, purpose: "session" | "login", config: AuthConfig) {
  return (await jwtDecrypt(value, await key(config), { issuer: config.origin, audience: `${config.clientId}:${purpose}`,
    keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"], requiredClaims: ["exp", "iat"] })).payload;
}
export function parseSession(payload: JWTPayload, config: AuthConfig): SessionUser {
  if (payload.tenantId !== config.tenantId || typeof payload.oid !== "string" || !payload.oid
    || typeof payload.name !== "string" || payload.mfaContext !== config.mfaContext
    || !Array.isArray(payload.roles) || !payload.roles.length
    || !payload.roles.every((role) => appRoles.includes(role))) throw new AuthError("UNAUTHENTICATED");
  return payload as unknown as SessionUser;
}
export async function getSession(): Promise<SessionUser | null> {
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
    if (origin.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)) {
      throw new AuthError("AUTH_BYPASS_REQUIRES_LOCAL_ORIGIN", 503);
    }
    return {
      oid: "dev-local",
      tenantId: "dev-local",
      name: "Desenvolvimento Local",
      roles: ["Operador"],
      mfaContext: "dev",
    };
  }

  try {
    const config = authConfig();
    const value = (await cookies()).get(cookieNames(config).session)?.value;

    return value
      ? parseSession(await unseal(value, "session", config), config)
      : null;
  } catch {
    return null;
  }
}
export async function requireSession(write = false) {
  const user = await getSession();
  if (!user) throw new AuthError("UNAUTHENTICATED");
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
  return Response.json({ error: error.code, message: error.status === 403 ? "Seu perfil não permite esta operação." : "Entre com sua conta Microsoft da 3P para continuar." },
    { status: error.status, headers: { "Cache-Control": "no-store" } });
}
