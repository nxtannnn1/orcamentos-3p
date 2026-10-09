import "server-only";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { readConfig } from "../config";
import { ApiError } from "../errors";
let pool: Pool | undefined;
function getPool() {
  if (!pool) {
    const config = readConfig();
    pool = new Pool({
      connectionString: config.databaseUrl, max: 5,
      connectionTimeoutMillis: 3000, idleTimeoutMillis: 10_000,
      query_timeout: 8000,
      ssl: config.tls ? { rejectUnauthorized: true } : false,
      application_name: "3p-operator-api-read",
      options: "-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=8000 -c search_path=pg_catalog,public",
    });
    pool.on("error", () => console.error(JSON.stringify({ event: "database_pool_error" })));
  }
  return pool;
}
const roleCheck = `
SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls OR r.rolreplication
 OR current_user <> session_user
 OR has_schema_privilege(current_user, 'public', 'CREATE')
 OR EXISTS (
   SELECT 1 FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
   AND (pg_has_role(current_user, c.relowner, 'USAGE')
     OR has_table_privilege(current_user, c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
     OR has_any_column_privilege(current_user, c.oid, 'INSERT,UPDATE,REFERENCES'))
 ) AS unsafe
FROM pg_roles r WHERE r.rolname = current_user
`;
export async function assertReadOnlyRole(client: Pick<PoolClient, "query">) {
  const result = await client.query<{ unsafe: boolean }>(roleCheck);
  if (result.rows.length !== 1 || result.rows[0].unsafe !== false)
    throw new ApiError(503, "DATABASE_ROLE_UNSAFE", "Acesso ao banco requer usuário somente leitura.");
}
export async function withRead<T>(action: (db: NodePgDatabase) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let destroy = false;
  try {
    await client.query("BEGIN READ ONLY");
    await assertReadOnlyRole(client);
    const result = await action(drizzle(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { destroy = true; }
    throw error;
  } finally { client.release(destroy); }
}
