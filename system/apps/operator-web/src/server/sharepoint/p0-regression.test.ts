import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({ authErrorResponse: () => null }));
import { resolveDecisionPerson, type SharePointPersonResolver } from "./person-resolver";
import { GraphClientCredentialsReadTransport } from "./graph-read-transport";
import { GraphWriteError } from "./graph-write-error";
import { routeErrorResponse } from "../data-source/route-error";
import { correctionFixture, correctionInput, actorM } from "./__test-support__/correction";

const context = { actor: actorM, version: '"v1"' };
const fieldPath = "/sites/site/lists/items/items/1/fields";
const grant = { roles: ["write"], grantedToV2: { application: { id: "client" } } };
const token = "header." + Buffer.from(JSON.stringify({ roles: ["Lists.SelectedOperations.Selected"] })).toString("base64url") + ".signature";
function transport(status = 200, pages: unknown[] = [{ value: [grant] }]) {
  let page = 0;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).includes("login.microsoftonline.com")) return Response.json({ access_token: token, expires_in: 3600 });
    if (init?.method === "GET") return Response.json(pages[page++]);
    return Response.json({ sensitive: "upstream details must not escape" }, { status, headers: { "Retry-After": "125" } });
  });
  return { graph: new GraphClientCredentialsReadTransport({ tenantId: "tenant", clientId: "client", clientSecret: "synthetic" }, fetcher), fetcher };
}
afterEach(() => vi.restoreAllMocks());
describe("P0 identidade", () => {
  it.each([null, undefined, {}, "", { length: 1 }])("resposta malformada %j não é pessoa ausente", async value => {
    const resolver = { findCandidates: async () => value } as unknown as SharePointPersonResolver;
    await expect(resolveDecisionPerson(resolver, actorM, "site", actorM.tenantId)).rejects.toMatchObject({ status: 503, code: "PERSON_RESOLUTION_UNAVAILABLE" });
  });
});
describe("P0 transporte Graph", () => {
  it.each([
    [400, 502, "GRAPH_WRITE_INVALID_PAYLOAD"], [401, 503, "GRAPH_WRITE_AUTHENTICATION_FAILED"],
    [403, 403, "GRAPH_WRITE_FORBIDDEN"], [404, 404, "ITEM_NOT_FOUND"],
    [409, 409, "DECISION_CONFLICT"], [412, 409, "DECISION_CONFLICT"], [429, 429, "GRAPH_WRITE_THROTTLED"],
  ])("classifica HTTP %s sem retry", async (http, status, code) => {
    const f = transport(Number(http));
    await expect(f.graph.patch(fieldPath, {}, '"v1"')).rejects.toMatchObject({ status, code, disposition: "rejected" });
    expect(f.fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);
  });
  it("preserva Retry-After no BFF sem corpo remoto", async () => {
    const f = transport(429);
    const error = await f.graph.patch(fieldPath, {}, '"v1"').catch(e => e);
    const response = routeErrorResponse(error);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("125");
    expect(await response.text()).not.toContain("upstream");
  });
  it("consulta concessão em página posterior", async () => {
    const f = transport(200, [{ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/sites/site/lists/items/permissions?$skiptoken=next" }, { value: [grant] }]);
    await f.graph.patch(fieldPath, {}, '"v1"');
    expect(f.fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(["POST", "GET", "GET", "PATCH"]);
  });
  it.each([
    "https://example.invalid/v1.0/sites/site/lists/items/permissions",
    "https://graph.microsoft.com/v1.0/sites/other/lists/items/permissions",
    "https://graph.microsoft.com/v1.0/sites/site/lists/items/permissions",
  ])("não aceita paginação insegura/cíclica %s", async link => {
    const f = transport(200, [{ value: [grant], "@odata.nextLink": link }]);
    await expect(f.graph.patch(fieldPath, {}, '"v1"')).rejects.toMatchObject({ code: "GRAPH_WRITE_PERMISSION_UNVERIFIED", disposition: "not_sent" });
    expect(f.fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
  it.each([null, {}, { value: [null] }, { value: [{ roles: "write" }] }])("falha fechada em permissão malformada %j", async page => {
    const f = transport(200, [page]);
    await expect(f.graph.patch(fieldPath, {}, '"v1"')).rejects.toMatchObject({ code: "GRAPH_WRITE_PERMISSION_UNVERIFIED" });
    expect(f.fetcher.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });
});
describe("P0 correção com transporte real e rede simulada", () => {
  it.each([400, 401, 403, 404, 409, 412, 429])("HTTP %s preserva recusa e permite nova operação sem lock órfão", async status => {
    const f = correctionFixture(); const remote = transport(status);
    f.patch.mockImplementationOnce((p, fields, etag) => remote.graph.patch(p, fields, etag));
    await expect(f.service.save("1", correctionInput, context)).rejects.toBeInstanceOf(GraphWriteError);
    expect([...f.ledger.keys()].some(k => k.endsWith(":pending"))).toBe(false);
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTION_NOT_APPLIED" });
    expect(f.patch).toHaveBeenCalledTimes(1);
    await expect(f.service.save("1", { ...correctionInput, operationId: "44444444-4444-4444-8444-444444444444" }, context)).resolves.toMatchObject({ status: "confirmed" });
  });
  it("5xx permanece incerto e bloqueia outra operação", async () => {
    const f = correctionFixture(); const remote = transport(500);
    f.patch.mockImplementationOnce((p, fields, etag) => remote.graph.patch(p, fields, etag));
    await expect(f.service.save("1", correctionInput, context)).rejects.toMatchObject({ code: "CORRECTION_UNCONFIRMED" });
    expect([...f.ledger.keys()].some(k => k.endsWith(":pending"))).toBe(true);
    await expect(f.service.save("1", { ...correctionInput, operationId: "44444444-4444-4444-8444-444444444444" }, context)).rejects.toMatchObject({ code: "CORRECTION_PENDING" });
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
  it("falha ao auditar recusa não libera lock", async () => {
    const f = correctionFixture(); const command = f.command.getMockImplementation()!;
    f.command.mockImplementation(args => args[0] === "SET" && String(args[1]).endsWith(":outcome") ? Promise.reject(new Error("ledger unavailable")) : command(args));
    f.patch.mockRejectedValueOnce(new GraphWriteError("Recusado", 429, "GRAPH_WRITE_THROTTLED", "rejected"));
    await expect(f.service.save("1", correctionInput, context)).rejects.toThrow();
    expect([...f.ledger.keys()].some(k => k.endsWith(":pending"))).toBe(true);
  });
  it("recupera falha de CAS após recusa durável, sem novo PATCH", async () => {
    const f = correctionFixture(); const command = f.command.getMockImplementation()!;
    f.command.mockImplementation(args => args[0] === "EVAL" ? Promise.reject(new Error("CAS unavailable")) : command(args));
    f.patch.mockRejectedValueOnce(new GraphWriteError("Recusado", 429, "GRAPH_WRITE_THROTTLED", "rejected"));
    await expect(f.service.save("1", correctionInput, context)).rejects.toThrow();
    f.command.mockImplementation(command);
    await expect(f.service.reconcile("1", correctionInput.operationId, { actor: actorM })).rejects.toMatchObject({ code: "CORRECTION_NOT_APPLIED" });
    expect([...f.ledger.keys()].some(k => k.endsWith(":pending"))).toBe(false);
    expect(f.patch).toHaveBeenCalledTimes(1);
  });
});

describe("P0 contrato de erro para a interface", () => {
  it.each(["GRAPH_WRITE_INVALID_PAYLOAD", "GRAPH_WRITE_AUTHENTICATION_FAILED", "GRAPH_WRITE_THROTTLED",
    "GRAPH_WRITE_PREPARATION_FAILED", "GRAPH_WRITE_PERMISSION_UNVERIFIED", "CORRECTION_NOT_APPLIED"])("recusa comprovada %s não indica sucesso nem operação incerta", async code => {
    const { CorrectionRequestError } = await import("../../repositories/bff/correction-error");
    expect(new CorrectionRequestError("Recusa", code).requiresReconciliation).toBe(false);
  });
  it.each(["CORRECTION_UNCONFIRMED", "GRAPH_WRITE_FAILED", "UNKNOWN"])("mantém reconciliação para %s", async code => {
    const { CorrectionRequestError } = await import("../../repositories/bff/correction-error");
    expect(new CorrectionRequestError("Incerto", code).requiresReconciliation).toBe(true);
  });
});
