import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { resolveDecisionPerson, unavailablePersonResolver, type SharePointPersonResolver } from "./person-resolver";

const actor = { tenantId: "tenant", oid: "human-oid" };
const person = { ...actor, siteId: "site", lookupId: "7" };
const resolve = (resolver: SharePointPersonResolver, identity = actor) =>
  resolveDecisionPerson(resolver, identity, "site", "tenant");

describe("resolução server-side da Pessoa SharePoint", () => {
  it("bloqueia por padrão sem um provedor verificado", async () => {
    await expect(resolve(unavailablePersonResolver)).rejects.toMatchObject({ code: "PERSON_RESOLUTION_NOT_CONFIGURED" });
  });
  it("aceita somente um vínculo do humano no site e tenant esperados", async () => {
    const findCandidates = vi.fn(async () => [person]);
    expect(await resolve({ findCandidates })).toEqual(person);
    expect(findCandidates).toHaveBeenCalledWith(actor, "site");
  });
  it("bloqueia tenant incorreto antes de consultar o provedor", async () => {
    const findCandidates = vi.fn(async () => [person]);
    await expect(resolve({ findCandidates }, { ...actor, tenantId: "other" })).rejects.toMatchObject({ code: "DECISION_TENANT_MISMATCH" });
    expect(findCandidates).not.toHaveBeenCalled();
  });
  it.each([
    { candidates: [], code: "PERSON_NOT_FOUND" },
    { candidates: [person, { ...person, lookupId: "8" }], code: "PERSON_AMBIGUOUS" },
    { candidates: [{ ...person, oid: "service-account" }], code: "PERSON_IDENTITY_MISMATCH" },
    { candidates: [{ ...person, tenantId: "other" }], code: "PERSON_IDENTITY_MISMATCH" },
    { candidates: [{ ...person, siteId: "other" }], code: "PERSON_IDENTITY_MISMATCH" },
    { candidates: [{ ...person, lookupId: "0" }], code: "PERSON_IDENTITY_MISMATCH" },
    { candidates: [{ ...person, lookupId: "human-oid" }], code: "PERSON_IDENTITY_MISMATCH" },
    { candidates: [{ ...person, lookupId: "9007199254740992" }], code: "PERSON_IDENTITY_MISMATCH" },
  ])("rejeita vínculo não verificável: $code", async ({ candidates, code }) => {
    await expect(resolve({ findCandidates: async () => candidates })).rejects.toMatchObject({ code });
  });
  it("não propaga mensagens Graph que possam conter dados pessoais", async () => {
    await expect(resolve({ findCandidates: async () => { throw new Error("private upstream details"); } }))
      .rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE", message: "Não foi possível verificar a Pessoa SharePoint." });
  });
});
