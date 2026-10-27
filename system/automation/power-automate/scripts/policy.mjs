// Offline only. No raw values or source paths are included in diagnostics.
export const SCHEMA = 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#';
export const placeholder = /^__PA_[A-Z]+_\d+__$/;
const guid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const url = /(?:https?|ftp):\/\/[^\s'"<>)}]+/gi;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const domain = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|br|local|internal|io)\b/gi;
const personal = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{11,14}\b/g;
const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const secretKey = /^(?:authorization|password|passwd|clientsecret|client_secret|access_token|refresh_token|token|secret|certificate|privatekey|apikey|api_key|cookie|set-cookie|sig)$/i;
const identityKey = /(?:^|\/)(?:tenantId|clientId|environmentId|flowId|connectionId|connectionName|connectionReferenceName|connectionReferenceLogicalName|workflowEntityId|dataset|destinationDataset|folderPath|destinationFolderPath|table|siteId|listId|email|emailAddress|userId|ownerId|displayName)$/i;
const forbidden = /^(?:runHistory|executionHistory|sampleData|samplePayload|triggerHistory|trackingData|testData)$/i;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const expression = v => typeof v === 'string' && v.startsWith('@');

export function extract(raw) {
  const definition = raw?.properties?.definition ?? raw?.definition ?? raw;
  if (!object(definition) || !object(definition.actions) || !object(definition.triggers)) throw Error('PA_INPUT_SHAPE');
  // Keep the workflow definition and connector dependencies, never export envelopes/history/owners.
  const allowed = new Set(['$schema', 'contentVersion', 'parameters', 'triggers', 'actions', 'outputs', 'metadata', 'description']);
  if (Object.keys(definition).some(k => !allowed.has(k))) throw Error('PA_UNKNOWN_DEFINITION_PROPERTY');
  return { definition, connectionReferences: raw.properties?.connectionReferences ?? raw.connectionReferences ?? {} };
}

export function sanitize(raw) {
  const selected = extract(raw), replacements = new Map();
  const mark = (value, kind = 'VALUE') => {
    const s = String(value);
    if (placeholder.test(s)) return s;
    if (!replacements.has(s)) replacements.set(s, `__PA_${kind}_${replacements.size + 1}__`);
    return replacements.get(s);
  };
  // Discover contextual opaque identifiers first, then replace everywhere (including expressions/keys).
  function collect(v, key = '') {
    if (key === 'metadata' || forbidden.test(key)) return;
    if (object(v)) {
      if (/^secure(string|object)$/i.test(v.type ?? '') && v.defaultValue != null) {
        if (typeof v.defaultValue === 'string' && v.defaultValue) mark(v.defaultValue, 'SECRET');
      }
      for (const [k, value] of Object.entries(v)) collect(value, k);
    } else if (Array.isArray(v)) v.forEach(x => collect(x, key));
    else if (v != null && String(v) && !expression(v) && (identityKey.test(key) || secretKey.test(key))) mark(v, secretKey.test(key) ? 'SECRET' : 'ID');
  }
  for (const k of Object.keys(selected.connectionReferences)) mark(k, 'CONNECTION');
  collect(selected);
  function string(s) {
    if (s === SCHEMA) return s;
    for (const [from, to] of [...replacements].sort((a, b) => b[0].length - a[0].length)) {
      // Short values must not replace characters inside field/action names.
      if (from.length < 5) { if (s === from) s = to; }
      else s = s.split(from).join(to);
    }
    return s.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, m => mark(m, 'SECRET'))
      .replace(jwt, m => mark(m, 'SECRET')).replace(url, m => mark(m, 'URL'))
      .replace(email, m => mark(m, 'PERSON')).replace(guid, m => mark(m, 'ID'))
      .replace(personal, m => mark(m, 'PERSON')).replace(domain, m => mark(m, 'HOST'));
  }
  function visit(v, key = '') {
    if (Array.isArray(v)) return v.map(x => visit(x, key));
    if (object(v)) {
      const out = {};
      for (const [k, value] of Object.entries(v)) {
        if (k === 'metadata' || forbidden.test(k)) continue;
        const nextKey = string(k);
        if (Object.hasOwn(out, nextKey)) throw Error('PA_KEY_COLLISION');
        if (k === 'defaultValue' && /^secure(string|object)$/i.test(v.type ?? '')) {
          out[nextKey] = v.type.toLowerCase() === 'secureobject' ? {} : mark('secure-default', 'SECRET');
        } else if (secretKey.test(k) && !expression(value) && value != null && value !== '') {
          out[nextKey] = mark(typeof value === 'object' ? JSON.stringify(value) : value, 'SECRET');
        } else out[nextKey] = visit(value, k);
      }
      return out;
    }
    if (typeof v === 'string') {
      // Public connector type is a technical dependency, not a connection instance.
      if (['apiId', 'id'].includes(key) && /^\/providers\/Microsoft\.PowerApps\/apis\/shared_(sharepointonline|office365|logicflows)$/.test(v)) return v;
      return string(v);
    }
    if (v != null && identityKey.test(key)) return mark(v, 'ID');
    return v;
  }
  const output = { format: 'power-automate-sanitized-v1', reviewRequired: true, directlyImportable: false, ...visit(selected) };
  const errors = validate(output);
  if (errors.length) throw Error('PA_SANITIZATION_REJECTED: ' + [...new Set(errors)].join(', '));
  return output;
}

// Delimiter/quote check, not a replacement for Microsoft's expression engine.
export function expressionValid(s) {
  if (!expression(s)) return true;
  let quote = false; const stack = [];
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (c === "'") { if (quote && s[i + 1] === "'") { i++; continue; } quote = !quote; continue; }
    if (quote) continue;
    if ('([{'.includes(c)) stack.push(c);
    else if (')]}'.includes(c) && stack.pop() !== ({ ')': '(', ']': '[', '}': '{' })[c]) return false;
  }
  return !quote && !stack.length;
}

export function validate(doc) {
  const errors = [];
  if (doc?.format !== 'power-automate-sanitized-v1' || doc.reviewRequired !== true || doc.directlyImportable !== false) errors.push('PA_ENVELOPE');
  if (!object(doc?.definition?.actions) || !object(doc?.definition?.triggers) || !Object.keys(doc.definition.triggers).length || !object(doc.connectionReferences)) return [...errors, 'PA_STRUCTURE'];
  if (Object.keys(doc).some(k => !['format', 'reviewRequired', 'directlyImportable', 'definition', 'connectionReferences'].includes(k))) errors.push('PA_EXTRA_ENVELOPE');
  if (Object.keys(doc.connectionReferences).some(k => !placeholder.test(k))) errors.push('PA_CONNECTION_ID');
  const names = new Set(), expressions = [];
  function actions(map) {
    if (!object(map)) { errors.push('PA_ACTION_MAP'); return; }
    for (const [name, action] of Object.entries(map)) {
      names.add(name);
      if (!object(action) || typeof action.type !== 'string') { errors.push('PA_ACTION_TYPE'); continue; }
      if (action.runAfter && (!object(action.runAfter) || Object.entries(action.runAfter).some(([k, states]) => !Object.hasOwn(map, k) || k === name || !Array.isArray(states) || !states.length || states.some(s => !['Succeeded', 'Failed', 'Skipped', 'TimedOut'].includes(s))))) errors.push('PA_RUN_AFTER');
      if (action.actions) actions(action.actions);
      if (action.else?.actions) actions(action.else.actions);
      if (action.cases) for (const c of Object.values(action.cases)) actions(c.actions);
      if (action.default?.actions) actions(action.default.actions);
    }
    const active = new Set(), done = new Set();
    function cycle(k) { if (active.has(k)) { errors.push('PA_CYCLE'); return; } if (done.has(k)) return; active.add(k); for (const dep of Object.keys(map[k]?.runAfter ?? {})) if (map[dep]) cycle(dep); active.delete(k); done.add(k); }
    Object.keys(map).forEach(cycle);
  }
  actions(doc.definition.actions); actions(doc.definition.triggers);
  function scan(v, key = '') {
    if (forbidden.test(key) || key === 'metadata') errors.push('PA_RUNTIME_METADATA');
    if (object(v)) {
      if (v.host?.connectionName && !Object.hasOwn(doc.connectionReferences, v.host.connectionName)) errors.push('PA_CONNECTION_REFERENCE');
      if (/^secure(string|object)$/i.test(v.type ?? '') && v.defaultValue != null && !(placeholder.test(v.defaultValue) || object(v.defaultValue) && !Object.keys(v.defaultValue).length)) errors.push('PA_SECURE_DEFAULT');
      for (const [k, value] of Object.entries(v)) { scan(k); scan(value, k); }
    } else if (Array.isArray(v)) v.forEach(x => scan(x, key));
    else if (typeof v === 'string') {
      if (v === SCHEMA && key === '$schema') return;
      for (const [pattern, error] of [[guid, 'PA_GUID'], [url, 'PA_URL'], [email, 'PA_PERSON'], [domain, 'PA_DOMAIN'], [personal, 'PA_PERSON'], [jwt, 'PA_TOKEN']]) {
        pattern.lastIndex = 0; if (pattern.test(v)) errors.push(error);
      }
      if (/-----BEGIN|\bBearer\s+[A-Za-z0-9]|[?&](?:sig|token|code)=|\b(?:password|client_secret)\s*=/i.test(v)) errors.push('PA_SECRET');
      if ((identityKey.test(key) || secretKey.test(key)) && v && !placeholder.test(v) && !expression(v)) errors.push('PA_LITERAL_ID_OR_SECRET');
      if (/\/connections\/|\/environments\/|\/flows\//i.test(v) && !/__PA_[A-Z]+_\d+__/.test(v)) errors.push('PA_RESOURCE_ID');
      if (!expressionValid(v)) errors.push('PA_EXPRESSION');
      if (expression(v)) expressions.push(v);
    }
  }
  scan(doc);
  for (const s of expressions) for (const m of s.matchAll(/\b(?:body|outputs|actions|items|result)\('((?:''|[^'])*)'\)/g)) if (!names.has(m[1].replace(/''/g, "'"))) errors.push('PA_ACTION_REFERENCE');
  return [...new Set(errors)];
}
