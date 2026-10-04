import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let budgetsGet: typeof import("./orcamentos/route").GET;
let itemsGet: typeof import("./orcamentos/[id]/itens/route").GET;
let materialsGet: typeof import("./materiais/route").GET;

beforeAll(async () => {
  budgetsGet = (await import("./orcamentos/route")).GET;
  itemsGet = (await import("./orcamentos/[id]/itens/route")).GET;
  materialsGet = (await import("./materiais/route")).GET;
});

afterEach(() => vi.unstubAllEnvs());

describe("Route Handlers com mock", () => {
  it("GET /api/orcamentos entrega a fila mockada", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await budgetsGet();
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].itemCount).toBe(56);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("GET /api/orcamentos/:id/itens entrega 56 itens ordenados", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const response = await itemsGet(
      new Request("http://localhost/api/orcamentos/budget-demo-01/itens"),
      { params: Promise.resolve({ id: "budget-demo-01" }) },
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toHaveLength(56);
    expect(data[0].itemNumber).toBe(1);
    expect(data[55].itemNumber).toBe(56);
  });

  it("GET /api/orcamentos/:id/itens rejects an invalid route parameter", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const response = await itemsGet(new Request("http://localhost/api/orcamentos/%20/itens"), {
      params: Promise.resolve({ id: "../secret" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "INVALID_ROUTE_PARAMETER" });
  });

  it("GET /api/materiais filtra por query", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const response = await materialsGet(new Request("http://localhost/api/materiais?q=MAT-QD-12"));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].code).toBe("MAT-QD-12");
  });

  it("não faz fallback para mock quando SharePoint está incompleto", async () => {
    vi.stubEnv("DATA_SOURCE", "sharepoint");
    vi.stubEnv("MICROSOFT_TENANT_ID", "");
    const response = await budgetsGet();
    const data = await response.json();
    expect(response.status).toBe(503);
    expect(data.error).toBe("DATA_SOURCE_CONFIGURATION_ERROR");
    expect(data.message).not.toContain("MICROSOFT_TENANT_ID");
    expect(JSON.stringify(data)).not.toContain("client_secret");
  });
});

// Estes testes cobrem os dados; a autenticação real tem suíte própria.
vi.mock("../../server/auth/session", () => ({
  requireSession: vi.fn(async () => ({ roles: ["Operador"] })),
  authErrorResponse: () => null,
}));
