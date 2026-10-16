import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ empty: false, fail: false, calls: [] as string[] }));
vi.mock("../../server/auth/session", () => ({ requireSession: async () => ({ oid: "synthetic", tenantId: "test" }), authErrorResponse: () => null }));
vi.mock("../../server/security/rate-limit", () => ({ limitUserRequests: async () => {} }));
vi.mock("../../server/sharepoint/graph-read-transport", () => ({
  GraphClientCredentialsReadTransport: class {
    async get(path: string) {
      state.calls.push(path);
      if (state.fail) throw new Error("Synthetic failure");
      if (state.empty) return { value: [] };
      if (path.includes("/lists/materials/")) return { value: [{ id: "1", fields: { Title: "SYNTHETIC", Name: "Synthetic", Unit: "UN" } }] };
      if (path.includes("/lists/budgets/")) return { value: [{ id: "2", fields: { Code: "SYNTHETIC-B", Date: "2026-10-01" } }] };
      return { value: [{ id: "10", fields: { Status: "APROVADO", ApprovedLookupId: "1", BudgetLookupId: "2", Price: 8, Unit: "UN", Fornecedor: "Synthetic supplier" } }] };
    }
  },
}));
import { GET } from "./comparacao-precos/route";
const fieldMap = { budgets: { code: "Code", date: "Date" }, items: { status: "Status", approvedMaterialLookupId: "Approved", budgetLookupId: "Budget", unitPrice: "Price", unit: "Unit" }, materials: { code: "Title", name: "Name", unit: "Unit" } };
beforeEach(() => {
  state.empty = false; state.fail = false; state.calls = [];
  const env = { DATA_SOURCE: "sharepoint", MICROSOFT_TENANT_ID: "test", MICROSOFT_CLIENT_ID: "test", MICROSOFT_CLIENT_SECRET: "synthetic", SHAREPOINT_SITE_ID: "site", SHAREPOINT_ORCAMENTOS_LIST_ID: "budgets", SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: "items", SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: "materials", SHAREPOINT_FIELD_MAP_JSON: JSON.stringify(fieldMap) };
  Object.entries(env).forEach(([k, v]) => vi.stubEnv(k, v));
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("External network forbidden in this test"); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("API de comparação por fonte", () => {
  it("entrega ofertas SharePoint sem mock ou escrita", async () => {
    const response = await GET(new Request("http://localhost/api/comparacao-precos?materialId=1"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ lowestPrice: 8, offers: [{ offer: { id: "item:10" } }] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("catálogo vazio é estado vazio, não erro de demonstração", async () => {
    state.empty = true;
    const response = await GET(new Request("http://localhost/api/comparacao-precos"));
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
  it("material inexistente recebe 404", async () => {
    const response = await GET(new Request("http://localhost/api/comparacao-precos?materialId=99"));
    expect(response.status).toBe(404);
  });
  it("falha Graph não entrega dados mock", async () => {
    state.fail = true;
    const response = await GET(new Request("http://localhost/api/comparacao-precos?materialId=1"));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "DATA_SOURCE_UNAVAILABLE" });
  });
  it("mock explícito não acessa Graph", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const response = await GET(new Request("http://localhost/api/comparacao-precos"));
    expect(response.status).toBe(200);
    expect(state.calls).toEqual([]);
  });
  it("mapeamento de comparação incompleto bloqueia antes de qualquer GET Graph", async () => {
    vi.stubEnv("SHAREPOINT_FIELD_MAP_JSON", JSON.stringify({ ...fieldMap, materials: { code: "Title", name: "Name" } }));
    const response = await GET(new Request("http://localhost/api/comparacao-precos"));
    expect(response.status).toBe(503);
    expect(state.calls).toEqual([]);
  });
});
