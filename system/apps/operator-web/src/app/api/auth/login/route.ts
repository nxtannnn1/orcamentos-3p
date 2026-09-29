import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { authConfig } from "../../../../server/auth/configuration";
import { cookieNames, cookieOptions, seal } from "../../../../server/auth/session";
import { createMicrosoftClient } from "../../../../server/auth/microsoft";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const config = authConfig();
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const url = await createMicrosoftClient(config).getAuthCodeUrl({
      scopes: ["openid", "profile", "email"], redirectUri: config.redirectUri,
      state, nonce, codeChallenge: createHash("sha256").update(verifier).digest("base64url"), codeChallengeMethod: "S256",
      prompt: "select_account",
      claims: JSON.stringify({ id_token: { acrs: { essential: true, value: config.mfaContext } } }),
    });
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(cookieNames(config).transaction, await seal({ state, nonce, verifier }, "login", Math.floor(Date.now() / 1000) + 600, config), cookieOptions(config, 600));
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=AUTH_NOT_CONFIGURED", request.url));
  }
}
