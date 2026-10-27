import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bridgePolicy } from './material-bridge.mjs';
import { buildWorkflow } from './build-material-bridge.mjs';
const policy = bridgePolicy();
const base = { catalogo_item_id: '101', Codigo_Nordeste: '3320060', Descricao: 'ANEL CONC ACC 270X330MM', Especificacao_Tecnica: 'DIS-ETE-094', Fonte: 'NEOENERGIA_REDE' };
const prepared = (extra = {}) => policy.prepare({ ...base, ...extra });
const official = (fields = {}) => ({ id: '201', eTag: '"synthetic-1"', fields: {
  Codigo_Neoenergia: base.Codigo_Nordeste, Material: base.Descricao, Especificacao_Tecnica: base.Especificacao_Tecnica,
  Status: 'ATIVO', Tipo_Registro: 'MATERIAL', Revisao_Obrigatoria: false, ...fields } });
const response = (...rows) => ({ statusCode: 200, body: { value: rows } });
const reason = (p, r) => policy.decide(p, r).motivo_revisao;
test('A: Coelba contract, original preserved, no company inferred', () => {
  const p = prepared();
  assert.equal(p.familia_sugerida, 'ESTRUTURAS_E_FERRAGENS');
  assert.equal(p.entrada_original.Descricao, base.Descricao);
  assert.equal(p.fonte, 'NEOENERGIA_REDE');
  assert.equal(reason(p, response(official())), 'IDENTIDADE_CONFIRMADA_PROPOSTA');
});
test('B: three codes confirm one record; absent NE accepted', () => {
  for (const ne of [base.Codigo_Nordeste, '']) {
    assert.equal(reason(prepared({ Codigo_Nordeste: ne, Codigo_Elektro: 'SYN-EL', Codigo_Brasilia: 'SYN-BR' }),
      response(official({ Codigo_Neoenergia: ne, Codigo_Elektro: 'SYN-EL', Codigo_Brasilia: 'SYN-BR' }))), 'IDENTIDADE_CONFIRMADA_PROPOSTA');
  }
});
test('C: supplier does not change technical identity or approve supplier', () => {
  const a = prepared({ Fornecedor: 'SINTETICO A' }), b = prepared({ Fornecedor: 'SINTETICO B' });
  assert.equal(a.chave_identidade, b.chave_identidade);
  assert.equal(reason(a, response(official())), reason(b, response(official())));
  assert.equal(policy.decide(a, response(official())).escrita_permitida, false);
});
for (const fields of [{ Especificacao_Tecnica: 'DIS-SYN-OTHER' }, { Material: 'ANEL CONC ACC 280X330MM' },
  { Descricao_Neoenergia: 'ANEL CONC ACC 270X350MM' }, { Atributos_Essenciais: 'CLASSE B' }]) {
  test(`D: divergent technical data ${JSON.stringify(fields)}`, () => assert.equal(reason(prepared(), response(official(fields))), 'DIVERGENCIA_TECNICA'));
}
test('E: no code requires review even for exact description', () => {
  assert.equal(reason(prepared({ Codigo_Nordeste: '' }), response(official())), 'IDENTIDADE_INSUFICIENTE');
  assert.equal(reason(policy.prepare({}), null), 'SEM_IDENTIDADE');
});
for (const [input, expected] of [['1.000 daN', '1.000 DAN'], ['0,6/1 kV', '0,6/1 KV'], ['270x330 mm', '270 X 330 MM'],
  ['1.000,50 daN', '1.000,50 DAN'], ['1,000.50 A', '1,000.50 A'], ['16mm²', '16 MM2'], ['10cm', '10 CM'],
  ['12m', '12 M'], ['15kVA', '15 KVA'], ['CLASSE 0,5 ±5%', 'CLASSE 0,5 ±5%'], ['DIS-ETE-094', 'DIS-ETE-094']]) {
  test(`F: preserve ${input}`, () => assert.equal(policy.normalize(input), expected));
}
for (const status of [400, 401, 403, 404, 409, 412, 429, 500, 502, 503]) {
  test(`G: HTTP ${status} cannot imply absence`, () => assert.equal(reason(prepared(), { statusCode: status, body: { value: [] } }), 'CONSULTA_INCOMPLETA'));
}
for (const r of [null, {}, { error: 'timeout' }, { statusCode: 200, body: {} },
  { statusCode: 200, body: { value: [], '@odata.nextLink': 'synthetic-next-page' } }]) {
  test(`incomplete response ${JSON.stringify(r)}`, () => assert.equal(reason(prepared(), r), 'CONSULTA_INCOMPLETA'));
}
test('H: repeated execution is deterministic and never creates', () => {
  for (const r of [response(), response(official())]) {
    assert.deepEqual(policy.decide(prepared(), r), policy.decide(prepared(), r));
    assert.equal(policy.decide(prepared(), r).escrita_permitida, false);
  }
  assert.equal(reason(prepared(), response()), 'NOVO_CANDIDATO_SEM_CADASTRO');
});
test('adapter supports legacy, Graph fields and empty aliases', () => {
  const raw = { id: '101', fields: { ...base, descricao: '', Descricao_Completa: 'DETALHE TECNICO', CNPJ: 'SINTETICO' } };
  const p = policy.prepare(raw);
  assert.equal(p.descricao, base.Descricao);
  assert.equal(p.descricao_completa, 'DETALHE TECNICO');
  assert.deepEqual(p.entrada_original, raw);
  assert.equal(reason(p, response(official())), 'DIVERGENCIA_TECNICA');
  assert.equal(policy.prepare({ codigo_neoenergia: 'SYN-001', descricao: 'CABO', fonte: 'NEOENERGIA_SUBESTACOES' }).codigo_neoenergia, 'SYN-001');
});
test('contradictory aliases are blocked', () => assert.equal(reason(prepared({ codigo_neoenergia: 'SYN-OTHER' }), response()), 'CONFLITO_ALIASES'));
test('codes, duplicates, stale keys and malformed IDs', () => {
  assert.equal(reason(prepared({ Codigo_Elektro: 'SYN-A' }), response(official({ Codigo_Elektro: 'SYN-B' }))), 'CONFLITO_CODIGOS');
  assert.equal(reason(prepared(), response(official(), { ...official(), id: '202' })), 'MULTIPLOS_OFICIAIS');
  assert.equal(reason(prepared(), response(official({ Codigo_Neoenergia: '', Chave_Normalizada: 'OLD' }))), 'CHAVE_LEGADA_REQUER_REVISAO');
  assert.equal(reason(prepared(), response({ ...official(), id: '-1' })), 'RESPOSTA_INVALIDA');
  assert.equal(reason(prepared(), response(official({ Chave_Normalizada: 'OLD' }))), 'IDENTIDADE_CONFIRMADA_PROPOSTA');
});
test('human state is never overwritten', () => {
  for (const f of [{ Status: 'INATIVO' }, { Revisao_Obrigatoria: true }, { Revisao_Obrigatoria: undefined }, { Tipo_Registro: 'OUTRO' }]) {
    assert.equal(reason(prepared(), response(official(f))), 'DECISAO_HUMANA_PROTEGIDA');
  }
});
test('OData quotes escaped and codes preserve zeros', () => {
  const p = prepared({ Codigo_Nordeste: "00'123" });
  assert.ok(p.filtro_identidade_odata.includes("eq '00''123'"));
  assert.equal(p.codigo_neoenergia, "00'123");
});
for (const description of ['POSTE CONCRETO', 'CABO COBRE', 'ELETRODUTO PVC', 'CONECTOR', 'TRAFO', 'DISJUNTOR', 'CHAVE', 'CAPACITOR', 'ISOLADOR', 'ATERRAMENTO']) {
  test(`internal classification ${description}`, () => assert.notEqual(policy.classify(description), 'OUTROS'));
}
test('lookup requires source identity, IDs, ETag and no replacement', () => {
  const d = policy.decide(prepared(), response(official()));
  const source = { statusCode: 200, body: { id: '101', eTag: '"synthetic-source-1"', fields: { ...base, Material_OficialLookupId: null } } };
  assert.equal(policy.association(d, source).proposta_lookup.if_match, '"synthetic-source-1"');
  for (const current of ['999', 'bad', 0]) {
    const r = structuredClone(source); r.body.fields.Material_OficialLookupId = current;
    assert.equal(policy.association(d, r).motivo_associacao, 'LOOKUP_EXISTENTE_PROTEGIDO');
  }
  const repeat = structuredClone(source); repeat.body.fields.Material_OficialLookupId = '201';
  assert.equal(policy.association(d, repeat).motivo_associacao, 'JA_ASSOCIADO');
  const changed = structuredClone(source); changed.body.fields.Descricao = 'OUTRO';
  assert.equal(policy.association(d, changed).motivo_associacao, 'ORIGEM_ALTERADA');
  const missing = structuredClone(source); delete missing.body.eTag;
  assert.equal(policy.association(d, missing).proposta_lookup, null);
  assert.equal(policy.association({ ...d, catalogo_item_id: -1 }, source).proposta_lookup, null);
});
test('export equals builder; graph contains only GET; embedded code preserves item linkage', () => {
  const w = JSON.parse(fs.readFileSync(new URL('../../system/automation/n8n/workflow-ponte-catalogo-materiais-oficiais-r01.json', import.meta.url)));
  assert.deepEqual(w, buildWorkflow());
  assert.equal(w.active, false);
  for (const n of w.nodes.filter(n => n.type.endsWith('.httpRequest'))) {
    assert.equal(n.parameters.method ?? 'GET', 'GET');
    assert.equal(n.onError, 'stopWorkflow');
    assert.equal(n.parameters.options.response.response.fullResponse, true);
  }
  const prep = w.nodes.find(n => n.name.startsWith('PREP - Identidade'));
  const items = new Function('$input', prep.parameters.jsCode)({ all: () => [{ json: base }, { json: { ...base, Codigo_Nordeste: 'SYN-2' } }] });
  assert.equal(items[1].pairedItem.item, 1);
  const resolve = w.nodes.find(n => n.name.startsWith('RESOLVE'));
  const actual = new Function('$', '$json', resolve.parameters.jsCode)(() => ({ item: items[0] }), response(official()));
  assert.deepEqual(actual.json, policy.decide(prepared(), response(official())));
  for (const edges of Object.values(w.connections)) for (const branch of edges.main) for (const edge of branch) assert.ok(w.nodes.some(n => n.name === edge.node));
});
for (const file of ['workflow-carga-redetransmissao-catalogo-neoenergia-r01.json', 'workflow-importar-catalogo-rede-neoenergia.json']) {
  test(`actual caller preparation contract: ${file}`, () => {
    const w = JSON.parse(fs.readFileSync(new URL('../../system/automation/n8n/' + file, import.meta.url)));
    const node = w.nodes.find(n => n.name === '12 - Rede - Preparar');
    const [row] = new Function('items', node.parameters.jsCode)([{ json: {
      Codigo_SAP_NE: '3320060', Codigo_SAP_EKT: 'SYN-EL', Codigo_SAP_NDB: 'SYN-BR',
      Descricao_Sucinta: base.Descricao, Espec_Tecnica: base.Especificacao_Tecnica,
      Descricao_Completa: 'DETALHE SINTETICO', Fornec_razao_social: 'FORNECEDOR SINTETICO'
    } }]);
    const p = policy.prepare(row.json);
    assert.equal(p.codigo_neoenergia, '3320060');
    assert.equal(p.descricao_completa, 'DETALHE SINTETICO');
    assert.equal(p.fonte, 'NEOENERGIA_REDE');
    assert.equal(p.catalogo_item_id, null); // Must be supplied by a future caller after persistence.
    assert.equal(w.nodes.some(n => n.type.endsWith('.executeWorkflow')), false);
  });
}
test('Substations mapping output is accepted; slice and missing caller remain explicit', () => {
  const w = JSON.parse(fs.readFileSync(new URL('../../system/automation/n8n/workflow-carga-catalogo-neoenergia-r01.json', import.meta.url)));
  const node = w.nodes.find(n => n.name === 'Code in JavaScript');
  const rows = new Function('items', node.parameters.jsCode)(Array.from({length: 1501}, () => ({json: { Nordeste: 'SYN-NE', Elektro: 'SYN-EL' }})));
  assert.equal(rows.length, 1);
  const p = policy.prepare(rows[0].json);
  assert.equal(p.codigo_neoenergia, 'SYN-NE');
  assert.equal(p.fonte, 'NEOENERGIA_SUBESTACOES');
  assert.equal(p.catalogo_item_id, null);
  assert.equal(w.nodes.some(n => n.type.endsWith('.executeWorkflow')), false);
});
