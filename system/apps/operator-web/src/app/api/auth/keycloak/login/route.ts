import { NextResponse } from "next/server";
import { AuthError } from "../../../../../server/auth/configuration";
import { keycloakConfig, keycloakAuthorization } from "../../../../../server/auth/keycloak";
import { cookieNames, cookieOptions, seal } from "../../../../../server/auth/session";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const config = keycloakConfig();
    const { url, ...pending } = await keycloakAuthorization(config);
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(cookieNames(config).transaction,
      await seal({
        ...pending, provider: "keycloak", issuer: config.issuer,
        corporateLoginAlias: config.corporateLogin?.identityProviderAlias ?? null
      }, "login",
        Math.floor(Date.now() / 1000) + 600, config), cookieOptions(config, 600));
    return response;
 } catch (error) {
  console.error("keycloak.login.failed", {
    errorType: error instanceof Error ? error.name : typeof error,
    errorCode:
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined,
  });

  return NextResponse.json(
    { error: "KEYCLOAK_UNAVAILABLE" },
    {
      status: error instanceof AuthError && error.code === "KEYCLOAK_DISABLED" ? 404 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
}
