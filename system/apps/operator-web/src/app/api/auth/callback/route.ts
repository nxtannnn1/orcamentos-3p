import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConfig, AuthError } from "../../../../server/auth/configuration";
import { cookieNames, cookieOptions, seal, unseal } from "../../../../server/auth/session";
import { createMicrosoftClient, validateMicrosoftToken } from "../../../../server/auth/microsoft";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  let config: ReturnType<typeof authConfig>;
  try { config = authConfig(); } catch { return NextResponse.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  const finish = (response: NextResponse) => {
    response.cookies.set(cookieNames(config).transaction, "", cookieOptions(config, 0));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  try {
    const params = new URL(request.url).searchParams;
    const transaction = (await cookies()).get(cookieNames(config).transaction)?.value;
    if (!transaction) throw new AuthError("LOGIN_EXPIRED");
    const pending = await unseal(transaction, "login", config);
    if (typeof pending.state !== "string" || pending.state !== params.get("state") || typeof pending.nonce !== "string" || typeof pending.verifier !== "string") {
      throw new AuthError("LOGIN_EXPIRED");
    }
    if (params.has("error")) throw new AuthError("LOGIN_FAILED");
    const code = params.get("code");
    if (!code) throw new AuthError("LOGIN_FAILED");
    const result = await createMicrosoftClient(config).acquireTokenByCode({
      code, scopes: ["openid", "profile", "email"], redirectUri: config.redirectUri, codeVerifier: pending.verifier,
    });
    if (!result?.idToken) throw new AuthError("LOGIN_FAILED");
    const { user, expiresAt } = await validateMicrosoftToken(result.idToken, pending.nonce, config);
    const response = NextResponse.redirect(new URL("/", config.origin));
    response.cookies.set(cookieNames(config).session, await seal(user, "session", expiresAt, config), cookieOptions(config, Math.max(0, expiresAt - Math.floor(Date.now() / 1000))));
    return finish(response);
  } catch (error) {
    const code = error instanceof AuthError ? error.code : "LOGIN_FAILED";
    const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, config.origin));
    response.cookies.set(cookieNames(config).session, "", cookieOptions(config, 0));
    return finish(response);
  }
}
