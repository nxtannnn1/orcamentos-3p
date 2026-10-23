// Isolated technical rehearsal: can Microsoft Graph persist the decision Person column of
// Itens_Importados and return it on a fresh read? Not an approval flow and not reachable by any route.
// Default is read-only. The only write is ONE PATCH of ONE column on ONE synthetic item, and only
// with the exact confirmation phrase printed by `plan` for the current ETag.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const SYNTHETIC_PREFIX = 'HOMOLOG-3P-';
// Columns SharePoint updates by itself on any edit; never evidence of an unintended change.
const SYSTEM_MANAGED = new Set(['Modified', 'Editor', 'EditorLookupId', 'AppEditor', 'AppEditorLookupId', '_UIVersionString',
  '_ComplianceFlags', '_ComplianceTag', '_ComplianceTagWrittenTime', '_ComplianceTagUserId', '@odata.etag']);
const required = ['MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'SHAREPOINT_SITE_ID', 'SHAREPOINT_ITENS_IMPORTADOS_LIST_ID', 'SHAREPOINT_FIELD_MAP_JSON'];

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
const positiveId = value => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value);
const lookupValue = value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value)
  : typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;

export class RehearsalError extends Error {
  constructor(code, detail = '') { super(detail ? `${code}: ${detail}` : code); this.code = code; }
}

export function readConfig(env) {
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new RehearsalError('CONFIG_MISSING', missing.join(', '));
  let map;
  try { map = JSON.parse(env.SHAREPOINT_FIELD_MAP_JSON); } catch { throw new RehearsalError('FIELD_MAP_INVALID'); }
  const items = map?.items ?? {};
  const names = { person: items.reviewedByPerson, oid: items.reviewedByOid, date: items.reviewedAt, decisionId: items.decisionId };
  if (Object.values(names).some(name => typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)))
    throw new RehearsalError('FIELD_MAP_INVALID', 'decision columns');
  return { tenantId: env.MICROSOFT_TENANT_ID.trim(), clientId: env.MICROSOFT_CLIENT_ID.trim(), clientSecret: env.MICROSOFT_CLIENT_SECRET,
    siteId: env.SHAREPOINT_SITE_ID.trim(), listId: env.SHAREPOINT_ITENS_IMPORTADOS_LIST_ID.trim(), names };
}

export function createGraphClient(config, fetcher = fetch) {
  const listBase = `/v1.0/sites/${encodeURIComponent(config.siteId)}/lists/`;
  const itemsBase = `${listBase}${encodeURIComponent(config.listId)}`;
  let token = null;
  let roles = [];
  let patches = 0;
  const request = (url, options) => fetcher(url, { ...options, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const ensureToken = async () => {
    if (token) return token;
    const response = await request(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    const payload = response.ok ? await response.json().catch(() => null) : null;
    if (typeof payload?.access_token !== 'string' || !payload.access_token) throw new RehearsalError('TOKEN_UNAVAILABLE', `HTTP ${response.status}`);
    token = payload.access_token;
    try {
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      roles = (Array.isArray(claims.roles) ? claims.roles : []).filter(role => typeof role === 'string' && /^[A-Za-z.]+$/.test(role));
    } catch { roles = []; }
    return token;
  };
  const target = (raw, allowedPrefix) => {
    const url = new URL(raw.startsWith('https://') ? raw : `${GRAPH}${raw}`);
    if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password || url.hash ||
        !decodeURIComponent(url.pathname).startsWith(decodeURIComponent(allowedPrefix))) throw new RehearsalError('UNSAFE_TARGET');
    return url.href;
  };
  return {
    itemsPath: itemsBase.slice('/v1.0'.length),
    sitePath: listBase.slice('/v1.0'.length, -'/lists/'.length),
    roles: () => roles,
    async get(raw) {
      const href = target(raw, listBase);
      const response = await request(href, { method: 'GET', headers: { Authorization: `Bearer ${await ensureToken()}`, Accept: 'application/json' } });
      return { status: response.status, body: response.ok ? await response.json() : null };
    },
    /** One PATCH per process; no retry, whatever the outcome. */
    async patchOnce(itemId, fields, etag) {
      if (patches++) throw new RehearsalError('SECOND_PATCH_REFUSED');
      if (!positiveId(itemId) || !etag || etag === '*' || /[\r\n]/.test(etag)) throw new RehearsalError('PATCH_PRECONDITION');
      const href = target(`${itemsBase.slice('/v1.0'.length)}/items/${itemId}/fields`, `${itemsBase}/items/${itemId}/fields`);
      try {
        const response = await request(href, { method: 'PATCH', headers: {
          Authorization: `Bearer ${await ensureToken()}`, Accept: 'application/json', 'Content-Type': 'application/json', 'If-Match': etag,
        }, body: JSON.stringify(fields) });
        let code = null;
        if (!response.ok) code = (await response.json().catch(() => null))?.error?.code ?? null;
        return { status: response.status, graphErrorCode: typeof code === 'string' ? code.slice(0, 80) : null };
      } catch { return { status: 0, graphErrorCode: 'NETWORK_OR_TIMEOUT_OUTCOME_UNKNOWN' }; }
    },
  };
}

async function readAll(graph, first, limit = 100) {
  const rows = [];
  const visited = new Set();
  for (let next = first; next;) {
    if (visited.has(next) || visited.size >= limit) throw new RehearsalError('PAGINATION_LIMIT');
    visited.add(next);
    const page = await graph.get(next);
    if (page.status !== 200) return { status: page.status, rows: null };
    if (!Array.isArray(page.body?.value)) throw new RehearsalError('INVALID_GRAPH_RESPONSE');
    rows.push(...page.body.value);
    next = page.body['@odata.nextLink'];
    if (next !== undefined && typeof next !== 'string') throw new RehearsalError('INVALID_GRAPH_RESPONSE');
  }
  return { status: 200, rows };
}

const facet = column => ['text', 'number', 'currency', 'dateTime', 'personOrGroup', 'lookup', 'choice', 'boolean', 'calculated']
  .find(key => column[key] && typeof column[key] === 'object') ?? 'unknown';

/** Column metadata only; no item values. */
export function describeColumn(columns, name) {
  const matches = columns.filter(column => column.name === name);
  if (matches.length !== 1) return { name, status: matches.length ? 'AMBIGUOUS' : 'MISSING' };
  const column = matches[0];
  return {
    name, displayName: column.displayName ?? null, type: facet(column), required: column.required === true,
    readOnly: column.readOnly === true, hidden: column.hidden === true, indexed: column.indexed === true,
    enforceUniqueValues: column.enforceUniqueValues === true,
    ...(column.personOrGroup ? { personOrGroup: { allowMultipleSelection: column.personOrGroup.allowMultipleSelection ?? null,
      chooseFromType: column.personOrGroup.chooseFromType ?? null, displayAs: column.personOrGroup.displayAs ?? null } } : {}),
    ...(column.choice ? { choices: Array.isArray(column.choice.choices) ? column.choice.choices : [] } : {}),
    ...(column.lookup ? { lookup: { allowMultipleValues: column.lookup.allowMultipleValues ?? null, columnName: column.lookup.columnName ?? null } } : {}),
  };
}

export function personColumnWritable(description) {
  return description.status === undefined && description.type === 'personOrGroup' && !description.readOnly &&
    description.personOrGroup?.allowMultipleSelection === false && description.personOrGroup?.chooseFromType === 'peopleOnly';
}

async function writeGrant(graph, config) {
  const result = await readAll(graph, `${graph.itemsPath}/permissions`, 20);
  if (!result.rows) return `UNVERIFIED_HTTP_${result.status}`;
  const granted = result.rows.some(permission =>
    [permission.grantedToV2, permission.grantedTo, ...(permission.grantedToIdentitiesV2 ?? []), ...(permission.grantedToIdentities ?? [])]
      .some(identity => identity?.application?.id?.toLowerCase() === config.clientId.toLowerCase()) &&
    permission.roles?.some(role => ['write', 'owner', 'fullcontrol'].includes(role)));
  return granted ? 'WRITE_GRANT_PRESENT' : 'WRITE_GRANT_NOT_FOUND';
}

export async function inspect(env, { fetcher = fetch } = {}) {
  const config = readConfig(env);
  const graph = createGraphClient(config, fetcher);
  const columns = await readAll(graph, `${graph.itemsPath}/columns`);
  if (!columns.rows) return { mode: 'INSPECT_READ_ONLY', listRead: `HTTP_${columns.status}` };
  const n = config.names;
  const report = {
    mode: 'INSPECT_READ_ONLY',
    appRoles: graph.roles(),
    listWriteGrant: await writeGrant(graph, config),
    decisionColumns: [n.person, n.oid, n.date, n.decisionId, 'Status_Revisao', 'Material_Aprovado', 'Observacao_Item', 'Enviado_Historico', 'Codigo_Item']
      .map(name => describeColumn(columns.rows, name)),
    requiredColumns: columns.rows.filter(column => column.required === true && column.readOnly !== true).map(column => column.name),
    personColumnsInList: columns.rows.filter(column => column.personOrGroup && !column.readOnly && !['Author', 'Editor'].includes(column.name)).map(column => column.name),
  };
  report.personColumnWritable = personColumnWritable(report.decisionColumns[0]);
  const items = await readAll(graph, `${graph.itemsPath}/items?$expand=fields($select=Codigo_Item,Status_Revisao,Enviado_Historico)&$top=999`, 200);
  report.syntheticCandidates = items.rows
    ? items.rows.filter(row => typeof row.fields?.Codigo_Item === 'string' && row.fields.Codigo_Item.startsWith(SYNTHETIC_PREFIX))
      .map(row => ({ itemId: row.id, status: row.fields.Status_Revisao ?? null, sentToHistory: row.fields.Enviado_Historico ?? null }))
    : `HTTP_${items.status}`;
  return report;
}

export function syntheticIssues(fields) {
  const issues = [];
  if (typeof fields.Codigo_Item !== 'string' || !fields.Codigo_Item.startsWith(SYNTHETIC_PREFIX)) issues.push('NOT_MARKED_SYNTHETIC');
  if (fields.Status_Revisao !== 'PENDENTE') issues.push('STATUS_NOT_PENDENTE');
  if (fields.Enviado_Historico !== 'NAO') issues.push('ENVIADO_HISTORICO_NOT_NAO');
  return issues;
}

/** Field-by-field comparison by name and value hash; values themselves are never reported. */
export function compareSnapshots(before, after, targetKeys) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changed = keys.filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  return {
    changed,
    unexpected: changed.filter(key => !targetKeys.includes(key) && !SYSTEM_MANAGED.has(key)),
    systemManaged: changed.filter(key => SYSTEM_MANAGED.has(key)),
    fingerprint: Object.fromEntries(keys.map(key => [key, { before: before[key] === undefined ? null : sha(JSON.stringify(before[key])),
      after: after[key] === undefined ? null : sha(JSON.stringify(after[key])) }])),
  };
}

export function confirmationPhrase(itemId, personField, personLookupId, etag) {
  return `PATCH Itens_Importados item ${itemId} ${personField}LookupId=${personLookupId} etag:${sha(etag)}`;
}

async function personContext(graph, personLookupId) {
  // Hidden site user list. Only the content type is read; never name, e-mail or login.
  const response = await graph.get(`${graph.sitePath}/lists/User%20Information%20List/items/${personLookupId}?$expand=fields($select=ContentType)`);
  if (response.status !== 200) return `UNVERIFIED_HTTP_${response.status}`;
  return response.body?.fields?.ContentType === 'Person' ? 'PERSON_EXISTS_IN_SITE' : 'NOT_A_PERSON';
}

/** @param {Record<string, string | undefined>} env @param {{ itemId?: string, personLookupId?: string, fetcher?: typeof fetch, graph?: ReturnType<typeof createGraphClient> }} [options] */
export async function plan(env, { itemId, personLookupId, fetcher = fetch, graph: injected } = {}) {
  if (!positiveId(itemId)) throw new RehearsalError('ITEM_ID_INVALID');
  if (!positiveId(personLookupId)) throw new RehearsalError('PERSON_LOOKUP_ID_INVALID');
  const config = readConfig(env);
  const graph = injected ?? createGraphClient(config, fetcher);
  const field = config.names.person;
  const columns = await readAll(graph, `${graph.itemsPath}/columns`);
  if (!columns.rows) throw new RehearsalError('COLUMNS_UNREADABLE', `HTTP ${columns.status}`);
  const column = describeColumn(columns.rows, field);
  const item = await graph.get(`${graph.itemsPath}/items/${itemId}?$expand=fields`);
  if (item.status !== 200) throw new RehearsalError('ITEM_UNREADABLE', `HTTP ${item.status}`);
  const etag = item.body?.eTag ?? item.body?.['@odata.etag'];
  if (item.body?.id !== itemId || typeof etag !== 'string' || !etag.trim() || !item.body.fields) throw new RehearsalError('INVALID_ITEM_RESPONSE');
  const current = lookupValue(item.body.fields[`${field}LookupId`]);
  const blockers = [...syntheticIssues(item.body.fields)];
  if (!personColumnWritable(column)) blockers.push('PERSON_COLUMN_NOT_WRITABLE_SINGLE_PEOPLE_ONLY');
  if (current === personLookupId) blockers.push('TARGET_VALUE_ALREADY_PRESENT');
  const grant = await writeGrant(graph, config);
  if (grant !== 'WRITE_GRANT_PRESENT') blockers.push(`WRITE_GRANT_${grant}`);
  return {
    mode: 'PLAN_DRY_RUN', itemId, etagHash: sha(etag), etag, before: item.body.fields, column,
    currentPersonLookupId: current, payload: { [`${field}LookupId`]: personLookupId },
    personContext: await personContext(graph, personLookupId), listWriteGrant: grant, appRoles: graph.roles(), blockers,
    confirmation: confirmationPhrase(itemId, field, personLookupId, etag),
  };
}

export async function execute(env, { itemId, personLookupId, confirm, personAttested = false, evidenceDir, fetcher = fetch, now = () => new Date() }) {
  const config = readConfig(env);
  const graph = createGraphClient(config, fetcher);
  const prepared = await plan(env, { itemId, personLookupId, graph });
  if (prepared.blockers.length) throw new RehearsalError('BLOCKED', prepared.blockers.join(', '));
  if (confirm !== prepared.confirmation) throw new RehearsalError('CONFIRMATION_MISMATCH', 'run plan again; the item or ETag may have changed');
  if (prepared.personContext !== 'PERSON_EXISTS_IN_SITE' && !personAttested)
    throw new RehearsalError('PERSON_NOT_VERIFIED', `${prepared.personContext}; requires --person-attested after human verification`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  // Durable one-shot guard: an existing marker means this item was already attempted.
  const lock = path.join(evidenceDir, `attempt-item-${itemId}.json`);
  try { fs.writeFileSync(lock, JSON.stringify({ startedAt: now().toISOString(), etagHash: prepared.etagHash }), { flag: 'wx' }); }
  catch { throw new RehearsalError('ALREADY_ATTEMPTED', 'evidence marker exists; inspect it instead of retrying'); }
  const field = config.names.person;
  const response = await graph.patchOnce(itemId, prepared.payload, prepared.etag);
  // A 2xx alone is not persistence evidence: always re-read.
  const reread = await graph.get(`${graph.itemsPath}/items/${itemId}?$expand=fields`);
  const after = reread.status === 200 ? reread.body?.fields ?? {} : {};
  const afterEtag = reread.body?.eTag ?? reread.body?.['@odata.etag'] ?? null;
  const persisted = lookupValue(after[`${field}LookupId`]);
  const comparison = compareSnapshots(prepared.before, after, [`${field}LookupId`, field]);
  const checks = {
    patchStatus: response.status, graphErrorCode: response.graphErrorCode, rereadStatus: reread.status,
    etagChanged: !!afterEtag && sha(afterEtag) !== prepared.etagHash,
    personPersisted: persisted === personLookupId,
    otherFieldsPreserved: reread.status === 200 && comparison.unexpected.length === 0,
    statusUnchanged: after.Status_Revisao === prepared.before.Status_Revisao,
  };
  const evidence = {
    tool: 'approver-write-rehearsal', at: now().toISOString(), itemId, personLookupId, personContext: prepared.personContext,
    personAttested, column: prepared.column, payloadKeys: Object.keys(prepared.payload), etagHashBefore: prepared.etagHash,
    etagHashAfter: afterEtag ? sha(afterEtag) : null, appRoles: prepared.appRoles, checks,
    changedFields: comparison.changed, unexpectedChanges: comparison.unexpected, fingerprint: comparison.fingerprint,
    result: checks.patchStatus >= 200 && checks.patchStatus < 300 && checks.rereadStatus === 200 && checks.etagChanged &&
      checks.personPersisted && checks.otherFieldsPreserved && checks.statusUnchanged ? 'PERSISTED_AND_VERIFIED' : 'NOT_CONFIRMED',
  };
  fs.writeFileSync(path.join(evidenceDir, `evidence-item-${itemId}-${evidence.at.replace(/[:.]/g, '-')}.json`), JSON.stringify(evidence, null, 2));
  return evidence;
}

export function sanitizePlan(prepared) {
  const shown = { ...prepared, beforeFieldNames: Object.keys(prepared.before).sort() };
  delete shown.etag;
  delete shown.before;
  return shown;
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = 'inspect'] = process.argv.slice(2);
  const argv = process.argv.slice(3);
  const evidenceDir = path.resolve(fileURLToPath(new URL('../../../../work/homologacao-aprovador', import.meta.url)));
  try {
    let output;
    if (command === 'inspect') output = await inspect(process.env);
    else if (command === 'plan') output = sanitizePlan(await plan(process.env, { itemId: argument(argv, '--item'), personLookupId: argument(argv, '--person-lookup') }));
    else if (command === 'execute') output = await execute(process.env, { itemId: argument(argv, '--item'), personLookupId: argument(argv, '--person-lookup'),
      confirm: argument(argv, '--confirm'), personAttested: argv.includes('--person-attested'), evidenceDir });
    else throw new RehearsalError('UNKNOWN_COMMAND', 'use inspect | plan | execute');
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(error instanceof RehearsalError ? error.message : 'UNEXPECTED_FAILURE');
    process.exitCode = 1;
  }
}
