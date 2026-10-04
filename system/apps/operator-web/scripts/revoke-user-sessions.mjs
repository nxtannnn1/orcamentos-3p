import { createHash } from "node:crypto";

// Trusted administrative CLI. Never call this from a public route.
const oid = process.argv[2]?.toLowerCase();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!oid || !uuid.test(oid)) throw new Error("Informe o Object ID GUID do usuário.");
const origin = new URL(process.env.AUTH_APP_ORIGIN ?? "").origin;
const tenant = process.env.ENTRA_LOGIN_TENANT_ID?.trim().toLowerCase();
const client = process.env.ENTRA_LOGIN_CLIENT_ID?.trim().toLowerCase();
const endpoint = new URL(process.env.SECURITY_REDIS_REST_URL ?? "");
const token = process.env.SECURITY_REDIS_REST_TOKEN?.trim();
if (
  !uuid.test(tenant ?? "") ||
  !uuid.test(client ?? "") ||
  !token ||
  endpoint.protocol !== "https:" ||
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash ||
  endpoint.pathname !== "/"
) {
  throw new Error("Configure as variáveis do ambiente de destino e o Redis compartilhado.");
}
const digest = (value) => createHash("sha256").update(value).digest("hex");
const key = `3p:${digest(`${origin}:${tenant}:${client}`)}:user:${digest(oid)}`;
const response = await fetch(endpoint, {
  method: "POST",
  redirect: "error",
  cache: "no-store",
  signal: AbortSignal.timeout(5_000),
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(["INCR", key]),
});
const payload = await response.json();
if (!response.ok || payload.error || !Number.isSafeInteger(payload.result))
  throw new Error("Não foi possível confirmar a revogação.");
console.log("Sessões anteriores do usuário revogadas no ambiente configurado.");
