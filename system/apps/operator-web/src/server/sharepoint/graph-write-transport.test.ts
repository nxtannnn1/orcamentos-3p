import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GraphClientCredentialsReadTransport } from "./graph-read-transport";

const config = { tenantId: "tenant", clientId: "client", clientSecret: "secret" };
const path = "/sites/site/lists/items/items/1/fields";
const token = (roles: string[]) =>
  `header.${Buffer.from(JSON.stringify({ roles })).toString("base64url")}.signature`;
afterEach(() => vi.restoreAllMocks());

function setup(
  roles = ["Lists.SelectedOperations.Selected"],
  grant = "write",
  applicationId = "client",
  patchStatus = 200,
) {
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).includes("login.microsoftonline.com"))
      return Response.json({ access_token: token(roles), expires_in: 3600 });
    if (String(input).endsWith("/permissions"))
      return Response.json({
        value: [{ roles: [grant], grantedToV2: { application: { id: applicationId } } }],
      });
    if (init?.method === "PATCH")
      return Response.json({ Status_Revisao: "REJEITADO" }, { status: patchStatus });
    throw new Error("Unexpected request");
  });
  return { graph: new GraphClientCredentialsReadTransport(config, fetcher), fetcher };
}

describe("PATCH Graph com verificação prévia de permissão", () => {
  it("verifica a concessão e envia JSON com token sem alterar o GET", async () => {
    const { graph, fetcher } = setup();
    const fields = {
      Material_AprovadoLookupId: null,
      Status_Revisao: "REJEITADO",
      Observacao_Item: "Revisado",
    };
    await graph.patch(path, fields, '"v1"');
    expect(fetcher.mock.calls.map(([, options]) => options?.method)).toEqual([
      "POST",
      "GET",
      "PATCH",
    ]);
    expect(fetcher.mock.calls[2][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify(fields),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token(["Lists.SelectedOperations.Selected"])}`,
      },
    });
  });
  it.each([
    ["read", "client"],
    ["write", "other-app"],
  ])("bloqueia concessão %s para %s antes do PATCH", async (grant, app) => {
    const { graph, fetcher } = setup(undefined, grant, app);
    await expect(graph.patch(path, {}, '"v1"')).rejects.toMatchObject({
      status: 403,
      code: "GRAPH_WRITE_FORBIDDEN",
    });
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
  });
  it("não aceita papel write na lista quando o token só tem Sites.Read.All", async () => {
    const { graph, fetcher } = setup(["Sites.Read.All"]);
    await expect(graph.patch(path, {}, '"v1"')).rejects.toThrow("write");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["Sites.ReadWrite.All", "Sites.Manage.All", "Sites.FullControl.All"])(
    "bloqueia permissão ampla %s",
    async (role) => {
      const { graph, fetcher } = setup([role]);
      await expect(graph.patch(path, {}, '"v1"')).rejects.toMatchObject({
        status: 403,
        code: "GRAPH_PERMISSION_TOO_BROAD",
      });
      expect(fetcher.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
    },
  );
  it("bloqueia permissão ampla mesmo quando o token também contém a permissão restrita", async () => {
    const { graph, fetcher } = setup(["Lists.SelectedOperations.Selected", "Sites.ReadWrite.All"]);
    await expect(graph.patch(path, {}, '"v1"')).rejects.toMatchObject({
      status: 403,
      code: "GRAPH_PERMISSION_TOO_BROAD",
    });
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
  });
  it("bloqueia quando não consegue verificar permissões", async () => {
    const { graph, fetcher } = setup();
    fetcher.mockImplementation(async (input) =>
      String(input).includes("login.microsoftonline.com")
        ? Response.json({
            access_token: token(["Lists.SelectedOperations.Selected"]),
            expires_in: 3600,
          })
        : Response.json({}, { status: 403 }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(graph.patch(path, {}, '"v1"')).rejects.toMatchObject({
      code: "GRAPH_WRITE_PERMISSION_UNVERIFIED",
    });
    expect(fetcher.mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
  });
  it.each([403, 404, 500])("propaga falha %s sem repetir o PATCH", async (status) => {
    const { graph, fetcher } = setup(undefined, "write", "client", status);
    await expect(graph.patch(path, {}, '"v1"')).rejects.toMatchObject({
      status: status === 500 ? 502 : status,
    });
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(1);
  });
  it("rejeita destino externo antes de obter token", async () => {
    const { graph, fetcher } = setup();
    await expect(graph.patch("https://example.org/fields", {}, '"v1"')).rejects.toThrow("Destino");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("envia If-Match e traduz 412 em conflito sem repetir gravação", async () => {
    const { graph, fetcher } = setup(undefined, "write", "client", 412);
    await expect(graph.patch(path, {}, '"v1"')).rejects.toMatchObject({
      status: 409,
      code: "DECISION_CONFLICT",
    });
    expect(fetcher.mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(1);
    expect(fetcher.mock.calls[2][1]).toMatchObject({
      redirect: "error",
      headers: { "If-Match": '"v1"' },
    });
  });
  it("não aceita wildcard que desativa controle de concorrência", async () => {
    const { graph, fetcher } = setup();
    await expect(graph.patch(path, {}, "*")).rejects.toMatchObject({ status: 428 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
