import { NextResponse } from "next/server";
import { authConfig } from "../../../../server/auth/configuration";
import {
  authErrorResponse,
  cookieNames,
  cookieOptions,
  revokeCookieSession,
} from "../../../../server/auth/session";

export async function POST(request: Request) {
  let config: ReturnType<typeof authConfig>;
  try {
    config = authConfig();
  } catch {
    return Response.json({ error: "AUTH_NOT_CONFIGURED" }, { status: 503 });
  }
  if (
    request.headers.get("origin") !== config.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  try {
    await revokeCookieSession(config);
  } catch (error) {
    return (
      authErrorResponse(error) ??
      Response.json(
        { error: "LOGOUT_FAILED" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      )
    );
  }
  const url = new URL(`${config.authority}/oauth2/v2.0/logout`);
  url.searchParams.set("post_logout_redirect_uri", `${config.origin}/login`);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(cookieNames(config).session, "", cookieOptions(config, 0));
  response.cookies.set(cookieNames(config).transaction, "", cookieOptions(config, 0));
  return response;
}
