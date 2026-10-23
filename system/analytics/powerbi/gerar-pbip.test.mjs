// Run: node --test system/analytics/powerbi/gerar-pbip.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { build, PLACEHOLDERS, PROJECT, SPEC } from './gerar-pbip.mjs';

const columnsOf = new Map(SPEC.tables.map(t => [t.name, new Set(t.columns.map(c => c.name))]));
const daxSources = SPEC.tables.flatMap(t => [
  ...(t.measures ?? []).map(m => ({ where: `medida ${m.name}`, dax: m.expression })),
  ...(t.partition.type === 'calculated' ? [{ where: `tabela ${t.name}`, dax: t.partition.source }] : []),
]);
const readTree = dir => readdirSync(dir, { recursive: true, withFileTypes: true }).filter(e => e.isFile())
  .map(e => path.join(e.parentPath ?? e.path, e.name)).sort().map(file => [path.relative(dir, file), readFileSync(file, 'utf8')]);

test('toda referência Tabela[Coluna] do DAX existe no modelo', () => {
  for (const { where, dax } of daxSources)
    for (const [, table, column] of dax.matchAll(/\b([A-Za-z_]+)\[([^\]]+)\]/g)) {
      assert.ok(columnsOf.has(table), `${where}: tabela ${table} inexistente`);
      assert.ok(columnsOf.get(table).has(column), `${where}: coluna ${table}[${column}] inexistente`);
    }
});

test('toda medida referenciada com [Nome] existe ou é coluna local da expressão', () => {
  const measures = new Set(SPEC.tables.flatMap(t => (t.measures ?? []).map(m => m.name)));
  for (const { where, dax } of daxSources) {
    const local = new Set([...dax.matchAll(/"([@A-Za-z_][\w@]*)"\s*,/g)].map(x => x[1]));
    for (const [, name] of dax.matchAll(/(?<![\w\]])\[([^\]]+)\]/g))
      assert.ok(measures.has(name) || local.has(name) || name === 'Date', `${where}: [${name}] não é medida nem coluna local`);
  }
});

test('relacionamentos ligam colunas existentes', () => {
  for (const [name, from, to] of SPEC.relationships)
    for (const ref of [from, to]) {
      const [table, column] = ref.split('.');
      assert.ok(columnsOf.get(table)?.has(column), `${name}: ${ref} inexistente`);
    }
});

test('registros sintéticos e materiais de teste ficam fora do modelo', () => {
  const sources = Object.fromEntries([...SPEC.tables.map(t => [t.name, t.partition.source]), ...SPEC.expressions.map(e => [e.name, e.source])]);
  for (const name of ['ItensBase', 'Orcamentos', 'Historico']) assert.match(sources[name], /HOMOLOG-3P/, `${name} sem filtro HOMOLOG-3P`);
  assert.match(sources.Materiais, /\[Tipo_Registro\] <> "TESTE"/);
  assert.match(sources.Itens, /ItensBase/);
  assert.match(sources.CorrecoesCampos, /ItensBase/);
});

test('cópia do repositório só tem marcadores e a geração é determinística', () => {
  const a = mkdtempSync(path.join(os.tmpdir(), 'pbip-a-'));
  const b = mkdtempSync(path.join(os.tmpdir(), 'pbip-b-'));
  try {
    build(path.join(a, PROJECT));
    build(path.join(b, PROJECT));
    const first = readTree(path.join(a, PROJECT));
    assert.deepEqual(first, readTree(path.join(b, PROJECT)));
    const all = first.map(([, text]) => text).join('\n');
    for (const value of Object.values(PLACEHOLDERS)) assert.ok(all.includes(value), `marcador ${value} ausente`);
    assert.doesNotMatch(all, /\.sharepoint\.com\/sites\/(?!SEU-SITE)/i);
    assert.doesNotMatch(all, /[0-9a-f]{8}-(?!0000-0000-0000-0000)[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'GUID real de lista no repositório');
    assert.ok(first.some(([file]) => file.endsWith(path.join('definition', 'tables', '_Medidas.tmdl'))));
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test('a versão gerada no repositório está atualizada com o gerador', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pbip-c-'));
  try {
    build(path.join(tmp, PROJECT));
    const committed = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), PROJECT);
    assert.deepEqual(readTree(path.join(tmp, PROJECT)), readTree(committed), 'rode: node system/analytics/powerbi/gerar-pbip.mjs');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
