import fs from 'node:fs';
import { bridgePolicy } from './material-bridge.mjs';
import { planPolicy } from './material-bridge-plan.mjs';

// Versioned defaults: placeholders only, writes disabled. Real values are set in the n8n copy.
export const DEFAULT_CONFIG = {
  graph_base: 'https://graph.microsoft.com/v1.0',
  site: 'SHAREPOINT_SITE_PLACEHOLDER',
  listas: { CATALOGO_NEOENERGIA: 'CATALOGO_NEOENERGIA_LIST_PLACEHOLDER', MATERIAIS_OFICIAIS: 'MATERIAIS_OFICIAIS_LIST_PLACEHOLDER' },
  escrita_habilitada: false,
  // Only values confirmed against the real list. Familia confirmed by the 2026-10-27 E2E;
  // Status/Tipo_Registro/Unidade_Padrao by the column Choices read on 2026-10-28 (FillInChoice false).
  choices_confirmados: { Familia: ['CAPACITORES_E_BANCOS'], Status: ['PENDENTE_REVISAO'], Tipo_Registro: ['MATERIAL'], Unidade_Padrao: ['UN'] },
  // Unidade_Padrao UN is provisional: only CAPACITORES_E_BANCOS can be created today; review it if Familia widens.
  valores_novo_material: { Status: 'PENDENTE_REVISAO', Tipo_Registro: 'MATERIAL', Unidade_Padrao: 'UN' }
};

export function buildWorkflow({ config = DEFAULT_CONFIG } = {}) {
  const policy = `const base = (${bridgePolicy.toString()})();\nconst policy = (${planPolicy.toString()})(base);\n`;
  const nodes = [];
  function add(name, type, parameters, extra = {}) {
    nodes.push({ name, id: `bridge-sap-${nodes.length + 1}`, type: `n8n-nodes-base.${type}`,
      typeVersion: type === 'httpRequest' ? 4.4 : type === 'code' ? 2 : type === 'if' ? 2.3 : 1.1,
      position: [nodes.length * 240, 0], parameters, ...extra });
  }
  const code = body => ({ jsCode: policy + body });
  const one = expr => code(`return [{ json: ${expr}, pairedItem: { item: 0 } }];`);
  const condition = expression => ({ conditions: { options: { typeValidation: 'strict', version: 3 },
    conditions: [{ leftValue: expression, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} });
  const response = { timeout: 30000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } };
  const auth = { authentication: 'genericCredentialType', genericAuthType: 'oAuth2Api' };
  const query = (...pairs) => ({ sendQuery: true, queryParameters: { parameters: pairs.map(([name, value]) => ({ name, value })) } });
  const headers = (...pairs) => ({ sendHeaders: true, headerParameters: { parameters: pairs.map(([name, value]) => ({ name, value })) } });
  const prefer = ['Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly'];
  // Reads retry only transport failures; HTTP statuses are inspected by the policy (neverError).
  const read = { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueRegularOutput' };
  // Writes are never retried: a lost response is resolved by the confirmation GET or a new PREPARAR.
  const write = { retryOnFail: false, onError: 'continueRegularOutput' };
  const ENTRADA = "$('ENTRADA - Validar').first().json";
  const CONFIG = "$('CONFIG - Ambiente').first().json.config";
  const GATE = "$('GATE - Aprovação e revalidação').first().json";

  add('TRIGGER - Execução por outro workflow', 'executeWorkflowTrigger', { inputSource: 'passthrough' });
  add('TRIGGER - Manual', 'manualTrigger', {});
  add('ENTRADA - Manual (editar)', 'code', { jsCode:
    "// Modo PREPARAR nunca grava. Para APLICAR, copiar plano_hash do relatorio e informar aprovado_por.\n" +
    "return [{ json: { modo: 'PREPARAR', codigo_sap: '', campo_codigo: 'Codigo_Nordeste', aprovacao: null } }];" });
  add('CONFIG - Ambiente', 'code', { jsCode:
    '// Unico ponto de configuracao por ambiente. Nao versionar IDs reais nem habilitar escrita no export.\n' +
    `const config = ${JSON.stringify(config, null, 2)};\n` +
    'return $input.all().map((item, index) => ({ json: { entrada: item.json, config }, pairedItem: { item: index } }));' });
  add('ENTRADA - Validar', 'code', code(
    "const items = $input.all();\n" +
    "if (items.length !== 1) return [{ json: { etapa: 'ENTRADA', status: 'BLOQUEADO', motivo: 'UMA_ENTRADA_POR_EXECUCAO', escrita_permitida: false }, pairedItem: { item: 0 } }];\n" +
    "return [{ json: policy.entrada(items[0].json.entrada, items[0].json.config), pairedItem: { item: 0 } }];"));
  add('IF - Entrada válida?', 'if', condition("={{ $json.status === 'OK' }}"));
  add('GET - Catálogo por código SAP', 'httpRequest', { url: '={{ $json.urls.catalogo_itens }}', ...auth,
    ...query(['$expand', 'fields'], ['$filter', '={{ $json.filtro_catalogo_odata }}'], ['$top', '100']), ...headers(prefer), options: response }, read);
  add('AGRUPAR - Identidade técnica', 'code', one(`policy.agrupar(${ENTRADA}, $input.first().json)`));
  add('IF - Grupo válido?', 'if', condition("={{ $json.status === 'OK' }}"));
  add('GET - Materiais Oficiais candidatos', 'httpRequest', { url: `={{ ${ENTRADA}.urls.oficiais_itens }}`, ...auth,
    ...query(['$expand', 'fields'], ['$filter', '={{ $json.filtro_oficiais_odata }}'], ['$top', '2']), ...headers(prefer), options: response }, read);
  add('PLANO - Gerar plano', 'code', one(`policy.planejar($('AGRUPAR - Identidade técnica').first().json, $input.first().json, ${CONFIG})`));
  add('GATE - Aprovação e revalidação', 'code', one(`policy.autorizar($input.first().json, ${ENTRADA}, ${CONFIG})`));
  add('IF - Escrita autorizada?', 'if', condition("={{ $json.status === 'AUTORIZADO' }}"));
  add('IF - Requer criação?', 'if', condition('={{ $json.requer_criacao === true }}'));
  add('POST - Criar Material Oficial', 'httpRequest', { method: 'POST', url: `={{ ${ENTRADA}.urls.oficiais_itens }}`, ...auth,
    sendBody: true, specifyBody: 'json', jsonBody: '={{ { fields: $json.fields_post } }}', options: response }, write);
  add('CHECK - Resposta criação', 'code', one(`policy.verificarCriacao(${GATE}, $input.first().json, ${ENTRADA}.urls.oficiais_itens)`));
  add('IF - Criação aceita?', 'if', condition("={{ $json.status === 'OK' }}"));
  add('GET - Confirmar Material criado', 'httpRequest', { url: '={{ $json.url_confirmacao }}', ...auth, ...query(['$expand', 'fields']), options: response }, read);
  add('CHECK - Material criado confirmado', 'code', one(`policy.confirmarCriacao(${GATE}, $('CHECK - Resposta criação').first().json, $input.first().json)`));
  add('IF - Material confirmado?', 'if', condition("={{ $json.status === 'CONFIRMADO' }}"));
  add('OPS - Preparar associações', 'code', code(
    `const gate = ${GATE};\n` +
    "const criacao = gate.requer_criacao ? $('CHECK - Material criado confirmado').first().json : null;\n" +
    `return policy.associacoes(gate, criacao, ${ENTRADA}.urls.catalogo_itens).map(json => ({ json, pairedItem: { item: 0 } }));`));
  add('PATCH - Associar Material_Oficial', 'httpRequest', { method: 'PATCH', url: '={{ $json.url_patch }}', ...auth,
    ...headers(['If-Match', '={{ $json.if_match }}']), sendBody: true, specifyBody: 'json', jsonBody: '={{ $json.fields_patch }}', options: response }, write);
  add('GET - Confirmar associação', 'httpRequest', { url: "={{ $('OPS - Preparar associações').item.json.url_item }}", ...auth,
    ...query(['$expand', 'fields']), options: response }, read);
  add('VERIFICAR - Associação', 'code', code(
    "const ops = $('OPS - Preparar associações').all();\nconst patches = $('PATCH - Associar Material_Oficial').all();\n" +
    'return $input.all().map((item, i) => ({ json: policy.verificarAssociacao(ops[i].json, patches[i].json, item.json), pairedItem: { item: i } }));'));
  add('RELATORIO - Execução', 'code', one(
    `policy.relatorio(${GATE}, ${GATE}.requer_criacao ? $('CHECK - Material criado confirmado').first().json : null, $input.all().map(i => i.json))`));
  add('SAIDA - Relatório', 'code', { jsCode: 'return $input.all();' });

  const connections = {};
  const connect = (from, ...branches) => { connections[from] = { main: branches.map(to => [{ node: to, type: 'main', index: 0 }]) }; };
  const OUT = 'SAIDA - Relatório';
  connect('TRIGGER - Execução por outro workflow', 'CONFIG - Ambiente');
  connect('TRIGGER - Manual', 'ENTRADA - Manual (editar)');
  connect('ENTRADA - Manual (editar)', 'CONFIG - Ambiente');
  connect('CONFIG - Ambiente', 'ENTRADA - Validar');
  connect('ENTRADA - Validar', 'IF - Entrada válida?');
  connect('IF - Entrada válida?', 'GET - Catálogo por código SAP', OUT);
  connect('GET - Catálogo por código SAP', 'AGRUPAR - Identidade técnica');
  connect('AGRUPAR - Identidade técnica', 'IF - Grupo válido?');
  connect('IF - Grupo válido?', 'GET - Materiais Oficiais candidatos', OUT);
  connect('GET - Materiais Oficiais candidatos', 'PLANO - Gerar plano');
  connect('PLANO - Gerar plano', 'GATE - Aprovação e revalidação');
  connect('GATE - Aprovação e revalidação', 'IF - Escrita autorizada?');
  connect('IF - Escrita autorizada?', 'IF - Requer criação?', OUT);
  connect('IF - Requer criação?', 'POST - Criar Material Oficial', 'OPS - Preparar associações');
  connect('POST - Criar Material Oficial', 'CHECK - Resposta criação');
  connect('CHECK - Resposta criação', 'IF - Criação aceita?');
  connect('IF - Criação aceita?', 'GET - Confirmar Material criado', OUT);
  connect('GET - Confirmar Material criado', 'CHECK - Material criado confirmado');
  connect('CHECK - Material criado confirmado', 'IF - Material confirmado?');
  connect('IF - Material confirmado?', 'OPS - Preparar associações', OUT);
  connect('OPS - Preparar associações', 'PATCH - Associar Material_Oficial');
  connect('PATCH - Associar Material_Oficial', 'GET - Confirmar associação');
  connect('GET - Confirmar associação', 'VERIFICAR - Associação');
  connect('VERIFICAR - Associação', 'RELATORIO - Execução');
  connect('RELATORIO - Execução', OUT);
  return { name: 'PONTE_MATERIAIS_OFICIAIS_POR_SAP_R02', nodes, connections, active: false, pinData: {},
    settings: { executionOrder: 'v1', availableInMCP: false }, tags: [] };
}

if (process.argv.includes('--write')) {
  fs.writeFileSync(new URL('../../system/automation/n8n/workflow-ponte-materiais-sap-r02.json', import.meta.url), JSON.stringify(buildWorkflow(), null, 2) + '\n');
}
