import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let GraphTransport: typeof import("./graph-read-transport").GraphClientCredentialsReadTransport;

beforeAll(async () => {
  GraphTransport = (await import("./graph-read-transport")).GraphClientCredentialsReadTransport;
});

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
