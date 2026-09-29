import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const browserCookies = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => browserCookies.value ? { value: browserCookies.value } : undefined }) }));
const data = vi.hoisted(() => ({ listBudgets: vi.fn(async () => []), listOfficialMaterials: vi.fn(async () => []), listItemsByBudget: vi.fn(async () => []), saveItemDecision: vi.fn() }));
vi.mock("../../server/data-source/operator-repository-factory", () => ({ createServerOperatorRepository: () => data }));
import { authConfig } from "../../server/auth/configuration";
import { seal } from "../../server/auth/session";
import { GET as budgets } from "./orcamentos/route";
import { GET as materials } from "./materiais/route";
import { GET as items } from "./orcamentos/[id]/itens/route";
import { PATCH } from "./itens/[id]/decisao/route";
const env = { ENTRA_LOGIN_TENANT_ID: "11111111-1111-1111-1111-111111111111", ENTRA_LOGIN_CLIENT_ID: "22222222-2222-2222-2222-222222222222", ENTRA_LOGIN_CLIENT_SECRET: "fake", AUTH_SESSION_SECRET: "test-only-secret-with-more-than-32-characters", ENTRA_MFA_AUTH_CONTEXT_ID: "c1", AUTH_APP_ORIGIN: "https://portal.example" };
const config = authConfig(env);
const context = { params: Promise.resolve({ id: "1" }) };
const request = () => new Request("https://portal.example/api/itens/1/decisao", { method: "PATCH", headers: { "Content-Type": "application/json", Origin: "https://portal.example" }, body: JSON.stringify({ action: "REJECT", approvedMaterialId: null, observation: "Teste" }) });
beforeEach(() => { vi.clearAllMocks(); browserCookies.value = undefined; for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());
async function login(role: string) {
  browserCookies.value = await seal({ oid: "employee", tenantId: config.tenantId, name: "Teste", roles: [role], mfaContext: "c1" }, "session", Math.floor(Date.now() / 1000) + 600, config);
}
describe("proteção efetiva dos endpoints BFF", () => {
  it("sem sessão todos os endpoints retornam 401 antes de acessar dados", async () => {
    expect((await budgets()).status).toBe(401);
    expect((await materials(new Request("https://portal.example/api/materiais"))).status).toBe(401);
    expect((await items(new Request("https://portal.example/api/orcamentos/1/itens"), context)).status).toBe(401);
    expect((await PATCH(request(), context)).status).toBe(401);
    for (const call of Object.values(data)) expect(call).not.toHaveBeenCalled();
  });
  it("Consulta lê mas não grava mesmo chamando diretamente o BFF", async () => {
    await login("Consulta");
    expect((await budgets()).status).toBe(200);
    expect((await PATCH(request(), context)).status).toBe(403);
    expect(data.saveItemDecision).not.toHaveBeenCalled();
  });
  it.each(["Operador", "Comprador"])("%s pode enviar decisão", async (role) => {
    await login(role);
    data.saveItemDecision.mockResolvedValue({ id: "1", reviewStatus: "REJEITADO" });
    expect((await PATCH(request(), context)).status).toBe(200);
    expect(data.saveItemDecision).toHaveBeenCalledTimes(1);
  });
});
