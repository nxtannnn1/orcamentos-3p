import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { GraphListPersonResolver } from "./graph-list-person-resolver";
import { resolveDecisionPerson } from "./person-resolver";
import { GraphReadError } from "./graph-read-error";

const tenantId = "11111111-1111-1111-1111-111111111111";
const oid = "22222222-2222-2222-2222-222222222222";
const siteId = "example.sharepoint.com,33333333-3333-3333-3333-333333333333,44444444-4444-4444-4444-444444444444";
const listId = "55555555-5555-5555-5555-555555555555";
const config = { tenantId, siteId, listId };
const actor = { tenantId, oid };
const pair = (lookupId = "7", user = { id: oid }) => ({ user, siteUser: { id: lookupId } });
function fixture(value: unknown[] = [{ grantedToV2: pair() }]) {
  const get = vi.fn(async (path: string): Promise<unknown> => path.includes("/permissions") ? { value } : { id: siteId });
  const patch = vi.fn();
  const transport = { get: async <T>(path: string) => await get(path) as T, patch };
  const diagnostics = vi.fn();
  const resolver = new GraphListPersonResolver(transport, config, diagnostics);
  return { resolver, get, patch, diagnostics, resolve: () => resolveDecisionPerson(resolver, actor, siteId, tenantId) };
}

describe("fonte Graph V2 de Pessoa SharePoint, somente leitura", () => {
  it("resolve um par único do mesmo objeto e nunca executa escrita", async () => {
    const f = fixture();
    expect(await f.resolve()).toEqual({ ...actor, siteId, lookupId: "7" });
    expect(f.get).toHaveBeenCalledTimes(2);
    expect(f.patch).not.toHaveBeenCalled();
  });
  it("aceita V2 plural e deduplica apenas a mesma associação", async () => {
    const f = fixture([{ grantedToV2: pair(), grantedToIdentitiesV2: [pair()] }]);
    expect((await f.resolve()).lookupId).toBe("7");
  });
  it("usuário ausente ou OID diferente não vira correspondência por email", async () => {
    const f = fixture([{ grantedToV2: { ...pair("7", { id: listId }), userEmail: "same@example.test" } }]);
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_NOT_FOUND" });
  });
  it("recusa duas Pessoas distintas para o mesmo OID", async () => {
    await expect(fixture([{ grantedToIdentitiesV2: [pair("7"), pair("8")] }]).resolve()).rejects.toMatchObject({ code: "PERSON_AMBIGUOUS" });
  });
  it("recusa tenant incorreto antes da rede", async () => {
    const f = fixture();
    await expect(f.resolver.findCandidates({ ...actor, tenantId: listId }, siteId)).rejects.toMatchObject({ code: "DECISION_TENANT_MISMATCH" });
    expect(f.get).not.toHaveBeenCalled();
  });
  it("recusa tenant divergente na identidade retornada", async () => {
    const f = fixture([{ grantedToV2: { ...pair(), user: { id: oid, tenantId: listId } } }]);
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_IDENTITY_MISMATCH" });
    const inconsistentSiteUser = fixture([{ grantedToV2: { ...pair(), siteUser: { id: "7", tenantId: listId } } }]);
    await expect(inconsistentSiteUser.resolve()).rejects.toMatchObject({ code: "PERSON_IDENTITY_MISMATCH" });
  });
  it("recusa outro site antes da rede e metadados de site divergentes", async () => {
    const f = fixture();
    await expect(f.resolver.findCandidates(actor, "another-site")).rejects.toMatchObject({ code: "PERSON_IDENTITY_MISMATCH" });
    expect(f.get).not.toHaveBeenCalled();
    f.get.mockResolvedValue({ id: "another-site" });
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_IDENTITY_MISMATCH" });
  });
  it.each(["0", "-1", "1.5", oid, "9007199254740992"])("recusa lookup inválido %s", async lookup => {
    await expect(fixture([{ grantedToV2: pair(lookup) }]).resolve()).rejects.toMatchObject({ code: "PERSON_IDENTITY_MISMATCH" });
  });
  it.each(["Graph unavailable", "403 accessDenied"])("falha fechada e sem vazar mensagem: %s", async message => {
    const f = fixture(); f.get.mockRejectedValue(new Error(message));
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE", message: "Não foi possível verificar a Pessoa SharePoint." });
    expect(f.patch).not.toHaveBeenCalled();
  });
  it("não combina pares separados nem usa identidades legadas ou de aplicação", async () => {
    const f = fixture([{ grantedToV2: { user: { id: oid } } }, { grantedToV2: { siteUser: { id: "7" } } }]);
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_IDENTITY_MISMATCH" });
    await expect(fixture([{ grantedTo: pair(), grantedToV2: { application: { id: oid } } }]).resolve()).rejects.toMatchObject({ code: "PERSON_NOT_FOUND" });
  });
  it("verifica todas as páginas para detectar ambiguidade", async () => {
    const f = fixture();
    const next = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${listId}/permissions?$skiptoken=next`;
    f.get.mockResolvedValueOnce({ id: siteId }).mockResolvedValueOnce({ value: [{ grantedToV2: pair() }], "@odata.nextLink": next }).mockResolvedValueOnce({ value: [{ grantedToV2: pair("8") }] });
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_AMBIGUOUS" });
  });
  it.each(["https://foreign.example/permissions", "https://graph.microsoft.com/v1.0/users"])("bloqueia paginação fora do recurso: %s", async next => {
    const f = fixture();
    f.get.mockResolvedValueOnce({ id: siteId }).mockResolvedValueOnce({ value: [], "@odata.nextLink": next });
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
    expect(f.get).toHaveBeenCalledTimes(2);
  });
  it("recusa identidade ausente antes da rede", async () => {
    const f = fixture();
    await expect(f.resolver.findCandidates({ tenantId, oid: "" }, siteId)).rejects.toMatchObject({ code: "DECISION_TENANT_MISMATCH" });
    expect(f.get).not.toHaveBeenCalled();
  });
});

describe("diagnóstico temporário agregado do resolvedor", () => {
  it("conta identidades e registros separadamente, deduplicando apenas candidatos", async () => {
    const f = fixture([{ grantedToV2: pair(), grantedToIdentitiesV2: [pair()] },
      { grantedToV2: { application: { id: oid } } }, { grantedToV2: pair("8", { id: listId }) }]);
    await f.resolve();
    expect(f.diagnostics).toHaveBeenCalledExactlyOnceWith({ siteQueryCompleted: true, siteVerified: true,
      permissionsPagesRequested: 1, permissionsPagesCompleted: 1, permissionRecordsAnalyzed: 3,
      actorUserMatches: 2, actorMatchesWithValidSiteUserId: 2, uniqueCandidates: 1, nextLinksSeen: 0,
      scanCompleted: true, failureStage: null, failureKind: null, graphOperation: null, httpStatus: null });
    const serialized = JSON.stringify(f.diagnostics.mock.calls);
    for (const privateValue of [oid, tenantId, siteId, listId]) expect(serialized).not.toContain(privateValue);
  });
  it("ausência real só após percorrer todas as páginas válidas", async () => {
    const f = fixture();
    f.get.mockResolvedValueOnce({ id: siteId }).mockResolvedValueOnce({ value: [{ grantedToV2: { group: { id: oid } } }],
      "@odata.nextLink": `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${listId}/permissions?$skiptoken=private-token` })
      .mockResolvedValueOnce({ value: [{ grantedToV2: pair("7", { id: listId }) }] });
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_NOT_FOUND" });
    expect(f.diagnostics).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ permissionsPagesRequested: 2,
      permissionsPagesCompleted: 2, permissionRecordsAnalyzed: 2, actorUserMatches: 0,
      actorMatchesWithValidSiteUserId: 0, nextLinksSeen: 1, scanCompleted: true, failureKind: null }));
    expect(JSON.stringify(f.diagnostics.mock.calls)).not.toContain("private-token");
  });
  it.each([401, 403, 404, 429, 500])("erro Graph %s não vira ausência", async status => {
    const f = fixture();
    f.get.mockResolvedValueOnce({ id: siteId }).mockRejectedValueOnce(new GraphReadError("get", "HTTP", status));
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
    expect(f.diagnostics).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ siteQueryCompleted: true,
      permissionsPagesRequested: 1, permissionsPagesCompleted: 0, permissionRecordsAnalyzed: 0, scanCompleted: false,
      failureStage: "permissions", failureKind: "HTTP", graphOperation: "get", httpStatus: status }));
  });
  it("distingue falha OAuth no primeiro GET de uma consulta de site concluída", async () => {
    const f = fixture(); f.get.mockRejectedValueOnce(new GraphReadError("oauth", "HTTP", 401));
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
    expect(f.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ siteQueryCompleted: false,
      permissionsPagesRequested: 0, failureStage: "site", graphOperation: "oauth", httpStatus: 401 }));
  });
  it("não usa resultado parcial se uma página posterior falhar", async () => {
    const f = fixture();
    f.get.mockResolvedValueOnce({ id: siteId }).mockResolvedValueOnce({ value: [{ grantedToV2: pair() }],
      "@odata.nextLink": `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/lists/${listId}/permissions?$skiptoken=private` })
      .mockRejectedValueOnce(new GraphReadError("get", "NETWORK"));
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
    expect(f.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ permissionsPagesRequested: 2,
      permissionsPagesCompleted: 1, uniqueCandidates: 1, scanCompleted: false, failureKind: "NETWORK" }));
  });
  it.each([{ value: null }, { value: ["invalid-record"] }, { value: [{ grantedToV2: "invalid-identity" }] }, { value: [{ grantedToIdentitiesV2: [null] }] },
    { value: [{ grantedToIdentitiesV2: "invalid-many" }] }, { value: [{ grantedToV2: { user: { id: 7 } } }] }])(
    "resposta inesperada não vira PERSON_NOT_FOUND: %j", async page => {
      const f = fixture(); f.get.mockResolvedValueOnce({ id: siteId }).mockResolvedValueOnce(page);
      await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
      expect(f.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ failureKind: "INVALID_RESPONSE", scanCompleted: false }));
    });
  it("OID correspondente sem siteUser válido continua incompatível, sem juntar registros", async () => {
    const f = fixture([{ grantedToV2: { user: { id: oid } } }, { grantedToV2: { siteUser: { id: "7" } } }]);
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_IDENTITY_MISMATCH" });
    expect(f.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ actorUserMatches: 1,
      actorMatchesWithValidSiteUserId: 0, uniqueCandidates: 0, failureStage: "identity", failureKind: "IDENTITY_MISMATCH" }));
  });
  it("tenant divergente não vira candidato mesmo com siteUser numericamente válido", async () => {
    const f = fixture([{ grantedToV2: { ...pair(), user: { id: oid, tenantId: listId } } }]);
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_IDENTITY_MISMATCH" });
    expect(f.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ actorUserMatches: 1,
      actorMatchesWithValidSiteUserId: 1, uniqueCandidates: 0, scanCompleted: false }));
  });
  it.each(["https://foreign.example/private", "https://graph.microsoft.com/v1.0/%invalid"])("pagina insegura permanece bloqueada", async next => {
    const f = fixture(); f.get.mockResolvedValueOnce({ id: siteId }).mockResolvedValueOnce({ value: [], "@odata.nextLink": next });
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
    expect(f.diagnostics).toHaveBeenCalledWith(expect.objectContaining({ nextLinksSeen: 1, failureStage: "pagination", failureKind: "PAGINATION_REJECTED" }));
    expect(f.get).toHaveBeenCalledTimes(2);
  });
  it("falha do logger não muda sucesso, recusa ou candidatos", async () => {
    const f = fixture(); f.diagnostics.mockImplementation(() => { throw new Error("private-log-error"); });
    expect((await f.resolve()).lookupId).toBe("7");
    f.get.mockRejectedValue(new GraphReadError("get", "NETWORK"));
    await expect(f.resolve()).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
  });
});
