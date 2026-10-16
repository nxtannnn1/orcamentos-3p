// Local artifact generator only. No fetch, SDK, shell execution, secrets or provisioning.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function buildArtifacts() {
  const text = name => ({ name, text: {} });
  const multiline = name => ({ name, text: { allowMultipleLines: true, textType: 'plain' } });
  const number = name => ({ name, number: {} });
  const money = name => ({ name, currency: { locale: 'pt-BR' } });
  const date = name => ({ name, dateTime: { format: 'dateTime' } });
  const person = name => ({ name, personOrGroup: { allowMultipleSelection: false, chooseFromType: 'peopleOnly' } });
  const lookup = (name, target) => ({ name, lookup: { listId: `REPLACE_${target}_LIST_ID`, columnName: 'Title', allowMultipleValues: false } });
  const choice = (name, choices) => ({ name, choice: { choices } });
  const unique = column => ({ ...column, indexed: true, enforceUniqueValues: true });
  const lists = {
    materials: [text('Material'), text('Familia'), choice('Unidade_Padrao', ['UN', 'PC', 'M', 'KG', 'CJ']), unique(text('Codigo_Neoenergia'))],
    budgets: [unique(text('Codigo_Orcamento')), text('Numero_Orcamento'), text('Fornecedor'), date('Data_Orcamento'), choice('Status_Revisao', ['PENDENTE', 'APROVADO', 'CONCLUIDO'])],
    items: [unique(text('Codigo_Item')), lookup('Codigo_Orcamento', 'BUDGETS'), lookup('Material_Sugerido_Ref', 'MATERIALS'), lookup('Material_Aprovado', 'MATERIALS'), number('Numero_Item'), text('Descricao_Original'), number('Quantidade'), money('Preco_Unitario'), money('Preco_Total'), text('Unidade_Original'), text('Fornecedor'), text('Observacao_Item'), choice('Status_Revisao', ['PENDENTE', 'APROVADO', 'REJEITADO', 'EM_REVISAO', 'CORRIGIR']), choice('Enviado_Historico', ['NAO', 'SIM']), person('Responsavel_Decisao'), date('Data_Decisao'), text('Revisado_Por_Oid'), text('Decisao_Id')],
    history: [lookup('Material_Oficial', 'MATERIALS'), lookup('Orcamento_Origem', 'BUDGETS'), lookup('Item_Origem', 'ITEMS'), unique(number('ID_Item_Importado')), unique(text('Chave_Historico')), money('Preco_Unitario'), money('Preco_Total'), number('Quantidade'), text('Descricao_Original'), text('Unidade'), text('Fornecedor'), text('Codigo_Orcamento'), date('Data_Orcamento'), date('Data_Aprovacao'), person('Aprovador'), text('Codigo_Neoenergia_Snapshot'), text('Revisado_Por_Oid'), text('Decisao_Id')],
  };
  const listTemplates = Object.fromEntries(Object.entries(lists).map(([key, columns]) => [key, { displayName: `3P_HOMOLOG_${key}`, list: { template: 'genericList' }, columns }]));
  lists.items.push(multiline('Extracao_Original_JSON'), multiline('Correcao_Humana_JSON'), unique(text('Correcao_Operacao_Id')));
  lists.history.push(text('Correcao_Operacao_Id'), text('Extracao_Original_Hash'));

  const item = field => `body('Ler_item_atual')?['${field}']`;
  const val = field => `body('Validar_tipos')?['${field}']`;
  const nonempty = expr => `not(empty(trim(string(coalesce(${expr},'')))))`;
  const expr = value => `@${value}`;
  const and = values => ({ and: values.map(value => ({ equals: [expr(value), true] })) });
  const api = (operationId, parameters, runAfter = {}) => ({ type: 'OpenApiConnection', inputs: { parameters: { dataset: "@parameters('siteUrl')", ...parameters }, host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId }, ...(['PostItem', 'HttpRequest'].includes(operationId) ? { retryPolicy: { type: 'none' } } : {}) }, runAfter });
  const get = (table, id, runAfter = {}) => api('GetItem', { table: `@parameters('${table}')`, id }, runAfter);
  const after = name => ({ [name]: ['Succeeded'] });
  const stop = code => ({ type: 'Terminate', inputs: { runStatus: 'Failed', runError: { code, message: 'Pré-requisito, integridade ou reconciliação pendente. Nenhuma confirmação automática.' } } });
  let failureOrdinal = 0;
  const gate = (conditions, actions, code, runAfter = {}) => ({ type: 'If', expression: and(conditions), actions, else: { actions: { [`Bloquear_${code}_${++failureOrdinal}`]: stop(code) } }, runAfter });

  const numericSchema = { type: 'object', properties: { Quantidade: { type: ['number', 'null'] }, Preco_Unitario: { type: ['number', 'null'] }, Preco_Total: { type: ['number', 'null'] }, Fornecedor: { type: ['string', 'null'] }, Descricao_Original: { type: ['string', 'null'] }, Unidade_Original: { type: ['string', 'null'] } }, required: ['Quantidade', 'Preco_Unitario', 'Preco_Total'] };
  const snapshot = {
    Correcao_Operacao_Id: expr(`coalesce(${item('Correcao_Operacao_Id')},'')`),
    Extracao_Original_Hash: "@coalesce(body('Correcao_validada')?['originalHash'],'')",
    Title: expr(`concat('ITEM-',string(${item('ID')}))`),
    'Material_Oficial/Id': expr(item('Material_Aprovado/Id')),
    'Orcamento_Origem/Id': expr(item('Codigo_Orcamento/Id')),
    'Item_Origem/Id': expr(item('ID')), ID_Item_Importado: expr(item('ID')),
    Chave_Historico: expr(`concat('Itens_Importados:',string(${item('ID')}))`),
    Preco_Unitario: expr(val('Preco_Unitario')), Quantidade: expr(val('Quantidade')),
    Preco_Total: expr(val('Preco_Total')),
    Fornecedor: expr(`trim(${val('Fornecedor')})`), Unidade: expr(`trim(${val('Unidade_Original')})`),
    Descricao_Original: expr(val('Descricao_Original')),
    Codigo_Orcamento: "@body('Obter_orcamento')?['Codigo_Orcamento']",
    Data_Orcamento: "@body('Obter_orcamento')?['Data_Orcamento']",
    Data_Aprovacao: expr(item('Data_Decisao')), 'Aprovador/Claims': expr(item('Responsavel_Decisao/Claims')),
    Codigo_Neoenergia_Snapshot: "@body('Obter_material')?['Codigo_Neoenergia']",
    Revisado_Por_Oid: expr(item('Revisado_Por_Oid')), Decisao_Id: expr(item('Decisao_Id')),
  };
  // A single reusable expression is used after either creation or existing-record lookup.
  const comparable = Object.keys(snapshot).filter(k => k !== 'Title');
  const equivalent = body => comparable.map(key => `equals(${body}?['${key}'],outputs('Snapshot')?['${key}'])`);
  const confirm = suffix => ({
    [`Reler_item_${suffix}`]: get('itemsListId', expr(item('ID'))),
    [`Reler_material_${suffix}`]: get('materialsListId', expr(item('Material_Aprovado/Id')), after(`Reler_item_${suffix}`)),
    [`Reler_orcamento_${suffix}`]: get('budgetsListId', expr(item('Codigo_Orcamento/Id')), after(`Reler_material_${suffix}`)),
    [`Conferir_versao_${suffix}`]: gate([
      nonempty(item('@odata.etag')),
      `equals(body('Reler_item_${suffix}')?['@odata.etag'],${item('@odata.etag')})`,
      nonempty("body('Obter_material')?['@odata.etag']"), nonempty("body('Obter_orcamento')?['@odata.etag']"),
      `equals(body('Reler_material_${suffix}')?['@odata.etag'],body('Obter_material')?['@odata.etag'])`,
      `equals(body('Reler_orcamento_${suffix}')?['@odata.etag'],body('Obter_orcamento')?['@odata.etag'])`,
      `equals(${item('Enviado_Historico/Value')},'NAO')`,
    ], {
      [`Marcar_enviado_${suffix}`]: api('HttpRequest', {
        'parameters/method': 'POST',
        'parameters/uri': expr(`concat('_api/web/lists(guid''',parameters('itemsListId'),''')/items(',string(${item('ID')}),')')`),
        'parameters/headers': { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata', 'IF-MATCH': expr(item('@odata.etag')), 'X-HTTP-Method': 'MERGE' },
        'parameters/body': '{"Enviado_Historico":"SIM"}',
      }),
    }, 'SOURCE_VERSION_CONFLICT', after(`Reler_orcamento_${suffix}`)),
  });
  const verify = (body, actions) => gate(equivalent(body), actions, 'HISTORY_RECONCILIATION_REQUIRED');
  const createBranch = gate([`equals(${item('Enviado_Historico/Value')},'NAO')`], {
    Criar_historico: api('PostItem', { table: "@parameters('historyListId')", ...Object.fromEntries(Object.entries(snapshot).map(([key, value]) => [`item/${key}`, value])) }),
    Reler_historico: get('historyListId', "@body('Criar_historico')?['ID']", after('Criar_historico')),
    Conferir_criado: { ...verify("body('Reler_historico')", confirm('criado')), runAfter: after('Reler_historico') },
  }, 'SENT_WITHOUT_HISTORY');
  const existingBranch = gate(["equals(length(body('Buscar_historico')?['value']),1)"], {
    Conferir_existente: verify("first(body('Buscar_historico')?['value'])", {
      Precisa_confirmar: { type: 'If', expression: and([`equals(${item('Enviado_Historico/Value')},'NAO')`]), actions: confirm('existente'), else: { actions: {} } },
    }),
  }, 'HISTORY_IDENTITY_CONFLICT');
  const historyActions = {
    Snapshot: { type: 'Compose', inputs: snapshot },
    Buscar_historico: api('GetItems', {
      table: "@parameters('historyListId')", '$top': 2,
      '$filter': expr(`concat('ID_Item_Importado eq ',string(${item('ID')}),' or Chave_Historico eq ''Itens_Importados:',string(${item('ID')}),''' or Item_OrigemId eq ',string(${item('ID')}))`),
    }, after('Snapshot')),
    Existe_historico: { type: 'If', expression: and(["equals(length(body('Buscar_historico')?['value']),0)"]), actions: { Primeira_aprovacao: createBranch }, else: { actions: { Validar_existente: existingBranch } }, runAfter: after('Buscar_historico') },
  };
  const relationActions = {
    Obter_material: get('materialsListId', expr(item('Material_Aprovado/Id'))),
    Obter_orcamento: get('budgetsListId', expr(item('Codigo_Orcamento/Id')), after('Obter_material')),
    Validar_relacoes: gate([
      `equals(string(body('Obter_material')?['ID']),string(${item('Material_Aprovado/Id')}))`,
      `equals(string(body('Obter_orcamento')?['ID']),string(${item('Codigo_Orcamento/Id')}))`,
      nonempty("body('Obter_orcamento')?['Codigo_Orcamento']"),
      nonempty("body('Obter_orcamento')?['Data_Orcamento']"),
      nonempty("body('Obter_material')?['Unidade_Padrao/Value']"),
      `equals(toUpper(trim(${val('Unidade_Original')})),toUpper(trim(string(body('Obter_material')?['Unidade_Padrao/Value']))))`,
    ], historyActions, 'RELATION_OR_UNIT_INVALID', after('Obter_orcamento')),
  };
  const correctionValueFields = { description: 'Descricao_Original', quantity: 'Quantidade', unit: 'Unidade_Original', unitPrice: 'Preco_Unitario', totalPrice: 'Preco_Total', supplier: 'Fornecedor', materialId: 'Material_Aprovado/Id', observation: 'Observacao_Item' };
  const correction = field => `body('Correcao_validada')?['${field}']`;
  const correctionMatches = [
    `equals(${correction('operationId')},${item('Correcao_Operacao_Id')})`,
    `equals(${correction('schemaVersion')},1)`,
    `equals(length(string(${correction('originalHash')})),64)`,
    `equals(${correction('originalHash')},body('Extracao_validada')?['hash'])`,
    ...Object.entries(correctionValueFields).map(([key, field]) => `equals(string(${correction(`values/${key}`)}),string(${item(field)}))`),
  ];
  const correctionProvenance = `or(and(empty(${item('Correcao_Operacao_Id')}),empty(${item('Correcao_Humana_JSON')}),empty(${item('Extracao_Original_JSON')})),and(${nonempty(item('Correcao_Operacao_Id'))},${correctionMatches.join(',')}))`;
  const validationActions = {
    Correcao_validada: { type: 'ParseJson', inputs: { content: expr(`if(empty(${item('Correcao_Humana_JSON')}),'{}',${item('Correcao_Humana_JSON')})`), schema: { type: 'object', properties: { operationId: { type: 'string' }, schemaVersion: { type: 'integer' }, originalHash: { type: 'string' }, values: { type: 'object' } } } } },
    Extracao_validada: { type: 'ParseJson', inputs: { content: expr(`if(empty(${item('Extracao_Original_JSON')}),'{}',${item('Extracao_Original_JSON')})`), schema: { type: 'object', properties: { hash: { type: 'string' } } } }, runAfter: after('Correcao_validada') },
    Validar_tipos: { type: 'ParseJson', inputs: { content: expr("body('Ler_item_atual')"), schema: numericSchema }, runAfter: after('Extracao_validada') },
    Validar_valores: gate([
      correctionProvenance,
      `greater(coalesce(${val('Quantidade')},0),0)`, `greater(coalesce(${val('Preco_Unitario')},0),0)`,
      `greater(coalesce(${val('Preco_Total')},0),0)`,
      ...['Fornecedor', 'Descricao_Original', 'Unidade_Original'].map(k => nonempty(val(k))),
      nonempty(item('Material_Aprovado/Id')), nonempty(item('Codigo_Orcamento/Id')),
      nonempty(item('Responsavel_Decisao/Claims')), nonempty(item('Data_Decisao')),
      nonempty(item('Revisado_Por_Oid')), nonempty(item('Decisao_Id')),
    ], relationActions, 'APPROVAL_INCOMPLETE', after('Validar_tipos')),
  };
  const processing = {
    Ler_item_atual: get('itemsListId', "@triggerBody()?['ID']"),
    Item_aprovado: { type: 'If', expression: and([`equals(${item('Status_Revisao/Value')},'APROVADO')`, `or(equals(${item('Enviado_Historico/Value')},'NAO'),equals(${item('Enviado_Historico/Value')},'SIM'))`]), actions: validationActions, else: { actions: {} }, runAfter: after('Ler_item_atual') },
  };
  const definition = {
    '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#', contentVersion: '1.0.0.0',
    parameters: { siteUrl: { type: 'String', defaultValue: '' }, approvedIsolatedSiteUrl: { type: 'String', defaultValue: '' }, isolationConfirmed: { type: 'Bool', defaultValue: false }, ...Object.fromEntries(['itemsListId', 'materialsListId', 'budgetsListId', 'historyListId'].map(k => [k, { type: 'String', defaultValue: '' }])) },
    triggers: { Item_modificado: { ...api('GetOnUpdatedItems', { table: "@parameters('itemsListId')" }), recurrence: { frequency: 'Minute', interval: 3 }, runtimeConfiguration: { concurrency: { runs: 1 } }, splitOn: "@triggerOutputs()?['body/value']" } },
    actions: {
      Isolamento: gate(["equals(parameters('isolationConfirmed'),true)", "not(empty(parameters('siteUrl')))", "equals(parameters('siteUrl'),parameters('approvedIsolatedSiteUrl'))", "endsWith(parameters('siteUrl'),'-homolog')"], {
        Processar: { type: 'Scope', actions: processing },
        Tratar_falha: { type: 'Terminate', inputs: { runStatus: 'Failed', runError: { code: 'UNCONFIRMED_REQUIRES_READ', message: 'Falha ou resultado incerto. Consultar identidades e conferir histórico antes de tentar novamente; não reenviar cegamente.' } }, runAfter: { Processar: ['Failed', 'TimedOut'] } },
      }, 'ISOLATION_NOT_CONFIRMED'),
    }, outputs: {},
  };
  delete definition.triggers.Item_modificado.runAfter;
  const artifacts = {
    'lists.templates.json': { kind: 'LOCAL_TEMPLATES_NOT_PROVISIONED', order: ['materials', 'budgets', 'items', 'history'], lists: listTemplates },
    'flow.definition.candidate.json': definition,
    'manifest.json': { state: 'NOT_CREATED_NOT_IMPORTED', desiredState: 'Stopped', engineValidated: false, productionAuthorized: false, connectionReferences: ['shared_sharepointonline'], prerequisites: ['isolated site ending -homolog', 'four isolated lists', 'authorized human test accounts', 'verified person resolver', 'isolated Redis', 'connector parameter and expression validation before activation'], recovery: 'read identities after any uncertain creation; never overwrite divergent history' },
    'fixtures.synthetic.json': { synthetic: true, material: { Title: 'SYNTHETIC LABEL', Material: 'Synthetic material', Unidade_Padrao: 'UN', Codigo_Neoenergia: 'TEST-NE-1' }, budgets: [{ Codigo_Orcamento: 'TEST-B1', Fornecedor: 'Synthetic A', Data_Orcamento: '2026-10-01T00:00:00Z' }, { Codigo_Orcamento: 'TEST-B2', Fornecedor: 'Synthetic B', Data_Orcamento: '2026-10-02T00:00:00Z' }], items: [{ Codigo_Item: 'TEST-I1', Quantidade: 2, Preco_Unitario: 10, Unidade_Original: 'UN', Fornecedor: 'Synthetic A', Status_Revisao: 'PENDENTE', Enviado_Historico: 'NAO' }, { Codigo_Item: 'TEST-I2', Quantidade: 2, Preco_Unitario: 8, Unidade_Original: 'UN', Fornecedor: 'Synthetic B', Status_Revisao: 'PENDENTE', Enviado_Historico: 'NAO' }], bindings: 'Resolve actual test-list IDs after authorized creation. No fabricated approvals or person IDs. Approve through the isolated Operator with authorized human test accounts.' },
  };
  const fixtures = artifacts['fixtures.synthetic.json'];
  fixtures.items = fixtures.items.map((item, index) => ({ ...item, Numero_Item: index + 1, Descricao_Original: `Synthetic item ${index + 1}`, Preco_Total: item.Quantidade * item.Preco_Unitario }));
  fixtures.budgets = fixtures.budgets.map(budget => ({ ...budget, Status_Revisao: 'PENDENTE', Numero_Orcamento: budget.Codigo_Orcamento }));
  return artifacts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = fileURLToPath(new URL('../docs/homologacao/', import.meta.url));
  await mkdir(output, { recursive: true });
  for (const [name, value] of Object.entries(buildArtifacts())) await writeFile(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log('Local homologation templates generated. No external resources accessed.');
}
