import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { OperatorApiRepository, readOperatorApiConfig } from "./operator-api-repository";
const config = { baseUrl: "http://127.0.0.1:3001", token: "t".repeat(43) };
const page = (data: unknown[], nextAfter: string | null = null) => Response.json({ data, pagination: { limit: 100, nextAfter } });
const material = { id: 1, nome: "Material", categoria: null };
const budget = { id: 1, numeroOrcamento: "A", fornecedor: null, dataOrcamento: null, itemCount: 1 };
const item = { id: 1, orcamentoId: 1, numeroItem: 1, descricaoOriginal: "Item", quantidade: "2.0000",
  unidade: "UN", precoUnitario: "1.2500", precoTotal: "2.5000", materialOficialId: 1 };
describe("adaptador HTTP seguro", () => {
  it("valida origem configurada e token sem revelar seu valor", () => {
    expect(readOperatorApiConfig({ OPERATOR_API_BASE_URL: config.baseUrl, OPERATOR_API_TOKEN: config.token })).toEqual(config);
    for (const url of ["http://remote.example", "https://example.com/path", "https://user:pass@example.com", "https://example.com/?x=1"])
      expect(() => readOperatorApiConfig({ OPERATOR_API_BASE_URL: url, OPERATOR_API_TOKEN: config.token })).toThrow();
    expect(() => readOperatorApiConfig({ OPERATOR_API_BASE_URL: config.baseUrl, OPERATOR_API_TOKEN: config.token, NODE_ENV: "production" })).toThrow();
  });
  it("envia token só no cabeçalho e desabilita cache/redirecionamento", async () => {
    const fetch = vi.fn(async () => page([material]));
    const repo = new OperatorApiRepository(config, fetch);
    const result = await repo.listOfficialMaterials("a & b");
    expect(fetch.mock.calls[0]).toEqual([config.baseUrl + "/api/v1/materiais?q=a%20%26%20b&limit=100",
      expect.objectContaining({ redirect: "error", cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer " + config.token }) })]);
    expect(JSON.stringify(result)).not.toContain(config.token);
  });
  it("consome paginação completa e cursor crescente", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page([material], "1")).mockResolvedValueOnce(page([{ ...material, id: 2 }]));
    expect(await new OperatorApiRepository(config, fetch).listOfficialMaterials()).toHaveLength(2);
    expect(fetch.mock.calls[1][0]).toContain("after=1");
  });
  it("recusa cursor repetido e resposta malformada", async () => {
    for (const response of [page([material], "0"), Response.json({ data: "invalid" })]) {
      const repo = new OperatorApiRepository(config, vi.fn(async () => response));
      await expect(repo.listOfficialMaterials()).rejects.toMatchObject({ status: 502 });
    }
  });
  it("não promove associação a aprovação e não permite decisão", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page([material])).mockResolvedValueOnce(page([item]));
    const repo = new OperatorApiRepository(config, fetch);
    const [result] = await repo.listItemsByBudget("1");
    expect(result.approvedMaterial).toBeNull(); expect(result.suggestedMaterial?.id).toBe("1");
    expect(result.reviewAvailable).toBe(false); expect(result.unitPrice).toBe(1.25);
    await expect(repo.saveItemDecision()).rejects.toMatchObject({ status: 403, code: "READ_ONLY_DATA_SOURCE" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("recusa valores ausentes em vez de inventar zero", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page([material])).mockResolvedValueOnce(page([{ ...item, quantidade: null }]));
    await expect(new OperatorApiRepository(config, fetch).listItemsByBudget("1")).rejects.toMatchObject({ status: 502 });
  });
  it("não repassa erro ou segredo da API", async () => {
    const repo = new OperatorApiRepository(config, vi.fn(async () => Response.json({ password: "private" }, { status: 500 })));
    await expect(repo.listBudgets()).rejects.toThrow("indisponível");
  });
  it("mapeia orçamento sem pressupor revisão", async () => {
    const repo = new OperatorApiRepository(config, vi.fn(async () => page([budget])));
    expect((await repo.listBudgets())[0]).toMatchObject({ readOnly: true, reviewAvailable: false, reviewedCount: 0, itemCount: 1 });
  });
});
