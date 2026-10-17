import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AuthError } from "../../../../../server/auth/configuration";
import { keycloakConfig, exchangeKeycloakCode } from "../../../../../server/auth/keycloak";
import { cookieNames, cookieOptions, seal, unseal } from "../../../../../server/auth/session";
import { revokePriorPortalSession } from "../../../../../server/auth/keycloak-session";
import { securityCommand } from "../../../../../server/security/store";
import { securityNamespace } from "../../../../../server/security/session-registry";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  let config: ReturnType<typeof keycloakConfig>;
  try { config = keycloakConfig(); }
  catch { return NextResponse.json({ error: "KEYCLOAK_UNAVAILABLE" }, {
    status: process.env.KEYCLOAK_ENABLED === "true" ? 503 : 404,
    headers: { "Cache-Control": "no-store" },
  }); }
  const finish = (response: NextResponse) => {
    response.cookies.set(cookieNames(config).transaction, "", cookieOptions(config, 0));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  let stage = "origin";
  try {
    const incoming = new URL(request.url);
    const url = new URL(config.redirectUri);
    // Next may construct Request.url with its internal listener hostname. Accept
    // only the configured public origin or an exact Host match, then pin the
    // token exchange redirect_uri to configuration, never forwarded input.
    if (incoming.pathname !== url.pathname ||
        (incoming.origin !== url.origin && request.headers.get("host") !== url.host))
      throw new AuthError("LOGIN_FAILED");
    url.search = incoming.search;
    stage = "transaction";
    const value = (await cookies()).get(cookieNames(config).transaction)?.value;
    if (!value) throw new AuthError("LOGIN_EXPIRED");
    const pending = await unseal(value, "login", config);
    if (pending.provider !== "keycloak" || pending.issuer !== config.issuer ||
        typeof pending.state !== "string" || pending.state !== url.searchParams.get("state") ||
        typeof pending.nonce !== "string" || typeof pending.verifier !== "string" ||
        url.searchParams.has("error") || !url.searchParams.get("code")) throw new AuthError("LOGIN_FAILED");
    stage = "consume";
    const transactionKey = `${securityNamespace(config)}:login:${createHash("sha256").update(pending.state).digest("hex")}`;
    if (await securityCommand(["SET", transactionKey, "used", "NX", "EX", 600]) !== "OK")
      throw new AuthError("LOGIN_EXPIRED");
    stage = "token";
    const { user, expiresAt } = await exchangeKeycloakCode(config, url, {
      state: pending.state, nonce: pending.nonce, verifier: pending.verifier,
    });
    stage = "replace-session";
    await revokePriorPortalSession();
    stage = "seal";
    const response = NextResponse.redirect(new URL("/", config.origin));
    response.cookies.set(cookieNames(config).session, await seal(user, "session", expiresAt, config),
      cookieOptions(config, expiresAt - Math.floor(Date.now() / 1000)));
    return finish(response);
  } catch (error) {
    // Only stable error categories; never provider messages, request URLs or tokens.
    if (process.env.NODE_ENV === "development" && error instanceof Error) {
      const category = error as Error & { code?: string; cause?: { code?: string; name?: string } };
      console.warn("Keycloak callback rejected", { stage, name: category.name, code: category.code,
        causeName: category.cause?.name, causeCode: category.cause?.code });
    }
    const code = error instanceof AuthError && ["ROLE_REQUIRED", "LOGIN_EXPIRED"].includes(error.code)
      ? error.code : "LOGIN_FAILED";
    // A failed alternative login must not erase an existing valid Microsoft session.
    return finish(NextResponse.redirect(new URL(`/login?error=${code}`, config.origin)));
  }
}
