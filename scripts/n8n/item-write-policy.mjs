// Fonte local do codigo incorporado nas duas rotas do workflow n8n.
// O n8n nao importa este modulo em producao; validate-workflows verifica a paridade.
export function decisionCode(prepNode) {
  return `const preparado = $('${prepNode}').item.json || {};
const resposta = $json;
if (!preparado.codigo_item || !preparado.fields_patch ||
    typeof preparado.fields_patch !== 'object') {
  throw new Error('ITEM_INPUT_INCOMPLETE');
}
if (!resposta || !Array.isArray(resposta.value) || resposta['@odata.nextLink']) {
  throw new Error('ITEM_LOOKUP_INCOMPLETE');
}
if (resposta.value.length > 2) throw new Error('ITEM_LOOKUP_INCOMPLETE');
const exatos = resposta.value.filter((registro) =>
  String(registro?.fields?.Codigo_Item ?? '').trim() === preparado.codigo_item
);
if (exatos.length !== resposta.value.length) {
  throw new Error('ITEM_LOOKUP_INCOMPLETE');
}
if (exatos.length > 1) throw new Error('ITEM_IDENTITY_CONFLICT');
if (exatos.length === 0) {
  return { json: { ...preparado, item_existe: false,
    item_sharepoint_id: null, acao_item: 'POST' } };
}
const item = exatos[0];
const id = Number(item.id);
const fields = item.fields;
const etag = item.eTag ?? item['@odata.etag'];
if (!Number.isInteger(id) || id < 1 || !fields ||
    typeof fields !== 'object' || Array.isArray(fields) ||
    typeof etag !== 'string' || !etag.trim() || etag === '*' ||
    etag.length > 512 || /[\\r\\n]/.test(etag) ||
    !Object.prototype.hasOwnProperty.call(fields, 'Status_Revisao') ||
    !Object.prototype.hasOwnProperty.call(fields, 'Enviado_Historico') ||
    !Object.prototype.hasOwnProperty.call(fields, 'Correcao_Operacao_Id')) {
  throw new Error('ITEM_STATE_INCOMPLETE');
}
if (fields.Status_Revisao !== 'PENDENTE' ||
    fields.Enviado_Historico !== 'NAO' ||
    String(fields.Correcao_Operacao_Id ?? '').trim() ||
    String(fields.Correcao_Humana_JSON ?? '').trim() ||
    String(fields.Extracao_Original_JSON ?? '').trim()) {
  throw new Error('ITEM_AUTOMATIC_UPDATE_BLOCKED');
}
const mesmoValor = (a, b) =>
  a === b || (typeof a === 'number' && typeof b === 'string' &&
    b.trim() !== '' && Number(b) === a) ||
  (typeof b === 'number' && typeof a === 'string' &&
    a.trim() !== '' && Number(a) === b);
const semAlteracoes = Object.entries(preparado.fields_patch).every(
  ([coluna, valor]) =>
    Object.prototype.hasOwnProperty.call(fields, coluna) &&
    mesmoValor(fields[coluna], valor)
);
return { json: { ...preparado, item_existe: true,
  item_sharepoint_id: id, item_etag: etag,
  acao_item: semAlteracoes ? 'UNCHANGED' : 'PATCH' } };`;
}

export function normalizePatchCode(decisionNode) {
  return `const decisao = $('${decisionNode}').item.json;
const id = Number(decisao.item_sharepoint_id);
if (!Number.isInteger(id) || id < 1) {
  throw new Error('ITEM_ID_INCOMPLETE');
}
if (decisao.acao_item === 'PATCH') {
  const resposta = $json;
  if (!resposta || typeof resposta !== 'object' || Array.isArray(resposta) ||
      !Object.keys(resposta).length ||
      resposta.Codigo_Item !== decisao.codigo_item) {
    throw new Error('ITEM_PATCH_RESPONSE_INCOMPLETE');
  }
  const mesmoValor = (a, b) =>
    a === b || (typeof a === 'number' && typeof b === 'string' &&
      b.trim() !== '' && Number(b) === a) ||
    (typeof b === 'number' && typeof a === 'string' &&
      a.trim() !== '' && Number(a) === b);
  for (const [coluna, valor] of Object.entries(decisao.fields_patch)) {
    if (!Object.prototype.hasOwnProperty.call(resposta, coluna) ||
        !mesmoValor(resposta[coluna], valor)) {
      throw new Error('ITEM_PATCH_RESPONSE_INCOMPLETE');
    }
  }
} else if (decisao.acao_item !== 'UNCHANGED') {
  throw new Error('ITEM_ACTION_INVALID');
}
return [{ json: {
  operacao_item: decisao.acao_item,
  item_sharepoint_id: id,
  codigo_item: decisao.codigo_item,
  codigo_orcamento: decisao.codigo_orcamento,
  orcamento_sharepoint_id: Number(decisao.orcamento_sharepoint_id),
  drive_file_id: decisao.drive_file_id || '',
  tributos: Array.isArray(decisao.tributos) ? decisao.tributos : []
} }];`;
}
