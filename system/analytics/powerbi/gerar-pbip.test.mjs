// Run: node --test system/analytics/powerbi/gerar-pbip.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { build, PLACEHOLDERS, PROJECT, SPEC } from './gerar-pbip.mjs';
import { pageVisuals, visualFields } from './visuais.mjs';

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

test('todo campo usado nos visuais existe no modelo (medida ou coluna)', () => {
  const measureNames = new Set(SPEC.tables.flatMap(t => (t.measures ?? []).map(m => m.name)));
  const fields = visualFields();
  assert.ok(fields.length > 60, `poucos campos nos visuais: ${fields.length}`);
  for (const f of fields) {
    if (f.Measure) assert.ok(measureNames.has(f.Measure.Property), `medida inexistente: ${f.Measure.Property}`);
    else assert.ok(columnsOf.get(f.Column.Expression.SourceRef.Entity)?.has(f.Column.Property), `coluna inexistente: ${JSON.stringify(f.Column)}`);
  }
});

test('cada página tem título, segmentações e visuais de conteúdo com nomes únicos', () => {
  const pagesV = pageVisuals();
  assert.equal(pagesV.length, SPEC.pages.length);
  const names = pagesV.flat().map(v => v.name);
  assert.equal(new Set(names).size, names.length);
  for (const visuals of pagesV) {
    const types = visuals.map(v => v.visual.visualType);
    assert.equal(types[0], 'textbox');
    assert.equal(types.filter(t => t === 'slicer').length, 4);
    assert.ok(types.filter(t => !['textbox', 'slicer'].includes(t)).length >= 2);
    for (const v of visuals) assert.ok(v.position.x + v.position.width <= 1280 && v.position.y + v.position.height <= 720, `${v.name} fora da página`);
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

// Regression (23/10/2026): Web.Contents(<url ending in /sites/<name.with.dot>>, [RelativePath]) made the Power Query
// SharePoint module call ".../sites/<name_with_underscore>/_api/contextinfo" (404). The base must be the tenant root.
test('Web.Contents usa a raiz do tenant como base e o site no RelativePath', () => {
  const fn = SPEC.expressions.find(e => e.name === 'fnLerLista').source;
  assert.match(fn, /Web\.Contents\(\s*SharePointRaiz\s*,/);
  assert.match(fn, /RelativePath = SiteCaminho & "\/_api\/web\/lists\(guid'"/);
  assert.doesNotMatch(fn, /SiteUrl/);
  assert.match(PLACEHOLDERS.SharePointRaiz, /^https:\/\/[^/]+\.sharepoint\.com$/);
  assert.match(PLACEHOLDERS.SiteCaminho, /^sites\/[^/]+$/);
  assert.ok(!SPEC.expressions.some(e => e.name === 'SiteUrl'));
});

// Regression (23/10/2026): Desktop 2.159 showed "Falha ao carregar o relatório" for the legacy single-file report.json.
test('relatório no formato PBIR com as 7 páginas e os temas registrados', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pbip-r-'));
  try {
    build(path.join(tmp, PROJECT));
    const rep = path.join(tmp, PROJECT, `${PROJECT}.Report`);
    const json = file => JSON.parse(readFileSync(path.join(rep, file), 'utf8'));
    assert.equal(json('definition.pbir').version, '4.0');
    assert.throws(() => readFileSync(path.join(rep, 'report.json')), /ENOENT/);
    const report = json('definition/report.json');
    const pages = json('definition/pages/pages.json');
    assert.equal(pages.pageOrder.length, 7);
    for (const id of pages.pageOrder) assert.equal(json(`definition/pages/${id}/page.json`).name, id);
    for (const pkg of report.resourcePackages)
      for (const item of pkg.items) {
        const folder = pkg.type === 'SharedResources' ? 'SharedResources' : 'RegisteredResources';
        assert.ok(JSON.parse(readFileSync(path.join(rep, 'StaticResources', folder, item.path), 'utf8')).name, `${item.path} ausente`);
      }
    assert.equal(report.themeCollection.customTheme.name, 'tema-3P-Energia.json');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
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
    assert.doesNotMatch(all, /\/\/(?!SEU-TENANT\.)[a-z0-9-]+\.sharepoint\.com/i);
    assert.doesNotMatch(all, /\bsites\/(?!SEU-SITE\b)[a-z0-9]/i);
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

test('gerar com parâmetros reais dentro do repositório é recusado', () => {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  const real = { ...PLACEHOLDERS, SiteCaminho: 'sites/SEU-SITE-REAL' };
  assert.throws(() => build(path.join(here, 'nao-criar', PROJECT), real), /fora do repositório/);
});

// Guards every file in this folder (scripts, docs, theme, generated PBIP), not only the generator output.
test('a pasta versionada não contém identificadores internos, caminhos pessoais ou segredos', () => {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  const files = readdirSync(here, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && !/[\\/](\.pbi|node_modules)([\\/]|$)/.test(path.join(e.parentPath ?? e.path, e.name)));
  const forbidden = [
    [/\/\/(?!SEU-TENANT\.|<tenant>\.)[a-z0-9-]+\.sharepoint\.com/i, 'host SharePoint real'],
    [/\bsites\/(?!SEU-SITE\b|<site)[a-z0-9]/i, 'caminho de site real'],
    [/[0-9a-f]{8}-(?!0000-0000-0000-0000)[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'GUID real'],
    [/[A-Z]:[\\/]+Users[\\/]+(?!<usuario>)[^\\/\s<]+/i, 'caminho pessoal'],
    [/[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i, 'e-mail'],
    [/client_(?:s)ecret|\bBearer\s+[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,}|[?&]sig=/i, 'credencial ou token'],
  ];
  assert.ok(files.length > 20);
  for (const e of files) {
    const file = path.join(e.parentPath ?? e.path, e.name);
    const text = readFileSync(file, 'utf8');
    for (const [pattern, what] of forbidden) if (pattern.test(text)) assert.fail(`${what} em ${path.relative(here, file)}`);
  }
});
