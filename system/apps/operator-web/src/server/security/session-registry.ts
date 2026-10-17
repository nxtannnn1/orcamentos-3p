import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { AuthError, type SessionConfig } from "../auth/configuration";
import { securityCommand } from "./store";

export const securityNamespace = (config: SessionConfig) =>
  `3p:${createHash("sha256").update(config.provider === "keycloak"
    ? JSON.stringify(["keycloak", config.origin, config.tenantId, config.clientId])
    : `${config.origin}:${config.tenantId}:${config.clientId}`).digest("hex")}`;
const userKey = (config: SessionConfig, oid: string) =>
  `${securityNamespace(config)}:user:${createHash("sha256").update(config.provider === "keycloak" ? oid : oid.toLowerCase()).digest("hex")}`;
const sessionKey = (config: SessionConfig, sid: string) =>
  `${securityNamespace(config)}:session:${sid}`;

export async function registerSession(oid: string, expiresAt: number, config: SessionConfig) {
  const userVersion = String((await securityCommand(["GET", userKey(config, oid)])) ?? "0");
  const sid = randomUUID();
  const ttl = expiresAt - Math.floor(Date.now() / 1000);
  if (ttl <= 0) throw new AuthError("UNAUTHENTICATED");
  if ((await securityCommand(["SET", sessionKey(config, sid), oid, "EX", ttl, "NX"])) !== "OK") {
    throw new AuthError("SECURITY_STORE_UNAVAILABLE", 503);
  }
  return { sid, userVersion };
}

export async function isSessionActive(
  sid: unknown,
  version: unknown,
  oid: string,
  config: SessionConfig,
) {
  if (typeof sid !== "string" || !/^[0-9a-f-]{36}$/.test(sid) || typeof version !== "string")
    return false;
  const active = await securityCommand(["GET", sessionKey(config, sid)]);
  const currentVersion = String((await securityCommand(["GET", userKey(config, oid)])) ?? "0");
  return active === oid && version === currentVersion;
}

export async function revokeSession(sid: unknown, config: SessionConfig) {
  if (typeof sid === "string" && /^[0-9a-f-]{36}$/.test(sid))
    await securityCommand(["DEL", sessionKey(config, sid)]);
}

// O processo administrativo chama esta função quando o acesso no Entra muda.
// O portal não expõe uma rota pública para revogar sessões.
export async function revokeUserSessions(oid: string, config: SessionConfig) {
  if (!oid.trim()) throw new AuthError("INVALID_USER", 400);
  await securityCommand(["INCR", userKey(config, oid)]);
}
