import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let GraphTransport: typeof import("./graph-read-transport").GraphClientCredentialsReadTransport;

beforeAll(async () => {
  GraphTransport = (await import("./graph-read-transport")).GraphClientCredentialsReadTransport;
});

describe("cache server-side do token Graph", () => {
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
      { tenantId: "tenant-placeholder", clientId: "client-placeholder", clientSecret: "secret-placeholder" },
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
      { tenantId: "tenant-placeholder", clientId: "client-placeholder", clientSecret: "secret-placeholder" },
      fetcher,
    );
    await Promise.all([graph.get("/sites/a"), graph.get("/sites/b")]);
    expect(tokenRequests).toBe(1);
  });
});
