import { createHash } from "node:crypto";
async function main() {
  // Administrative tool. Exact case-sensitive subject; never an email or Microsoft OID.
  const subject = process.argv[2];
  const issuer = new URL(process.env.KEYCLOAK_ISSUER?.trim() ?? "").href.replace(/\/$/, "");
  const client = process.env.KEYCLOAK_CLIENT_ID?.trim();
  const origin = new URL(process.env.AUTH_APP_ORIGIN ?? "").origin;
  const endpoint = new URL(process.env.SECURITY_REDIS_REST_URL ?? "");
  const token = process.env.SECURITY_REDIS_REST_TOKEN?.trim();
  const issuerUrl = new URL(issuer ?? "");
  if (!subject || !client || process.env.KEYCLOAK_ENABLED !== "true" || !token ||
      issuerUrl.protocol !== "https:" || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash ||
      endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/")
    throw new Error("Configure o provedor e o Redis compartilhado do ambiente de destino.");
  const digest = value => createHash("sha256").update(value).digest("hex");
  const namespace = `3p:${digest(JSON.stringify(["keycloak", origin, issuer, client]))}`;
  const identity = JSON.stringify([issuer, subject]);
  const response = await fetch(endpoint, {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5_000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["INCR", `${namespace}:user:${digest(identity)}`]),
  });
  const payload = await response.json();
  if (!response.ok || payload.error || !Number.isSafeInteger(payload.result))
    throw new Error("Não foi possível confirmar a revogação.");
  console.log("Sessões Keycloak anteriores revogadas no ambiente configurado.");

}
main().catch(() => { console.error("Não foi possível revogar as sessões. Verifique a configuração e a disponibilidade do controle de acesso."); process.exitCode = 1; });
