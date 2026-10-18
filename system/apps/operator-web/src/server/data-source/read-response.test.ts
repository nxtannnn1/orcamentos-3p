import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ authErrorResponse: () => null }));
import { dataSourceReadResponse } from "./read-response";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("leituras observáveis sem fallback", () => {
  it("correlaciona a resposta com a fonte selecionada sem registrar dados", async () => {
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await dataSourceReadResponse("budgets", async () => Response.json([{ private: "never-log" }]));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(log).toHaveBeenCalledWith("operator-web.data-read", expect.objectContaining({
      correlationId: response.headers.get("X-Correlation-Id"), selectedSource: "sharepoint", adapter: "sharepoint-graph", status: 200,
    }));
    expect(JSON.stringify(log.mock.calls)).not.toContain("never-log");
  });
  it("recusa fonte inválida antes de consultar qualquer adaptador", async () => {
    vi.stubEnv("DATA_SOURCE", "synthetic-invalid-secret");
    const read = vi.fn();
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await dataSourceReadResponse("items", read);
    expect(response.status).toBe(503);
    expect(read).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("synthetic-invalid-secret");
    expect(await response.json()).toMatchObject({ error: "DATA_SOURCE_CONFIGURATION_ERROR" });
  });
  it("falha de upstream retorna erro seguro sem dados mock", async () => {
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    vi.spyOn(console, "info").mockImplementation(() => {});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await dataSourceReadResponse("materials", async () => { throw new Error("synthetic-secret"); });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "DATA_SOURCE_UNAVAILABLE", message: "A fonte de dados está temporariamente indisponível." });
    expect(JSON.stringify(log.mock.calls)).not.toContain("synthetic-secret");
  });
});
