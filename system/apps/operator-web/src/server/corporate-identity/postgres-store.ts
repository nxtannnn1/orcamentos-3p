import "server-only";
import { DecisionError } from "../../domain/decision-error";
import type { AuditEvent, Binding, ExternalIdentity, IdentityStore, IdentityTransaction } from "./contracts";
import { identityKey } from "./service";

/** Driver integration is intentionally unconfigured. The owner must connect ONLY
 * an authorized, separate identity database; no business database fallback. */
export interface SqlConnection {
  query<T>(sql: string, values: readonly unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}
export interface IdentitySqlDatabase {
  /** Dedicated connection; BEGIN/COMMIT on success, ROLLBACK on ANY callback failure.
   * Bounded connect/query/lock timeouts; no automatic retry of external side effects. */
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
}
export class PostgresIdentityStore implements IdentityStore {
  constructor(private readonly database: IdentitySqlDatabase) {}
  transaction<T>(identity: ExternalIdentity, work: (tx: IdentityTransaction) => Promise<T>): Promise<T> {
    const key = structuredClone(identity);
    return this.database.transaction(async connection => {
      // Also serializes first creation when no binding row exists yet. Hash collisions
      // merely serialize unrelated identities; equality still uses exact C collation.
      await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [identityKey(key)]);
      const tx: IdentityTransaction = {
        current: async () => {
          const result = await connection.query<{ snapshot: Binding }>(
            'SELECT snapshot FROM identity_auth.bindings WHERE issuer = $1 COLLATE "C" AND subject = $2 COLLATE "C" FOR UPDATE',
            [key.issuer, key.subject]);
          return result.rows[0]?.snapshot ?? null;
        },
        save: async (binding, expectedVersion) => {
          if (identityKey(binding.identity) !== identityKey(key) || binding.version !== (expectedVersion ?? 0) + 1)
            throw new DecisionError("Versão ou identidade divergente.", 409, "BINDING_VERSION_CONFLICT");
          const result = expectedVersion === null
            ? await connection.query("INSERT INTO identity_auth.bindings (id, snapshot) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING", [binding.id, JSON.stringify(binding)])
            : await connection.query("UPDATE identity_auth.bindings SET snapshot = $1::jsonb WHERE id = $2 AND issuer = $3 AND subject = $4 AND version = $5", [JSON.stringify(binding), binding.id, key.issuer, key.subject, expectedVersion]);
          if (result.rowCount !== 1) throw new DecisionError("Vínculo concorrente.", 409, "BINDING_VERSION_CONFLICT");
          await connection.query("INSERT INTO identity_auth.binding_revisions (binding_id, version, snapshot) VALUES ($1, $2, $3::jsonb)", [binding.id, binding.version, JSON.stringify(binding)]);
        },
        append: async (event: AuditEvent) => {
          if (identityKey(event.identity) !== identityKey(key)) throw new DecisionError("Auditoria divergente.", 403, "AUDIT_IDENTITY_MISMATCH");
          await connection.query("INSERT INTO identity_auth.audit_events (id, binding_id, binding_version, event) VALUES ($1, $2, $3, $4::jsonb)", [event.id, event.bindingId, event.bindingVersion, JSON.stringify(event)]);
        },
      };
      return work(tx);
    }).catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505")
        throw new DecisionError("Vínculo corporativo já utilizado.", 409, "BINDING_TARGET_CONFLICT");
      throw error;
    });
  }
}
