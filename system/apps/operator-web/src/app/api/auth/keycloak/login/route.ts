import { NextResponse } from "next/server";
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
      await seal({ ...pending, provider: "keycloak", issuer: config.issuer }, "login",
        Math.floor(Date.now() / 1000) + 600, config), cookieOptions(config, 600));
    return response;
  } catch {
    return NextResponse.json({ error: process.env.KEYCLOAK_ENABLED === "true"
      ? "KEYCLOAK_UNAVAILABLE" : "KEYCLOAK_DISABLED" }, {
      status: process.env.KEYCLOAK_ENABLED === "true" ? 503 : 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
