import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BASELINE_FILE, evaluate, listFiles, loadBaseline } from './check-policy.mjs';
import {
  compareWithBaseline,
  formatFinding,
  structuralErrors,
  textFindings,
  trackedPathAllowed,
  workflowFindings
} from './workflow-policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = 'system/automation/n8n/workflow-sintetico.json';

// Valores de risco sao montados em tempo de execucao para nao existirem literalmente no repositorio.
const fake = {
  tenantHost: ['contoso-fake', 'sharepoint', 'com'].join('.'),
  onMicrosoft: ['contoso-fake', 'onmicrosoft', 'com'].join('.'),
  email: ['pessoa', 'empresa-fake.com.br'].join('@'),
  jwt: ['eyJ' + 'a'.repeat(12), 'b'.repeat(12), 'c'.repeat(12)].join('.'),
  bearer: 'Bearer ' + 'A1b2'.repeat(6),
  openAiKey: 'sk-' + 'x'.repeat(28),
  privateKey: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  driveId: 'b!' + 'Zx'.repeat(20),
  guid: '1234abcd-1234-4abc-8def-1234567890ab',
  credentialId: 'Ab12Cd34Ef56Gh78',
  n8nHost: ['https://empresa-fake', 'app', 'n8n', 'cloud/webhook/x'].join('.')
};

function sanitizedWorkflow() {
  return {
    name: 'Sintetico',
    active: false,
    pinData: {},
    settings: { executionOrder: 'v1' },
    nodes: [
      { id: fake.guid, name: 'Inicio', type: 'n8n-nodes-base.manualTrigger', parameters: {} },
      {
        id: '2234abcd-1234-4abc-8def-1234567890ab',
        name: 'GET Lista',
        type: 'n8n-nodes-base.httpRequest',
        parameters: {
          url: 'https://graph.microsoft.com/v1.0/sites/SHAREPOINT_SITE_PLACEHOLDER/lists/SHAREPOINT_LIST_PLACEHOLDER/items',
          authentication: 'genericCredentialType',
          sendHeaders: true,
          headerParameters: { parameters: [{ name: 'Authorization', value: '={{ $json.token }}' }] }
        },
        credentials: { oAuth2Api: { id: 'EXAMPLE_N8N_CREDENTIAL_ID', name: 'Graph' } }
      },
      {
        id: '3234abcd-1234-4abc-8def-1234567890ab',
        name: 'Code',
        type: 'n8n-nodes-base.code',
        parameters: { jsCode: "const ref = $node['GET Lista'].json; return [{ json: { contato: 'qa@example.com', ref } }];" }
      }
    ],
    connections: {
      Inicio: { main: [[{ node: 'GET Lista', type: 'main', index: 0 }]] },
      'GET Lista': { main: [[{ node: 'Code', type: 'main', index: 0 }]] }
    }
  };
}

function mutate(change) {
  const workflow = sanitizedWorkflow();
  change(workflow);
  return workflow;
}

const rules = (workflow, file = FILE) => workflowFindings(workflow, file).map((finding) => finding.rule);
const node = (workflow, name) => workflow.nodes.find((entry) => entry.name === name);

test('workflow sanitizado nao gera achados nem erros estruturais', () => {
  assert.deepEqual(workflowFindings(sanitizedWorkflow(), FILE), []);
  assert.deepEqual(structuralErrors(sanitizedWorkflow()), []);
});

test('repositorio atual: todo achado e divida legada registrada e o baseline nao tem entradas obsoletas', () => {
  const { findings, errors } = evaluate(repoRoot, listFiles(repoRoot));
  const { unexpected, stale } = compareWithBaseline(findings, loadBaseline(repoRoot));
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected.map(formatFinding), []);
  assert.deepEqual(stale.map(formatFinding), []);
});

test('workflows versionados possuem estrutura valida', () => {
  const dir = path.join(repoRoot, 'system/automation/n8n');
  for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.json'))) {
    assert.deepEqual(structuralErrors(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))), [], name);
  }
});

const negativeCases = [
  ['N8N_CREDENTIAL_ID', (w) => { node(w, 'GET Lista').credentials.oAuth2Api.id = fake.credentialId; }],
  ['N8N_INSTANCE_ID', (w) => { w.meta = { instanceId: 'f'.repeat(64) }; }],
  ['N8N_ACTIVE', (w) => { w.active = true; }],
  ['N8N_EXECUTION_DATA', (w) => { w.pinData = { Inicio: [{ json: { valor: 1 } }] }; }],
  ['N8N_EXECUTION_DATA', (w) => { w.staticData = { lastId: 10 }; }],
  ['N8N_TENANT_HOST', (w) => { node(w, 'GET Lista').parameters.url = `https://graph.microsoft.com/v1.0/sites/${fake.tenantHost}:/sites/x`; }],
  ['N8N_TENANT_HOST', (w) => { node(w, 'Code').parameters.jsCode = `const tenant = '${fake.onMicrosoft}'; return [];`; }],
  ['N8N_ENDPOINT', (w) => { node(w, 'GET Lista').parameters.url = fake.n8nHost; }],
  ['N8N_ENDPOINT', (w) => { node(w, 'GET Lista').parameters.url = `https://${fake.tenantHost}/sites/x/_api/web`; }],
  ['N8N_ENVIRONMENT_ID', (w) => { node(w, 'GET Lista').parameters.url = `https://graph.microsoft.com/v1.0/sites/SHAREPOINT_SITE_PLACEHOLDER/lists/${fake.guid}/items`; }],
  ['N8N_ENVIRONMENT_ID', (w) => { w.shared = [{ project: { creatorId: fake.guid } }]; }],
  ['N8N_DRIVE_ID', (w) => { node(w, 'GET Lista').parameters.url = `https://graph.microsoft.com/v1.0/drives/${fake.driveId}/root`; }],
  ['N8N_EMAIL', (w) => { node(w, 'Code').parameters.jsCode = `return [{ json: { to: '${fake.email}' } }];`; }],
  ['N8N_SECRET_TOKEN', (w) => { node(w, 'Code').parameters.jsCode = `const t = '${fake.jwt}'; return [];`; }],
  ['N8N_SECRET_TOKEN', (w) => { node(w, 'Code').parameters.jsCode = `const k = '${fake.openAiKey}'; return [];`; }],
  ['N8N_SECRET_TOKEN', (w) => { node(w, 'Code').parameters.jsCode = `const pem = '${fake.privateKey}'; return [];`; }],
  ['N8N_SECRET_TOKEN', (w) => { node(w, 'GET Lista').parameters.url = `https://graph.microsoft.com/v1.0/x?access_token=${'q'.repeat(20)}`; }],
  ['N8N_SECRET_FIELD', (w) => { node(w, 'GET Lista').parameters.headerParameters.parameters[0].value = fake.bearer; }],
  ['N8N_SECRET_FIELD', (w) => { node(w, 'GET Lista').parameters.headerParameters.parameters.push({ name: 'x-api-key', value: 'k'.repeat(20) }); }],
  ['N8N_SECRET_FIELD', (w) => { node(w, 'GET Lista').parameters.password = 'senha-literal'; }],
  ['N8N_TLS_DISABLED', (w) => { node(w, 'GET Lista').parameters.options = { allowUnauthorizedCerts: true }; }],
  ['N8N_RESOURCE_LOCATOR', (w) => { node(w, 'GET Lista').parameters.fileId = { __rl: true, mode: 'list', value: '1AbCdEfGhIjKlMnOp' }; }],
  ['N8N_WEBHOOK_ID', (w) => { node(w, 'Inicio').webhookId = fake.guid; }],
  ['N8N_WEBHOOK_AUTH', (w) => { Object.assign(node(w, 'Inicio'), { type: 'n8n-nodes-base.webhook', parameters: { path: 'entrada' } }); }],
  ['N8N_DANGEROUS_NODE', (w) => { Object.assign(node(w, 'Code'), { type: 'n8n-nodes-base.executeCommand', parameters: { command: 'ls' } }); }],
  ['N8N_DANGEROUS_NODE', (w) => { node(w, 'Code').parameters.jsCode = "const cp = require('child_process'); return [];"; }],
  ['N8N_BROKEN_REFERENCE', (w) => { node(w, 'Code').parameters.jsCode = 'return $items("Node Removido");'; }],
  ['N8N_BROKEN_REFERENCE', (w) => { node(w, 'Code').parameters.jsCode = 'return [$node["Node Removido"].json];'; }]
];

for (const [rule, change] of negativeCases) {
  test(`bloqueia ${rule}: ${change.toString().slice(0, 70)}`, () => {
    assert.ok(rules(mutate(change)).includes(rule), `esperado ${rule}, obtido ${rules(mutate(change)).join(',') || 'nada'}`);
  });
}

test('placeholders, expressoes e dominios reservados nao sao bloqueados', () => {
  const workflow = mutate((w) => {
    w.meta = { instanceId: 'EXAMPLE_N8N_INSTANCE_ID' };
    node(w, 'GET Lista').parameters.url = '={{ $json.nextLink }}';
    node(w, 'GET Lista').parameters.password = '={{ $env.SENHA }}';
    node(w, 'GET Lista').parameters.fileId = { __rl: true, mode: 'id', value: 'GOOGLE_DRIVE_FILE_PLACEHOLDER' };
    node(w, 'Inicio').webhookId = 'EXAMPLE_WEBHOOK_ID';
    node(w, 'Code').parameters.jsCode = "return [{ json: { a: 'dev@example.org', b: 'https://example.sharepoint.com/sites/x' } }];";
  });
  assert.deepEqual(rules(workflow), []);
});

test('diagnostico nunca contem o valor encontrado', () => {
  const workflow = mutate((w) => {
    node(w, 'GET Lista').credentials.oAuth2Api.id = fake.credentialId;
    node(w, 'Code').parameters.jsCode = `const t = '${fake.jwt}'; const e = '${fake.email}'; return [];`;
    node(w, 'GET Lista').parameters.url = `https://${fake.tenantHost}/lists/${fake.guid}`;
  });
  const output = workflowFindings(workflow, FILE).map(formatFinding).join('\n');
  assert.ok(output.length > 0);
  for (const value of [fake.credentialId, fake.jwt, fake.email, fake.tenantHost, fake.guid]) {
    assert.equal(output.includes(value), false);
  }
});

test('baseline nao absorve o mesmo achado em arquivo novo nem um valor diferente no mesmo caminho', () => {
  const legacy = mutate((w) => { node(w, 'GET Lista').credentials.oAuth2Api.id = fake.credentialId; });
  const baseline = { version: 1, entries: workflowFindings(legacy, FILE) };
  assert.deepEqual(compareWithBaseline(workflowFindings(legacy, FILE), baseline).unexpected, []);

  const copied = compareWithBaseline(workflowFindings(legacy, 'system/automation/n8n/workflow-copia.json'), baseline);
  assert.equal(copied.unexpected.length, 1);
  assert.equal(copied.stale.length, 1);

  const changed = mutate((w) => { node(w, 'GET Lista').credentials.oAuth2Api.id = 'Zz99Yy88Xx77Ww66'; });
  assert.equal(compareWithBaseline(workflowFindings(changed, FILE), baseline).unexpected.length, 1);
});

test('caminhos versionados: somente workflows e documentos com nomes previstos', () => {
  for (const allowed of [
    'system/automation/n8n/workflow-ponte-materiais-sap-r02.json',
    'system/automation/n8n/README.md',
    'system/automation/n8n/REDE-ESTABILIZACAO.md',
    'scripts/n8n/check-policy.mjs',
    'scripts/n8n/workflow-policy.test.mjs',
    'scripts/n8n/material-bridge-sap.md',
    'scripts/n8n/policy-baseline.json',
    'docs/outro.md'
  ]) assert.equal(trackedPathAllowed(allowed), true, allowed);
  for (const rejected of [
    'system/automation/n8n/workflow-x.backup.json',
    'system/automation/n8n/backups/workflow-x.json',
    'system/automation/n8n/workflow-x.JSON',
    'system/automation/n8n/export.zip',
    'system/automation/n8n/.env',
    'system/automation/n8n/credentials.json',
    'system/automation/n8n/workflow_x.json',
    'scripts/n8n/.env.local',
    'scripts/n8n/export-n8n.json'
  ]) assert.equal(trackedPathAllowed(rejected), false, rejected);
});

test('estrutura invalida e reportada', () => {
  const cases = [
    [[], 'arquivo sem workflows'],
    [null, 'workflow deve ser objeto'],
    [{ name: 'x', connections: {} }, 'lista de nodes ausente ou vazia'],
    [mutate((w) => { delete w.connections; }), 'mapa de conexoes ausente'],
    [mutate((w) => { delete w.name; }), 'nome do workflow ausente'],
    [mutate((w) => { delete node(w, 'Code').type; }), 'sem tipo'],
    [mutate((w) => { node(w, 'Code').name = ''; }), 'sem nome'],
    [mutate((w) => { node(w, 'Code').id = fake.guid; }), 'id de node duplicado'],
    [mutate((w) => { node(w, 'Code').parameters = 'texto'; }), 'parameters invalido'],
    [mutate((w) => { w.connections.Inicio.main[0][0].index = -1; }), 'aresta invalida'],
    [mutate((w) => { w.connections.Inicio.main[0][0] = 'GET Lista'; }), 'aresta invalida'],
    [mutate((w) => { w.connections.Inicio.main = {}; }), 'conexoes main de Inicio invalidas']
  ];
  for (const [workflow, expected] of cases) {
    const errors = structuralErrors(workflow);
    assert.ok(errors.some((error) => error.includes(expected)), `${expected}: ${errors.join('; ')}`);
  }
});

test('scripts e documentos sao varridos por segredos e identificadores do tenant', () => {
  const text = `// ok: https://graph.microsoft.com\nconst host = '${fake.tenantHost}';\nconst t = '${fake.bearer}';\n`;
  const found = textFindings(text, 'scripts/n8n/gerador.mjs').map((finding) => finding.rule).sort();
  assert.deepEqual(found, ['N8N_SECRET_TOKEN', 'N8N_TENANT_HOST']);
});

function tempRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-policy-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

test('arquivo novo, export fora da pasta e JSON invalido sao detectados', () => {
  const leaking = mutate((w) => { node(w, 'GET Lista').credentials.oAuth2Api.id = fake.credentialId; });
  const files = {
    'system/automation/n8n/workflow-novo.json': leaking,
    'system/automation/n8n/workflow-quebrado.json': '{ "nodes": [',
    'docs/exports/meu-export.json': sanitizedWorkflow(),
    'docs/qualquer.json': { nodes: [] }
  };
  const root = tempRepo(files);
  try {
    const { findings, errors } = evaluate(root, Object.keys(files));
    const { unexpected } = compareWithBaseline(findings, { version: 1, entries: [] });
    assert.deepEqual(unexpected.map((finding) => finding.rule).sort(), ['N8N_CREDENTIAL_ID', 'N8N_MISPLACED_EXPORT']);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /workflow-quebrado\.json: JSON invalido/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CLI falha para arquivo novo ainda nao rastreado e para baseline obsoleto, sem expor valores', (t) => {
  if (spawnSync('git', ['--version']).status !== 0) { t.skip('git indisponivel'); return; }
  const leaking = mutate((w) => { node(w, 'Code').parameters.jsCode = `const t = '${fake.jwt}'; return [];`; });
  const stale = { version: 1, entries: [{ file: 'x', rule: 'N8N_ACTIVE', path: 'active', fingerprint: '0'.repeat(16) }] };
  const root = tempRepo({
    'system/automation/n8n/workflow-novo.json': leaking,
    [BASELINE_FILE]: stale
  });
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const cli = path.join(repoRoot, 'scripts/n8n/check-policy.mjs');
    const result = spawnSync(process.execPath, [cli], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /N8N_SECRET_TOKEN system\/automation\/n8n\/workflow-novo\.json/);
    assert.match(result.stderr, /baseline obsoleto/);
    assert.equal(`${result.stdout}${result.stderr}`.includes(fake.jwt), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('validador principal falha com arquivo novo estruturalmente invalido e com pasta vazia', () => {
  const validator = path.join(repoRoot, 'scripts/n8n/validate-workflows.mjs');
  const run = (root) => spawnSync(process.execPath, [validator], { cwd: root, encoding: 'utf8' });
  const broken = tempRepo({
    'system/automation/n8n/workflow-novo.json': mutate((w) => { w.connections.Inicio.main[0][0].index = 'zero'; }),
    'system/infrastructure/microsoft-lists/.keep': ''
  });
  const empty = tempRepo({ 'system/automation/n8n/README.md': '', 'system/infrastructure/microsoft-lists/.keep': '' });
  try {
    const brokenResult = run(broken);
    assert.equal(brokenResult.status, 1);
    assert.match(brokenResult.stderr, /aresta invalida a partir de Inicio/);
    const emptyResult = run(empty);
    assert.equal(emptyResult.status, 1);
    assert.match(emptyResult.stderr, /nenhum workflow encontrado/);
  } finally {
    fs.rmSync(broken, { recursive: true, force: true });
    fs.rmSync(empty, { recursive: true, force: true });
  }
});
