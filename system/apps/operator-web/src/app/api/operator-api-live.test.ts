import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Apenas este processo de teste simula uma sessão Consulta. O runtime real mantém seu controle de acesso.
vi.mock("../../server/auth/session", () => ({
  requireSession: async () => ({ oid: "integration-test", tenantId: "test", roles: ["Consulta"] }),
  authErrorResponse: () => null,
}));
vi.mock("../../server/security/rate-limit", () => ({ limitUserRequests: async () => {} }));
import { GET as budgets } from "./orcamentos/route";
import { GET as materials } from "./materiais/route";
import { GET as items } from "./orcamentos/[id]/itens/route";
describe.skipIf(process.env.RUN_OPERATOR_API_LIVE !== "1")("BFF → API → PostgreSQL real, somente leitura", () => {
  beforeAll(() => {
    const local = parseEnv(readFileSync(".env.local", "utf8"));
    vi.stubEnv("DATA_SOURCE", "operator-api"); vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("OPERATOR_API_BASE_URL", local.OPERATOR_API_BASE_URL);
    vi.stubEnv("OPERATOR_API_TOKEN", local.OPERATOR_API_TOKEN);
  });
  afterAll(() => vi.unstubAllEnvs());
  it("fila, catálogo e itens percorrem as rotas do frontend e o banco", async () => {
    const queue = await budgets();
    expect(queue.status).toBe(200);
    const rows = await queue.json();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].readOnly).toBe(true);
    const catalog = await materials(new Request("http://localhost/api/materiais"));
    expect(catalog.status).toBe(200);
    const response = await items(new Request("http://localhost/api/orcamentos/" + rows[0].id + "/itens"),
      { params: Promise.resolve({ id: rows[0].id }) });
    expect(response.status).toBe(200);
    const entries = await response.json();
    expect(entries.length).toBe(rows[0].itemCount);
    expect(entries.every((entry: { approvedMaterial: unknown }) => entry.approvedMaterial === null)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(process.env.OPERATOR_API_TOKEN);
  });
});
