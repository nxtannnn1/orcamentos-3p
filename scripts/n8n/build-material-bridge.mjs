import fs from 'node:fs';
import { bridgePolicy } from './material-bridge.mjs';

export function buildWorkflow() {
  const policy = `const policy = (${bridgePolicy.toString()})();\n`;
  const nodes = [];
  function add(name, type, parameters, extra = {}) {
    nodes.push({ name, id: `bridge-local-${nodes.length + 1}`, type: `n8n-nodes-base.${type}`,
      typeVersion: type === 'httpRequest' ? 4.4 : type === 'code' ? 2 : type === 'if' ? 2.3 : 1.2,
      position: [nodes.length * 240, 0], parameters, ...extra });
  }
  const condition = expression => ({ conditions: { options: { typeValidation: 'strict', version: 3 },
    conditions: [{ leftValue: expression, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} });
  const get = url => ({ url, authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api',
    options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } } });
  const httpFlags = { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'stopWorkflow' };
  add('TRIGGER - Registro de Catálogo Criado', 'executeWorkflowTrigger', { inputSource: 'passthrough' });
  add('PREP - Identidade Material Oficial', 'code', { jsCode: policy + 'return $input.all().map((item, index) => ({json: policy.prepare(item.json), pairedItem: {item: index}}));' });
  add('IF - Possui codigo de identificacao?', 'if', condition('={{ $json.possui_identidade }}'));
  add('SAÍDA - Revisão sem SAP', 'code', { jsCode: policy + 'return $input.all().map((item, index) => ({json: policy.decide(item.json, null), pairedItem: {item: index}}));' });
  add('GET - Material Oficial por Identidade', 'httpRequest', {
    ...get('https://graph.microsoft.com/v1.0/sites/SHAREPOINT_SITE_PLACEHOLDER/lists/MATERIAIS_OFICIAIS_LIST_PLACEHOLDER/items'),
    sendQuery: true, queryParameters: { parameters: [{ name: '$expand', value: 'fields' },
      { name: '$filter', value: '={{ $json.filtro_identidade_odata }}' }, { name: '$top', value: '2' }] }
  }, httpFlags);
  add('RESOLVE - Material Oficial Existente', 'code', { mode: 'runOnceForEachItem', jsCode: policy + "return {json: policy.decide($('PREP - Identidade Material Oficial').item.json, $json)};" });
  add('IF - Proposta de associacao?', 'if', condition("={{ $json.motivo_revisao === 'IDENTIDADE_CONFIRMADA_PROPOSTA' && $json.catalogo_item_id !== null }}"));
  add('GET - Registro de origem', 'httpRequest', { ...get('={{ "https://graph.microsoft.com/v1.0/sites/SHAREPOINT_SITE_PLACEHOLDER/lists/CATALOGO_LIST_PLACEHOLDER/items/" + $json.catalogo_item_id }}'),
    sendQuery: true, queryParameters: { parameters: [{ name: '$expand', value: 'fields' }] }
  }, httpFlags);
  add('PREP - Proposta lookup sem escrita', 'code', { mode: 'runOnceForEachItem', jsCode: policy + "return {json: policy.association($('RESOLVE - Material Oficial Existente').item.json, $json)};" });
  add('SAIDA - Resultado local', 'code', { jsCode: 'return $input.all();' });
  const connections = {};
  const connect = (from, ...branches) => { connections[from] = { main: branches.map(to => [{ node: to, type: 'main', index: 0 }]) }; };
  connect(nodes[0].name, nodes[1].name); connect(nodes[1].name, nodes[2].name);
  connect(nodes[2].name, nodes[4].name, nodes[3].name); connect(nodes[3].name, nodes[9].name);
  connect(nodes[4].name, nodes[5].name); connect(nodes[5].name, nodes[6].name);
  connect(nodes[6].name, nodes[7].name, nodes[9].name); connect(nodes[7].name, nodes[8].name); connect(nodes[8].name, nodes[9].name);
  return { name: 'PONTE_CATALOGO_MATERIAIS_OFICIAIS_R01', nodes, connections, active: false, pinData: {},
    settings: { executionOrder: 'v1', availableInMCP: false }, tags: [] };
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(new URL('../../system/automation/n8n/workflow-ponte-catalogo-materiais-oficiais-r01.json', import.meta.url), JSON.stringify(buildWorkflow(), null, 2) + '\n');
}
