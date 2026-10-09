import { beforeEach, expect, it, vi } from "vitest";
const capture = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/db/client", () => ({
  withRead: async (action: (db: unknown) => unknown) => {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    return action(drizzle({ query: capture.query } as never));
  },
}));
import { repository } from "@/server/repository";
beforeEach(() => { capture.query.mockReset(); capture.query.mockResolvedValue({ rows: [] }); });
it("pesquisa maliciosa fica em parâmetro, fora do SQL", async () => {
  const payload = "'; DROP TABLE fornecedor; --";
  await repository.suppliers({ q: payload, limit: 5, after: 0 });
  const [query, values] = capture.query.mock.calls[0];
  expect(query.text).not.toContain(payload);
  expect(values.some((v: unknown) => typeof v === "string" && v.includes(payload))).toBe(true);
  expect(query.text.toLowerCase()).toContain("select");
  expect(values).toContain(6);
});
it("catálogo preserva semântica literal de wildcard", async () => {
  await repository.materials({ q: "%_", limit: 10, after: 4 });
  const [, values] = capture.query.mock.calls[0];
  expect(values).toContain("%\\%\\_%"); expect(values).toContain(4); expect(values).toContain(11);
});
it("fornecedores não expõem contato ou CNPJ", async () => {
  await repository.suppliers({ q: "", limit: 5, after: 0 });
  const sql = capture.query.mock.calls[0][0].text;
  expect(sql).not.toMatch(/cnpj|email|telefone/);
});
it("orçamento ausente tem 404", async () => {
  await expect(repository.budget(123)).rejects.toMatchObject({ status: 404 });
});
it("preserva decimais como texto e ausência como null", async () => {
  capture.query.mockResolvedValue({ rows: [[1, "A", null, null, null, null,
    "0.10", null, null, null, "0.10", "2026-10-09 12:00:00+00", "2026-10-09 12:00:00+00"]] });
  const result = await repository.budget(1);
  expect(result.data.subtotal).toBe("0.10");
  expect(result.data.frete).toBeNull();
});
it("readiness verifica tabelas sem devolver dados", async () => {
  await expect(repository.ready()).resolves.toEqual({ status: "ready" });
  const sql = capture.query.mock.calls[0][0].text;
  expect(sql).toContain("LIMIT 0");
  for (const table of ["orcamento", "item_orcamento", "material_oficial", "fornecedor"])
    expect(sql).toContain("public." + table);
});
it("itens de orçamento ausente não fazem consulta adicional", async () => {
  await expect(repository.items(123, { q: "", limit: 5, after: 0 })).rejects.toMatchObject({ status: 404 });
  expect(capture.query).toHaveBeenCalledTimes(1);
});
