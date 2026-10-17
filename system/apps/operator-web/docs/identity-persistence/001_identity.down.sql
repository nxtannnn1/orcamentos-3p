-- REVIEW ONLY. Manual rollback of an UNUSED installation, separate identity DB.
-- Refuses to destroy identity/audit data. Nonempty rollback requires a separately
-- approved preservation/restore plan; never bypass this guard automatically.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity_auth.bindings)
     OR EXISTS (SELECT 1 FROM identity_auth.binding_revisions)
     OR EXISTS (SELECT 1 FROM identity_auth.audit_events) THEN
    RAISE EXCEPTION 'Rollback blocked: preserve identity and audit history first';
  END IF;
END;
$$;
DROP TABLE identity_auth.audit_events;
ALTER TABLE identity_auth.bindings DROP CONSTRAINT current_revision_exists;
DROP TABLE identity_auth.binding_revisions;
DROP TABLE identity_auth.bindings;
DROP FUNCTION identity_auth.reject_history_mutation();
DROP FUNCTION identity_auth.guard_binding_update();
DROP FUNCTION identity_auth.valid_snapshot(jsonb);
DROP TABLE identity_auth.schema_versions;
DROP SCHEMA identity_auth;
COMMIT;
