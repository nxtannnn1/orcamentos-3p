// Builds v2 of the published Power Automate flow "Itens aprovados para Histórico de Preços"
// from its exported definition.json. Pure transformation: no network, no SharePoint access.
// STATUS: development artifact, NOT PUBLISHED. Production still runs v1
// (see docs/FLUXO_HISTORICO_PRECOS_V2_2026-10-23.md).
//
// v2 order: quick trigger filter → re-read the approved item → validate the re-read state
// (APROVADO, NAO, Decisao_Id, e-mail, data) → create history only if absent → re-read history →
// confirm it belongs to the same decision with consistent values → MERGE Enviado_Historico=SIM
// with If-Match = ETag of the re-read item (never "*").
//
// Usage: node scripts/historico-precos-flow.mjs <definition.json exported> <output definition.json>
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FLOW_VERSION = 'v2-2026-10-23';
const ITEM = "body('Reler_item_aprovado')";
const r = field => `${ITEM}?['${field}']`;
const text = field => `string(coalesce(${r(field)},''))`;
const nonEmpty = field => `@not(empty(trim(${text(field)})))`;
const notNull = field => ({ not: { equals: [`@${r(field)}`, '@null'] } });
const isTrue = expression => ({ equals: [expression, true] });
// Plain mailbox shape; the portal already validates and lower-cases it from the Microsoft session.
const validEmail = `@and(contains(${text('EmailAprovador')},'@'),not(contains(${text('EmailAprovador')},' ')),` +
  `greater(indexOf(${text('EmailAprovador')},'@'),0),greater(lastIndexOf(${text('EmailAprovador')},'.'),add(indexOf(${text('EmailAprovador')},'@'),1)))`;
const HISTORY = "first(body('Reler_historico')?['value'])";
const h = field => `${HISTORY}?['${field}']`;
const historyFilter = `@concat('ID_Item_Importado eq ', string(${r('ID')}))`;

function connection(action) {
  const host = action?.inputs?.host;
  if (!host?.connectionName || !host.apiId) throw new Error('Ação sem conexão SharePoint esperada.');
  return { apiId: host.apiId, connectionName: host.connectionName };
}
const sharepoint = (host, operationId, parameters, extra = {}) => ({
  type: 'OpenApiConnection',
  inputs: { parameters, host: { ...host, operationId }, authentication: "@parameters('$authentication')" },
  ...extra,
});

/** Returns a new definition object; the input is not modified. */
export function upgradeFlowDefinition(exported) {
  const flow = structuredClone(exported);
  const outer = flow?.properties?.definition?.actions?.['Condição'];
  const v1 = outer?.actions;
  if (v1?.Reler_item_aprovado) throw new Error('A definição já está na v2.');
  const required = ['Obter_item', 'Obter_item_1', 'Obter_itens', 'Condição_1', 'Enviar_uma_solicitação_HTTP_ao_SharePoint'];
  if (!v1 || required.some(name => !v1[name]) || !v1['Condição_1'].actions?.Criar_item_1)
    throw new Error('Definição exportada não corresponde à v1 esperada; nada foi gerado.');

  // Same connections as v1: reads and HTTP keep Obter_item's; Criar_item_1 keeps its own host.
  const read = connection(v1.Obter_item);
  connection(v1['Condição_1'].actions.Criar_item_1);
  const dataset = v1.Obter_item.inputs.parameters.dataset;
  const historyTable = v1.Obter_itens.inputs.parameters.table;
  const itemsTable = flow.properties.definition.triggers['Quando_um_item_é_criado_ou_modificado'].inputs.parameters.table;
  const materialTable = v1.Obter_item.inputs.parameters.table;
  const budgetTable = v1.Obter_item_1.inputs.parameters.table;
  const oldCreate = v1['Condição_1'].actions.Criar_item_1;
  const oldHttp = v1['Enviar_uma_solicitação_HTTP_ao_SharePoint'];

  const createParameters = {
    dataset, table: historyTable,
    'item/Title': `@concat(${r('Codigo_Orcamento/Value')},'-ITEM-',string(${r('Numero_Item')}))`,
    'item/Material_Oficial/Id': `@${r('Material_Aprovado/Id')}`,
    'item/Fornecedor': `@${r('Fornecedor')}`,
    'item/Data_Orcamento': "@outputs('Obter_item_1')?['body/Data_Orcamento']",
    'item/Codigo_Orcamento': `@${r('Codigo_Orcamento/Value')}`,
    'item/Numero_Item': `@${r('Numero_Item')}`,
    'item/Preco_Unitario': `@${r('Preco_Unitario')}`,
    'item/Preco_Total': `@${r('Preco_Total')}`,
    'item/Descricao_Original': `@${r('Descricao_Original')}`,
    'item/Quantidade': `@${r('Quantidade')}`,
    'item/Chave_Historico': `@concat('Itens_Importados:',string(${r('ID')}))`,
    'item/Unidade': `@${r('Unidade_Original')}`,
    'item/DriveFileId': `@${r('DriveFileId')}`,
    'item/Codigo_Material_Snapshot': "@outputs('Obter_item')?['body/Codigo_Material']",
    'item/Codigo_Neoenergia_Snapshot': "@outputs('Obter_item')?['body/Codigo_Neoenergia']",
    'item/Codigo_Orcamento_Snapshot': `@${r('Codigo_Orcamento/Value')}`,
    'item/Orcamento_Origem/Id': `@${r('Codigo_Orcamento/Id')}`,
    'item/ID_Item_Importado': `@${r('ID')}`,
    // Traceability (v2). Existing columns plus AprovadoPor/EmailAprovador created on 23/10/2026.
    'item/Item_Origem/Id': `@${r('ID')}`,
    'item/Data_Aprovacao': `@${r('Data_Decisao')}`,
    'item/AprovadoPor': `@${r('AprovadoPor')}`,
    'item/EmailAprovador': `@${r('EmailAprovador')}`,
    'item/Decisao_Id': `@${r('Decisao_Id')}`,
    'item/Revisado_Por_Oid': `@${r('Revisado_Por_Oid')}`,
    'item/Correcao_Operacao_Id': `@${r('Correcao_Operacao_Id')}`,
    // json() of '{}' when absent: never parses an empty string.
    'item/Extracao_Original_Hash': `@json(if(empty(${text('Extracao_Original_JSON')}),'{}',${text('Extracao_Original_JSON')}))?['hash']`,
  };

  const confirmHistory = [
    isTrue("@equals(length(body('Reler_historico')?['value']),1)"),
    isTrue(`@equals(string(${h('Decisao_Id')}),${text('Decisao_Id')})`),
    isTrue(`@equals(string(${h('Chave_Historico')}),concat('Itens_Importados:',string(${r('ID')})))`),
    isTrue(`@equals(float(string(coalesce(${h('ID_Item_Importado')},-1))),float(string(${r('ID')})))`),
    isTrue(`@equals(string(${h('Material_Oficial/Id')}),string(${r('Material_Aprovado/Id')}))`),
    isTrue(`@equals(string(${h('EmailAprovador')}),${text('EmailAprovador')})`),
    isTrue(`@equals(float(string(coalesce(${h('Preco_Unitario')},-1))),float(string(coalesce(${r('Preco_Unitario')},-1))))`),
    isTrue(`@equals(float(string(coalesce(${h('Preco_Total')},-1))),float(string(coalesce(${r('Preco_Total')},-1))))`),
    isTrue(`@equals(float(string(coalesce(${h('Quantidade')},-1))),float(string(coalesce(${r('Quantidade')},-1))))`),
  ];

  const markSent = {
    ...oldHttp,
    runAfter: undefined,
    inputs: {
      ...oldHttp.inputs,
      parameters: {
        ...oldHttp.inputs.parameters,
        'parameters/uri': `@concat('_api/web/lists/getbytitle(''Itens_Importados'')/items(',string(${r('ID')}),')')`,
        // ETag of the re-read item (connector format "N", accepted by this REST endpoint; a stale value returns 412).
        'parameters/headers': { ...oldHttp.inputs.parameters['parameters/headers'], 'IF-MATCH': `@${ITEM}?['@odata.etag']` },
      },
    },
  };
  delete markSent.runAfter;

  const validated = {
    Obter_item: { ...v1.Obter_item, inputs: { ...v1.Obter_item.inputs, parameters: { dataset, table: materialTable, id: `@${r('Material_Aprovado/Id')}` } } },
    Obter_item_1: { ...v1.Obter_item_1, inputs: { ...v1.Obter_item_1.inputs, parameters: { dataset, table: budgetTable, id: `@${r('Codigo_Orcamento/Id')}` } } },
    Obter_itens: { ...v1.Obter_itens, inputs: { ...v1.Obter_itens.inputs, parameters: { dataset, table: historyTable, $filter: historyFilter, $top: 2 } } },
    'Condição_1': { ...v1['Condição_1'], actions: { Criar_item_1: { ...oldCreate, inputs: { ...oldCreate.inputs, parameters: createParameters } } } },
    Reler_historico: sharepoint(read, 'GetItems', { dataset, table: historyTable, $filter: historyFilter, $top: 2 },
      { runAfter: { 'Condição_1': ['Succeeded'] } }),
    Conferir_historico: {
      type: 'If', runAfter: { Reler_historico: ['Succeeded'] },
      expression: { and: confirmHistory },
      actions: { 'Enviar_uma_solicitação_HTTP_ao_SharePoint': markSent },
      else: { actions: { Historico_divergente: { type: 'Terminate', inputs: { runStatus: 'Failed', runError: {
        code: 'HISTORICO_DIVERGENTE',
        message: 'Histórico ausente, duplicado ou de outra decisão. Item NÃO marcado como enviado; conferir manualmente.' } } } } },
    },
  };
  // Obter_item now depends on the validation scope, not on the trigger.
  delete validated.Obter_item.runAfter;

  outer.actions = {
    Reler_item_aprovado: sharepoint(read, 'GetItem', { dataset, table: itemsTable, id: "@triggerBody()?['ID']" }),
    Validar_item_relido: {
      type: 'If', runAfter: { Reler_item_aprovado: ['Succeeded'] },
      expression: { and: [
        { equals: [`@${r('Status_Revisao/Value')}`, 'APROVADO'] },
        { equals: [`@${r('Enviado_Historico/Value')}`, 'NAO'] },
        isTrue(nonEmpty('Decisao_Id')), isTrue(validEmail), isTrue(nonEmpty('AprovadoPor')), isTrue(nonEmpty('Data_Decisao')),
        notNull('Material_Aprovado/Id'), notNull('Codigo_Orcamento/Id'), notNull('Descricao_Original'),
        { greater: [`@${r('Quantidade')}`, 0] }, notNull('Preco_Unitario'), notNull('Fornecedor'), notNull('Unidade_Original'),
      ] },
      // Legacy or incomplete approvals (no Decisao_Id/e-mail) are left untouched: no history, no marking.
      actions: validated,
      else: { actions: {} },
    },
  };
  return flow;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Uso: node scripts/historico-precos-flow.mjs <entrada.json> <saida.json>');
  const upgraded = upgradeFlowDefinition(JSON.parse(readFileSync(input, 'utf8')));
  writeFileSync(output, JSON.stringify(upgraded));
  console.log(`Definição ${FLOW_VERSION} gerada em ${output}. Nenhum recurso externo acessado.`);
}
