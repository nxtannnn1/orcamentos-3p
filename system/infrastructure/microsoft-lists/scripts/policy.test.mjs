import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { allowedTracked, inventory, parseIndex, root, schemaPaths, scanSensitive, validate, validateCollection } from './policy.mjs';
import { validateDirectory } from './validate.mjs';

const field = () => ({ InternalName: 'Title', Title: 'Título', TypeAsString: 'Text', Required: false, Hidden: false, Indexed: false, EnforceUniqueValues: false, FromBaseType: true, ReadOnlyField: false });
const fixture = () => ({ site: 'SITE_PLACEHOLDER', title: 'Synthetic_List', type: 'List', fields: [field()] });
const lookup = () => ({ ...field(), InternalName: 'Reference', TypeAsString: 'Lookup', LookupList: 'list:Target', LookupField: 'Title' });

test('accepts metadata without mutating it or inventing missing Choices', () => {
  const s = fixture(); s.fields[0].TypeAsString = 'Choice';
  const before = structuredClone(s);
  assert.deepEqual(validate(s), []); assert.deepEqual(s, before);
  assert.equal('Choices' in s.fields[0], false);
});

for (const [category, value] of [
  ['ML_IDENTIFIER', '11111111-2222-4333-8444-555555555555'],
  ['ML_IDENTIFIER', 'abcdef0123456789abcdef0123456789'],
  ['ML_ENDPOINT', 'https://synthetic.sharepoint.com/sites/test'],
  ['ML_ENDPOINT', 'http://10.20.30.40/private'],
  ['ML_ENDPOINT', 'synthetic.internal'],
  ['ML_ENDPOINT', '//synthetic.example.com/private'],
  ['ML_ENDPOINT', '\\\\synthetic\\private'],
  ['ML_PERSON', 'synthetic.person@example.invalid'],
  ['ML_PERSON', '123.456.789-00'],
  ['ML_PERSON', '12.345.678/0001-00'],
  ['ML_PERSON', '12345678901'],
  ['ML_PERSON', '+55 (11) 99999-0000'],
  ['ML_SECRET', 'Bearer synthetic-not-a-token'],
  ['ML_SECRET', 'Basic c3ludGhldGlj'],
  ['ML_SECRET', 'eyJsynthetic.eyJsynthetic.signature'],
  ['ML_SECRET', 'client_secret=synthetic-not-a-secret'],
  ['ML_SECRET', '{"password":"synthetic"}'],
  ['ML_SECRET', '-----BEGIN PRIVATE KEY-----'],
]) test(`rejects synthetic ${category}: case ${value.length}`, () => {
  const s = fixture(); s.fields[0].Title = value;
  const errors = validate(s);
  assert.ok(errors.includes(category));
  assert.ok(errors.every(e => /^ML_[A-Z_]+$/.test(e)));
  assert.equal(JSON.stringify(errors).includes(value), false);
});

test('rejects unknown properties: items, values, samples, owners and credentials', () => {
  for (const key of ['items', 'rows', 'value', 'sampleData', 'runHistory', 'owner', 'tenantId', 'access_token', 'connections', 'backup']) {
    const s = fixture(); s[key] = [{ arbitrary: 'synthetic operational content' }];
    assert.ok(validate(s).includes('ML_PROPERTY'));
  }
  for (const key of ['value', 'DefaultValue', 'Choices', 'ValidationFormula', 'password', 'price']) {
    const s = fixture(); s.fields[0][key] = 'synthetic operational content';
    assert.ok(validate(s).includes('ML_FIELD_PROPERTY'));
  }
});

test('rejects item payloads masquerading as fields and malformed structures', () => {
  for (const s of [null, [], {}, { ...fixture(), fields: [{ Title: 'Synthetic row', Preco: 42 }] },
    { ...fixture(), fields: [] }, { ...fixture(), fields: [null] }, { ...fixture(), site: 'opaque-corporate-site' }]) assert.ok(validate(s).length);
  for (const [key, value] of [['Required', 'false'], ['InternalName', 123], ['TypeAsString', 'Unknown'], ['Title', {}]]) {
    const s = fixture(); s.fields[0][key] = value; assert.ok(validate(s).length);
  }
});

test('rejects duplicate names, misplaced lookup metadata and arbitrary binding values', () => {
  const s = fixture(); s.fields.push(field()); assert.ok(validate(s).includes('ML_DUPLICATE_FIELD'));
  s.fields = [{ ...field(), LookupList: 'EXAMPLE_LIST_ID' }]; assert.ok(validate(s).includes('ML_UNEXPECTED_LOOKUP'));
  s.fields = [{ ...lookup(), LookupList: 'opaque-instance' }]; assert.ok(validate(s).includes('ML_LOOKUP_TARGET'));
});

test('logical lookup resolves by list title and exact internal field, never display title', () => {
  const source = fixture(); source.fields.push(lookup());
  const target = { ...fixture(), title: 'Target' };
  assert.deepEqual(validateCollection([source, target]), []);
  assert.ok(validateCollection([source]).includes('ML_UNRESOLVED_LOOKUP'));
  target.fields[0].InternalName = 'Other';
  assert.ok(validateCollection([source, target]).includes('ML_UNRESOLVED_LOOKUP'));
  assert.ok(validateCollection([fixture(), fixture()]).includes('ML_DUPLICATE_LIST'));
});

test('unresolved user binding stays explicit and legacy placeholders remain compatible', () => {
  const s = fixture();
  s.fields = [{ ...field(), TypeAsString: 'User', LookupList: 'USER_INFORMATION_LIST_PLACEHOLDER', LookupField: '' }];
  assert.deepEqual(validate(s), []);
  s.fields = [{ ...lookup(), LookupList: 'EXAMPLE_LIST_ID_4' }];
  assert.deepEqual(validate(s), []);
  s.fields[0].LookupList = '{EXAMPLE_LIST_ID_4}';
  assert.deepEqual(validate(s), []);
  s.fields[0].LookupList = '{EXAMPLE_LIST_ID_4';
  assert.ok(validate(s).includes('ML_LOOKUP_TARGET'));
});

test('scans nested values and keys without reflecting sensitive input', () => {
  assert.ok(scanSensitive({ 'password=synthetic': [{ hidden: 'https://example.invalid' }] }).includes('ML_SECRET'));
});

test('tracked guard accepts only exact reviewed paths, even for forced additions', () => {
  for (const relative of [...schemaPaths, 'README.md', 'scripts/policy.mjs', 'scripts/policy.test.mjs', 'scripts/validate.mjs', 'scripts/check-tracked.mjs']) assert.equal(allowedTracked(root + relative), true);
  for (const relative of ['raw/export.json', 'exports/a.zip', 'backups/README.md', 'items.csv', 'items.xlsx', 'private.xml', 'fornecedores/Other.schema.json', 'scripts/secret.mjs', 'fornecedores/Fornecedores.schema.json.zip', '../escape.schema.json', 'orcamentos/../README.md', 'README.md\nitems.csv']) assert.equal(allowedTracked(root + relative), false);
  assert.equal(allowedTracked('other/README.md'), false);
});

test('all eight repository schemas validate and documented logical target exists', () => {
  const result = validateDirectory(fileURLToPath(new URL('../', import.meta.url)));
  assert.equal(result.count, 8); assert.deepEqual(result.errors, []);
});

test('directory validator fails closed on missing, malformed, renamed or sensitive schemas', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-policy-synthetic-'));
  try {
    for (const [dir, title] of Object.entries(inventory)) {
      fs.mkdirSync(path.join(temp, dir));
      fs.writeFileSync(path.join(temp, dir, `${title}.schema.json`), JSON.stringify({ ...fixture(), title }));
    }
    assert.deepEqual(validateDirectory(temp).errors, []);
    const file = path.join(temp, schemaPaths[0]);
    fs.writeFileSync(file, '{"secret":"synthetic-invalid-json"');
    assert.deepEqual(validateDirectory(temp).errors, ['ML_FILE_OR_JSON']);
    fs.writeFileSync(file, JSON.stringify(fixture()));
    assert.ok(validateDirectory(temp).errors.includes('ML_FILENAME_TITLE'));
    fs.writeFileSync(file, JSON.stringify({ ...fixture(), title: inventory['arquivos-processados'], items: [{ price: 42 }] }));
    assert.ok(validateDirectory(temp).errors.includes('ML_PROPERTY'));
    fs.unlinkSync(file);
    assert.ok(validateDirectory(temp).errors.includes('ML_FILE_OR_JSON'));
  } finally {
    // Only the unique test-owned directory; never operate on a computed workspace path.
    if (path.dirname(temp) !== os.tmpdir() || !path.basename(temp).startsWith('ml-policy-synthetic-')) throw Error('ML_TEST_PATH');
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Git ignore and CLI guard reject an actually forced synthetic raw file in an isolated index', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-policy-synthetic-'));
  const repo = fileURLToPath(new URL('../../../../', import.meta.url));
  const guard = fileURLToPath(new URL('./check-tracked.mjs', import.meta.url));
  // Ignore inherited index/worktree variables; never touch the user's index.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = args => execFileSync('git', args, { cwd: temp, env, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    git(['init', '--quiet']);
    fs.copyFileSync(path.join(repo, '.gitignore'), path.join(temp, '.gitignore'));
    for (const relative of ['raw/export.json', 'exports/export.zip', 'backups/Fornecedores.schema.json', 'items.csv', 'items.xlsx', 'backup.json', 'fornecedores/private.local.schema.json']) {
      const checked = git(['check-ignore', '--no-index', root + relative]).toString().trim();
      assert.equal(checked, root + relative);
    }
    for (const relative of [...schemaPaths, 'README.md', 'scripts/policy.mjs']) {
      const result = spawnSync('git', ['check-ignore', '--no-index', root + relative], { cwd: temp, env });
      assert.equal(result.status, 1);
    }
    const forced = root + 'raw/export.json';
    fs.mkdirSync(path.dirname(path.join(temp, forced)), { recursive: true });
    fs.writeFileSync(path.join(temp, forced), '{"items":[{"synthetic":true}]}');
    git(['add', '-f', '--', forced]);
    const index = git(['ls-files', '-z', '--', root]);
    const result = spawnSync(process.execPath, [guard], { input: index, encoding: 'utf8', env });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /1 files checked; 1 rejected/);
    assert.equal(result.stdout.includes('export.json'), false);
    const empty = spawnSync(process.execPath, [guard], { input: '', encoding: 'utf8', env });
    assert.equal(empty.status, 1);
    const accepted = spawnSync(process.execPath, [guard], { input: schemaPaths.map(p => root + p + '\0').join(''), encoding: 'utf8', env });
    assert.equal(accepted.status, 0);
  } finally {
    if (path.dirname(temp) !== os.tmpdir() || !path.basename(temp).startsWith('ml-policy-synthetic-')) throw Error('ML_TEST_PATH');
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('index parser accepts only NUL-terminated entries and rejects control characters', () => {
  const ok = parseIndex(Buffer.from(`${root}README.md\0${root}scripts/policy.mjs\0`));
  assert.deepEqual(ok, [root + 'README.md', root + 'scripts/policy.mjs']);
  const adversarial = [
    '', `${root}README.md\n${root}scripts/policy.mjs\0`, `${root}README.md\r\n${root}scripts/policy.mjs\0`,
    `${root}README.md\0${root}scripts/policy.mjs`, `${root}README.md\n`, `${root}README.md\0\0`, `\0`,
    `${root}README.md\t.csv\0`, `${root}README.md\u001b[2K\0`, `${root}README.md\u007f\0`, `${root}README.md\u0085items.csv\0`,
    // Cf: bidi override, zero-width space/joiner, BOM (leading and embedded), soft hyphen, isolate.
    `${root}README‮.md\0`, `${root}README.md​\0`, `${root}README‍.md\0`, `﻿${root}README.md\0`,
    `${root}README.md\0﻿${root}scripts/policy.mjs\0`, `${root}README­.md\0`, `${root}⁦README.md\0`
  ];
  for (const input of adversarial) assert.throws(() => parseIndex(Buffer.from(input)), /ML_INDEX_FORMAT/, JSON.stringify(input));
  assert.throws(() => parseIndex(Buffer.from([0x52, 0xff, 0x00])), TypeError);
});

test('allowedTracked rejects Cc/Cf characters even when called without the parser', () => {
  for (const name of [`${root}README.md\n`, `${root}README.md\u0000`, `﻿${root}README.md`, `${root}README.md‮`, `${root}​README.md`]) {
    assert.equal(allowedTracked(name), false, JSON.stringify(name));
  }
  assert.equal(allowedTracked(root + 'README.md'), true);
  assert.equal(allowedTracked(undefined), false);
});

test('CLI guard rejects adversarial tracked names that split into allowed paths, without printing them', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ml-policy-synthetic-'));
  const guard = fileURLToPath(new URL('./check-tracked.mjs', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const git = (args, input) => execFileSync('git', ['-c', 'core.protectNTFS=false', ...args], { cwd: temp, env, input, stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    git(['init', '--quiet']);
    const blob = git(['hash-object', '-w', '--stdin'], 'synthetic\n').toString().trim();
    // Index-only entries: names with newlines cannot exist on NTFS but can exist in a Git index.
    const names = [`${root}README.md\n${root}scripts/policy.mjs`, `${root}README.md\r`, `${root}scripts/policy.mjs\u001b`, `${root}README.md‮`];
    for (const name of names) {
      git(['update-index', '--add', '-z', '--index-info'], `100644 blob ${blob}\t${name}\0`);
      const index = git(['ls-files', '-z', '--', root]);
      const result = spawnSync(process.execPath, [guard], { input: index, encoding: 'utf8', env });
      assert.equal(result.status, 1, JSON.stringify(name));
      assert.equal(`${result.stdout}${result.stderr}`.includes('README'), false);
      assert.equal(`${result.stdout}${result.stderr}`.includes('policy.mjs'), false);
      git(['rm', '--cached', '--quiet', '--', name]);
    }
    const newlineListing = schemaPaths.map(p => root + p).join('\n') + '\n';
    assert.equal(spawnSync(process.execPath, [guard], { input: newlineListing, encoding: 'utf8', env }).status, 1);
  } finally {
    if (path.dirname(temp) !== os.tmpdir() || !path.basename(temp).startsWith('ml-policy-synthetic-')) throw Error('ML_TEST_PATH');
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
