import { beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, type JSONWebKeySet } from "jose";
vi.mock("server-only", () => ({}));
const keyStore = vi.hoisted(() => ({ jwks: { keys: [] } as JSONWebKeySet }));
vi.mock("jose", async (original) => {
  const actual = await original<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: () => actual.createLocalJWKSet(keyStore.jwks) };
});
import { authConfig } from "./configuration";
import { validateMicrosoftToken } from "./microsoft";
const config = authConfig({ ENTRA_LOGIN_TENANT_ID: "11111111-1111-1111-1111-111111111111", ENTRA_LOGIN_CLIENT_ID: "22222222-2222-2222-2222-222222222222", ENTRA_LOGIN_CLIENT_SECRET: "fake", AUTH_SESSION_SECRET: "test-only-secret-with-more-than-32-characters", ENTRA_MFA_AUTH_CONTEXT_ID: "c1", AUTH_APP_ORIGIN: "https://portal.example" });
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let foreignKeys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  foreignKeys = await generateKeyPair("RS256");
  keyStore.jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: "test-key", alg: "RS256", use: "sig" }] };
});
async function token(changes: Record<string, unknown> = {}, foreign = false) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: config.issuer, aud: config.clientId, sub: "subject", iat: now, exp: now + 3600, tid: config.tenantId,
    oid: "employee", name: "Pessoa 3P", nonce: "nonce", acct: 0, roles: ["Operador"], acrs: ["c1"], ...changes })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign((foreign ? foreignKeys : keys).privateKey);
}
describe("validação criptográfica da identidade Microsoft", () => {
  it("aceita membro da 3P com perfil e contexto exigidos", async () => {
    expect((await validateMicrosoftToken(await token(), "nonce", config)).user).toMatchObject({ oid: "employee", roles: ["Operador"], mfaContext: "c1" });
  });
  it.each([
    { iss: "https://attacker.example" }, { aud: "other-app" }, { tid: "other-tenant" }, { nonce: "other" },
    { acct: 1 }, { acct: undefined }, { roles: [] }, { roles: ["Unassigned"] }, { acrs: [] }, { acrs: ["c2"] },
    { exp: 1 }, { oid: undefined },
  ])("nega identidade inválida: %j", async (changes) => {
    await expect(validateMicrosoftToken(await token(changes), "nonce", config)).rejects.toThrow();
  });
  it("rejeita assinatura de outra chave mesmo com claims corretas", async () => {
    await expect(validateMicrosoftToken(await token({}, true), "nonce", config)).rejects.toThrow();
  });
});
