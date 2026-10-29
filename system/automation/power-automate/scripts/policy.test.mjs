import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitize, validate, expressionValid, SCHEMA } from './policy.mjs';
import { readDefinition } from './read-zip.mjs';
import { compareLogic } from './audit-snapshots.mjs';
import { allowedTracked, parseIndex } from './check-tracked.mjs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const fixture = () => ({ properties: { definition: {
  $schema: SCHEMA, contentVersion: '1.0.0.0', parameters: {},
  triggers: { Start: { type: 'Request', kind: 'Http' } },
  actions: { Read: { type: 'Compose', inputs: "@concat('literal',string(triggerBody()?['ID']))", runAfter: {} },
    Finish: { type: 'Compose', inputs: "@outputs('Read')", runAfter: { Read: ['Succeeded', 'Failed'] } } }, outputs: {}
}, connectionReferences: {}, owner: { email: 'person@example.invalid' }, runHistory: [{ private: 'omitted' }] } });
test('keeps definition, fields, expressions, exception ordering; discards envelope', () => {
  const raw = fixture(), before = structuredClone(raw), out = sanitize(raw);
  assert.deepEqual(raw, before);
  assert.deepEqual(out.definition, raw.properties.definition);
  assert.deepEqual(validate(out), []);
  assert.equal(JSON.stringify(out).includes('omitted'), false);
  assert.equal(out.directlyImportable, false);
});
test('consistent replacement in keys, connection references and expressions', () => {
  const f = fixture();
  f.properties.connectionReferences['synthetic-connection'] = { connectionName: 'synthetic-instance' };
  f.properties.definition.actions.Read = { type: 'OpenApiConnection', inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connectionName: 'synthetic-connection', operationId: 'GetItems' }, parameters: {
    dataset: 'https://sample.sharepoint.com/sites/test', table: '11111111-1111-4111-8111-111111111111',
    uri: "@concat('https://sample.sharepoint.com/sites/test','/items/11111111-1111-4111-8111-111111111111')"
  } } };
  const out = sanitize(f), a = out.definition.actions.Read.inputs;
  assert.ok(out.connectionReferences[a.host.connectionName]);
  assert.ok(a.parameters.uri.includes(a.parameters.dataset));
  assert.ok(a.parameters.uri.includes(a.parameters.table));
  assert.equal(a.host.operationId, 'GetItems');
  assert.equal(a.host.apiId, '/providers/Microsoft.PowerApps/apis/shared_sharepointonline');
  assert.deepEqual(validate(out), []);
});
test('public connector survives when reference alias equals connector name', () => {
  const f = fixture();
  f.properties.connectionReferences.shared_sharepointonline = { connectionName: 'opaque-instance', id: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline' };
  f.properties.definition.actions.Read.inputs = { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connectionName: 'shared_sharepointonline' }, parameters: { folderPath: '/private/folder', 'parameters/destinationFolderPath': '/private/other' } };
  const d = sanitize(f);
  assert.equal(d.definition.actions.Read.inputs.host.apiId, '/providers/Microsoft.PowerApps/apis/shared_sharepointonline');
  assert.equal(JSON.stringify(d).includes('/private/'), false);
});
test('redacts credentials and secure defaults while retaining parameter references', () => {
  const f = fixture(); f.properties.definition.parameters = { Secure: { type: 'SecureString', defaultValue: 'sensitive-synthetic-value' } };
  f.properties.definition.actions.Read.inputs = { password: 'synthetic-password', authorization: 'synthetic-auth', ref: "@parameters('Secure')" };
  const out = sanitize(f);
  assert.equal(JSON.stringify(out).includes('sensitive-synthetic-value'), false);
  assert.equal(out.definition.actions.Read.inputs.ref, "@parameters('Secure')");
  assert.deepEqual(validate(out), []);
});
for (const [value, error] of [
  ['11111111-1111-4111-8111-111111111111', 'PA_GUID'],
  ['https://sample.sharepoint.com/sites/test', 'PA_URL'], ['person@example.org', 'PA_PERSON'],
  ['corp.internal', 'PA_DOMAIN'], ['123.456.789-00', 'PA_PERSON'], ['12345678901', 'PA_PERSON'],
  ['Bearer synthetic-token', 'PA_SECRET'], ['-----BEGIN PRIVATE KEY-----', 'PA_SECRET'],
  ['eyJsynthetic.eyJsynthetic.signature', 'PA_TOKEN'], ['/environments/opaque/flows/opaque', 'PA_RESOURCE_ID']
]) test(`rejects ${error} fixture`, () => {
  const out = sanitize(fixture()); out.definition.actions.Read.inputs = value;
  assert.ok(validate(out).includes(error));
});
test('encoded opaque secrets fail closed rather than claiming success', () => {
  const f = fixture(); f.properties.definition.actions.Read.inputs = 'Bearer synthetic-token';
  assert.throws(() => sanitize(f), /PA_SANITIZATION_REJECTED/);
});
for (const key of ['runHistory', 'executionHistory', 'samplePayload', 'trackingData']) test(`rejects runtime ${key}`, () => {
  const out = sanitize(fixture()); out.definition[key] = [];
  assert.ok(validate(out).includes('PA_RUNTIME_METADATA'));
});
test('structural failures: missing trigger, invalid action, missing dependency, cycle', () => {
  for (const mutate of [d => d.definition.triggers = {}, d => delete d.definition.actions.Read.type,
    d => d.definition.actions.Finish.runAfter = { Absent: ['Succeeded'] },
    d => d.definition.actions.Read.runAfter = { Finish: ['Succeeded'] }]) {
    const d = sanitize(fixture()); mutate(d); assert.ok(validate(d).length);
  }
});
test('dangling expression and connection references rejected', () => {
  const d = sanitize(fixture()); d.definition.actions.Read.inputs = "@outputs('Absent')";
  assert.ok(validate(d).includes('PA_ACTION_REFERENCE'));
  d.definition.actions.Read.inputs = { host: { connectionName: '__PA_CONNECTION_99__' } };
  assert.ok(validate(d).includes('PA_CONNECTION_REFERENCE'));
});
test('expression quote/parenthesis integrity including escaped apostrophes', () => {
  assert.equal(expressionValid("@concat('O''Brien',string(triggerBody()?['ID']))"), true);
  for (const s of ["@concat('a'", "@outputs('Read')]", "@concat('unclosed)"]) assert.equal(expressionValid(s), false);
});
test('numeric rules, field mappings, nested scope and failure branches preserved', () => {
  const f = fixture(); f.properties.definition.actions.Finish = { type: 'If', expression: { greater: ["@outputs('Read')", 10] },
    actions: { Yes: { type: 'Compose', inputs: { 'item/Preco_Unitario': "@triggerBody()?['Preco_Unitario']" } } },
    else: { actions: { No: { type: 'Terminate', inputs: { runStatus: 'Failed' } } } }, runAfter: { Read: ['Succeeded'] } };
  assert.deepEqual(sanitize(f).definition, f.properties.definition);
});
test('deterministic and idempotent sanitizer', () => {
  const f = fixture(); f.properties.definition.actions.Read.inputs = 'https://sample.sharepoint.com/sites/test';
  const once = sanitize(f); assert.deepEqual(sanitize(f), once); assert.deepEqual(sanitize(once), once);
});
test('unknown export shape is rejected', () => {
  assert.throws(() => sanitize({ arbitrary: 'input' }), /PA_INPUT_SHAPE/);
  const f = fixture(); f.properties.definition.unknown = {}; assert.throws(() => sanitize(f), /PA_UNKNOWN/);
});
test('ZIP rejects truncation, non-ZIP and oversized input', () => {
  for (const b of [Buffer.alloc(0), Buffer.from('not a zip'), Buffer.alloc(26 * 1024 * 1024)]) assert.throws(() => readDefinition(b));
});
test('all versioned artifacts validate', () => {
  const dir = new URL('../flows/', import.meta.url);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sanitized.json'));
  assert.ok(files.length);
  for (const file of files) assert.deepEqual(validate(JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8'))), []);
});
test('independent audit detects functional drift and accepts unchanged logic', () => {
  const raw = fixture(), sanitized = sanitize(raw);
  assert.deepEqual(compareLogic(raw, sanitized).failures, []);
  sanitized.definition.actions.Finish.inputs = "@body('Read')";
  assert.ok(compareLogic(raw, sanitized).failures.length);
});
test('index guard rejects previously tracked raw exports across the entire scope', () => {
  const root = 'system/automation/power-automate/';
  for (const f of ['flows/raw.zip', 'flows/definition.json', 'old/export.zip', 'schemas/raw.xml', 'scripts/secret.json', 'flows/a.sanitized.json.zip']) assert.equal(allowedTracked(root + f), false);
  for (const f of ['flows/test.sanitized.json', 'scripts/policy.mjs', 'README.md', 'AUDIT.md', 'templates/environment.example.json']) assert.equal(allowedTracked(root + f), true);
});
test('opaque connection reference keys require placeholders', () => {
  const d = sanitize(fixture()); d.connectionReferences['opaque-corporate-reference'] = {};
  assert.ok(validate(d).includes('PA_CONNECTION_ID'));
});
test('index parser accepts only NUL-terminated entries and rejects control characters', () => {
  const root = 'system/automation/power-automate/';
  assert.deepEqual(parseIndex(Buffer.from(`${root}README.md\0${root}scripts/policy.mjs\0`)), [root + 'README.md', root + 'scripts/policy.mjs']);
  for (const input of [
    '', `${root}README.md\n${root}scripts/policy.mjs\0`, `${root}README.md\r\n${root}AUDIT.md\0`, `${root}README.md\0${root}AUDIT.md`,
    `${root}README.md\n`, `${root}README.md\0\0`, `\0`, `${root}flows/a\t.sanitized.json\0`, `${root}README.md\u001b\0`,
    `${root}README.md\u007f\0`, `${root}README.md\u0085flows/raw.zip\0`,
    // Cf: bidi override, zero-width space/joiner, BOM (leading and embedded), soft hyphen, isolate.
    `${root}flows/x‮noslew.sanitized.json\0`, `${root}README.md​\0`, `${root}AUDIT‍.md\0`, `﻿${root}README.md\0`,
    `${root}README.md\0﻿${root}AUDIT.md\0`, `${root}README­.md\0`, `${root}⁦README.md\0`
  ]) assert.throws(() => parseIndex(Buffer.from(input)), /PA_INDEX_FORMAT/, JSON.stringify(input));
  assert.throws(() => parseIndex(Buffer.from([0x52, 0xff, 0x00])), TypeError);
});
test('allowedTracked rejects Cc/Cf characters even when called without the parser', () => {
  const root = 'system/automation/power-automate/';
  for (const name of [`${root}README.md\n`, `${root}README.md\u0000`, `﻿${root}README.md`, `${root}flows/a‮.sanitized.json`, `${root}scripts/​policy.mjs`]) {
    assert.equal(allowedTracked(name), false, JSON.stringify(name));
  }
  assert.equal(allowedTracked(root + 'README.md'), true);
  assert.equal(allowedTracked(undefined), false);
});
test('CLI guard fails on an empty file list', () => {
  const guard = fileURLToPath(new URL('./check-tracked.mjs', import.meta.url));
  const empty = spawnSync(process.execPath, [guard], { input: '', encoding: 'utf8' });
  assert.equal(empty.status, 1);
  assert.equal(empty.stdout, '');
});
test('CLI guard rejects adversarial tracked names from a real isolated index without printing them', () => {
  const root = 'system/automation/power-automate/';
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-policy-synthetic-'));
  const guard = fileURLToPath(new URL('./check-tracked.mjs', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (args, input) => execFileSync('git', ['-c', 'core.protectNTFS=false', ...args], { cwd: temp, env, input, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    git(['init', '--quiet']);
    const blob = git(['hash-object', '-w', '--stdin'], 'synthetic\n').toString().trim();
    // Index-only entries: names with newlines cannot exist on NTFS but can exist in a Git index.
    for (const name of [`${root}README.md\n${root}scripts/policy.mjs`, `${root}AUDIT.md\r`, `${root}flows/x.sanitized.json\u001b`, `${root}README.md‮`]) {
      git(['update-index', '--add', '-z', '--index-info'], `100644 blob ${blob}\t${name}\0`);
      const result = spawnSync(process.execPath, [guard], { input: git(['ls-files', '-z', '--', root]), encoding: 'utf8', env });
      assert.equal(result.status, 1, JSON.stringify(name));
      assert.equal(/README|AUDIT|sanitized|policy\.mjs/.test(`${result.stdout}${result.stderr}`), false);
      git(['rm', '--cached', '--quiet', '--', name]);
    }
    git(['update-index', '--add', '-z', '--index-info'], `100644 blob ${blob}\t${root}README.md\0`);
    const valid = git(['ls-files', '-z', '--', root]);
    assert.equal(spawnSync(process.execPath, [guard], { input: valid, encoding: 'utf8', env }).status, 0);
    assert.equal(spawnSync(process.execPath, [guard], { input: `${root}README.md\n`, encoding: 'utf8', env }).status, 1);
  } finally {
    if (path.dirname(temp) !== os.tmpdir() || !path.basename(temp).startsWith('pa-policy-synthetic-')) throw Error('PA_TEST_PATH');
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
