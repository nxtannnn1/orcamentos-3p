import { createHash } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import { authenticate } from "@/server/auth";
import { readConfig } from "@/server/config";
import { positiveId, queryOptions, requireEmptyQuery, literalSearch, page } from "@/server/query";
import { FixedWindowLimiter, ConcurrencyLimit } from "@/server/limits";
import { protectedRead } from "@/server/http";

const token = "a".repeat(43);
const client = { id: "operator-web", sha256: createHash("sha256").update(token).digest("hex"), scopes: ["read"] as ["read"] };
const env = { API_CLIENTS_JSON: JSON.stringify([client]), DATABASE_URL: "postgresql://reader:test@127.0.0.1/orcamentos", DATABASE_TLS_MODE: "disable", NODE_ENV: "test" } as const;
const request = (headers: Record<string, string> = {}) => new Request("http://localhost/api/v1/orcamentos", { headers });
afterEach(() => vi.unstubAllEnvs());

describe("configuração bloqueia acesso inseguro", () => {
  it("aceita configuração local válida", () => expect(readConfig(env).tls).toBe(false));
  it.each([
    { API_CLIENTS_JSON: "[]" }, { API_CLIENTS_JSON: "invalid" },
    { API_CLIENTS_JSON: JSON.stringify([client, client]) },
    { API_CLIENTS_JSON: JSON.stringify([{ ...client, scopes: ["write"] }]) },
    { API_CLIENTS_JSON: JSON.stringify([{ ...client, sha256: "token" }]) },
    { DATABASE_URL: "http://reader:test@localhost/db" },
    { DATABASE_URL: "postgresql://reader:test@localhost/db?sslmode=disable" },
    { DATABASE_URL: "postgresql://reader:test@remote/db" },
    { DATABASE_TLS_MODE: "insecure" }, { NODE_ENV: "production" },
  ])("recusa configuração inválida %j", override => expect(() => readConfig({ ...env, ...override })).toThrow("Serviço não configurado."));
  it("TLS remoto verifica certificado", () => expect(readConfig({ ...env, DATABASE_TLS_MODE: "verify-full", DATABASE_URL: "postgresql://reader:test@remote/db" }).tls).toBe(true));
});

describe("autenticação de serviço", () => {
  it("aceita token válido", () => expect(authenticate(request({ authorization: "Bearer " + token }), [client]).id).toBe(client.id));
  it.each(["", "Basic abc", "Bearer " + "b".repeat(43), "Bearer short"])("recusa token inválido", authorization =>
    expect(() => authenticate(request({ authorization }), [client])).toThrow("Autenticação necessária."));
  it("recusa chamada de navegador mesmo com token", () => expect(() =>
    authenticate(request({ authorization: "Bearer " + token, origin: "https://example.com" }), [client])).toThrow("Origem não permitida."));
});

describe("consultas limitadas", () => {
  it("recusa URL excessiva", () => expect(() => queryOptions("http://localhost/?q=" + "a".repeat(2100), true)).toThrow());
  it("detalhe recusa parâmetros sem significado", () => {
    expect(() => requireEmptyQuery("http://localhost/?limit=10")).toThrow();
    expect(() => requireEmptyQuery("http://localhost/")).not.toThrow();
  });
  it.each(["0", "-1", "1 OR 1=1", "1.0", "2147483648", "01"])("recusa ID %s", id => expect(() => positiveId(id)).toThrow());
  it("aceita máximo int4", () => expect(positiveId("2147483647")).toBe(2147483647));
  it.each(["?limit=101", "?limit=0", "?limit=1&limit=2", "?order=id", "?after=-1", "?q=a", "?q=%00"])("recusa query inválida %s", q =>
    expect(() => queryOptions("http://localhost/" + q)).toThrow());
  it("limita pesquisa e aceita cursor", () => expect(queryOptions("http://localhost/?q=luva&limit=10&after=3", true)).toEqual({ q: "luva", limit: 10, after: 3 }));
  it("escape não transforma wildcard do usuário em pesquisa ampla", () => expect(literalSearch("a%_\\")).toBe("%a\\%\\_\\\\%"));
  it("pagina sem expor a linha extra", () => expect(page([{ id: 1 }, { id: 2 }], 1)).toEqual({ data: [{ id: 1 }], pagination: { limit: 1, nextAfter: "1" } }));
});

describe("limites de recursos", () => {
  it("renova janela", () => { const limiter = new FixedWindowLimiter(1, 100); limiter.take("known", 0); expect(() => limiter.take("known", 1)).toThrow(); expect(() => limiter.take("known", 100)).not.toThrow(); });
  it("libera concorrência uma vez", () => { const limiter = new ConcurrencyLimit(1); const release = limiter.enter(); expect(() => limiter.enter()).toThrow(); release(); release(); const second = limiter.enter(); expect(() => limiter.enter()).toThrow(); second(); });
});

describe("respostas não revelam detalhes internos", () => {
  function configure() { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); }
  it("não chama o banco sem autenticação", async () => {
    configure(); const action = vi.fn();
    const response = await protectedRead(request(), action);
    expect(response.status).toBe(401); expect(action).not.toHaveBeenCalled();
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });
  it("retorna erro genérico sem senha/SQL", async () => {
    configure(); const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await protectedRead(request({ authorization: "Bearer " + token }), async () => { throw new Error("password-secret SELECT internal"); });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("password-secret");
    expect(JSON.stringify(log.mock.calls)).not.toContain("SELECT internal");
    expect(response.headers.get("cache-control")).toBe("no-store"); log.mockRestore();
  });
  it("recusa mutação antes do action", async () => {
    configure(); const action = vi.fn();
    const response = await protectedRead(new Request("http://localhost/", { method: "POST" }), action);
    expect(response.status).toBe(405); expect(action).not.toHaveBeenCalled();
  });
});
