import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { corporateLoginPolicy, corporateLoginRequested, requireCorporateIdentityProvider } from "./corporate-login";

const enabled = { AUTH_CORPORATE_LOGIN_ENABLED: "true", KEYCLOAK_ENABLED: "true", KEYCLOAK_CORPORATE_IDP_ALIAS: "oidc" };
describe("corporate entry policy configuration", () => {
  it("is disabled by default and preserves the legacy entry", () => {
    expect(corporateLoginPolicy({})).toBeNull();
    expect(corporateLoginRequested({})).toBe(false);
    expect(corporateLoginPolicy({ AUTH_CORPORATE_LOGIN_ENABLED: "false" })).toBeNull();
  });
  it("uses the configured alias exactly", () => {
    expect(corporateLoginPolicy(enabled)).toEqual({ identityProviderAlias: "oidc" });
  });
  it.each(["", "../oidc", "oidc?x=1", "https://foreign.example", "x".repeat(65)])("rejects invalid alias %j", alias => {
    expect(() => corporateLoginPolicy({ ...enabled, KEYCLOAK_CORPORATE_IDP_ALIAS: alias })).toThrowError("CORPORATE_LOGIN_NOT_CONFIGURED");
  });
  it("does not silently restore duplicated legacy buttons for a mistyped flag", () => {
    expect(corporateLoginRequested({ ...enabled, AUTH_CORPORATE_LOGIN_ENABLED: "TRUE" })).toBe(true);
    expect(() => corporateLoginPolicy({ ...enabled, AUTH_CORPORATE_LOGIN_ENABLED: "TRUE" })).toThrow();
  });
  it("requires Keycloak enabled", () => {
    expect(() => corporateLoginPolicy({ ...enabled, KEYCLOAK_ENABLED: "false" })).toThrow();
  });
  it.each(["AUTH_DISABLED", "ALLOW_LOCAL_OPERATOR_API_BYPASS", "ALLOW_LOCAL_SHAREPOINT_BYPASS"])("refuses corporate mode with %s", bypass => {
    expect(() => corporateLoginPolicy({ ...enabled, [bypass]: "true" })).toThrow();
  });
  it.each([undefined, null, "", "local", "OIDC", ["oidc"], { value: "oidc" }])("rejects missing or wrong server-owned provenance %j", value => {
    expect(() => requireCorporateIdentityProvider(value, corporateLoginPolicy(enabled))).toThrowError("CORPORATE_ACCOUNT_REQUIRED");
  });
  it("accepts exact provenance only when policy is enabled", () => {
    expect(() => requireCorporateIdentityProvider("oidc", corporateLoginPolicy(enabled))).not.toThrow();
    expect(() => requireCorporateIdentityProvider(undefined, null)).not.toThrow();
  });
});
