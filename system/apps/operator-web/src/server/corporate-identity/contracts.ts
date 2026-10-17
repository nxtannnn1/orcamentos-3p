import type { AppRole } from "../auth/configuration";

export type ExternalIdentity = Readonly<{ issuer: string; subject: string }>;
export type CorporatePerson = Readonly<{ tenantId: string; oid: string; siteId: string; lookupId: string }>;
export const writeActions = ["APPROVE", "REJECT", "CORRECT", "RECONCILE"] as const;
export type WriteAction = typeof writeActions[number];
export type Resource = Readonly<{ siteId: string; listId: string; budgetId: string; itemId: string }>;
export type Grant = Readonly<{ id: string; action: WriteAction; resource: Resource; expiresAt: number }>;
/** Server adapter output, never claims supplied by the browser or by Keycloak. */
export type Verification = Readonly<{
  source: string; evidenceId: string; checkedAt: number; expiresAt: number;
  identity: ExternalIdentity; person: CorporatePerson;
  externalAccountActive: true; corporateAccountActive: true; personExists: true; associationVerified: true;
}>;
export interface CorporateVerifier {
  /** Must independently verify both accounts, the site-local person binding,
   * and the explicitly approved association between those accounts.
   * Must not provision accounts, infer linkage from email, or expand Graph grants.
   * Returns exactly one verified binding or throws. Runtime has no configured adapter. */
  verify(identity: ExternalIdentity, proposed: CorporatePerson, signal: AbortSignal): Promise<Verification>;
}
export type Binding = Readonly<{
  id: string; identity: ExternalIdentity; person: CorporatePerson;
  version: number; state: "active" | "revoked";
  verification: Verification; grants: readonly Grant[];
}>;
export type Administrator = Readonly<{ id: string; capabilities: readonly ("bindings:manage" | "bindings:read")[] }>;
export interface AdministratorVerifier {
  /** Resolve an opaque credential through a trusted administrative authority.
   * Business roles are never administrative capabilities. Never log the credential. */
  authenticate(credential: string): Promise<Administrator>;
}
export type AuditEvent = Readonly<{
  id: string; at: number; kind: "activated" | "revoked" | "write-intent" | "write-confirmed" | "write-unconfirmed";
  bindingId: string; bindingVersion: number; identity: ExternalIdentity;
  actorId: string; reason?: string; operationId?: string; action?: WriteAction; resource?: Resource;
  person: CorporatePerson;
}>;
export interface IdentityTransaction {
  current(): Promise<Binding | null>;
  /** Compare-and-set; must reject conflicting versions and target identity reuse. */
  save(binding: Binding, expectedVersion: number | null): Promise<void>;
  append(event: AuditEvent): Promise<void>;
}
export interface IdentityStore {
  /** Serialize this identity across processes. Roll back state AND audit on error.
   * The callback must not perform external writes; transactions cannot undo Graph. */
  transaction<T>(identity: ExternalIdentity, work: (tx: IdentityTransaction) => Promise<T>): Promise<T>;
}
export type WriteRequest = Readonly<{
  /** Trusted server session context ONLY; never deserialize this object from a request body. */
  identity: ExternalIdentity; roles: readonly AppRole[]; sessionBindingVersion: number;
  action: WriteAction; resource: Resource;
}>;
export type AuthorizedWrite = Readonly<{
  operationId: string; bindingId: string; bindingVersion: number;
  identity: ExternalIdentity; person: CorporatePerson; action: WriteAction; resource: Resource;
}>;
