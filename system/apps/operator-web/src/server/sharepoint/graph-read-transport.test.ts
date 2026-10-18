import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let GraphTransport: typeof import("./graph-read-transport").GraphClientCredentialsReadTransport;

beforeAll(async () => {
  GraphTransport = (await import("./graph-read-transport")).GraphClientCredentialsReadTransport;
});
afterEach(() => vi.restoreAllMocks());

describe("cache server-side do token Graph", () => {
  it("rejeita destinos externos antes de obter token e desativa redirects", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).includes("login.microsoftonline.com")
        ? Response.json({ access_token: "fake-token", expires_in: 3600 })
        : Response.json({ value: [] }),
    );
    const graph = new GraphTransport(
      { tenantId: "tenant", clientId: "client", clientSecret: "fake" },
      fetcher,
    );
    await expect(
      graph.get("https://graph.microsoft.com.attacker.example/v1.0/sites/x"),
    ).rejects.toThrow("Destino");
    expect(fetcher).not.toHaveBeenCalled();
    await graph.get("/sites/example");
    expect(
      fetcher.mock.calls.every(([, init]) => init?.redirect === "error" && !!init.signal),
    ).toBe(true);
  });
  it("reutiliza o token, respeita expires_in e renova antes da expiração", async () => {
    let currentTime = 0;
    let tokenRequests = 0;
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("login.microsoftonline.com")) {
        tokenRequests += 1;
        return Response.json({ access_token: `token-${tokenRequests}`, expires_in: 100 });
      }
      return Response.json({ value: [] });
    };
    const graph = new GraphTransport(
      {
        tenantId: "tenant-placeholder",
        clientId: "client-placeholder",
        clientSecret: "secret-placeholder",
      },
      fetcher,
      () => currentTime,
    );

    await graph.get("/sites/example");
    await graph.get("/sites/example");
    expect(tokenRequests).toBe(1);

    currentTime = 91_000;
    await graph.get("/sites/example");
    expect(tokenRequests).toBe(2);
  });

  it("compartilha uma solicitação de token entre leituras concorrentes", async () => {
    let tokenRequests = 0;
    const fetcher: typeof fetch = async (input) => {
      if (String(input).includes("login.microsoftonline.com")) {
        tokenRequests += 1;
        await Promise.resolve();
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      return Response.json({ value: [] });
    };
    const graph = new GraphTransport(
      {
        tenantId: "tenant-placeholder",
        clientId: "client-placeholder",
        clientSecret: "secret-placeholder",
      },
      fetcher,
    );
    await Promise.all([graph.get("/sites/a"), graph.get("/sites/b")]);
    expect(tokenRequests).toBe(1);
  });

  it("propaga erro com status e AADSTS quando a autenticação falha", async () => {
    const fetcher: typeof fetch = async (input) => {
      if (String(input).includes("login.microsoftonline.com")) {
        return Response.json(
          {
            error: "invalid_client",
            error_description: "AADSTS7000215: Invalid client secret provided.",
            error_codes: [7000215],
          },
          { status: 401 },
        );
      }
      return Response.json({});
    };

    const graph = new GraphTransport(
      {
        tenantId: "tenant-placeholder",
        clientId: "client-placeholder",
        clientSecret: "secret-placeholder",
      },
      fetcher,
    );

    await expect(graph.get("/sites/example")).rejects.toThrow(
      "Falha na autenticação server-side com Microsoft Graph (401 - invalid_client - AADSTS7000215)",
    );
  });

  it("propaga erro detalhado quando leitura no Graph falha", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("login.microsoftonline.com")) {
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      return Response.json(
        { error: { code: "itemNotFound", message: "The resource could not be found." } },
        { status: 404 },
      );
    };

    const graph = new GraphTransport(
      {
        tenantId: "tenant-placeholder",
        clientId: "client-placeholder",
        clientSecret: "secret-placeholder",
      },
      fetcher,
    );

    await expect(graph.get("/sites/example")).rejects.toThrow(
      "Falha de leitura no Microsoft Graph (404 - itemNotFound)",
    );
  });
});

describe("metadados seguros de falha Graph", () => {
  const config = { tenantId: "fixture-tenant", clientId: "fixture-client", clientSecret: "private-secret" };
  it.each([401, 403, 404, 429, 503])("GET %s preserva status sem corpo, URL ou código arbitrário", async status => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>(async input => String(input).includes("login.microsoftonline.com")
      ? Response.json({ access_token: "private-token", expires_in: 3600 })
      : Response.json({ error: { code: "private-user@example.test", message: "private-secret" } }, { status }));
    const graph = new GraphTransport(config, fetcher);
    let caught: unknown;
    try { await graph.get("/sites/private-site/lists/private-list/permissions"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ operation: "get", kind: "HTTP", httpStatus: status });
    const output = JSON.stringify(log.mock.calls) + (caught as Error).message;
    for (const value of ["private-", "example.test", "https://"]) expect(output).not.toContain(value);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET"]);
  });
  it("falha OAuth guarda somente status e códigos permitidos", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const graph = new GraphTransport(config, async () => Response.json({ error: "private-user@example.test",
      error_description: "private-secret AADSTS123456789", error_codes: [123456789] }, { status: 401 }));
    let caught: unknown;
    try { await graph.get("/sites/private"); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ operation: "oauth", kind: "HTTP", httpStatus: 401 });
    const output = JSON.stringify(log.mock.calls) + (caught as Error).message;
    for (const value of ["private-", "example.test", "123456789"]) expect(output).not.toContain(value);
  });
  it.each(["oauth", "get"])("rede na etapa %s não inclui erro subjacente", async operation => {
    const graph = new GraphTransport(config, async input => {
      if (operation === "get" && String(input).includes("login.microsoftonline.com"))
        return Response.json({ access_token: "private-token" });
      throw new Error("private-secret private-url");
    });
    await expect(graph.get("/sites/private")).rejects.toMatchObject({ operation, kind: "NETWORK", httpStatus: null });
  });
  it.each(["oauth", "get"])("JSON inválido em %s mantém status HTTP e falha", async operation => {
    const graph = new GraphTransport(config, async input => {
      if (operation === "get" && String(input).includes("login.microsoftonline.com"))
        return Response.json({ access_token: "private-token" });
      return new Response("private-not-json", { status: 200 });
    });
    await expect(graph.get("/sites/private")).rejects.toMatchObject({ operation, kind: "INVALID_RESPONSE", httpStatus: 200 });
  });
});
