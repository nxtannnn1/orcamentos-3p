-- REVIEW ONLY. Do not run against the business DB or the Keycloak DB.
-- Execute manually only after separate authorization, on a dedicated empty database.
-- No extension, role, database or infrastructure provisioning is performed here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA identity_auth;
REVOKE ALL ON SCHEMA identity_auth FROM PUBLIC;

CREATE TABLE identity_auth.schema_versions (
  version integer PRIMARY KEY,
  installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION identity_auth.valid_snapshot(doc jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE g jsonb; r jsonb; k text; seen text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(doc) IS DISTINCT FROM 'object'
     OR jsonb_typeof(doc->'grants') IS DISTINCT FROM 'array'
     OR jsonb_typeof(doc->'verification') IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  FOREACH k IN ARRAY ARRAY['id','state'] LOOP
    IF jsonb_typeof(doc->k) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  END LOOP;
  IF jsonb_typeof(doc#>'{identity,issuer}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(doc#>'{identity,subject}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(doc#>'{person,tenantId}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(doc#>'{person,oid}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(doc#>'{person,siteId}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(doc#>'{person,lookupId}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(doc->'version') IS DISTINCT FROM 'number'
     OR jsonb_typeof(doc#>'{verification,checkedAt}') IS DISTINCT FROM 'number'
     OR jsonb_typeof(doc#>'{verification,expiresAt}') IS DISTINCT FROM 'number'
     OR jsonb_typeof(doc#>'{verification,source}') IS DISTINCT FROM 'string'
     OR jsonb_typeof(doc#>'{verification,evidenceId}') IS DISTINCT FROM 'string'
     OR COALESCE(length(doc#>>'{verification,source}'),0) = 0
     OR COALESCE(length(doc#>>'{verification,evidenceId}'),0) = 0 THEN RETURN false; END IF;
  IF (doc#>>'{verification,expiresAt}')::numeric <= (doc#>>'{verification,checkedAt}')::numeric
     OR (doc#>>'{verification,expiresAt}')::numeric - (doc#>>'{verification,checkedAt}')::numeric > 86400 THEN RETURN false; END IF;
  FOR g IN SELECT value FROM jsonb_array_elements(doc->'grants') LOOP
    IF jsonb_typeof(g) IS DISTINCT FROM 'object' OR jsonb_typeof(g->'id') IS DISTINCT FROM 'string'
       OR NOT COALESCE((g->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
       OR (g->>'id') = ANY(seen) OR NOT COALESCE(g->>'action' IN ('APPROVE','REJECT','CORRECT','RECONCILE'),false)
       OR jsonb_typeof(g->'expiresAt') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
    seen := array_append(seen, g->>'id');
    r := g->'resource';
    FOREACH k IN ARRAY ARRAY['siteId','listId','budgetId','itemId'] LOOP
      IF jsonb_typeof(r->k) IS DISTINCT FROM 'string' OR length(r->>k) NOT BETWEEN 1 AND 512
         OR r->>k = '*' THEN RETURN false; END IF;
    END LOOP;
    IF (r->>'siteId') IS DISTINCT FROM (doc#>>'{person,siteId}') THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- The binding is a versioned aggregate; grants belong to that exact revision.
-- A complete immutable snapshot preserves the grants used by past operations.
CREATE TABLE identity_auth.bindings (
  id uuid PRIMARY KEY,
  snapshot jsonb NOT NULL,
  issuer text COLLATE "C" GENERATED ALWAYS AS (snapshot #>> '{identity,issuer}') STORED NOT NULL,
  subject text COLLATE "C" GENERATED ALWAYS AS (snapshot #>> '{identity,subject}') STORED NOT NULL,
  tenant_id uuid GENERATED ALWAYS AS ((snapshot #>> '{person,tenantId}')::uuid) STORED NOT NULL,
  object_id uuid GENERATED ALWAYS AS ((snapshot #>> '{person,oid}')::uuid) STORED NOT NULL,
  site_id text COLLATE "C" GENERATED ALWAYS AS (snapshot #>> '{person,siteId}') STORED NOT NULL,
  person_lookup_id bigint GENERATED ALWAYS AS ((snapshot #>> '{person,lookupId}')::bigint) STORED NOT NULL,
  version bigint GENERATED ALWAYS AS ((snapshot ->> 'version')::bigint) STORED NOT NULL,
  state text GENERATED ALWAYS AS (snapshot ->> 'state') STORED NOT NULL,
  UNIQUE (issuer, subject),
  CHECK (identity_auth.valid_snapshot(snapshot)),
  CHECK ((snapshot ->> 'id')::uuid = id),
  CHECK (length(issuer) BETWEEN 1 AND 1024 AND length(subject) BETWEEN 1 AND 255),
  CHECK (length(site_id) BETWEEN 1 AND 512),
  CHECK (version BETWEEN 1 AND 9007199254740991 AND (snapshot ->> 'version') ~ '^[1-9][0-9]*$'),
  CHECK (person_lookup_id BETWEEN 1 AND 9007199254740991),
  CHECK (state IN ('active', 'revoked')),
  CHECK (jsonb_typeof(snapshot -> 'grants') = 'array' AND jsonb_array_length(snapshot -> 'grants') <= 1000),
  CHECK (state <> 'revoked' OR snapshot -> 'grants' = '[]'::jsonb),
  CHECK ((snapshot #> '{verification,identity}') = (snapshot -> 'identity')),
  CHECK ((snapshot #> '{verification,person}') = (snapshot -> 'person')),
  CHECK ((snapshot #> '{verification,externalAccountActive}') = 'true'::jsonb),
  CHECK ((snapshot #> '{verification,corporateAccountActive}') = 'true'::jsonb),
  CHECK ((snapshot #> '{verification,personExists}') = 'true'::jsonb),
  CHECK ((snapshot #> '{verification,associationVerified}') = 'true'::jsonb),
  CHECK (snapshot ?& ARRAY['id','identity','person','version','state','verification','grants']),
  CHECK ((snapshot -> 'verification') ?& ARRAY['identity','person','source','evidenceId','checkedAt','expiresAt','externalAccountActive','corporateAccountActive','personExists','associationVerified'])
);
CREATE UNIQUE INDEX one_active_corporate_account_per_issuer
  ON identity_auth.bindings (issuer, tenant_id, object_id) WHERE state = 'active';
CREATE UNIQUE INDEX one_active_person_per_issuer
  ON identity_auth.bindings (issuer, site_id, person_lookup_id) WHERE state = 'active';

CREATE TABLE identity_auth.binding_revisions (
  binding_id uuid NOT NULL REFERENCES identity_auth.bindings(id) ON DELETE RESTRICT,
  version bigint NOT NULL CHECK (version > 0),
  snapshot jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (binding_id, version),
  CHECK ((snapshot ->> 'id')::uuid = binding_id),
  CHECK ((snapshot ->> 'version')::bigint = version)
);
CREATE TABLE identity_auth.audit_events (
  id uuid PRIMARY KEY,
  binding_id uuid NOT NULL,
  binding_version bigint NOT NULL,
  event jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (binding_id, binding_version)
    REFERENCES identity_auth.binding_revisions(binding_id, version) ON DELETE RESTRICT,
  CHECK ((event ->> 'id')::uuid = id),
  CHECK ((event ->> 'bindingId')::uuid = binding_id),
  CHECK ((event ->> 'bindingVersion')::bigint = binding_version),
  CHECK (event ->> 'kind' IN ('activated','revoked','write-intent','write-confirmed','write-unconfirmed')),
  CHECK (event ?& ARRAY['id','at','kind','bindingId','bindingVersion','identity','person','actorId'])
);
ALTER TABLE identity_auth.bindings ADD CONSTRAINT current_revision_exists
  FOREIGN KEY (id, version) REFERENCES identity_auth.binding_revisions(binding_id, version)
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION identity_auth.guard_binding_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.issuer <> OLD.issuer OR NEW.subject <> OLD.subject
     OR NEW.tenant_id <> OLD.tenant_id OR NEW.object_id <> OLD.object_id
     OR NEW.site_id <> OLD.site_id OR NEW.person_lookup_id <> OLD.person_lookup_id
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Identity ownership is immutable; version must advance exactly once';
  END IF;
  RETURN NEW;
END;
$$;
-- Generated columns are available in AFTER triggers, not in BEFORE triggers.
CREATE TRIGGER binding_update_guard AFTER UPDATE ON identity_auth.bindings
  FOR EACH ROW EXECUTE FUNCTION identity_auth.guard_binding_update();

CREATE FUNCTION identity_auth.reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Identity history is append-only';
END;
$$;
CREATE TRIGGER revisions_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON identity_auth.binding_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION identity_auth.reject_history_mutation();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON identity_auth.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION identity_auth.reject_history_mutation();
REVOKE ALL ON ALL TABLES IN SCHEMA identity_auth FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA identity_auth FROM PUBLIC;
INSERT INTO identity_auth.schema_versions (version) VALUES (1);
COMMIT;

-- Review DBA grants separately. Owner/migration credentials must NEVER be used by
-- the web process. App needs schema USAGE, bindings SELECT/INSERT/UPDATE,
-- revisions SELECT/INSERT and audit_events INSERT; no DELETE/TRUNCATE/DDL.
-- Backups, retention, TLS, credential distribution and driver wiring require approval.
