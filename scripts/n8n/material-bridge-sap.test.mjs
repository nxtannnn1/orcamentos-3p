import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { bridgePolicy } from './material-bridge.mjs';
import { planPolicy } from './material-bridge-plan.mjs';
import { buildWorkflow, DEFAULT_CONFIG } from './build-material-bridge-sap.mjs';
import { runWorkflow, mockGraph } from './n8n-sim.mjs';

// Fixtures: technical data from the SAP 610096 reference case; SharePoint IDs and ETags are synthetic.
const base = bridgePolicy();
const plan = planPolicy(base);
const CAT = 'SYN-CATALOGO', OFI = 'SYN-OFICIAIS';
const CONFIG = { ...DEFAULT_CONFIG, site: 'SYN-SITE', listas: { CATALOGO_NEOENERGIA: CAT, MATERIAIS_OFICIAIS: OFI }, escrita_habilitada: true };
const DESC = 'BANCO CAPAC COMPAC FI 14,5KV 25KA 4,8MVA';
const bank = (id, Fornecedor, fields = {}) => ({ id: String(id), eTag: `"syn-cat-${id},1"`, fields: {
  Title: DESC, Codigo_Nordeste: '610096', Codigo_Elektro: '36635', Codigo_Brasilia: '13050016', Descricao: DESC,
  Especificacao_Tecnica: 'DIS-ETE-028', Familia: 'CAPACITORES_E_BANCOS', SubFamilia: 'Banco de Capacitor',
  Fornecedor, Status_Homologacao: 'Homologado', Fonte: 'NEOENERGIA_SUBESTACOES', Material_OficialLookupId: null, ...fields } });
const three = (fields = {}) => [bank(9005, 'FABRICANTE SINTETICO A', fields), bank(9060, 'FABRICANTE SINTETICO B', fields), bank(9096, 'FABRICANTE SINTETICO C', fields)];
const official = (fields = {}) => ({ id: '7134', eTag: '"syn-ofi-7134,3"', fields: { Title: DESC, Material: DESC, Descricao_Neoenergia: DESC,
  Nome_Normalizado: base.normalize(DESC), Especificacao_Tecnica: 'DIS-ETE-028', Subfamilia: 'Banco de Capacitor',
  Codigo_Neoenergia: '610096', Codigo_Elektro: '36635', Codigo_Brasilia: '13050016',
  Familia: 'CAPACITORES_E_BANCOS', Status: 'ATIVO', Tipo_Registro: 'MATERIAL', Revisao_Obrigatoria: false, ...fields } });
const graphOf = (catalog, officials = []) => mockGraph({ lists: { [CAT]: catalog, [OFI]: officials }, unique: { [OFI]: ['Codigo_Neoenergia'] } });
const START = 'TRIGGER - Execução por outro workflow';
async function run(graph, input, config = CONFIG) {
  const writesBefore = graph.writes().length;
  const { output, executed } = await runWorkflow(buildWorkflow({ config }), START, [input], graph);
  assert.equal(output.length >= 1, true, 'every path must reach SAIDA - Relatório');
  if ((input.modo ?? 'PREPARAR') === 'PREPARAR') assert.equal(graph.writes().length, writesBefore, 'PREPARAR must never write');
  return { out: output[0], all: output, executed };
}
const prepare = (graph, codigo_sap = '610096', extra = {}) => run(graph, { modo: 'PREPARAR', codigo_sap, ...extra });
const apply = (graph, hash, extra = {}, config) => run(graph, { modo: 'APLICAR', codigo_sap: '610096',
  aprovacao: { plano_hash: hash, aprovado_por: 'revisor.sintetico', confirmacao: 'APLICAR_PLANO' }, ...extra }, config);
const lookups = graph => [...graph.state[CAT].values()].map(r => r.fields.Material_OficialLookupId);

test('1: SAP 610096 with three manufacturers creates one official and links all three', async () => {
  const graph = graphOf(three());
  const { out: prep } = await prepare(graph);
  assert.equal(prep.status, 'PREPARADO');
  assert.equal(prep.motivo, 'AGUARDANDO_APROVACAO_HUMANA');
  assert.deepEqual(prep.plano.operacoes.map(o => o.tipo), ['CRIAR_MATERIAL_OFICIAL', 'ASSOCIAR_CATALOGO', 'ASSOCIAR_CATALOGO', 'ASSOCIAR_CATALOGO']);
  const post = prep.plano.material_oficial.fields_post;
  assert.equal(post.Familia, 'CAPACITORES_E_BANCOS');
  assert.equal(post.Revisao_Obrigatoria, true);
  // Administrative fields: confirmed Choices only, never ATIVO; Origem_Catalogo stays for human review.
  assert.equal(post.Status, 'PENDENTE_REVISAO');
  assert.equal(post.Tipo_Registro, 'MATERIAL');
  assert.equal(post.Unidade_Padrao, 'UN');
  assert.equal(post.Chave_Normalizada, 'NEOENERGIA_610096');
  assert.equal('Origem_Catalogo' in post, false);
  assert.equal(post.Nome_Normalizado, 'BANCO CAPAC COMPAC FI 14,5 KV 25 KA 4,8 MVA');
  const { out } = await apply(graph, prep.plano_hash);
  assert.equal(out.status, 'CONCLUIDO');
  assert.equal(out.material_oficial.criado_nesta_execucao, true);
  assert.equal(graph.writes().filter(c => c.method === 'POST').length, 1);
  assert.equal(graph.writes().filter(c => c.method === 'PATCH').length, 3);
  const id = out.material_oficial.id;
  assert.deepEqual(lookups(graph), [String(id), String(id), String(id)]);
  assert.deepEqual([...graph.state[CAT].values()].map(r => r.fields.Fornecedor), ['FABRICANTE SINTETICO A', 'FABRICANTE SINTETICO B', 'FABRICANTE SINTETICO C']);
  for (const c of graph.writes().filter(c => c.method === 'PATCH')) {
    assert.match(c.headers['If-Match'], /^"syn-cat-\d+,1"$/);
    assert.deepEqual(c.body, { Material_OficialLookupId: String(id) });
  }
});

test('2: repeated execution of SAP 610096 never creates a duplicate', async () => {
  const graph = graphOf(three());
  const { out: prep } = await prepare(graph);
  await apply(graph, prep.plano_hash);
  const { out: again } = await prepare(graph);
  assert.equal(again.status, 'SEM_ALTERACAO');
  assert.equal(again.motivo, 'JA_CONSOLIDADO');
  const { out: replay } = await apply(graph, prep.plano_hash);
  assert.notEqual(replay.status, 'AUTORIZADO');
  assert.equal(graph.writes().filter(c => c.method === 'POST').length, 1);
  assert.equal(graph.state[OFI].size, 1);
});

test('2b: lost POST response is not replayed and the next PREPARAR protects the new record', async () => {
  const graph = graphOf(three()).on({ method: 'POST', throwAfter: true, times: 1 });
  const { out: prep } = await prepare(graph);
  const { out } = await apply(graph, prep.plano_hash);
  assert.equal(out.motivo, 'CRIACAO_NAO_CONFIRMADA');
  assert.equal(graph.writes().filter(c => c.method === 'PATCH').length, 0);
  const { out: next } = await prepare(graph);
  assert.equal(next.motivo, 'MATERIAL_OFICIAL_PROTEGIDO');
  assert.equal(graph.state[OFI].size, 1);
});

test('2c: concurrent creation is stopped by the unique Codigo_Neoenergia (409)', async () => {
  const graph = graphOf(three());
  const { out: prep } = await prepare(graph);
  graph.on({ method: 'POST', times: 1, before: state => state[OFI].set('9999', { id: '9999', eTag: '"x,1"', fields: { Codigo_Neoenergia: '610096' } }) });
  const { out } = await apply(graph, prep.plano_hash);
  assert.equal(out.motivo, 'CRIACAO_CONFLITO_DUPLICIDADE');
  assert.equal(graph.writes().filter(c => c.method === 'PATCH').length, 0);
});

test('3: existing official with correct links needs no change', async () => {
  const graph = graphOf(three({ Material_OficialLookupId: '7134' }), [official()]);
  const { out } = await prepare(graph);
  assert.equal(out.status, 'SEM_ALTERACAO');
  assert.equal(out.material_oficial_id, 7134);
});

// E2E 2026-10-27 shape: official 134 created by the old published bridge (legacy payload:
// ATIVO/MATERIAL/Revisao false, UN, legacy Nome_Normalizado/Chave_Normalizada; Familia fixed by hand)
// and catalog rows 5/60/96 linked through Material_OficialLookupId, returned by Graph as a string.
const e2eRows = (lookup = '134') => [bank(5, 'FABRICANTE SINTETICO A'), bank(60, 'FABRICANTE SINTETICO B'), bank(96, 'FABRICANTE SINTETICO C')]
  .map(r => ({ ...r, fields: { ...r.fields, Material_OficialLookupId: lookup } }));
const e2eOfficial = (fields = {}) => ({ id: '134', eTag: '"syn-ofi-134,4"', fields: { Title: DESC, Material: DESC, Descricao_Neoenergia: DESC,
  Nome_Normalizado: 'BANCO CAPAC COMPAC FI 14.5 KV 25 KA 4.8 MVA', Chave_Normalizada: 'NEOENERGIA_610096',
  Codigo_Neoenergia: '610096', Codigo_Elektro: '36635', Codigo_Brasilia: '13050016', Especificacao_Tecnica: 'DIS-ETE-028',
  Subfamilia: 'Banco de Capacitor', Familia: 'CAPACITORES_E_BANCOS', Categoria: 'CAPACITORES_E_BANCOS', Unidade_Padrao: 'UN',
  Status: 'ATIVO', Tipo_Registro: 'MATERIAL', Revisao_Obrigatoria: false, ...fields } });

test('E2E 610096: rerun returns official 134, recognizes the three links and proposes nothing', async () => {
  const variants = [
    [{}, 'JA_CONSOLIDADO', []],
    // The old PREP read lower-case keys, so 134 may lack these values.
    [{ Especificacao_Tecnica: '', Subfamilia: '' }, 'JA_CONSOLIDADO_COM_DIVERGENCIAS', ['Especificacao_Tecnica:AUSENTE_NO_OFICIAL', 'Subfamilia:AUSENTE_NO_OFICIAL']],
    [{ Revisao_Obrigatoria: true, Status: 'EM_REVISAO_SINTETICO' }, 'JA_CONSOLIDADO', []],
    [{ Familia: 'CAPACITORES' }, 'JA_CONSOLIDADO_COM_DIVERGENCIAS', ['Familia:DIFERENTE_DA_SUGESTAO', 'Familia:CHOICE_NAO_CONFIRMADO']],
    [{ Material: DESC.replace('14,5KV', '14.5KV') }, 'JA_CONSOLIDADO_COM_DIVERGENCIAS', ['Material:TEXTO_DIVERGENTE']],
    [{ Codigo_Elektro: '' }, 'JA_CONSOLIDADO_COM_DIVERGENCIAS', ['Codigo_Elektro:AUSENTE_NO_OFICIAL']]
  ];
  for (const [fields, motivo, divergencias] of variants) {
    const graph = graphOf(e2eRows(), [e2eOfficial(fields)]);
    const { out } = await prepare(graph);
    assert.equal(out.status, 'SEM_ALTERACAO', JSON.stringify(fields));
    assert.equal(out.motivo, motivo);
    assert.equal(out.material_oficial_id, 134);
    assert.equal(out.material_oficial.etag, '"syn-ofi-134,4"');
    assert.deepEqual(out.registros.map(r => [r.catalogo_item_id, r.lookup_atual, r.fornecedor]),
      [[5, 134, 'FABRICANTE SINTETICO A'], [60, 134, 'FABRICANTE SINTETICO B'], [96, 134, 'FABRICANTE SINTETICO C']]);
    assert.deepEqual(out.operacoes, []);
    assert.equal(out.plano_hash, undefined);
    assert.deepEqual(out.divergencias.map(d => `${d.campo}:${d.tipo}`), divergencias);
    // Even APLICAR with an approval cannot write when nothing is proposed.
    const { out: applied } = await apply(graph, 'a'.repeat(64));
    assert.equal(applied.status, 'SEM_ALTERACAO');
    assert.equal(graph.writes().length, 0);
    assert.deepEqual(graph.calls.map(c => c.method), ['GET', 'GET', 'GET', 'GET']);
  }
});

test('E2E 610096: code conflict on the linked official is reported, never rewritten', async () => {
  const graph = graphOf(e2eRows(), [e2eOfficial({ Codigo_Brasilia: '99999999' })]);
  const { out } = await prepare(graph);
  assert.equal(out.motivo, 'JA_CONSOLIDADO_COM_DIVERGENCIAS');
  assert.deepEqual(out.divergencias, [{ campo: 'Codigo_Brasilia', tipo: 'CONFLITO_CODIGO' }]);
  assert.equal(out.revisao_humana_obrigatoria, true);
  assert.equal(graph.writes().length, 0);
});

test('E2E 610096: links to an official the search cannot find never trigger a POST', async () => {
  const hidden = e2eOfficial({ Codigo_Neoenergia: '', Codigo_Elektro: '', Codigo_Brasilia: '', Nome_Normalizado: 'LEGADO' });
  const graph = graphOf(e2eRows(), [hidden]);
  const { out } = await prepare(graph);
  assert.equal(out.motivo, 'VINCULADO_A_MATERIAL_NAO_LOCALIZADO');
  assert.equal(out.material_oficial_id, 134);
  const { out: applied } = await apply(graph, 'a'.repeat(64));
  assert.equal(applied.status, 'BLOQUEADO');
  assert.equal(graph.writes().length, 0);
});

test('E2E 610096: a new manufacturer row is linked to 134 only when the identity is proven', async () => {
  const rows = [...e2eRows(), bank(140, 'FABRICANTE SINTETICO D')];
  const full = await prepare(graphOf(rows, [e2eOfficial()]));
  assert.equal(full.out.status, 'PREPARADO');
  assert.deepEqual(full.out.plano.operacoes, [{ tipo: 'ASSOCIAR_CATALOGO', catalogo_item_id: 140, if_match: '"syn-cat-140,1"',
    material_oficial_id: 134, fornecedor: 'FABRICANTE SINTETICO D' }]);
  assert.deepEqual(full.out.plano.ja_associados, [5, 60, 96]);
  const legacy = await prepare(graphOf(rows, [e2eOfficial({ Especificacao_Tecnica: '' })]));
  assert.equal(legacy.out.motivo, 'DIVERGENCIA_TECNICA');
});

test('4: existing official without links is reused, never recreated', async () => {
  const graph = graphOf(three(), [official()]);
  const { out: prep } = await prepare(graph);
  assert.equal(prep.motivo, 'AGUARDANDO_APROVACAO_HUMANA');
  assert.deepEqual(prep.plano.material_oficial, { acao: 'REUTILIZAR', id: 7134, etag: '"syn-ofi-7134,3"' });
  const { out } = await apply(graph, prep.plano_hash);
  assert.equal(out.status, 'CONCLUIDO');
  assert.equal(graph.writes().filter(c => c.method === 'POST').length, 0);
  assert.deepEqual(lookups(graph), ['7134', '7134', '7134']);
});

test('4b: partially linked group only links the missing rows', async () => {
  const rows = three(); rows[0].fields.Material_OficialLookupId = '7134';
  const graph = graphOf(rows, [official()]);
  const { out: prep } = await prepare(graph);
  assert.deepEqual(prep.plano.operacoes.map(o => o.catalogo_item_id), [9060, 9096]);
  assert.deepEqual(prep.plano.ja_associados, [9005]);
});

test('5: conflicting codes in catalog or in the official block the plan', async () => {
  const rows = three(); rows[1].fields.Codigo_Elektro = '99999';
  assert.equal((await prepare(graphOf(rows))).out.motivo, 'CONFLITO_CODIGOS_CATALOGO');
  assert.equal((await prepare(graphOf(three(), [official({ Codigo_Elektro: '99999' })]))).out.motivo, 'CONFLITO_CODIGOS');
});

test('6: different description or specification for the same code is ambiguous', async () => {
  for (const field of [{ Especificacao_Tecnica: 'DIS-ETE-029' }, { Descricao: 'BANCO CAPAC COMPAC FI 13,8KV 25KA 4,8MVA' }, { SubFamilia: 'Capacitor Unitario' }]) {
    const rows = three(); Object.assign(rows[2].fields, field);
    const { out } = await prepare(graphOf(rows));
    assert.equal(out.motivo, 'AMBIGUIDADE_TECNICA');
    assert.equal(out.grupos.length, 2);
  }
  assert.equal((await prepare(graphOf(three(), [official({ Especificacao_Tecnica: 'DIS-ETE-029' })]))).out.motivo, 'DIVERGENCIA_TECNICA');
});

test('7: empty input never searches nor produces a fallback identity', async () => {
  for (const codigo of ['', '   ', '0', 'null', "1' or 1 eq 1"]) {
    const graph = graphOf(three());
    const { out } = await prepare(graph, codigo);
    assert.equal(out.motivo, 'CODIGO_SAP_INVALIDO');
    assert.equal(graph.calls.length, 0);
  }
  for (const raw of [{}, { Chave_Normalizada: 'OUTROS' }, { Descricao: ' - ', Familia: 'OUTROS' }, { Descricao: 'OUTROS' }]) {
    const p = base.prepare(raw);
    assert.equal(p.possui_identidade, false, JSON.stringify(raw));
    assert.equal('chave_fallback' in p, false);
    assert.equal(base.decide(p, null).motivo_revisao, 'SEM_IDENTIDADE');
  }
  assert.equal(base.prepare({}).familia_sugerida, null);
  assert.equal((await prepare(graphOf([]))).out.motivo, 'SAP_NAO_ENCONTRADO_NO_CATALOGO');
});

test('8: missing or invalid catalogo_item_id blocks the plan', async () => {
  for (const badId of [null, '', '0', '-5', 'abc']) {
    const rows = three(); rows[1].id = badId;
    assert.equal((await prepare(graphOf(rows))).out.motivo, 'CATALOGO_ITEM_ID_INVALIDO');
  }
  const rows = three(); delete rows[0].eTag;
  assert.equal((await prepare(graphOf(rows))).out.motivo, 'ETAG_CATALOGO_AUSENTE');
});

test('9: lookup linked to another official is protected', async () => {
  const rows = three(); rows[2].fields.Material_OficialLookupId = '555';
  assert.equal((await prepare(graphOf(rows, [official()]))).out.motivo, 'VINCULO_CONFLITANTE');
  assert.equal((await prepare(graphOf(rows))).out.motivo, 'VINCULO_CONFLITANTE');
  const bad = three(); bad[0].fields.Material_OficialLookupId = 'xyz';
  assert.equal((await prepare(graphOf(bad))).out.motivo, 'LOOKUP_INVALIDO');
});

test('10: stale ETag yields conflict without re-applying; source change after approval invalidates the plan', async () => {
  const graph = graphOf(three(), [official()]);
  const { out: prep } = await prepare(graph);
  // Concurrent edit between the revalidation read and the PATCH of one row.
  graph.on({ method: 'PATCH', url: /\/items\/9060\/fields$/, times: 1, before: s => { s[CAT].get('9060').eTag = '"syn-cat-9060,2"'; } });
  const { out } = await apply(graph, prep.plano_hash);
  assert.equal(out.status, 'CONCLUIDO_PARCIAL');
  assert.deepEqual(out.pendentes_revisao, [9060]);
  assert.equal(out.associacoes.find(a => a.catalogo_item_id === 9060).status, 'CONFLITO');
  assert.equal(graph.writes().filter(c => /9060/.test(c.url)).length, 1);

  const g2 = graphOf(three(), [official()]);
  const { out: p2 } = await prepare(g2);
  g2.state[CAT].get('9005').eTag = '"syn-cat-9005,2"';
  g2.state[CAT].get('9005').fields.Descricao = DESC + ' ALTERADO';
  const { out: o2 } = await apply(g2, p2.plano_hash);
  assert.equal(['PLANO_DIVERGENTE_REPREPARAR', 'AMBIGUIDADE_TECNICA'].includes(o2.motivo), true);
  assert.equal(g2.writes().length, 0);
  const g3 = graphOf(three(), [official()]);
  const { out: p3 } = await prepare(g3);
  g3.state[CAT].get('9096').eTag = '"syn-cat-9096,9"';
  assert.equal((await apply(g3, p3.plano_hash)).out.motivo, 'PLANO_DIVERGENTE_REPREPARAR');
  assert.equal(g3.writes().length, 0);
});

test('11: Graph 400/403/404/429 and transport failures never imply absence', async () => {
  for (const status of [400, 403, 404, 429, 500]) {
    const g1 = graphOf(three()).on({ url: new RegExp(`/lists/${CAT}/items$`), status });
    const r1 = (await prepare(g1)).out;
    assert.equal(r1.motivo, 'CONSULTA_CATALOGO_INCOMPLETA');
    assert.equal(r1.http_status, status);
    const g2 = graphOf(three()).on({ url: new RegExp(`/lists/${OFI}/items$`), method: 'GET', status });
    assert.equal((await prepare(g2)).out.motivo, 'CONSULTA_OFICIAIS_INCOMPLETA');
  }
  const g3 = graphOf(three()).on({ url: new RegExp(`/lists/${CAT}/items$`), throwBefore: true });
  assert.equal((await prepare(g3)).out.motivo, 'CONSULTA_CATALOGO_INCOMPLETA');
  for (const status of [400, 403, 404, 429]) {
    const g = graphOf(three(), [official()]);
    const { out: prep } = await prepare(g);
    g.on({ method: 'PATCH', status });
    const { out } = await apply(g, prep.plano_hash);
    assert.equal(out.status, 'FALHOU');
    assert.deepEqual(out.associacoes.map(a => a.motivo), [`HTTP_${status}`, `HTTP_${status}`, `HTTP_${status}`]);
    assert.equal(g.writes().length, 3, 'one attempt per row, no retry');
  }
  const g4 = graphOf(three());
  const { out: p4 } = await prepare(g4);
  g4.on({ method: 'POST', status: 400 });
  assert.equal((await apply(g4, p4.plano_hash)).out.motivo, 'CRIACAO_NAO_CONFIRMADA');
  assert.equal(g4.writes().filter(c => c.method === 'PATCH').length, 0);
  // PATCH applied but response lost: the confirmation read proves the result.
  const g5 = graphOf(three(), [official()]);
  const { out: p5 } = await prepare(g5);
  g5.on({ method: 'PATCH', throwAfter: true, times: 1 });
  const { out: o5 } = await apply(g5, p5.plano_hash);
  assert.equal(o5.associacoes[0].motivo, 'CONFIRMADO_POR_LEITURA_APOS_RESPOSTA_DE_FALHA');
  assert.equal(o5.status, 'CONCLUIDO');
});

test('12: multiple official matches block the plan', async () => {
  const graph = graphOf(three(), [official(), { ...official(), id: '7135', fields: { ...official().fields, Codigo_Neoenergia: '', Codigo_Elektro: '36635' } }]);
  assert.equal((await prepare(graph)).out.motivo, 'MULTIPLOS_OFICIAIS');
});

test('13: pagination or truncated results block the plan', async () => {
  const many = Array.from({ length: 101 }, (_, i) => bank(9200 + i, `FABRICANTE ${i}`));
  assert.equal((await prepare(graphOf(many))).out.motivo, 'CONSULTA_CATALOGO_INCOMPLETA');
  assert.equal(plan.agrupar({ codigo_sap: '610096', campo_codigo: 'Codigo_Nordeste' }, { statusCode: 200, body: { value: [] , '@odata.nextLink': 'x' } }).motivo, 'CONSULTA_CATALOGO_INCOMPLETA');
  assert.equal(plan.agrupar({ codigo_sap: '610096', campo_codigo: 'Codigo_Nordeste' }, { statusCode: 200, body: {} }).motivo, 'CONSULTA_CATALOGO_INCOMPLETA');
  // A server that ignores the filter must not leak another code into the group.
  const wrong = three(); wrong[0].fields.Codigo_Nordeste = '610097';
  assert.equal(plan.agrupar({ codigo_sap: '610096', campo_codigo: 'Codigo_Nordeste' }, { statusCode: 200, body: { value: wrong } }).motivo, 'RESPOSTA_CATALOGO_INCONSISTENTE');
});

test('14: Choice values must be confirmed; ATIVO is never set on creation', async () => {
  const cases = [
    [{ ...CONFIG, choices_confirmados: { Familia: [] } }, 'CHOICE_NAO_CONFIRMADO'],
    [{ ...CONFIG, valores_novo_material: { Status: 'PENDENTE' } }, 'CHOICE_NAO_CONFIRMADO'],
    [{ ...CONFIG, choices_confirmados: { Familia: ['CAPACITORES_E_BANCOS'], Status: ['ATIVO'] }, valores_novo_material: { Status: 'ATIVO' } }, 'STATUS_ATIVO_PROIBIDO_NA_CRIACAO'],
    [{ ...CONFIG, valores_novo_material: { Revisao_Obrigatoria: false } }, 'CAMPO_NAO_PERMITIDO']
  ];
  for (const [config, motivo] of cases) {
    const { out } = await run(graphOf(three()), { modo: 'PREPARAR', codigo_sap: '610096' }, config);
    assert.equal(out.motivo, motivo);
  }
  const ok = { ...CONFIG, choices_confirmados: { Familia: ['CAPACITORES_E_BANCOS'], Status: ['EM_REVISAO'] }, valores_novo_material: { Status: 'EM_REVISAO' } };
  assert.equal((await run(graphOf(three()), { codigo_sap: '610096' }, ok)).out.plano.material_oficial.fields_post.Status, 'EM_REVISAO');
  const none = { ...CONFIG, valores_novo_material: {} };
  const bare = (await run(graphOf(three()), { codigo_sap: '610096' }, none)).out.plano.material_oficial.fields_post;
  assert.deepEqual(['Status', 'Tipo_Registro', 'Unidade_Padrao'].filter(k => k in bare), []);
  const cable = three({ Descricao: 'CABO COBRE NU 16MM2', Familia: 'CABOS' });
  assert.equal((await prepare(graphOf(cable))).out.motivo, 'CHOICE_NAO_CONFIRMADO');
  const other = three({ Descricao: 'PECA SINTETICA XYZ', Familia: '' });
  assert.equal((await prepare(graphOf(other))).out.motivo, 'FAMILIA_NAO_CLASSIFICADA');
});

test('14: the confirmation GET must read back the administrative fields and never ATIVO', () => {
  const fields = { Material: DESC, Especificacao_Tecnica: 'DIS-ETE-028', Codigo_Neoenergia: '610096', Revisao_Obrigatoria: true,
    Status: 'PENDENTE_REVISAO', Tipo_Registro: 'MATERIAL', Unidade_Padrao: 'UN', Chave_Normalizada: 'NEOENERGIA_610096' };
  const confirm = (read, expected = fields) => plan.confirmarCriacao({ fields_post: expected }, { material_oficial_id: 7200 },
    { statusCode: 200, body: { id: '7200', fields: { ...fields, ...read } } }).status;
  assert.equal(confirm({}), 'CONFIRMADO');
  for (const read of [{ Status: 'ATIVO' }, { Status: undefined }, { Tipo_Registro: 'TESTE' }, { Unidade_Padrao: 'M' }, { Chave_Normalizada: '' }]) {
    assert.equal(confirm(read), 'BLOQUEADO', JSON.stringify(read));
  }
  // A material created without optional fields is still confirmed, unless SharePoint defaulted it to ATIVO.
  const { Status, Tipo_Registro, Unidade_Padrao, Chave_Normalizada, ...minimal } = fields;
  assert.equal(confirm({ Status: undefined, Tipo_Registro: undefined, Unidade_Padrao: undefined, Chave_Normalizada: undefined }, minimal), 'CONFIRMADO');
  assert.equal(confirm({ Status: 'ATIVO' }, minimal), 'BLOQUEADO');
});

for (const [input, expected] of [['14,5KV', '14,5 KV'], ['25KA', '25 KA'], ['4,8MVA', '4,8 MVA'], ['1.000 daN', '1.000 DAN'],
  ['0,6/1 kV', '0,6/1 KV'], ['1.000daN', '1.000 DAN'], ['300 ± 0,5 mm', '300 ± 0,5 MM'], ['2,5x1,2m', '2,5 X 1,2 M'], [DESC, 'BANCO CAPAC COMPAC FI 14,5 KV 25 KA 4,8 MVA']]) {
  test(`15: normalization preserves ${input}`, () => assert.equal(base.normalize(input), expected));
}
for (const description of ['BANCO CAPAC COMPAC FI 14,5KV', 'BANCO DE CAPACITORES 13,8 KV', 'CAPACITOR 200 KVAR', 'Banco de capacitor', 'CAPAC 100 KVAR']) {
  test(`15: ${description} is CAPACITORES_E_BANCOS`, () => assert.equal(base.classify(description), 'CAPACITORES_E_BANCOS'));
}
test('15: accessories for capacitor banks keep their own family', () => {
  assert.equal(base.classify('CHAVE FUSIVEL P/ BANCO DE CAPACITORES'), 'PROTECAO_ELETRICA');
  assert.equal(base.classify('CHAVE SECCIONADORA P/ BANCO CAPAC'), 'CHAVES_SECCIONADORAS');
});

test('safety: writes require environment switch and explicit approval', async () => {
  const graph = graphOf(three());
  const { out: prep } = await prepare(graph);
  assert.equal((await apply(graph, prep.plano_hash, {}, { ...CONFIG, escrita_habilitada: false })).out.motivo, 'ESCRITA_DESABILITADA_NO_AMBIENTE');
  for (const aprovacao of [null, {}, { plano_hash: prep.plano_hash, aprovado_por: 'revisor.sintetico' },
    { plano_hash: prep.plano_hash, confirmacao: 'APLICAR_PLANO' }, { plano_hash: 'abc', aprovado_por: 'revisor.sintetico', confirmacao: 'APLICAR_PLANO' }]) {
    assert.equal((await run(graph, { modo: 'APLICAR', codigo_sap: '610096', aprovacao })).out.motivo, 'APROVACAO_AUSENTE_OU_INVALIDA');
  }
  assert.equal((await run(graph, { modo: 'APLICAR', codigo_sap: '610096', aprovacao: { plano_hash: 'f'.repeat(64), aprovado_por: 'revisor.sintetico', confirmacao: 'APLICAR_PLANO' } })).out.motivo, 'PLANO_DIVERGENTE_REPREPARAR');
  assert.equal(graph.writes().length, 0);
  assert.equal((await run(graphOf(three()), { codigo_sap: '610096' }, DEFAULT_CONFIG)).out.motivo, 'CONFIG_AMBIENTE_PENDENTE');
  assert.equal((await run(graphOf(three()), { modo: 'APAGAR', codigo_sap: '610096' })).out.motivo, 'MODO_INVALIDO');
});

test('safety: Elektro and Brasília can be the entry code without assuming Nordeste', async () => {
  const rows = three({ Codigo_Nordeste: '' });
  const { out } = await run(graphOf(rows), { codigo_sap: '36635', campo_codigo: 'Codigo_Elektro' });
  assert.equal(out.status, 'PREPARADO');
  assert.equal('Codigo_Neoenergia' in out.plano.material_oficial.fields_post, false);
  assert.equal('Chave_Normalizada' in out.plano.material_oficial.fields_post, false);
  assert.equal(out.plano.material_oficial.fields_post.Codigo_Brasilia, '13050016');
});

test('hash: pure SHA-256 equals node:crypto and is order independent', () => {
  for (const s of ['', 'abc', 'ação 14,5 kV ±', 'x'.repeat(200), '😀']) {
    assert.equal(plan.sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'));
  }
  assert.equal(plan.canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), plan.canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

test('export equals builder, is inactive, sanitized and uses explicit write contracts', () => {
  const file = new URL('../../system/automation/n8n/workflow-ponte-materiais-sap-r02.json', import.meta.url);
  const raw = fs.readFileSync(file, 'utf8');
  const w = JSON.parse(raw);
  assert.deepEqual(w, buildWorkflow());
  assert.equal(w.active, false);
  assert.doesNotMatch(raw, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(raw, /\.sharepoint\.com|b![A-Za-z0-9_-]{20,}|login\.microsoftonline|"escrita_habilitada": true/);
  assert.equal(w.nodes.some(n => n.credentials), false);
  const http = w.nodes.filter(n => n.type.endsWith('.httpRequest'));
  for (const n of http) {
    assert.equal(n.parameters.authentication, 'genericCredentialType');
    assert.equal(n.parameters.options.response.response.neverError, true);
  }
  const writes = http.filter(n => n.parameters.method && n.parameters.method !== 'GET');
  assert.deepEqual(writes.map(n => [n.name, n.parameters.method]), [['POST - Criar Material Oficial', 'POST'], ['PATCH - Associar Material_Oficial', 'PATCH']]);
  for (const n of writes) assert.equal(n.retryOnFail, false);
  const patch = writes[1];
  assert.deepEqual(patch.parameters.headerParameters.parameters, [{ name: 'If-Match', value: '={{ $json.if_match }}' }]);
  assert.equal(patch.parameters.jsonBody, '={{ $json.fields_patch }}');
  assert.doesNotMatch(raw, /If-Match[^\n]*\*/);
  // Writes are reachable only through the authorization gate.
  const into = name => Object.entries(w.connections).filter(([, c]) => c.main.flat().some(e => e.node === name)).map(([from]) => from);
  assert.deepEqual(into('POST - Criar Material Oficial'), ['IF - Requer criação?']);
  assert.deepEqual(into('IF - Requer criação?'), ['IF - Escrita autorizada?']);
  assert.deepEqual(into('PATCH - Associar Material_Oficial'), ['OPS - Preparar associações']);
  assert.deepEqual(into('OPS - Preparar associações').sort(), ['IF - Material confirmado?', 'IF - Requer criação?']);
});
