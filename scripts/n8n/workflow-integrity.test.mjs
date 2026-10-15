import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { validateAutomaticWorkflowPatches } from './workflow-integrity.mjs';

const workflowFile = path.join(
  process.cwd(),
  'system',
  'automation',
  'n8n',
  'workflow-itens-tributos-v0.json'
);

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
