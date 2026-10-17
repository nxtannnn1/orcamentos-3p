import "server-only";
import { randomUUID } from "node:crypto";
import { DecisionError } from "../../domain/decision-error";
import { writeActions, type AdministratorVerifier, type AuthorizedWrite, type Binding,
  type CorporatePerson, type CorporateVerifier, type ExternalIdentity, type Grant,
  type IdentityStore, type Resource, type Verification, type WriteRequest } from "./contracts";

const deny = (code: string, status = 403): never => { throw new DecisionError("Autorização corporativa indisponível ou não concedida.", status, code); };
export const identityKey = (identity: ExternalIdentity) => JSON.stringify([identity.issuer, identity.subject]);
const sameIdentity = (a: ExternalIdentity, b: ExternalIdentity) => identityKey(a) === identityKey(b);
const samePerson = (a: CorporatePerson, b: CorporatePerson) =>
  a.tenantId === b.tenantId && a.oid === b.oid && a.siteId === b.siteId && a.lookupId === b.lookupId;
const sameResource = (a: Resource, b: Resource) =>
  a.siteId === b.siteId && a.listId === b.listId && a.budgetId === b.budgetId && a.itemId === b.itemId;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function validateIdentity(identity: ExternalIdentity) {
  try {
    const url = new URL(identity.issuer);
    if (!identity.subject || identity.subject.length > 255 || identity.issuer.length > 1024 ||
      /[\u0000-\u001f]/.test(identity.subject) || url.username || url.password || url.search || url.hash ||
      !["http:", "https:"].includes(url.protocol)) return deny("IDENTITY_INVALID");
  } catch { return deny("IDENTITY_INVALID"); }
}
function validatePerson(person: CorporatePerson) {
  if (!uuid.test(person.tenantId) || !uuid.test(person.oid) || !person.siteId || person.siteId.length > 512 || /[\u0000-\u001f]/.test(person.siteId) ||
    !/^[1-9]\d*$/.test(person.lookupId) || !Number.isSafeInteger(Number(person.lookupId))) return deny("CORPORATE_PERSON_INVALID");
}
function validateResource(resource: Resource) {
  if (![resource.siteId, resource.listId, resource.budgetId, resource.itemId].every(value =>
    typeof value === "string" && value.length > 0 && value.length <= 512 && value !== "*" && !/[\u0000-\u001f]/.test(value)))
    return deny("RESOURCE_INVALID");
}
function validateVerification(value: Verification, identity: ExternalIdentity, person: CorporatePerson, now: number, sources: readonly string[]) {
  if (!sources.includes(value.source) || !value.evidenceId || value.evidenceId.length > 255 ||
    !sameIdentity(value.identity, identity) || !samePerson(value.person, person) ||
    value.externalAccountActive !== true || value.corporateAccountActive !== true || value.personExists !== true || value.associationVerified !== true ||
    !Number.isSafeInteger(value.checkedAt) || !Number.isSafeInteger(value.expiresAt) ||
    value.checkedAt > now || value.expiresAt <= now || now - value.checkedAt > 300 ||
    value.expiresAt - value.checkedAt > 86400) return deny("VERIFICATION_INVALID");
}

/** Role is only an upper bound. Every write additionally requires an exact grant.
 * Initial policy preserves both existing review roles; Consulta alone cannot write. */
export function roleAllows(request: Pick<WriteRequest, "roles" | "action">) {
  return writeActions.includes(request.action) && request.roles.some(role => role === "Operador" || role === "Comprador");
}

export class CorporateIdentityService {
  // Only receipts actually issued by this service instance can report an outcome.
  // A restart leaves a durable intent requiring a separate reconciliation procedure.
  private readonly receipts = new WeakMap<AuthorizedWrite, AuthorizedWrite>();
  constructor(private readonly store: IdentityStore, private readonly verifier: CorporateVerifier,
    private readonly admins: AdministratorVerifier, private readonly trustedSources: readonly string[],
    private readonly clock: () => number = () => Math.floor(Date.now() / 1000)) {}

  private async verify(identity: ExternalIdentity, person: CorporatePerson) {
    const signal = AbortSignal.timeout(5000);
    return Promise.race([
      this.verifier.verify(structuredClone(identity), structuredClone(person), signal),
      new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Verification timeout")), { once: true })),
    ]);
  }

  private async administrator(credential: string, capability: "bindings:read" | "bindings:manage") {
    const admin = await this.admins.authenticate(credential);
    if (!admin.id || !admin.capabilities.includes(capability)) return deny("ADMIN_REQUIRED");
    return admin;
  }
  private async safe<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof DecisionError) throw error;
      return deny("IDENTITY_DEPENDENCY_UNAVAILABLE", 503);
    }
  }
  async lookup(credential: string, identity: ExternalIdentity) {
    return this.safe(async () => {
      await this.administrator(credential, "bindings:read"); validateIdentity(identity);
      return this.store.transaction(identity, tx => tx.current());
    });
  }
  async activate(credential: string, input: {
    identity: ExternalIdentity; person: CorporatePerson; grants: readonly Grant[];
    expectedVersion: number | null; reason: string;
  }): Promise<Binding> {
    // Clone before awaiting any dependency; callers cannot mutate identity/grants mid-verification.
    const candidate = structuredClone(input);
    return this.safe(async () => {
      const admin = await this.administrator(credential, "bindings:manage");
      validateIdentity(candidate.identity); validatePerson(candidate.person);
      if (!candidate.reason.trim() || candidate.reason.length > 2000) return deny("REASON_REQUIRED", 400);
      if (candidate.grants.length > 1000 || new Set(candidate.grants.map(g => g.id)).size !== candidate.grants.length)
        return deny("GRANT_INVALID", 400);
      for (const grant of candidate.grants) {
        validateResource(grant.resource);
        if (!uuid.test(grant.id) || !writeActions.includes(grant.action) || grant.resource.siteId !== candidate.person.siteId ||
          !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= this.clock()) return deny("GRANT_INVALID", 400);
      }
      const verification = structuredClone(await this.verify(candidate.identity, candidate.person));
      return this.store.transaction(candidate.identity, async tx => {
        validateVerification(verification, candidate.identity, candidate.person, this.clock(), this.trustedSources);
        const old = await tx.current();
        if ((old?.version ?? null) !== candidate.expectedVersion) return deny("BINDING_VERSION_CONFLICT", 409);
        // A revoked identity cannot silently switch corporate ownership; new ownership needs a separate reviewed procedure.
        if (old && !samePerson(old.person, candidate.person)) return deny("BINDING_OWNERSHIP_CHANGE_DENIED");
        const binding: Binding = { id: old?.id ?? randomUUID(), identity: candidate.identity, person: candidate.person,
          version: (old?.version ?? 0) + 1, state: "active", verification, grants: candidate.grants };
        await tx.save(binding, candidate.expectedVersion);
        await tx.append({ id: randomUUID(), at: this.clock(), kind: "activated", bindingId: binding.id,
          bindingVersion: binding.version, identity: binding.identity, person: binding.person, actorId: admin.id, reason: candidate.reason });
        return structuredClone(binding);
      });
    });
  }
  async revoke(credential: string, identity: ExternalIdentity, expectedVersion: number, reason: string) {
    const key = structuredClone(identity);
    return this.safe(async () => {
      const admin = await this.administrator(credential, "bindings:manage"); validateIdentity(key);
      if (!reason.trim() || reason.length > 2000) return deny("REASON_REQUIRED", 400);
      return this.store.transaction(key, async tx => {
        const old = await tx.current();
        if (!old || old.version !== expectedVersion) return deny("BINDING_VERSION_CONFLICT", 409);
        const binding: Binding = { ...old, state: "revoked", version: old.version + 1, grants: [] };
        await tx.save(binding, expectedVersion);
        await tx.append({ id: randomUUID(), at: this.clock(), kind: "revoked", bindingId: old.id, bindingVersion: binding.version,
          identity: key, person: old.person, actorId: admin.id, reason });
        return binding;
      });
    });
  }
  /** Authorize and durably record intent. No Graph call is made by this service.
   * Revocation blocks subsequent authorizations, not requests already dispatched. */
  async authorize(request: WriteRequest): Promise<AuthorizedWrite> {
    const input = structuredClone(request);
    return this.safe(async () => {
      validateIdentity(input.identity); validateResource(input.resource);
      if (!roleAllows(input)) return deny("BUSINESS_ROLE_REQUIRED");
      const result = await this.store.transaction(input.identity, async tx => {
        const binding = await tx.current();
        if (!binding || binding.state !== "active") return deny("BINDING_REQUIRED");
        if (!sameIdentity(binding.identity, input.identity) || binding.version !== input.sessionBindingVersion)
          return deny("BINDING_SESSION_STALE");
        validatePerson(binding.person);
        // Re-check both authoritative accounts and the site-local mapping on every write.
        const proof = await this.verify(input.identity, binding.person);
        validateVerification(proof, input.identity, binding.person, this.clock(), this.trustedSources);
        if (binding.verification.expiresAt <= this.clock()) return deny("BINDING_VERIFICATION_EXPIRED");
        if (!binding.grants.some(grant => grant.action === input.action && grant.expiresAt > this.clock() && sameResource(grant.resource, input.resource)))
          return deny("EXPLICIT_GRANT_REQUIRED");
        const authorized: AuthorizedWrite = { operationId: randomUUID(), bindingId: binding.id, bindingVersion: binding.version,
          identity: binding.identity, person: binding.person, action: input.action, resource: input.resource };
        await tx.append({ id: randomUUID(), at: this.clock(), kind: "write-intent", ...authorized, actorId: identityKey(input.identity) });
        return structuredClone(authorized);
      });
      this.receipts.set(result, structuredClone(result));
      return result;
    });
  }
  async recordOutcome(receipt: AuthorizedWrite, outcome: "confirmed" | "unconfirmed") {
    return this.safe(async () => {
      const issued = this.receipts.get(receipt);
      if (!issued || !["confirmed", "unconfirmed"].includes(outcome)) return deny("WRITE_RECEIPT_INVALID");
      this.receipts.delete(receipt);
      // The original binding revision remains auditable even if subsequently revoked.
      await this.store.transaction(issued.identity, tx => tx.append({ ...issued,
        id: randomUUID(), at: this.clock(), kind: outcome === "confirmed" ? "write-confirmed" : "write-unconfirmed",
        actorId: identityKey(issued.identity) }));
    });
  }
}
