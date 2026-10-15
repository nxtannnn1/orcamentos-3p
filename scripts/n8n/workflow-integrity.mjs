const PROTECTED_HUMAN_ITEM_FIELDS = new Set([
  'Observacao_Item',
  'Material_Aprovado',
  'Material_AprovadoLookupId',
  'Status_Revisao',
  'Enviado_Historico',
  'ReviewedByOid',
  'ReviewedAt',
  'DecisionId',
  'Revisado_Por_Oid',
  'Revisado_Em',
  'Decisao_Id',
  'Author',
  'AuthorLookupId',
  'Editor',
  'EditorLookupId',
  'Created',
  'Modified'
]);

const ALLOWED_AUTOMATIC_ITEM_PATCH_FIELDS = new Set([
  'Title',
  'Codigo_Item',
  'Codigo_OrcamentoLookupId',
  'Numero_Item',
  'DriveFileId',
  'Fornecedor',
  'Codigo_Fornecedor',
  'Referencia_Fornecedor',
  'Descricao_Original',
  'Quantidade',
  'Unidade_Original',
  'Preco_Unitario',
  'Preco_Total',
  'NCM',
  'Material_Sugerido'
]);

const ALLOWED_AUTOMATIC_TAX_PATCH_FIELDS = new Set([
  'Title',
  'Codigo_Tributo_Item',
  'Codigo_ItemLookupId',
  'Codigo_OrcamentoLookupId',
  'Tipo_Tributo',
  'Situacao_Tributaria',
  'DriveFileId',
  'Aliquota_Percentual',
  'Valor_Tributo',
  'Base_Calculo',
  'Observacao_Fiscal'
]);

function objectLiteral(code, variableName) {
  const match = code.match(new RegExp(`const\\s+${variableName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  return match?.[1] ?? '';
}

function objectKeys(literal) {
  return [...literal.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)].map((match) => match[1]);
}

function assignedPatchFields(code) {
  const fields = [];
  const pattern = /fieldsPatch\s*(?:\.\s*([A-Za-z_][A-Za-z0-9_]*)|\[\s*['"]([^'"]+)['"]\s*\])\s*=/g;
  for (const match of code.matchAll(pattern)) fields.push(match[1] ?? match[2]);
  return fields;
}

function protectedFieldsInText(text) {
  return [...PROTECTED_HUMAN_ITEM_FIELDS].filter((field) =>
    new RegExp(`\\b${field}\\b`, 'i').test(text)
  );
}

function validatePersistenceBranch({
  nodes,
  errors,
  suffix,
  prepBase,
  patchBase,
  postBase,
  allowedPatchFields
}) {
  const prepName = `${prepBase}${suffix}`;
  const patchName = `${patchBase}${suffix}`;
  const postName = `${postBase}${suffix}`;
  const prep = nodes.find((node) => node.name === prepName);
  const patch = nodes.find((node) => node.name === patchName);
  const post = nodes.find((node) => node.name === postName);

  if (!prep || !patch || !post) {
    errors.push(`contrato de persistencia incompleto no ramo ${prepName}`);
    return;
  }

  const code = prep.parameters?.jsCode;
  if (typeof code !== 'string') {
    errors.push(`${prepName}: codigo de preparacao ausente`);
    return;
  }

  const declaredFields = [
    ...objectKeys(objectLiteral(code, 'fieldsPatch')),
    ...objectKeys(objectLiteral(code, 'opcionais')),
    ...assignedPatchFields(code)
  ];
  for (const field of new Set(declaredFields)) {
    if (!allowedPatchFields.has(field)) {
      const classification = PROTECTED_HUMAN_ITEM_FIELDS.has(field)
        ? 'campo humano ou de auditoria reservado'
        : 'campo nao autorizado';
      errors.push(`${prepName}: ${classification} no fields_patch: ${field}`);
    }
  }

  const postBoundaries = [code.indexOf('const fieldsPost'), code.indexOf('fields_post')].filter(
    (index) => index >= 0
  );
  const fieldsPostIndex = postBoundaries.length > 0 ? Math.min(...postBoundaries) : -1;
  const patchPreparation = fieldsPostIndex >= 0 ? code.slice(0, fieldsPostIndex) : code;
  for (const field of protectedFieldsInText(patchPreparation)) {
    errors.push(`${prepName}: campo humano ou de auditoria reservado antes de fieldsPost: ${field}`);
  }
  if (!/fields_patch\s*:\s*fieldsPatch\b/.test(code)) {
    errors.push(`${prepName}: fields_patch deve referenciar exclusivamente fieldsPatch`);
  }

  if (patch.parameters?.method !== 'PATCH') {
    errors.push(`${patchName}: metodo deve permanecer PATCH`);
  }
  const patchBody = patch.parameters?.jsonBody;
  if (patchBody !== '={{ $json.fields_patch }}') {
    errors.push(`${patchName}: PATCH deve usar exclusivamente fields_patch`);
  }
  for (const field of protectedFieldsInText(String(patchBody ?? ''))) {
    errors.push(`${patchName}: campo humano ou de auditoria reservado no body: ${field}`);
  }

  if (post.parameters?.method !== 'POST') {
    errors.push(`${postName}: metodo deve permanecer POST`);
  }
  if (post.parameters?.jsonBody !== '={{ { fields: $json.fields_post } }}') {
    errors.push(`${postName}: POST deve usar exclusivamente fields_post`);
  }
}

export function validateAutomaticWorkflowPatches(workflow) {
  const errors = [];
  const nodes = workflow.nodes ?? [];

  for (const suffix of ['', '1']) {
    validatePersistenceBranch({
      nodes,
      errors,
      suffix,
      prepBase: 'PREP - Itens',
      patchBase: 'Patch Item',
      postBase: 'Post Item',
      allowedPatchFields: ALLOWED_AUTOMATIC_ITEM_PATCH_FIELDS
    });
    validatePersistenceBranch({
      nodes,
      errors,
      suffix,
      prepBase: 'PREP - Tributo',
      patchBase: 'PatchTributo',
      postBase: 'Post Tributo',
      allowedPatchFields: ALLOWED_AUTOMATIC_TAX_PATCH_FIELDS
    });
  }

  const coveredPatchNodes = new Set(['Patch Item', 'Patch Item1', 'PatchTributo', 'PatchTributo1']);
  for (const node of nodes) {
    const method = String(node.parameters?.method ?? '').toUpperCase();
    if (method === 'PUT') {
      errors.push(`${node.name}: operacao PUT/UPSERT nao coberta pela regra de integridade`);
    }
    if (method === 'PATCH' && !coveredPatchNodes.has(node.name)) {
      errors.push(`${node.name}: PATCH automatico nao coberto pela regra de integridade`);
    }
  }

  return errors;
}

export const humanDecisionItemFields = Object.freeze([...PROTECTED_HUMAN_ITEM_FIELDS]);
