import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ExplicitPersonResolver } from "./explicit-person-resolver";
import { resolveDecisionPerson } from "./person-resolver";

const actor = { tenantId: "11111111-1111-4111-8111-111111111111", oid: "22222222-2222-4222-8222-222222222222" };
const binding = { ...actor, siteId: "synthetic-site", lookupId: "7", status: "active", evidenceId: "synthetic-evidence", verifiedAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z" };
const resolver = (rows: unknown) => new ExplicitPersonResolver({ readBindings: async () => rows }, () => Date.parse("2026-10-22T00:00:00Z"));
describe("contrato explícito de Pessoa, sem ativação", () => {
  it("resolve identidade da sessão e não expõe metadados administrativos", async () => {
    expect(await resolveDecisionPerson(resolver([binding]), actor, binding.siteId, actor.tenantId))
      .toEqual({ ...actor, siteId: binding.siteId, lookupId: "7" });
  });
  it.each([null, {}, [null], [{ ...binding, oid: "email@example.invalid" }], [{ ...binding, lookupId: "0" }], [{ ...binding, verifiedAt: "2026-02-30T00:00:00.000Z" }]])("recusa envelope/vínculo malformado", async rows => {
    await expect(resolver(rows).findCandidates(actor, binding.siteId)).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
  });
  it.each([{ status: "revoked" }, { siteId: "other-site" }, { oid: "33333333-3333-4333-8333-333333333333" }])("não resolve vínculo revogado ou de outro escopo", async change => {
    expect(await resolver([{ ...binding, ...change }]).findCandidates(actor, binding.siteId)).toEqual([]);
  });
  it.each([{ expiresAt: "2026-10-22T00:00:00.000Z" }, { verifiedAt: "2026-10-23T00:00:00.000Z" }])("recusa evidência expirada ou futura", async change => {
    await expect(resolver([{ ...binding, ...change }]).findCandidates(actor, binding.siteId)).rejects.toMatchObject({ status: 503 });
  });
  it.each([binding, { ...binding, status: "revoked" }, { ...binding, oid: "33333333-3333-4333-8333-333333333333" }])("bloqueia duplicidade ou colisão de Pessoa", async second => {
    await expect(resolver([binding, second]).findCandidates(actor, binding.siteId)).rejects.toMatchObject({ code: "PERSON_AMBIGUOUS" });
  });
  it("sanitiza falha da fonte", async () => {
    const source = new ExplicitPersonResolver({ readBindings: async () => { throw Error("secret remote body"); } });
    await expect(source.findCandidates(actor, binding.siteId)).rejects.toMatchObject({ code: "PERSON_RESOLUTION_UNAVAILABLE" });
  });
});
