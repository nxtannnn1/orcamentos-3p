import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateAutomaticWorkflowPatches } from './workflow-integrity.mjs';

const workflowFile = fileURLToPath(new URL(
  '../../system/automation/n8n/workflow-itens-tributos-v0.json',
  import.meta.url
));

function loadWorkflow() {
  const parsed = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
  return structuredClone(Array.isArray(parsed) ? parsed[0] : parsed);
}

test('workflow exportado isola campos humanos dos PATCHs automaticos', () => {
  assert.deepEqual(validateAutomaticWorkflowPatches(loadWorkflow()), []);
});

test('validador rejeita Observacao_Item reintroduzida no fields_patch', () => {
  const workflow = loadWorkflow();
  const prep = workflow.nodes.find((node) => node.name === 'PREP - Itens1');
  prep.parameters.jsCode = prep.parameters.jsCode.replace(
    '// Campos de revisao humana nunca entram no PATCH automatico.',
    "fieldsPatch.Observacao_Item = texto(entrada.observacao_item);\n\n// Campos de revisao humana nunca entram no PATCH automatico."
  );

  assert.match(validateAutomaticWorkflowPatches(workflow).join('\n'), /Observacao_Item/);
});

test('validador rejeita campo de auditoria e body PATCH fora do contrato', () => {
  const workflow = loadWorkflow();
  const prep = workflow.nodes.find((node) => node.name === 'PREP - Itens');
  const patch = workflow.nodes.find((node) => node.name === 'Patch Item');
  prep.parameters.jsCode = prep.parameters.jsCode.replace(
    'Material_Sugerido: texto(entrada.material_sugerido)',
    "Material_Sugerido: texto(entrada.material_sugerido),\n  DecisionId: texto(entrada.decision_id)"
  );
  patch.parameters.jsonBody = '={{ { Status_Revisao: "PENDENTE" } }}';

  const errors = validateAutomaticWorkflowPatches(workflow).join('\n');
  assert.match(errors, /DecisionId/);
  assert.match(errors, /fields_patch/);
  assert.match(errors, /Status_Revisao/);
});

test('validador rejeita Status_Revisao no PATCH automatico de tributo', () => {
  const workflow = loadWorkflow();
  const prep = workflow.nodes.find((node) => node.name === 'PREP - Tributo1');
  prep.parameters.jsCode = prep.parameters.jsCode.replace(
    'Observacao_Fiscal: texto(entrada.observacao_fiscal)',
    "Observacao_Fiscal: texto(entrada.observacao_fiscal),\n  Status_Revisao: 'PENDENTE'"
  );

  assert.match(validateAutomaticWorkflowPatches(workflow).join('\n'), /Status_Revisao/);
});

test('validador rejeita novo PATCH ou PUT sem cobertura explicita', () => {
  const workflow = loadWorkflow();
  workflow.nodes.push(
    { name: 'Patch desconhecido', parameters: { method: 'PATCH' } },
    { name: 'Upsert desconhecido', parameters: { method: 'PUT' } }
  );

  const errors = validateAutomaticWorkflowPatches(workflow).join('\n');
  assert.match(errors, /Patch desconhecido/);
  assert.match(errors, /Upsert desconhecido/);
});

function runDecision(workflow, suffix, prepared, response) {
  const code = workflow.nodes.find((node) => node.name === `CODE - Decidir Item${suffix}`).parameters.jsCode;
  return new Function('$json', '$', code)(response, () => ({ item: { json: prepared } })).json;
}

function runNormalize(workflow, suffix, decision, response) {
  const code = workflow.nodes.find((node) => node.name === `Normalizar Patch${suffix}`).parameters.jsCode;
  return new Function('$json', '$', code)(response, () => ({ item: { json: decision } }))[0].json;
}

function preparedItem() {
  return {
    codigo_item: 'ITEM-FICTICIO-001',
    codigo_orcamento: 'ORC-FICTICIO',
    orcamento_sharepoint_id: 20,
    fields_patch: {
      Title: 'ITEM-FICTICIO-001',
      Codigo_Item: 'ITEM-FICTICIO-001',
      Quantidade: 2
    },
    tributos: []
  };
}

function existingItem(overrides = {}) {
  return {
    id: '31',
    eTag: '"etag-1"',
    fields: {
      Title: 'ITEM-FICTICIO-001',
      Codigo_Item: 'ITEM-FICTICIO-001',
      Quantidade: 1,
      Status_Revisao: 'PENDENTE',
      Enviado_Historico: 'NAO',
      Correcao_Operacao_Id: null,
      ...overrides
    }
  };
}

for (const suffix of ['', '1']) {
  test(`ramo ${suffix || 'legado'}: POST novo, PATCH condicional e reexecucao sem escrita`, () => {
    const workflow = loadWorkflow();
    const prepared = preparedItem();
    assert.equal(runDecision(workflow, suffix, prepared, { value: [] }).acao_item, 'POST');

    const first = runDecision(workflow, suffix, prepared, { value: [existingItem()] });
    assert.equal(first.acao_item, 'PATCH');
    assert.equal(first.item_etag, '"etag-1"');
    assert.equal(first.item_sharepoint_id, 31);

    const fieldsAfterPatch = { ...existingItem().fields, Quantidade: 2 };
    assert.equal(runNormalize(workflow, suffix, first, fieldsAfterPatch).operacao_item, 'PATCH');
    const repeated = runDecision(workflow, suffix, prepared, {
      value: [{ ...existingItem(fieldsAfterPatch), eTag: '"etag-2"' }]
    });
    assert.equal(repeated.acao_item, 'UNCHANGED');
    assert.equal(runNormalize(workflow, suffix, repeated, repeated).operacao_item, 'UNCHANGED');
  });

  test(`ramo ${suffix || 'legado'}: bloqueia revisao, historico e evidencia de correcao`, () => {
    const workflow = loadWorkflow();
    const prepared = preparedItem();
    for (const status of ['EM_REVISAO', 'CORRIGIR', 'APROVADO', 'REJEITADO', 'DESCONHECIDO']) {
      assert.throws(() => runDecision(workflow, suffix, prepared, {
        value: [existingItem({ Status_Revisao: status })]
      }), /ITEM_AUTOMATIC_UPDATE_BLOCKED/);
    }
    for (const fields of [
      { Enviado_Historico: 'SIM' },
      { Correcao_Operacao_Id: 'operacao-ficticia' },
      { Correcao_Humana_JSON: '{}' },
      { Extracao_Original_JSON: '{}' }
    ]) {
      assert.throws(() => runDecision(workflow, suffix, prepared, {
        value: [existingItem(fields)]
      }), /ITEM_AUTOMATIC_UPDATE_BLOCKED/);
    }
  });

  test(`ramo ${suffix || 'legado'}: lookup ou estado incompleto nunca vira POST/PATCH`, () => {
    const workflow = loadWorkflow();
    const prepared = preparedItem();
    for (const response of [null, {}, { value: null }, { error: 'falha' },
      { value: [], '@odata.nextLink': 'pagina-seguinte' },
      { value: [{ id: '40', fields: { Codigo_Item: 'OUTRO' } }] }]) {
      assert.throws(() => runDecision(workflow, suffix, prepared, response), /ITEM_LOOKUP_INCOMPLETE/);
    }
    assert.throws(() => runDecision(workflow, suffix, prepared, {
      value: [existingItem(), existingItem()]
    }), /ITEM_IDENTITY_CONFLICT/);
    for (const item of [
      { ...existingItem(), eTag: undefined },
      { ...existingItem(), id: null },
      { ...existingItem(), fields: { ...existingItem().fields, Correcao_Operacao_Id: undefined } }
    ]) {
      if (item.fields?.Correcao_Operacao_Id === undefined) delete item.fields.Correcao_Operacao_Id;
      assert.throws(() => runDecision(workflow, suffix, prepared, { value: [item] }),
        /ITEM_STATE_INCOMPLETE/);
    }
    const decision = runDecision(workflow, suffix, prepared, { value: [existingItem()] });
    assert.throws(() => runNormalize(workflow, suffix, decision, {}),
      /ITEM_PATCH_RESPONSE_INCOMPLETE/);
    assert.throws(() => runNormalize(workflow, suffix, decision, { Codigo_Item: prepared.codigo_item }),
      /ITEM_PATCH_RESPONSE_INCOMPLETE/);
  });
}

test('conflito concorrente por ETag e resposta perdida exigem nova leitura', () => {
  const workflow = loadWorkflow();
  const prepared = preparedItem();
  const first = runDecision(workflow, '', prepared, { value: [existingItem()] });
  const concurrent = runDecision(workflow, '', prepared, { value: [existingItem()] });
  const remote = { etag: '"etag-1"', fields: existingItem().fields };
  const conditionalPatch = (decision) => {
    if (decision.item_etag !== remote.etag) return 412;
    remote.fields = { ...remote.fields, ...decision.fields_patch };
    remote.etag = '"etag-2"';
    return 200;
  };
  assert.equal(conditionalPatch(first), 200);
  assert.equal(conditionalPatch(concurrent), 412);
  // Simula resposta HTTP perdida apos commit: a proxima execucao faz GET e nao repete PATCH.
  assert.equal(runDecision(workflow, '', prepared, {
    value: [{ ...existingItem(remote.fields), eTag: remote.etag }]
  }).acao_item, 'UNCHANGED');
});

test('correcao humana entre GET e PATCH invalida ETag e bloqueia reexecucao', () => {
  const workflow = loadWorkflow();
  const prepared = preparedItem();
  const stale = runDecision(workflow, '', prepared, { value: [existingItem()] });
  const remote = {
    ...existingItem({ Status_Revisao: 'EM_REVISAO', Correcao_Operacao_Id: 'operacao-ficticia' }),
    eTag: '"etag-humano"'
  };
  const patch = workflow.nodes.find((node) => node.name === 'Patch Item');
  assert.notEqual(stale.item_etag, remote.eTag);
  assert.deepEqual(patch.parameters.headerParameters.parameters, [
    { name: 'If-Match', value: '={{ $json.item_etag }}' }
  ]);
  assert.equal(patch.retryOnFail, undefined);
  assert.equal(patch.continueOnFail, undefined);
  assert.throws(() => runDecision(workflow, '', prepared, { value: [remote] }),
    /ITEM_AUTOMATIC_UPDATE_BLOCKED/);
});

test('validador rejeita retirada de ETag, guarda, conexao ou retry automatico', () => {
  const workflow = loadWorkflow();
  const patch = workflow.nodes.find((node) => node.name === 'Patch Item1');
  patch.parameters.headerParameters.parameters = [];
  workflow.nodes.find((node) => node.name === 'CODE - Decidir Item').parameters.jsCode = 'return {json:{acao_item:"PATCH"}};';
  workflow.connections['Post Item'] = undefined;
  workflow.nodes.find((node) => node.name === 'LOOKUP - Item por Codigo_Item').retryOnFail = true;
  const errors = validateAutomaticWorkflowPatches(workflow).join('\n');
  assert.match(errors, /If-Match/);
  assert.match(errors, /politica de estado\/ETag/);
  assert.match(errors, /Post Item: conexao esperada/);
  assert.match(errors, /retry\/continuidade/);
});
