import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConfig, AuthError } from "../../../../server/auth/configuration";
import {
  cookieNames,
  cookieOptions,
  revokeCookieSession,
  seal,
  unseal,
} from "../../../../server/auth/session";
import { createMicrosoftClient, validateMicrosoftToken } from "../../../../server/auth/microsoft";
import { logMicrosoftLoginFailure, microsoftLoginFailure, type MicrosoftLoginStage, type MicrosoftLoginReason } from "../../../../server/auth/microsoft-diagnostics";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  let config: ReturnType<typeof authConfig>;
  let stage: MicrosoftLoginStage = "transaction";
  let reason: MicrosoftLoginReason | undefined;
  try {
    config = authConfig();
  } catch {
    return NextResponse.json(
      { error: "AUTH_NOT_CONFIGURED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const finish = (response: NextResponse) => {
    response.cookies.set(cookieNames(config).transaction, "", cookieOptions(config, 0));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  try {
    const params = new URL(request.url).searchParams;
    const transaction = (await cookies()).get(cookieNames(config).transaction)?.value;
    if (!transaction) {
      reason = "COOKIE_MISSING";
      throw new AuthError("LOGIN_EXPIRED");
    }
    let pending: Awaited<ReturnType<typeof unseal>>;
    try {
      pending = await unseal(transaction, "login", config);
    } catch (error) {
      reason = error && typeof error === "object" && "code" in error && error.code === "ERR_JWT_EXPIRED"
        ? "COOKIE_EXPIRED" : "COOKIE_INVALID";
      throw new AuthError("LOGIN_EXPIRED");
    }
    if (
      typeof pending.state !== "string" ||
      pending.state !== params.get("state") ||
      typeof pending.nonce !== "string" ||
      typeof pending.verifier !== "string"
    ) {
      reason = typeof pending.state === "string" && pending.state !== params.get("state")
        ? "STATE_MISMATCH" : "TRANSACTION_INVALID";
      throw new AuthError("LOGIN_EXPIRED");
    }
    stage = "provider";
    if (params.has("error")) {
      reason = "PROVIDER_REJECTED";
      throw new AuthError("LOGIN_FAILED");
    }
    const code = params.get("code");
    if (!code) {
      reason = "CODE_MISSING";
      throw new AuthError("LOGIN_FAILED");
    }
    stage = "code_exchange";
    const result = await createMicrosoftClient(config).acquireTokenByCode({
      code,
      scopes: ["openid", "profile", "email"],
      redirectUri: config.redirectUri,
      codeVerifier: pending.verifier,
      // MSAL also validates the ID token nonce before our cryptographic validator.
      nonce: pending.nonce,
    });
    if (!result?.idToken) {
      reason = "TOKEN_MISSING";
      throw new AuthError("LOGIN_FAILED");
    }
    stage = "token_validation";
    const { user, expiresAt } = await validateMicrosoftToken(result.idToken, pending.nonce, config);
    stage = "session";
    await revokeCookieSession(config);
    const response = NextResponse.redirect(new URL("/", config.origin));
    response.cookies.set(
      cookieNames(config).session,
      await seal(user, "session", expiresAt, config),
      cookieOptions(config, Math.max(0, expiresAt - Math.floor(Date.now() / 1000))),
    );
    return finish(response);
  } catch (error) {
    logMicrosoftLoginFailure(stage, reason ?? microsoftLoginFailure(stage, error));
    const code = error instanceof AuthError ? error.code : "LOGIN_FAILED";
    const response = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(code)}`, config.origin),
    );
    response.cookies.set(cookieNames(config).session, "", cookieOptions(config, 0));
    return finish(response);
  }
}
