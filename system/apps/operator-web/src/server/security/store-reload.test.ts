import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());
it("shares local session state across development module instances without allowing production memory", async () => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("SECURITY_REDIS_REST_URL", ""); vi.stubEnv("SECURITY_REDIS_REST_TOKEN", "");
  const first = await import("./store");
  await first.securityCommand(["SET", "registry-module-reload-test", "active", "EX", 60]);
  vi.resetModules();
  const second = await import("./store");
  expect(await second.securityCommand(["GET", "registry-module-reload-test"])).toBe("active");
  vi.stubEnv("NODE_ENV", "production");
  await expect(second.securityCommand(["GET", "registry-module-reload-test"])).rejects.toMatchObject({ code: "SECURITY_STORE_NOT_CONFIGURED" });
});
