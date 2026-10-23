import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ args: [] as unknown[], calls: 0 }));
vi.mock("../sharepoint/graph-read-transport", () => ({ GraphClientCredentialsReadTransport: class {} }));
vi.mock("../sharepoint/sharepoint-operator-repository", () => ({ SharePointOperatorRepository: class {
  constructor(...args: unknown[]) { state.args = args; state.calls++; }
} }));
import { createServerOperatorRepository } from "./operator-repository-factory";
const env = {
  DATA_SOURCE: "sharepoint", MICROSOFT_TENANT_ID: "11111111-1111-1111-1111-111111111111",
  MICROSOFT_CLIENT_ID: "22222222-2222-2222-2222-222222222222", MICROSOFT_CLIENT_SECRET: "synthetic",
  SHAREPOINT_SITE_ID: "example.sharepoint.com,33333333-3333-3333-3333-333333333333,44444444-4444-4444-4444-444444444444",
  SHAREPOINT_ORCAMENTOS_LIST_ID: "66666666-6666-6666-6666-666666666666",
  SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: "55555555-5555-5555-5555-555555555555",
  SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: "77777777-7777-7777-7777-777777777777",
  SHAREPOINT_FIELD_MAP_JSON: JSON.stringify({ budgets: {}, items: {}, materials: {} }),
};
afterEach(() => { state.args = []; state.calls = 0; vi.restoreAllMocks(); });
describe("aprovador em campos de texto: nenhuma resolução de Pessoa SharePoint", () => {
  it("compõe o repositório só com transporte e configuração, sem consultar a rede", () => {
    const network = vi.spyOn(globalThis, "fetch");
    createServerOperatorRepository(env);
    expect(state.calls).toBe(1);
    expect(state.args).toHaveLength(2);
    expect(network).not.toHaveBeenCalled();
  });
  it("ignora o seletor legado SHAREPOINT_PERSON_RESOLVER", () => {
    for (const value of ["disabled", "graph-list-permissions", "email"]) {
      createServerOperatorRepository({ ...env, SHAREPOINT_PERSON_RESOLVER: value });
      expect(state.args).toHaveLength(2);
    }
    expect(state.calls).toBe(3);
  });
});
