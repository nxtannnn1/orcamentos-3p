import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoginActions } from "./login-actions";

describe("public login choices", () => {
  it.each([true, false])("shows exactly one corporate action even with Microsoft configured=%s", microsoftConfigured => {
    const html = renderToStaticMarkup(<LoginActions corporateMode microsoftConfigured={microsoftConfigured} keycloakConfigured />);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/api/auth/keycloak/login"');
    expect(html).toContain("Entrar com conta corporativa");
    expect(html).not.toContain("Entrar com Microsoft");
    expect(html).not.toContain("Entrar com Keycloak");
    expect(html).not.toContain('href="/api/auth/login"');
    expect(html).not.toContain("<input");
  });
  it("shows one disabled corporate action without fallback when configuration is missing", () => {
    const html = renderToStaticMarkup(<LoginActions corporateMode microsoftConfigured keycloakConfigured={false} />);
    expect(html.match(/<button /g)).toHaveLength(1);
    expect(html).toContain('disabled=""'); expect(html).toContain("Entrar com conta corporativa");
    expect(html).not.toContain("<a "); expect(html).not.toContain("Entrar com Microsoft");
  });
  it("preserves both legacy choices when corporate mode is off", () => {
    const html = renderToStaticMarkup(<LoginActions corporateMode={false} microsoftConfigured keycloakConfigured />);
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain("Entrar com Microsoft"); expect(html).toContain("Entrar com Keycloak");
  });
  it("preserves Microsoft-only UI when the optional Keycloak provider is disabled", () => {
    const html = renderToStaticMarkup(<LoginActions corporateMode={false} microsoftConfigured keycloakConfigured={false} />);
    expect(html.match(/<a /g)).toHaveLength(1); expect(html).toContain('href="/api/auth/login"');
  });
});
