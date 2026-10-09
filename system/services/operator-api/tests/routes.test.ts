import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const repo = vi.hoisted(() => ({
  budgets: vi.fn(), budget: vi.fn(), items: vi.fn(), materials: vi.fn(), suppliers: vi.fn(), ready: vi.fn(),
}));
vi.mock("@/server/repository", () => ({ repository: repo }));
import { GET as budgets } from "@/app/api/v1/orcamentos/route";
import { GET as items } from "@/app/api/v1/orcamentos/[id]/itens/route";
import { GET as materials } from "@/app/api/v1/materiais/route";
import { GET as health } from "@/app/api/health/route";
const token = "x".repeat(43);
const request = (path: string, authenticated = true) => new Request("http://localhost" + path,
  { headers: authenticated ? { authorization: "Bearer " + token } : {} });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("API_CLIENTS_JSON", JSON.stringify([{ id: "test", sha256: createHash("sha256").update(token).digest("hex"), scopes: ["read"] }]));
  vi.stubEnv("DATABASE_URL", "postgresql://reader:test@localhost/db");
  vi.stubEnv("DATABASE_TLS_MODE", "disable"); vi.stubEnv("NODE_ENV", "test");
});
it("liveness não consulta banco", async () => {
  expect(await health().json()).toEqual({ status: "alive" });
  expect(repo.ready).not.toHaveBeenCalled();
});
it("rota autenticada passa paginação limitada", async () => {
  repo.budgets.mockResolvedValue({ data: [], pagination: { limit: 10, nextAfter: null } });
  const response = await budgets(request("/api/v1/orcamentos?limit=10&after=2"));
  expect(response.status).toBe(200);
  expect(repo.budgets).toHaveBeenCalledWith({ limit: 10, after: 2, q: "" });
});
it("consulta inválida não chega no repositório", async () => {
  expect((await materials(request("/api/v1/materiais?limit=1000"))).status).toBe(400);
  expect(repo.materials).not.toHaveBeenCalled();
});
it("ID inválido não chega no repositório", async () => {
  expect((await items(request("/api/v1/orcamentos/invalid/itens"), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
  expect(repo.items).not.toHaveBeenCalled();
});
it("falta de token não consulta dados", async () => {
  expect((await budgets(request("/api/v1/orcamentos", false))).status).toBe(401);
  expect(repo.budgets).not.toHaveBeenCalled();
});
