// Read-only diagnostics. The only POST is OAuth token acquisition, never a resource write.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildArtifacts } from './prepare-homologation.mjs';

const requiredLogin = ['ENTRA_LOGIN_TENANT_ID', 'ENTRA_LOGIN_CLIENT_ID', 'ENTRA_LOGIN_CLIENT_SECRET', 'AUTH_SESSION_SECRET', 'ENTRA_MFA_AUTH_CONTEXT_ID'];
const requiredGraph = ['MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'SHAREPOINT_SITE_ID'];
const listKeys = { materials: 'SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID', budgets: 'SHAREPOINT_ORCAMENTOS_LIST_ID', items: 'SHAREPOINT_ITENS_IMPORTADOS_LIST_ID', history: 'SHAREPOINT_HISTORICO_PRECOS_LIST_ID' };
const facets = ['text', 'number', 'currency', 'dateTime', 'personOrGroup', 'lookup', 'choice'];

export function compareColumns(actual, expected, listIds) {
  return expected.map(column => {
    const matches = actual.filter(value => value.name === column.name);
    if (matches.length !== 1) return { name: column.name, status: matches.length ? 'ambiguous' : 'missing' };
    const found = matches[0];
    const facet = facets.find(key => column[key]);
    let compatible = !!found[facet] && found.readOnly !== true;
    if (facet === 'personOrGroup') compatible &&= found.personOrGroup.allowMultipleSelection === false && found.personOrGroup.chooseFromType === 'peopleOnly';
    if (facet === 'choice') compatible &&= column.choice.choices.every(choice => found.choice?.choices?.includes(choice));
    if (facet === 'lookup') {
      const target = column.lookup.listId.replace('REPLACE_', '').replace('_LIST_ID', '').toLowerCase();
      const normalize = value => String(value ?? '').replace(/[{}]/g, '').toLowerCase();
      compatible &&= !!listIds[target] && normalize(found.lookup?.listId) === normalize(listIds[target]) && found.lookup?.allowMultipleValues === false;
    }
    if (column.enforceUniqueValues) compatible &&= found.enforceUniqueValues === true && found.indexed === true;
    return { name: column.name, status: compatible ? 'compatible' : 'incompatible', ...(!compatible ? {
      expectedType: facet,
      actualType: facets.find(key => found[key]) ?? 'unknown',
      ...(facet === 'choice' ? { missingChoices: column.choice.choices.filter(choice => !found.choice?.choices?.includes(choice)) } : {}),
    } : {}) };
  });
}

export async function runPreflight(env, { live = false, discoverHistory = false, fetcher = fetch } = {}) {
  const has = key => !!env[key]?.trim();
  const listIds = Object.fromEntries(Object.entries(listKeys).map(([kind, key]) => [kind, env[key]?.trim()]));
  let origin;
  try { origin = new URL(env.AUTH_APP_ORIGIN); } catch { /* report missing/invalid */ }
  const report = {
    mode: live ? 'LIVE_READ_ONLY' : 'LOCAL_CONFIGURATION_ONLY',
    login: {
      missing: requiredLogin.filter(key => !has(key)),
      httpsOrigin: origin?.protocol === 'https:',
      bypassRequested: env.AUTH_DISABLED === 'true' || env.ALLOW_LOCAL_SHAREPOINT_BYPASS === 'true' || env.ALLOW_LOCAL_OPERATOR_API_BYPASS === 'true',
      redisConfigured: has('SECURITY_REDIS_REST_URL') && has('SECURITY_REDIS_REST_TOKEN'),
      authenticatedSessionVerified: false, mfaPolicyVerified: false,
    },
    graph: { missing: requiredGraph.filter(key => !has(key)), tokenAcquired: false, roles: [] },
    personResolution: 'BLOCKED_NO_AUTHORIZED_IDENTITY_SOURCE',
    lists: /** @type {Record<string, {status: string, httpStatus?: number, columns?: ReturnType<typeof compareColumns>}>} */ ({}),
    historyDiscovery: 'NOT_REQUESTED', listWriteGrant: 'not_checked', writePolicy: 'NOT_VERIFIED',
    powerAutomate: { engineValidated: false, published: false },
  };
  if (!live || report.graph.missing.length) return report;
  const request = async (url, options) => fetcher(url, { ...options, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  let token;
  try {
    const response = await request(`https://login.microsoftonline.com/${encodeURIComponent(env.MICROSOFT_TENANT_ID)}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.MICROSOFT_CLIENT_ID, client_secret: env.MICROSOFT_CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
    });
    if (!response.ok) { report.graph.status = response.status; return report; }
    const payload = await response.json();
    if (typeof payload.access_token !== 'string' || !payload.access_token) throw new Error();
    token = payload.access_token;
    report.graph.tokenAcquired = true;
    // Informational only: never use this unverified decoding to authorize a user/write.
    try {
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      report.graph.roles = (Array.isArray(claims.roles) ? claims.roles : []).filter(role => typeof role === 'string' && /^[A-Za-z.]+$/.test(role));
    } catch { /* opaque tokens are valid; do not infer extra permissions */ }
  } catch { report.graph.error = 'TOKEN_REQUEST_UNAVAILABLE'; return report; }

  const get = async rawUrl => {
    const url = new URL(rawUrl, 'https://graph.microsoft.com/v1.0/');
    if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password || url.hash || !url.pathname.startsWith('/v1.0/sites/')) throw new Error('UNSAFE_TARGET');
    return request(url.href, { method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  };
  const sitePath = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(env.SHAREPOINT_SITE_ID)}/lists/`;
  if (discoverHistory && !listIds.history) {
    const endpoint = `${sitePath.slice(0, -1)}?$select=id,displayName`;
    let next = endpoint;
    const visited = new Set();
    const candidates = [];
    try {
      while (next) {
        if (visited.size >= 20 || visited.has(next) || new URL(next).pathname !== new URL(endpoint).pathname) throw new Error();
        visited.add(next);
        const response = await get(next);
        if (!response.ok) throw new Error();
        const page = await response.json();
        if (!Array.isArray(page.value) || page.value.length > 2000) throw new Error();
        candidates.push(...page.value.filter(list => list.displayName === 'Historico_Precos' && typeof list.id === 'string'));
        next = page['@odata.nextLink'];
        if (next !== undefined && typeof next !== 'string') throw new Error();
      }
      report.historyDiscovery = candidates.length === 1 ? 'EXACT_NAME_MATCH_METADATA_ONLY' : 'ABSENT_OR_AMBIGUOUS';
      if (candidates.length === 1) listIds.history = candidates[0].id;
    } catch { report.historyDiscovery = 'DISCOVERY_UNAVAILABLE'; }
  }
  const templates = buildArtifacts()['lists.templates.json'].lists;
  for (const [kind, id] of Object.entries(listIds)) {
    if (!id) { report.lists[kind] = { status: 'LIST_ID_NOT_CONFIGURED' }; continue; }
    const endpoint = `${sitePath}${encodeURIComponent(id)}/columns`;
    const rows = [];
    const visited = new Set();
    let next = endpoint;
    try {
      while (next) {
        if (visited.size >= 20 || visited.has(next) || rows.length > 2000 || new URL(next).pathname !== new URL(endpoint).pathname) throw new Error();
        visited.add(next);
        const response = await get(next);
        if (!response.ok) { report.lists[kind] = { status: 'READ_DENIED_OR_UNAVAILABLE', httpStatus: response.status }; break; }
        const page = await response.json();
        if (!Array.isArray(page.value) || rows.length + page.value.length > 2000) throw new Error();
        rows.push(...page.value);
        next = page['@odata.nextLink'];
        if (next !== undefined && typeof next !== 'string') throw new Error();
      }
      if (!next) report.lists[kind] = { status: 'READ_OK', columns: compareColumns(rows, templates[kind].columns, listIds) };
    } catch { report.lists[kind] = { status: 'READ_FAILED_OR_UNSAFE_PAGINATION' }; }
  }
  if (listIds.items) {
    try {
      const response = await get(`${sitePath}${encodeURIComponent(listIds.items)}/permissions`);
      if (!response.ok) report.listWriteGrant = `UNVERIFIED_HTTP_${response.status}`;
      else {
        const payload = await response.json();
        const matches = (Array.isArray(payload.value) ? payload.value : []).filter(permission =>
          [permission.grantedToV2, permission.grantedTo, ...(permission.grantedToIdentitiesV2 ?? []), ...(permission.grantedToIdentities ?? [])]
            .some(identity => identity?.application?.id?.toLowerCase() === env.MICROSOFT_CLIENT_ID.toLowerCase()));
        report.listWriteGrant = matches.some(permission => permission.roles?.some(role => ['write', 'owner', 'fullcontrol'].includes(role))) ? 'WRITE_GRANT_PRESENT_NOT_EXERCISED' : 'WRITE_NOT_CONFIRMED';
      }
    } catch { report.listWriteGrant = 'UNVERIFIED'; }
  }
  report.writePolicy = report.graph.roles.some(role => ['Sites.ReadWrite.All', 'Sites.Manage.All', 'Sites.FullControl.All'].includes(role))
    ? 'BLOCKED_GRAPH_PERMISSION_TOO_BROAD' : 'OTHER_WRITE_PREREQUISITES_STILL_REQUIRED';
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runPreflight(process.env, { live: process.argv.includes('--live'), discoverHistory: process.argv.includes('--discover-history') });
  console.log(JSON.stringify(report, null, 2));
}
