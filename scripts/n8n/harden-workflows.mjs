import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'system', 'automation', 'n8n');

function load(file) {
  const full = path.join(dir, file);
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  return { full, parsed, workflow: Array.isArray(parsed) ? parsed[0] : parsed };
}

function save(document) {
  fs.writeFileSync(document.full, `${JSON.stringify(document.parsed, null, 2)}\n`, 'utf8');
}

function node(workflow, name) {
  const found = workflow.nodes.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Node nao encontrado: ${name}`);
  return found;
}

function query(nodeValue, name) {
  return nodeValue.parameters.queryParameters.parameters.find((item) => item.name === name);
}

const itemPrepCode = `const entrada = $json || {};

function texto(valor) {
  return String(valor ?? '').trim();
}

function numero(valor, padrao = null) {
  if (valor === null || valor === undefined || valor === '') return padrao;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : padrao;
  let normalizado = String(valor).trim().replace(/R\\$/gi, '').replace(/\\s/g, '');
  if (normalizado.includes('.') && normalizado.includes(',')) {
    normalizado = normalizado.replace(/\\./g, '').replace(',', '.');
  } else if (normalizado.includes(',')) {
    normalizado = normalizado.replace(',', '.');
  }
  const convertido = Number(normalizado);
  return Number.isFinite(convertido) ? convertido : padrao;
}

function inteiro(valor, padrao = null) {
  const convertido = numero(valor, padrao);
  return convertido === null ? padrao : Math.trunc(convertido);
}

function definido(valor) {
  return valor !== null && valor !== undefined && valor !== '';
}

const codigoItem = texto(entrada.codigo_item);
const codigoOrcamento = texto(entrada.codigo_orcamento);
const orcamentoSharePointId = inteiro(entrada.orcamento_sharepoint_id, null);

if (!codigoItem) throw new Error('codigo_item nao recebido no PREP - Itens.');
if (!codigoOrcamento) throw new Error(\`codigo_orcamento nao recebido para \${codigoItem}.\`);
if (!orcamentoSharePointId || orcamentoSharePointId < 1) {
  throw new Error(\`orcamento_sharepoint_id invalido para \${codigoItem}.\`);
}

const fieldsPatch = {
  Title: codigoItem,
  Codigo_Item: codigoItem,
  Codigo_OrcamentoLookupId: orcamentoSharePointId
};

const opcionais = {
  Numero_Item: inteiro(entrada.numero_item, null),
  DriveFileId: texto(entrada.drive_file_id),
  Fornecedor: texto(entrada.fornecedor),
  Codigo_Fornecedor: texto(entrada.codigo_produto_fornecedor ?? entrada.codigo_fornecedor),
  Referencia_Fornecedor: texto(entrada.referencia_fornecedor),
  Descricao_Original: texto(entrada.descricao_original),
  Quantidade: numero(entrada.quantidade, null),
  Unidade_Original: texto(entrada.unidade_original),
  Preco_Unitario: numero(entrada.preco_unitario, null),
  Preco_Total: numero(entrada.preco_total, null),
  NCM: texto(entrada.ncm),
  Material_Sugerido: texto(entrada.material_sugerido)
};

for (const [chave, valor] of Object.entries(opcionais)) {
  if (definido(valor)) fieldsPatch[chave] = valor;
}

// Campos de revisao humana nunca entram no PATCH automatico.
const fieldsPost = {
  ...fieldsPatch,
  Status_Revisao: 'PENDENTE',
  Enviado_Historico: 'NAO'
};

if (texto(entrada.observacao_item)) {
  fieldsPost.Observacao_Item = texto(entrada.observacao_item);
}

return {
  json: {
    ...entrada,
    codigo_item: codigoItem,
    codigo_orcamento: codigoOrcamento,
    orcamento_sharepoint_id: orcamentoSharePointId,
    drive_file_id: texto(entrada.drive_file_id),
    numero_item: inteiro(entrada.numero_item, null),
    tributos: Array.isArray(entrada.tributos) ? entrada.tributos : [],
    fields: fieldsPatch,
    fields_post: fieldsPost,
    fields_patch: fieldsPatch
  }
};`;

const decideItemCode = (prepName) => `const preparado = $('${prepName}').item.json || {};
const registros = Array.isArray($json?.value) ? $json.value : [];
const exatos = registros.filter((registro) =>
  String(registro?.fields?.Codigo_Item ?? '').trim() === preparado.codigo_item
);

if (exatos.length > 1) {
  throw new Error(\`COLISAO_CODIGO_ITEM: \${preparado.codigo_item} retornou \${exatos.length} registros.\`);
}

const id = exatos[0]?.id ? Number(exatos[0].id) : null;
const existe = Number.isInteger(id) && id > 0;

return { json: { ...preparado, item_existe: existe, item_sharepoint_id: existe ? id : null, acao_item: existe ? 'PATCH' : 'POST' } };`;

const tributoPrepCode = `const entrada = $json || {};
const texto = (valor) => String(valor ?? '').trim();
const numero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  const normalizado = typeof valor === 'string' ? valor.trim().replace(/\\s/g, '').replace(',', '.') : valor;
  const convertido = Number(normalizado);
  return Number.isFinite(convertido) ? convertido : null;
};

const codigoTributo = texto(entrada.codigo_tributo_item);
const itemId = Number(entrada.item_sharepoint_id);
const orcamentoId = Number(entrada.orcamento_sharepoint_id);
if (!codigoTributo) throw new Error('codigo_tributo_item ausente.');
if (!Number.isInteger(itemId) || itemId < 1) throw new Error(\`item_sharepoint_id invalido para \${codigoTributo}.\`);
if (!Number.isInteger(orcamentoId) || orcamentoId < 1) throw new Error(\`orcamento_sharepoint_id invalido para \${codigoTributo}.\`);

const tipos = ['PIS', 'COFINS', 'ICMS', 'DIFAL', 'IPI', 'ISS', 'OUTRO', 'ICMS-ST'];
const situacoes = ['INCLUSO', 'A_INCLUIR', 'NAO_INFORMADO', 'NAO_APLICA', 'ISENTO'];
const tipoRecebido = texto(entrada.tipo_tributo || 'OUTRO').toUpperCase();
const situacaoRecebida = texto(entrada.situacao_tributaria || 'NAO_INFORMADO').toUpperCase();

const fieldsPatch = {
  Title: codigoTributo,
  Codigo_Tributo_Item: codigoTributo,
  Codigo_ItemLookupId: itemId,
  Codigo_OrcamentoLookupId: orcamentoId,
  Tipo_Tributo: tipos.includes(tipoRecebido) ? tipoRecebido : 'OUTRO',
  Situacao_Tributaria: situacoes.includes(situacaoRecebida) ? situacaoRecebida : 'NAO_INFORMADO'
};

const opcionais = {
  DriveFileId: texto(entrada.drive_file_id),
  Aliquota_Percentual: numero(entrada.aliquota_percentual),
  Valor_Tributo: numero(entrada.valor_tributo),
  Base_Calculo: numero(entrada.base_calculo),
  Observacao_Fiscal: texto(entrada.observacao_fiscal)
};
for (const [chave, valor] of Object.entries(opcionais)) {
  if (valor !== null && valor !== '') fieldsPatch[chave] = valor;
}

return [{ json: { ...entrada, fields: fieldsPatch, fields_patch: fieldsPatch, fields_post: { ...fieldsPatch, Status_Revisao: 'PENDENTE' } } }];`;

const decideTributoCode = (prepName) => `const preparado = $('${prepName}').item.json || {};
const registros = Array.isArray($json?.value) ? $json.value : [];
const exatos = registros.filter((registro) =>
  String(registro?.fields?.Codigo_Tributo_Item ?? '').trim() === preparado.codigo_tributo_item
);
if (exatos.length > 1) {
  throw new Error(\`COLISAO_CODIGO_TRIBUTO: \${preparado.codigo_tributo_item} retornou \${exatos.length} registros.\`);
}
const id = exatos[0]?.id ? Number(exatos[0].id) : null;
if (id !== null && (!Number.isInteger(id) || id < 1)) throw new Error('ID de tributo invalido retornado pelo SharePoint.');
return [{ json: { ...preparado, tributo_existe: Boolean(id), tributo_sharepoint_id: id } }];`;

{
  const document = load('workflow-itens-tributos-v0.json');
  const w = document.workflow;
  if (!w.nodes.some((candidate) => candidate.name === 'Post Tributo')) {
    const template = structuredClone(node(w, 'Post Tributo1'));
    template.id = '6d64b5c5-4738-4a46-8aa6-29f448aa3b51';
    template.name = 'Post Tributo';
    template.position = [-2848, 3712];
    w.nodes.push(template);
    w.connections['IF - Tributo Existe?'].main[1] = [{ node: 'Post Tributo', type: 'main', index: 0 }];
    w.connections['Post Tributo'] = {
      main: [[{ node: 'Normalizar POST Tributo', type: 'main', index: 0 }]]
    };
    w.connections['Normalizar POST Tributo'] = {
      main: [[{ node: 'Loop Over Tributos', type: 'main', index: 0 }]]
    };
  }
  for (const suffix of ['', '1']) {
    const prepItem = node(w, `PREP - Itens${suffix}`);
    prepItem.parameters.jsCode = itemPrepCode;
    node(w, `CODE - Decidir Item${suffix}`).parameters.jsCode = decideItemCode(prepItem.name);
    const lookupItem = node(w, `LOOKUP - Item por Codigo_Item${suffix}`);
    query(lookupItem, '$top').value = '2';
    query(lookupItem, '$filter').value = `={{ "fields/Codigo_Item eq '" + $json.codigo_item.replace(/'/g, "''") + "'" }}`;
    node(w, `Post Item${suffix}`).parameters.jsonBody = '={{ { fields: $json.fields_post } }}';
    node(w, `Patch Item${suffix}`).parameters.jsonBody = '={{ $json.fields_patch }}';

    const prepTributo = node(w, `PREP - Tributo${suffix}`);
    prepTributo.parameters.jsCode = tributoPrepCode;
    node(w, `CODE - Decidir Tributo${suffix}`).parameters.jsCode = decideTributoCode(prepTributo.name);
    const lookupTributo = node(w, `LOOKUP - Tributo por Codigo_Tributo_Item${suffix}`);
    query(lookupTributo, '$top').value = '2';
    query(lookupTributo, '$filter').value = `={{ "fields/Codigo_Tributo_Item eq '" + $json.codigo_tributo_item.replace(/'/g, "''") + "'" }}`;
    node(w, `Post Tributo${suffix}`).parameters.jsonBody = '={{ { fields: $json.fields_post } }}';
    node(w, `PatchTributo${suffix}`).parameters.jsonBody = '={{ $json.fields_patch }}';
  }
  save(document);
}

{
  const document = load('workflow-normalizar-associar-materiais-v0.json');
  const w = document.workflow;
  const lookup = node(w, 'GET - MaterialOficial por Chave1');
  query(lookup, '$top').value = '3';
  const decision = node(w, 'CODE - Decidir Material1');
  decision.parameters.jsCode = decision.parameters.jsCode
    .replace(".trim() === chaveBusca\n  );", ".trim() === chaveBusca &&\n    String(registro?.fields?.Status || '').trim().toUpperCase() === 'ATIVO'\n  );")
    .replace("estrategia_matching:\n      'DESCRICAO_NORMALIZADA_EXATA',", "status_associacao:\n      encontrou ? 'EXATO' : 'SEM_ASSOCIACAO',\n\n    estrategia_matching:\n      'DESCRICAO_NORMALIZADA_EXATA',");
  save(document);
}

{
  const document = load('workflow-orquestrador-v0.json');
  const w = document.workflow;
  const normalizer = node(w, 'NORMALIZAR - Entrada SharePoint');
  let code = normalizer.parameters.jsCode;
  code = code.replace(
    /(const driveFileId = decodificar\(headers\['x-drive-file-id'\]\);\n\n)+/g,
    "const driveFileId = decodificar(headers['x-drive-file-id']);\n\n"
  );
  code = code.replace(/(\s+DriveFileId: driveFileId,\n)+/g, '\n      DriveFileId: driveFileId,\n');
  if (!code.includes("const driveFileId = decodificar(headers['x-drive-file-id'])")) {
    code = code.replace("const sharePointIdentifier = decodificar(", "const driveFileId = decodificar(headers['x-drive-file-id']);\n\nconst sharePointIdentifier = decodificar(");
  }
  if (!code.includes('const arquivoId = driveFileId')) {
    code = code.replace("const arquivoId = sharePointItemId", "const arquivoId = driveFileId\n  ? `DRIVE:${driveFileId}`\n  : sharePointItemId");
  }
  if (!code.includes('DriveFileId: driveFileId,')) {
    code = code.replace("SharePoint_Item_ID: sharePointItemId,", "DriveFileId: driveFileId,\n      SharePoint_Item_ID: sharePointItemId,");
  }
  normalizer.parameters.jsCode = code;
  save(document);
}

console.log('Workflows endurecidos com sucesso.');
