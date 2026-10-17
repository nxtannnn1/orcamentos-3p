import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { CorporateIdentityService, identityKey } from "./service";
import { assertCorporateWriteRuntime } from "./runtime";
import { PostgresIdentityStore, type SqlConnection } from "./postgres-store";
import type { AdministratorVerifier, AuditEvent, Binding, CorporatePerson, CorporateVerifier,
  ExternalIdentity, IdentityStore, IdentityTransaction, Resource, WriteAction, WriteRequest } from "./contracts";
import type { AppRole, SessionUser } from "../auth/configuration";
import { DecisionError } from "../../domain/decision-error";

// EXPLICIT TEST DOUBLE: no PostgreSQL, Graph, SharePoint, Keycloak or infrastructure writes.
class IsolatedStore implements IdentityStore {
  rows = new Map<string, Binding>();
  events: AuditEvent[] = [];
  failPersistence = false;
  failAudit = false;
  private queue = Promise.resolve();
  async transaction<T>(identity: ExternalIdentity, work: (tx: IdentityTransaction) => Promise<T>): Promise<T> {
    let unlock!: () => void;
    const previous = this.queue;
    this.queue = new Promise(resolve => { unlock = resolve; });
    await previous;
    const rows = structuredClone(this.rows), events = structuredClone(this.events), key = identityKey(identity);
    try {
      if (this.failPersistence) throw new Error("simulated DB unavailable");
      const result = await work({
        current: async () => structuredClone(rows.get(key) ?? null),
        save: async (binding, expectedVersion) => {
          if ((rows.get(key)?.version ?? null) !== expectedVersion) throw new DecisionError("Conflict", 409, "BINDING_VERSION_CONFLICT");
          for (const other of rows.values()) if (identityKey(other.identity) !== key && binding.state === "active" && other.state === "active" &&
            binding.identity.issuer === other.identity.issuer &&
            ((binding.person.tenantId === other.person.tenantId && binding.person.oid === other.person.oid) ||
             (binding.person.siteId === other.person.siteId && binding.person.lookupId === other.person.lookupId)))
            throw new DecisionError("Target conflict", 409, "BINDING_TARGET_CONFLICT");
          rows.set(key, structuredClone(binding));
        },
        append: async event => { if (this.failAudit) throw new Error("simulated audit unavailable"); events.push(structuredClone(event)); },
      });
      this.rows = rows; this.events = events;
      return result;
    } finally { unlock(); }
  }
}
const identity = { issuer: "https://sso.example/realms/portal", subject: "Employee-A" };
const person: CorporatePerson = { tenantId: "11111111-1111-4111-8111-111111111111", oid: "22222222-2222-4222-8222-222222222222", siteId: "site-ficticio", lookupId: "12" };
const resource: Resource = { siteId: person.siteId, listId: "list-ficticia", budgetId: "101", itemId: "201" };
const grantId = "33333333-3333-4333-8333-333333333333";
let time: number, store: IsolatedStore, service: CorporateIdentityService, verifier: CorporateVerifier;
const admins: AdministratorVerifier = { authenticate: async credential => ({ id: "admin-ficticio", capabilities: credential === "test-admin" ? ["bindings:manage", "bindings:read"] : [] }) };
const input = (action: WriteAction = "APPROVE") => ({ identity, person,
  expectedVersion: null, reason: "Vínculo fictício autorizado para teste isolado",
  grants: [{ id: grantId, action, resource, expiresAt: time + 600 }] });
const request = (action: WriteAction = "APPROVE", roles: AppRole[] = ["Operador"]): WriteRequest => ({ identity, action, roles, resource, sessionBindingVersion: 1 });
beforeEach(() => {
  time = 1800000000;
  store = new IsolatedStore();
  verifier = { verify: vi.fn<CorporateVerifier["verify"]>(async (key, target) => ({ source: "isolated-test-verifier", evidenceId: "proof-ficticia", checkedAt: time,
    expiresAt: time + 600, identity: structuredClone(key), person: structuredClone(target),
    externalAccountActive: true, corporateAccountActive: true, personExists: true, associationVerified: true })) };
  service = new CorporateIdentityService(store, verifier, admins, ["isolated-test-verifier"], () => time);
});

describe("corporate identity: explicit isolated verifier and transactional store", () => {
  it.each(["APPROVE", "REJECT", "CORRECT", "RECONCILE"] as const)("authorizes %s only with verified identity, business role and exact grant", async action => {
    await service.activate("test-admin", input(action));
    const result = await service.authorize(request(action));
    expect(result).toMatchObject({ identity, person, bindingVersion: 1, action, resource });
    expect(store.events.map(e => e.kind)).toEqual(["activated", "write-intent"]);
    expect(store.events[1]).toMatchObject({ operationId: result.operationId, person, identity });
    expect(verifier.verify).toHaveBeenCalledTimes(2);
  });
  it.each(["Operador", "Comprador"] as const)("requires grant even for %s", async role => {
    await service.activate("test-admin", { ...input(), grants: [] });
    await expect(service.authorize(request("APPROVE", [role]))).rejects.toMatchObject({ code: "EXPLICIT_GRANT_REQUIRED" });
  });
  it.each([{ roles: [] }, { roles: ["Consulta"] }] as { roles: AppRole[] }[])("denies identities without a review role: %j", async ({ roles }) => {
    await service.activate("test-admin", input());
    await expect(service.authorize(request("APPROVE", roles))).rejects.toMatchObject({ code: "BUSINESS_ROLE_REQUIRED" });
  });
  it.each(["Operador", "Comprador"] as const)("permits granted %s", async role => {
    await service.activate("test-admin", input());
    await expect(service.authorize(request("APPROVE", [role]))).resolves.toMatchObject({ person });
  });
  it("denies unbound identity", async () => {
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "BINDING_REQUIRED" });
  });
  it("revocation blocks existing session immediately and reactivation rejects old version", async () => {
    await service.activate("test-admin", input());
    await service.revoke("test-admin", identity, 1, "Revogação de teste");
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "BINDING_REQUIRED" });
    await service.activate("test-admin", { ...input(), expectedVersion: 2 });
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "BINDING_SESSION_STALE" });
    await expect(service.authorize({ ...request(), sessionBindingVersion: 3 })).resolves.toMatchObject({ bindingVersion: 3 });
    expect(store.events.map(e => e.bindingVersion)).toEqual([1, 2, 3, 3]);
  });
  it("requires a new session after grants change; old JWE version cannot gain permission", async () => {
    await service.activate("test-admin", { ...input(), grants: [] });
    await service.activate("test-admin", { ...input(), expectedVersion: 1 });
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "BINDING_SESSION_STALE" });
  });
  it("denies a legacy session that has no binding version", async () => {
    await service.activate("test-admin", input());
    await expect(service.authorize({ ...request(), sessionBindingVersion: undefined } as unknown as WriteRequest))
      .rejects.toMatchObject({ code: "BINDING_SESSION_STALE" });
  });
  it("records result against original identity/version even if the binding is revoked in flight", async () => {
    await service.activate("test-admin", input());
    const receipt = await service.authorize(request());
    await service.revoke("test-admin", identity, 1, "Revogado durante operação já autorizada");
    await service.recordOutcome(receipt, "unconfirmed");
    expect(store.events.at(-1)).toMatchObject({ kind: "write-unconfirmed", bindingVersion: 1, operationId: receipt.operationId });
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "BINDING_REQUIRED" });
  });
  it("rejects forged and replayed operation receipts", async () => {
    await service.activate("test-admin", input());
    const receipt = await service.authorize(request());
    await expect(service.recordOutcome(structuredClone(receipt), "confirmed")).rejects.toMatchObject({ code: "WRITE_RECEIPT_INVALID" });
    await service.recordOutcome(receipt, "confirmed");
    await expect(service.recordOutcome(receipt, "confirmed")).rejects.toMatchObject({ code: "WRITE_RECEIPT_INVALID" });
    expect(store.events.at(-1)?.kind).toBe("write-confirmed");
  });
  it("leaves durable intent when outcome storage fails, without retrying any write", async () => {
    await service.activate("test-admin", input());
    const receipt = await service.authorize(request()); store.failAudit = true;
    await expect(service.recordOutcome(receipt, "confirmed")).rejects.toMatchObject({ status: 503 });
    expect(store.events.at(-1)?.kind).toBe("write-intent");
  });
  it("does not identify by email: same email cannot authorize another subject", async () => {
    const sharedEmail = "ficticio@example.invalid";
    await service.activate("test-admin", { ...input(), email: sharedEmail } as ReturnType<typeof input>);
    await expect(service.authorize({ ...request(), identity: { ...identity, subject: "Other-person" }, email: sharedEmail } as WriteRequest))
      .rejects.toMatchObject({ code: "BINDING_REQUIRED" });
  });
  it.each([{ ...identity, subject: "employee-a" }, { ...identity, issuer: "https://SSO.example/realms/portal" }])("keeps issuer and subject exact: %j", async other => {
    await service.activate("test-admin", input());
    await expect(service.authorize({ ...request(), identity: other })).rejects.toMatchObject({ code: "BINDING_REQUIRED" });
  });
  it("rejects spoofed corporate ID returned by verifier", async () => {
    const original = verifier.verify;
    verifier.verify = async (key, target, signal) => ({ ...await original(key, target, signal), person: { ...target, lookupId: "999" } });
    await expect(service.activate("test-admin", input())).rejects.toMatchObject({ code: "VERIFICATION_INVALID" });
    expect(store.rows.size).toBe(0);
  });
  it.each(["externalAccountActive", "corporateAccountActive", "personExists", "associationVerified"] as const)("denies failed verification: %s", async field => {
    await service.activate("test-admin", input());
    const original = verifier.verify;
    verifier.verify = async (key, target, signal) => ({ ...await original(key, target, signal), [field]: false }) as never;
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "VERIFICATION_INVALID" });
    expect(store.events).toHaveLength(1);
  });
  it("rejects untrusted verification source", async () => {
    service = new CorporateIdentityService(store, verifier, admins, [], () => time);
    await expect(service.activate("test-admin", input())).rejects.toMatchObject({ code: "VERIFICATION_INVALID" });
  });
  it("fails closed if verifier is unavailable", async () => {
    await service.activate("test-admin", input());
    verifier.verify = async () => { throw new Error("simulated directory outage"); };
    await expect(service.authorize(request())).rejects.toMatchObject({ status: 503, code: "IDENTITY_DEPENDENCY_UNAVAILABLE" });
  });
  it("bounds a hung verifier and never activates the binding", async () => {
    verifier.verify = () => new Promise(() => {});
    await expect(service.activate("test-admin", input())).rejects.toMatchObject({ status: 503 });
    expect(store.rows.size).toBe(0);
  }, 10000);
  it.each(["future", "stale", "expired", "excess-validity", "wrong-subject"] as const)("rejects invalid verifier evidence: %s", async variant => {
    const original = verifier.verify;
    verifier.verify = async (key, target, signal) => ({ ...await original(key, target, signal),
      ...(variant === "future" ? { checkedAt: time + 1 } : {}),
      ...(variant === "stale" ? { checkedAt: time - 301 } : {}),
      ...(variant === "expired" ? { expiresAt: time } : {}),
      ...(variant === "excess-validity" ? { expiresAt: time + 86401 } : {}),
      ...(variant === "wrong-subject" ? { identity: { ...key, subject: "Other" } } : {}),
    });
    await expect(service.activate("test-admin", input())).rejects.toMatchObject({ code: "VERIFICATION_INVALID" });
    expect(store.events).toHaveLength(0);
  });
  it("expires grants", async () => {
    await service.activate("test-admin", { ...input(), grants: [{ ...input().grants[0], expiresAt: time + 1 }] });
    time += 1;
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "EXPLICIT_GRANT_REQUIRED" });
  });
  it("expires original binding proof even when fresh verification works", async () => {
    await service.activate("test-admin", input()); time += 600;
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "BINDING_VERIFICATION_EXPIRED" });
  });
  it.each(["siteId", "listId", "budgetId", "itemId"] as const)("confines permission to exact %s", async field => {
    await service.activate("test-admin", input());
    await expect(service.authorize({ ...request(), resource: { ...resource, [field]: "another" } })).rejects.toMatchObject({ code: "EXPLICIT_GRANT_REQUIRED" });
  });
  it("does not infer a correction permission from approval", async () => {
    await service.activate("test-admin", input());
    await expect(service.authorize(request("CORRECT"))).rejects.toMatchObject({ code: "EXPLICIT_GRANT_REQUIRED" });
  });
  it("rejects wildcard grants and duplicate grant identifiers", async () => {
    await expect(service.activate("test-admin", { ...input(), grants: [{ ...input().grants[0], resource: { ...resource, itemId: "*" } }] })).rejects.toMatchObject({ code: "RESOURCE_INVALID" });
    await expect(service.activate("test-admin", { ...input(), grants: [...input().grants, ...input().grants] })).rejects.toMatchObject({ code: "GRANT_INVALID" });
  });
  it("requires separate administrative authority for create, read and revoke", async () => {
    await expect(service.activate("Operador", input())).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    await expect(service.lookup("Comprador", identity)).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
    await expect(service.revoke("Consulta", identity, 1, "test")).rejects.toMatchObject({ code: "ADMIN_REQUIRED" });
  });
  it("supports privileged lookup without changing the binding", async () => {
    const binding = await service.activate("test-admin", input());
    expect(await service.lookup("test-admin", identity)).toEqual(binding);
    expect(store.events).toHaveLength(1);
  });
  it("rejects corporate ownership changes even after revocation", async () => {
    await service.activate("test-admin", input()); await service.revoke("test-admin", identity, 1, "Revogado");
    await expect(service.activate("test-admin", { ...input(), expectedVersion: 2, person: { ...person, lookupId: "99" } }))
      .rejects.toMatchObject({ code: "BINDING_OWNERSHIP_CHANGE_DENIED" });
  });
  it("rolls back binding when audit persistence fails", async () => {
    store.failAudit = true;
    await expect(service.activate("test-admin", input())).rejects.toMatchObject({ status: 503 });
    expect(store.rows.size).toBe(0); expect(store.events).toHaveLength(0);
  });
  it("does not authorize when persistence or audit is unavailable", async () => {
    await service.activate("test-admin", input()); store.failPersistence = true;
    await expect(service.authorize(request())).rejects.toMatchObject({ status: 503 });
    store.failPersistence = false; store.failAudit = true;
    await expect(service.authorize(request())).rejects.toMatchObject({ status: 503 });
    expect(store.events).toHaveLength(1);
  });
  it("serializes concurrent creation of the same identity", async () => {
    const results = await Promise.allSettled([service.activate("test-admin", input()), service.activate("test-admin", input())]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(store.rows.size).toBe(1); expect(store.events).toHaveLength(1);
  });
  it("rejects concurrent reuse of one corporate person by different subjects", async () => {
    const results = await Promise.allSettled([service.activate("test-admin", input()),
      service.activate("test-admin", { ...input(), identity: { ...identity, subject: "Employee-B" } })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("serializes concurrent revocation; no lost update", async () => {
    await service.activate("test-admin", input());
    const results = await Promise.allSettled([service.revoke("test-admin", identity, 1, "First"), service.revoke("test-admin", identity, 1, "Second")]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    await expect(service.authorize(request())).rejects.toMatchObject({ code: "BINDING_REQUIRED" });
  });
  it("does not accept browser corporate fields as authorization inputs", async () => {
    await expect(service.authorize({ ...request(), person, corporateOid: person.oid } as WriteRequest)).rejects.toMatchObject({ code: "BINDING_REQUIRED" });
  });
  it("retains real-write runtime block for Keycloak; Microsoft identity passes unchanged", () => {
    const user: SessionUser = { authMode: "keycloak", issuer: identity.issuer, subject: identity.subject, oid: identityKey(identity), tenantId: identity.issuer, name: "Fictício", roles: ["Operador"], mfaContext: null };
    expect(() => assertCorporateWriteRuntime(user)).toThrowError(expect.objectContaining({ code: "CORPORATE_WRITES_NOT_ACTIVATED" }));
    expect(() => assertCorporateWriteRuntime({ ...user, authMode: "entra", oid: person.oid, tenantId: person.tenantId, mfaContext: "c1" })).not.toThrow();
  });
});

describe("Postgres adapter contract (recording driver; no real SQL executed)", () => {
  it("parameterizes exact subject instead of interpolating it into SQL", async () => {
    const calls: { sql: string; values: readonly unknown[] }[] = [];
    const connection: SqlConnection = { query: async <T>(sql: string, values: readonly unknown[]) => { calls.push({ sql, values }); return { rows: [] as T[], rowCount: 0 }; } };
    const adapter = new PostgresIdentityStore({ transaction: work => work(connection) });
    const key = { ...identity, subject: "A'); DELETE FROM bindings; --" };
    expect(await adapter.transaction(key, tx => tx.current())).toBeNull();
    expect(calls[1].values).toEqual([identity.issuer, key.subject]);
    expect(calls.every(c => !c.sql.includes(key.subject))).toBe(true);
  });
});
