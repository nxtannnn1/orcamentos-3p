import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { extract, sanitize, validate } from './policy.mjs';
import { readDefinition } from './read-zip.mjs';

// Independent comparison: preserve topology, types, constants and expression operators.
// Only contextual bindings or recognizable private literals may change to placeholders.
export function compareLogic(raw, snapshot) {
  const failures = [], counts = { expressions: 0, changedExpressions: 0, bindings: 0, metadataRemoved: 0 };
  function walk(a, b, key = '') {
    if (a === b) { if (typeof a === 'string' && a.startsWith('@')) counts.expressions++; return; }
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) { failures.push('ARRAY_CHANGED'); return; }
      a.forEach((v, i) => walk(v, b[i], key)); return;
    }
    if (a && typeof a === 'object') {
      if (!b || typeof b !== 'object' || Array.isArray(b)) { failures.push('OBJECT_CHANGED'); return; }
      const keys = Object.keys(a).filter(k => k !== 'metadata');
      if (Object.hasOwn(a, 'metadata')) counts.metadataRemoved++;
      if (keys.length !== Object.keys(b).length) failures.push('KEYS_CHANGED');
      if (key === 'connectionReferences') {
        const values = Object.values(b); keys.forEach((k, i) => walk(a[k], values[i]));
      } else for (const k of keys) {
        if (!Object.hasOwn(b, k)) { failures.push('KEY_CHANGED'); continue; }
        walk(a[k], b[k], k);
      }
      return;
    }
    if (typeof a !== 'string' || typeof b !== 'string') { failures.push('TYPE_OR_NUMBER_CHANGED'); return; }
    if (!/__PA_[A-Z]+_\d+__/.test(b)) { failures.push('UNEXPLAINED_LITERAL_CHANGE'); return; }
    if (a.startsWith('@')) {
      counts.expressions++; counts.changedExpressions++;
      const quoted = /'(?:''|[^'])*'/g;
      if (a.replace(quoted, "''") !== b.replace(quoted, "''")) failures.push('EXPRESSION_OPERATORS_CHANGED');
      const oldLiterals = a.match(quoted) ?? [], newLiterals = b.match(quoted) ?? [];
      if (oldLiterals.length !== newLiterals.length) failures.push('EXPRESSION_LITERALS_CHANGED');
      oldLiterals.forEach((v, i) => { if (v !== newLiterals[i] && !/https?:|[0-9a-f]{8}-[0-9a-f-]{27,}|\/connections\//i.test(v)) failures.push('BUSINESS_LITERAL_CHANGED'); });
    } else {
      const contextual = /(?:^|\/)(dataset|destinationDataset|table|folderPath|destinationFolderPath|connectionName|connectionReferenceLogicalName|connectionReferenceName|tenantId|clientId|environmentId|flowId|siteId|listId)$/i.test(key);
      if (!contextual && !/https?:|[0-9a-f]{8}-[0-9a-f-]{27,}|\b[^\s]+@[^\s]+\.[a-z]{2,}/i.test(a)) failures.push('BUSINESS_LITERAL_CHANGED');
    }
    counts.bindings++;
  }
  walk(extract(raw), { definition: snapshot.definition, connectionReferences: snapshot.connectionReferences });
  return { failures: [...new Set(failures)], ...counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [source, destination] = process.argv.slice(2);
    const before = fs.readFileSync(source), digest = b => createHash('sha256').update(b).digest('hex');
    const raw = JSON.parse(source.toLowerCase().endsWith('.zip') ? readDefinition(before) : before.toString('utf8'));
    const snapshot = JSON.parse(fs.readFileSync(destination, 'utf8'));
    const report = compareLogic(raw, snapshot);
    report.reproducible = JSON.stringify(sanitize(raw)) === JSON.stringify(snapshot);
    report.repeatable = JSON.stringify(sanitize(raw)) === JSON.stringify(sanitize(raw));
    report.sourceUnchanged = digest(before) === digest(fs.readFileSync(source));
    report.validationErrors = validate(snapshot);
    console.log(JSON.stringify(report));
    if (report.failures.length || !report.reproducible || !report.sourceUnchanged || report.validationErrors.length) process.exitCode = 1;
  } catch { console.error('PA_AUDIT_FAILED: inspect source privately.'); process.exitCode = 1; }
}
