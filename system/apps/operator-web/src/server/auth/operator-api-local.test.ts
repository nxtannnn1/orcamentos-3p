import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { getSession, requireSession } from "./session";
afterEach(() => vi.unstubAllEnvs());
function configure() {
  vi.stubEnv("ALLOW_LOCAL_OPERATOR_API_BYPASS", "true");
  vi.stubEnv("AUTH_DISABLED", "true");
  vi.stubEnv("DATA_SOURCE", "operator-api");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("OPERATOR_API_BASE_URL", "http://127.0.0.1:3001");
}
it("consulta local não concede permissão de escrita", async () => {
  configure();
  expect((await getSession())?.roles).toEqual(["Consulta"]);
  await expect(requireSession(true)).rejects.toMatchObject({ status: 403 });
});
it.each([
  ["NODE_ENV", "production"], ["AUTH_DISABLED", "false"], ["DATA_SOURCE", "sharepoint"],
  ["AUTH_APP_ORIGIN", "http://remote.example"], ["OPERATOR_API_BASE_URL", "https://remote.example"],
])("modo local falha fechado com %s=%s", async (key, value) => {
  configure(); vi.stubEnv(key, value);
  await expect(getSession()).rejects.toMatchObject({ status: 503 });
});
