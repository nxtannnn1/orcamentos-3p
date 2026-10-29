// Offline contract for reviewed metadata only. Never return input values in diagnostics.
export const root = 'system/infrastructure/microsoft-lists/';
export const inventory = Object.freeze({
  'arquivos-processados': 'Arquivos_Processados',
  fornecedores: 'Fornecedores',
  'historico-precos': 'Historico_Precos',
  'itens-importados': 'Itens_Importados',
  'materiais-fornecedores-homologados': 'Materiais_Fornecedores_Homologados',
  'materiais-oficiais': 'Materiais_Oficiais',
  orcamentos: 'Orcamentos',
  'tributos-itens': 'Tributos_Itens_Orcamentos',
});
export const schemaPaths = Object.entries(inventory).map(([dir, title]) => `${dir}/${title}.schema.json`);
export const currentInventory = Object.freeze({ ...inventory, 'catalogo-neoenergiav2': 'Catalogo_Neoenergiav2' });
export const currentPaths = Object.keys(currentInventory).filter(d => d !== 'tributos-itens').map(d => `arquivos-processados/${d}/schema.json`);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const placeholder = /^(?:EXAMPLE_LIST_ID(?:_\d+)?|\{EXAMPLE_LIST_ID(?:_\d+)?\}|[A-Z][A-Z0-9_]*_PLACEHOLDER)$/;
const flags = ['EnforceUniqueValues', 'FromBaseType', 'Hidden', 'Indexed', 'ReadOnlyField', 'Required'];
const fieldKeys = new Set([...flags, 'InternalName', 'Title', 'TypeAsString', 'LookupList', 'LookupField']);
const types = new Set(['Text', 'Note', 'Choice', 'MultiChoice', 'Number', 'Currency', 'Boolean', 'DateTime', 'Counter', 'Lookup', 'LookupMulti', 'User', 'UserMulti', 'URL', 'Calculated']);

// Pattern detection complements the closed metadata contract, never certifies free text.
export function scanSensitive(value) {
  const errors = new Set();
  const patterns = [
    [/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b|\b[0-9a-f]{32}\b/i, 'ML_IDENTIFIER'],
    [/(?:https?|ftp):\/\/|www\.|\\\\|(?:\b[\w-]+\.)+(?:com|net|org|br|io|internal|local)\b|\b(?:\d{1,3}\.){3}\d{1,3}\b/i, 'ML_ENDPOINT'],
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{11,14}\b|\+\d[\d ()-]{8,}\d/i, 'ML_PERSON'],
    [/\b(?:Bearer|Basic)\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN|\b(?:password|passwd|client_secret|clientsecret|access_token|refresh_token|api_key|apikey|authorization|secret|token)["']?\s*[:=]\s*\S+|[?&](?:sig|code)=/i, 'ML_SECRET'],
  ];
  function walk(v) {
    if (typeof v === 'string') {
      for (const [pattern, code] of patterns) if (pattern.test(v)) errors.add(code);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (object(v)) for (const [key, item] of Object.entries(v)) { walk(key); walk(item); }
  }
  walk(value);
  return [...errors];
}

export function validate(schema) {
  const errors = new Set(scanSensitive(schema));
  const fail = code => errors.add(code);
  if (!object(schema)) return [...errors, 'ML_OBJECT'];
  const allowed = new Set(['site', 'title', 'type', 'fields']);
  if (Object.keys(schema).some(k => !allowed.has(k))) fail('ML_PROPERTY');
  if (schema.site !== 'example-site' && schema.site !== 'SITE_PLACEHOLDER') fail('ML_SITE');
  if (typeof schema.title !== 'string' || !identifier.test(schema.title)) fail('ML_TITLE');
  if (!['List', 'Document Library'].includes(schema.type)) fail('ML_TYPE');
  if (!Array.isArray(schema.fields) || !schema.fields.length || schema.fields.length > 5000) return [...errors, 'ML_FIELDS'];
  const names = new Set();
  for (const f of schema.fields) {
    if (!object(f)) { fail('ML_FIELD'); continue; }
    if (Object.keys(f).some(k => !fieldKeys.has(k))) fail('ML_FIELD_PROPERTY');
    if (typeof f.InternalName !== 'string' || !identifier.test(f.InternalName)) fail('ML_INTERNAL_NAME');
    if (names.has(f.InternalName)) fail('ML_DUPLICATE_FIELD');
    names.add(f.InternalName);
    if (typeof f.Title !== 'string' || !f.Title.trim() || f.Title.length > 255 || /[\r\n\x00-\x1f]/.test(f.Title)) fail('ML_FIELD_TITLE');
    if (!types.has(f.TypeAsString)) fail('ML_FIELD_TYPE');
    if (flags.some(k => typeof f[k] !== 'boolean')) fail('ML_FLAG');
    const lookup = ['Lookup', 'LookupMulti', 'User', 'UserMulti'].includes(f.TypeAsString);
    if (lookup) {
      if (typeof f.LookupList !== 'string' || !(placeholder.test(f.LookupList) || /^list:[A-Za-z_][A-Za-z0-9_]*$/.test(f.LookupList))) fail('ML_LOOKUP_TARGET');
      if (typeof f.LookupField !== 'string' || !(identifier.test(f.LookupField) || /^User/.test(f.TypeAsString) && f.LookupField === '')) fail('ML_LOOKUP_FIELD');
    } else if ('LookupList' in f || 'LookupField' in f) fail('ML_UNEXPECTED_LOOKUP');
  }
  return [...errors];
}

// Separate Graph contract: never synthesize REST types or FromBaseType.
export function validateGraph(schema) {
  const errors = new Set(scanSensitive(schema));
  const fail = () => errors.add('ML_GRAPH_CONTRACT');
  const closed = (v, keys) => object(v) && Object.keys(v).every(k => keys.includes(k));
  const options = {
    text: {allowMultipleLines:'boolean',appendChangesToExistingText:'boolean',linesForEditing:'number',maxLength:'number',textType:'string'},
    choice: {allowTextEntry:'boolean',choices:'array',displayAs:'string'},
    dateTime: {displayAs:'string',format:'string'},
    personOrGroup: {allowMultipleSelection:'boolean',displayAs:'string',chooseFromType:'string'},
    boolean: {}, number: {decimalPlaces:'string',displayAs:'string',maximum:'number',minimum:'number'},
    currency: {locale:'string'}, defaultValue: {value:'string',formula:'string'},
    lookup: {allowMultipleValues:'boolean',allowUnlimitedLength:'boolean',columnName:'string',listId:'string',primaryLookupColumnId:'string'},
  };
  if (!closed(schema,['title','source','extractedAt','paginationComplete','columns']) || !Object.values(currentInventory).includes(schema?.title) || schema?.source !== 'Microsoft Graph v1.0 columnDefinition' || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(schema?.extractedAt??'') || !Number.isFinite(Date.parse(schema?.extractedAt)) || schema?.paginationComplete !== true || !Array.isArray(schema?.columns) || !schema.columns.length || schema.columns.length > 5000) return [...errors,'ML_GRAPH_CONTRACT'];
  const seen = new Set();
  for (const c of schema.columns) {
    if (!closed(c,['name','displayName','description','enforceUniqueValues','hidden','indexed','readOnly','required',...Object.keys(options)])) {fail();continue;}
    if (!identifier.test(c.name??'') || seen.has(c.name)) fail();
    seen.add(c.name);
    if (typeof c.displayName !== 'string' || !c.displayName.trim() || typeof c.description !== 'string') fail();
    for (const k of ['enforceUniqueValues','hidden','indexed','readOnly','required']) if(typeof c[k]!=='boolean') fail();
    for (const [facet,fields] of Object.entries(options)) if (facet in c) {
      const v=c[facet];
      if(!closed(v,Object.keys(fields))) {fail();continue;}
      for(const [k,x] of Object.entries(v)) {
        if(fields[k]==='array' ? !Array.isArray(x)||x.some(s=>typeof s!=='string') : typeof x!==fields[k] || typeof x==='number'&&!Number.isFinite(x)) fail();
      }
      if(facet==='choice' && (!Array.isArray(v.choices)||!v.choices.length))fail();
      if(facet==='lookup' && (typeof v.listId!=='string' || !(placeholder.test(v.listId)||/^list:[A-Za-z_][A-Za-z0-9_]*$/.test(v.listId)) || typeof v.columnName!=='string' || !identifier.test(v.columnName) || 'primaryLookupColumnId' in v && !identifier.test(v.primaryLookupColumnId)))fail();
    }
  }
  return [...errors];
}

export function validateCollection(schemas) {
  const errors = new Set(schemas.flatMap(validate));
  const byTitle = new Map();
  for (const s of schemas) {
    if (byTitle.has(s?.title)) errors.add('ML_DUPLICATE_LIST');
    byTitle.set(s?.title, s);
  }
  for (const s of schemas) for (const f of Array.isArray(s?.fields) ? s.fields : []) {
    if (typeof f?.LookupList !== 'string' || !f.LookupList.startsWith('list:')) continue;
    const target = byTitle.get(f.LookupList.slice(5));
    if (!target || !Array.isArray(target.fields) || !target.fields.some(x => x?.InternalName === f.LookupField)) errors.add('ML_UNRESOLVED_LOOKUP');
  }
  return [...errors];
}

const permitted = new Set([
  'README.md', ...Object.keys(inventory).map(d => `${d}/README.md`), ...schemaPaths,
  'scripts/policy.mjs', 'scripts/policy.test.mjs', 'scripts/validate.mjs', 'scripts/check-tracked.mjs',
  ...currentPaths, ...Object.keys(currentInventory).map(d => `arquivos-processados/${d}/README.md`),
]);
// Unicode Cc (controls) and Cf (format: bidi overrides, zero-width, BOM) never belong in a tracked path.
const unsafePathChar = /[\p{Cc}\p{Cf}]/u;
export function allowedTracked(file) {
  return typeof file === 'string' && !unsafePathChar.test(file) && file.startsWith(root) && permitted.has(file.slice(root.length));
}
// Accepts only non-empty `git ls-files -z` output: every entry NUL-terminated, valid UTF-8, no Cc/Cf characters.
// A newline is never a separator, so a single tracked name cannot be split into allowed names.
export function parseIndex(buffer) {
  // ignoreBOM keeps a leading U+FEFF in the text so it is rejected instead of silently stripped.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  if (!text.endsWith('\0')) throw Error('ML_INDEX_FORMAT');
  const files = text.slice(0, -1).split('\0');
  if (files.some(f => f === '' || unsafePathChar.test(f))) throw Error('ML_INDEX_FORMAT');
  return files;
}
