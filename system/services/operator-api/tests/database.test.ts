import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  query: vi.fn(), release: vi.fn(), connect: vi.fn(), on: vi.fn(),
}));
vi.mock("pg", () => ({ Pool: class {
  query = fake.query; on = fake.on;
  connect = fake.connect;
} }));
import { assertReadOnlyRole, withRead } from "@/server/db/client";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("API_CLIENTS_JSON", JSON.stringify([{ id: "test", sha256: "a".repeat(64), scopes: ["read"] }]));
  vi.stubEnv("DATABASE_URL", "postgresql://reader:test@localhost/db");
  vi.stubEnv("DATABASE_TLS_MODE", "disable"); vi.stubEnv("NODE_ENV", "test");
  fake.connect.mockResolvedValue({ query: fake.query, release: fake.release });
});
describe("permissões e transação", () => {
  it.each([true, null, undefined])("recusa usuário com permissões inseguras ou resultado indefinido", async unsafe => {
    fake.query.mockResolvedValue({ rows: [{ unsafe }] });
    await expect(assertReadOnlyRole({ query: fake.query })).rejects.toThrow("somente leitura");
  });
  it("recusa ausência de role", async () => {
    fake.query.mockResolvedValue({ rows: [] });
    await expect(assertReadOnlyRole({ query: fake.query })).rejects.toThrow();
  });
  it("recusa superusuário antes da consulta de negócio", async () => {
    fake.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith("\nSELECT") ? [{ unsafe: true }] : [] }));
    const action = vi.fn();
    await expect(withRead(action)).rejects.toThrow("somente leitura");
    expect(action).not.toHaveBeenCalled();
    expect(fake.query.mock.calls[0][0]).toBe("BEGIN READ ONLY");
    expect(fake.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
    expect(fake.release).toHaveBeenCalledWith(false);
  });
  it("fecha transação somente leitura após sucesso", async () => {
    fake.query.mockResolvedValue({ rows: [{ unsafe: false }] });
    await expect(withRead(async () => "ok")).resolves.toBe("ok");
    expect(fake.query.mock.calls[0][0]).toBe("BEGIN READ ONLY");
    expect(fake.query.mock.calls.at(-1)![0]).toBe("COMMIT");
  });
  it("descarta conexão se rollback falhar", async () => {
    fake.query.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK") throw new Error("connection lost");
      return { rows: [{ unsafe: false }] };
    });
    await expect(withRead(async () => { throw new Error("query failed"); })).rejects.toThrow("query failed");
    expect(fake.release).toHaveBeenCalledWith(true);
  });
});
