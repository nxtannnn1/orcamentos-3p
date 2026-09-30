import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

describe("CSP do proxy", () => {
  it("gera nonce por resposta e aplica diretivas restritivas", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = proxy(new NextRequest("https://portal.example/"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(response.headers.get("x-middleware-request-x-nonce")).toBeTruthy();
  });

  it("permite unsafe-eval somente durante desenvolvimento Next", () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = proxy(new NextRequest("http://localhost:3000/"));
    expect(response.headers.get("Content-Security-Policy")).toContain("'unsafe-eval'");
  });
});
