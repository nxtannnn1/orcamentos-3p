import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ resolver: undefined as unknown, calls: 0 }));
vi.mock("../sharepoint/graph-read-transport", () => ({ GraphClientCredentialsReadTransport: class {} }));
vi.mock("../sharepoint/sharepoint-operator-repository", () => ({ SharePointOperatorRepository: class {
  constructor(_graph: unknown, _config: unknown, resolver: unknown) { state.resolver = resolver; state.calls++; }
} }));
import { createServerOperatorRepository } from "./operator-repository-factory";
import { unavailablePersonResolver } from "../sharepoint/person-resolver";
import { GraphListPersonResolver } from "../sharepoint/graph-list-person-resolver";
const env = {
  DATA_SOURCE: "sharepoint", MICROSOFT_TENANT_ID: "11111111-1111-1111-1111-111111111111",
  MICROSOFT_CLIENT_ID: "22222222-2222-2222-2222-222222222222", MICROSOFT_CLIENT_SECRET: "synthetic",
  SHAREPOINT_SITE_ID: "example.sharepoint.com,33333333-3333-3333-3333-333333333333,44444444-4444-4444-4444-444444444444",
  SHAREPOINT_ORCAMENTOS_LIST_ID: "66666666-6666-6666-6666-666666666666",
  SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: "55555555-5555-5555-5555-555555555555",
  SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: "77777777-7777-7777-7777-777777777777",
  SHAREPOINT_FIELD_MAP_JSON: JSON.stringify({ budgets: {}, items: {}, materials: {} }),
};
afterEach(() => { state.resolver = undefined; state.calls = 0; vi.restoreAllMocks(); });
describe("injeção de Pessoa SharePoint sem ativação implícita", () => {
  it("preserva resolvedor indisponível por padrão", () => {
    createServerOperatorRepository(env);
    expect(state.resolver).toBe(unavailablePersonResolver);
  });
  it("injeta somente após seleção explícita, sem consultar nem escrever", () => {
    const network = vi.spyOn(globalThis, "fetch");
    createServerOperatorRepository({ ...env, SHAREPOINT_PERSON_RESOLVER: "graph-list-permissions" });
    expect(state.resolver).toBeInstanceOf(GraphListPersonResolver);
    expect(network).not.toHaveBeenCalled();
    expect(env).not.toHaveProperty("SHAREPOINT_HUMAN_CORRECTIONS_ENABLED");
  });
  it("recusa seletor inválido antes de compor o repositório", () => {
    expect(() => createServerOperatorRepository({ ...env, SHAREPOINT_PERSON_RESOLVER: "email" })).toThrow("Fonte de identidade SharePoint inválida.");
    expect(state.calls).toBe(0);
  });
});
