import { NextResponse } from "next/server";
import { keycloakConfig, keycloakLogoutUrl } from "../../../../../server/auth/keycloak";
import { getKeycloakSession, revokeKeycloakSession } from "../../../../../server/auth/keycloak-session";
import { cookieNames, cookieOptions } from "../../../../../server/auth/session";

export async function POST(request: Request) {
  let config: ReturnType<typeof keycloakConfig>;
  try { config = keycloakConfig(); }
  catch { return NextResponse.json({ error: "KEYCLOAK_UNAVAILABLE" }, {
    status: process.env.KEYCLOAK_ENABLED === "true" ? 503 : 404,
    headers: { "Cache-Control": "no-store" },
  }); }
  if (request.headers.get("origin") !== config.origin || request.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    if (!await getKeycloakSession()) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    await revokeKeycloakSession();
  } catch { return NextResponse.json({ error: "LOGOUT_FAILED" }, { status: 503 }); }
  let target = new URL("/login", config.origin);
  try { target = await keycloakLogoutUrl(config); }
  catch { /* Local revocation already succeeded; provider downtime cannot restore it. */ }
  const response = request.headers.get("accept")?.includes("application/json")
    ? NextResponse.json({ logoutUrl: target.href }) : NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(cookieNames(config).session, "", cookieOptions(config, 0));
  response.cookies.set(cookieNames(config).transaction, "", cookieOptions(config, 0));
  return response;
}
