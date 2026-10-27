// Pure, offline policy. Embedded verbatim in the n8n Code nodes by the builder.
export function bridgePolicy() {
  const text = v => String(v ?? '').trim();
  const code = v => /^(0|null|undefined)$/i.test(text(v)) ? '' : text(v);
  const id = v => /^[1-9]\d*$/.test(text(v)) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
  function normalize(v) {
    // Never parse ambiguous thousands/decimal separators or discard tolerances.
    return text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
      .replace(/²/g, '2').replace(/(\d)\s*[X×]\s*(?=\d)/g, '$1 X ')
      .replace(/(\d)\s*(MM2|MM|CM|DAN|KVAR|KVA|MVA|KW|MW|KV|KA|V|A|M)\b/g, '$1 $2')
      .replace(/\s+/g, ' ');
  }
  // Generic tokens are fallbacks, never a technical identity.
  const GENERIC = new Set(['OUTROS', 'OUTRO', 'MATERIAL', 'MATERIAIS', 'DIVERSOS', 'NA', 'N/A', 'N A', 'SEM DESCRICAO', 'NULL', 'UNDEFINED']);
  const validName = v => /[A-Z]{2,}/.test(v) && v.replace(/[^A-Z0-9]/g, '').length >= 3 && !GENERIC.has(v);
  function classify(v) {
    const s = normalize(v);
    if (!s) return null;
    // The leading noun wins: "BANCO CAPAC ..." is a bank even when it lists accessories.
    if (/^(BANCO (DE )?CAPAC\w*|CAPACITOR(ES)?\b|CAPAC\b)/.test(s)) return 'CAPACITORES_E_BANCOS';
    const rules = [
      ['ATERRAMENTO', /\b(ATERRAMENTO|HASTE TERRA)\b/],
      ['ELETRODUTOS', /\b(ELETRODUTO|ELETROD)\b/],
      ['CONEXOES_E_TERMINAIS', /\b(CONECTOR|CONECT|CONEC|TERMINAL)\b/],
      ['ESTRUTURAS_E_FERRAGENS', /\b(POSTE|ANEL CONC|CRUZETA|FERRAGEM|ESTRUTURA|PARAFUSO)\b/],
      ['CABOS_E_CONDUTORES', /\b(CABO|CONDUTOR)\b/],
      ['TRANSFORMADORES_MEDICAO', /\b(TC|TP|TRANSFORMADOR DE CORRENTE|TRANSFORMADOR DE POTENCIAL)\b/],
      ['TRANSFORMADORES', /\b(TRANSFORMADOR|TRAFO|TRANSF)\b/],
      ['PROTECAO_ELETRICA', /\b(DISJUNTOR|DISJ|FUSIVEL|PARA[ -]?RAIOS?)\b/],
      ['CHAVES_SECCIONADORAS', /\b(CHAVE|SECCIONADORA)\b/],
      ['CAPACITORES_E_BANCOS', /\b(BANCO (DE )?CAPAC\w*|CAPACITOR|CAPACITORES|CAPAC)\b/],
      ['ISOLADORES', /\b(ISOLADOR|ISOL)\b/]
    ];
    return rules.find(([, re]) => re.test(s))?.[0] ?? 'OUTROS';
  }
  function prepare(raw) {
    const rows = [raw, raw.fields ?? {}];
    const conflicts = [];
    function alias(names, transform = text) {
      const values = rows.flatMap(r => names.map(n => transform(r[n]))).filter(Boolean);
      if (new Set(values).size > 1) conflicts.push(names.join('/'));
      return values[0] ?? '';
    }
    const p = {
      entrada_original: raw,
      codigo_neoenergia: alias(['codigo_neoenergia', 'Codigo_Nordeste', 'Codigo_Neoenergia'], code),
      codigo_elektro: alias(['codigo_elektro', 'Codigo_Elektro'], code),
      codigo_brasilia: alias(['codigo_brasilia', 'Codigo_Brasilia'], code),
      descricao: alias(['descricao', 'Descricao']) || alias(['Material', 'Title']),
      descricao_completa: alias(['descricao_completa', 'Descricao_Completa']),
      especificacao_tecnica: alias(['especificacao_tecnica', 'Especificacao_Tecnica']),
      familia_origem: alias(['familia', 'Familia']),
      subfamilia: alias(['subfamilia', 'SubFamilia', 'Subfamilia']),
      fonte: alias(['fonte', 'Fonte']),
      chave_importacao: alias(['chave_importacao', 'Chave_Importacao']),
      catalogo_item_id: id(alias(['catalogo_item_id', 'id', 'ID'])),
      conflitos_aliases: conflicts
    };
    p.nome_normalizado = normalize(p.descricao);
    p.nome_valido = validName(p.nome_normalizado);
    p.familia_sugerida = p.nome_valido || p.familia_origem ? classify(p.descricao + ' ' + p.familia_origem) : null;
    // Suggestion only: the local schema does not export Choice values.
    p.familia_schema_confirmada = false;
    const pairs = [['Codigo_Neoenergia', p.codigo_neoenergia], ['Codigo_Elektro', p.codigo_elektro], ['Codigo_Brasilia', p.codigo_brasilia]];
    const keys = pairs.filter(([, v]) => v).map(([k, v]) => `${k}:${v}`);
    p.chave_identidade = JSON.stringify(keys.length ? keys : [p.nome_normalizado, normalize(p.especificacao_tecnica)]);
    const escaped = v => text(v).replace(/'/g, "''");
    const filters = pairs.filter(([, v]) => v).map(([k, v]) => `fields/${k} eq '${escaped(v)}'`);
    // Also find legacy/name-only records: these are candidates, never proof by themselves.
    // A received key only widens a search that already has a code or a valid name.
    const legacyKey = alias(['chave_normalizada', 'Chave_Normalizada']);
    if (p.nome_valido) filters.push(`fields/Nome_Normalizado eq '${escaped(p.nome_normalizado)}'`);
    if ((keys.length || p.nome_valido) && validName(normalize(legacyKey))) filters.push(`fields/Chave_Normalizada eq '${escaped(legacyKey)}'`);
    p.filtro_identidade_odata = filters.join(' or ');
    p.possui_codigo_identidade = keys.length > 0;
    p.possui_identidade = (keys.length > 0 || p.nome_valido) && !conflicts.length;
    return p;
  }
  function decide(p, response) {
    const result = (reason, extra = {}) => ({ ...p, versao_politica: 'ponte-local-v2',
      material_oficial_id: null, associacao_catalogo: 'REVISAO_PENDENTE',
      motivo_revisao: reason, escrita_permitida: false, revisao_humana_obrigatoria: true, ...extra });
    if (p.conflitos_aliases.length) return result('CONFLITO_ALIASES');
    if (!p.possui_identidade) return result('SEM_IDENTIDADE');
    if (!response || response.statusCode !== 200 || response.error || !Array.isArray(response.body?.value)
      || response.body.error || response.body['@odata.nextLink']) return result('CONSULTA_INCOMPLETA');
    const rows = response.body.value;
    if (rows.some(r => !id(r?.id) || !r.fields)) return result('RESPOSTA_INVALIDA');
    if (rows.length > 1) return result('MULTIPLOS_OFICIAIS');
    if (!p.possui_codigo_identidade || !p.descricao || !p.especificacao_tecnica) return result('IDENTIDADE_INSUFICIENTE');
    if (!rows.length) return result('NOVO_CANDIDATO_SEM_CADASTRO');
    const r = rows[0], f = r.fields;
    const pairs = [['Codigo_Neoenergia', p.codigo_neoenergia], ['Codigo_Elektro', p.codigo_elektro], ['Codigo_Brasilia', p.codigo_brasilia]];
    if (pairs.some(([k, v]) => v && code(f[k]) && v !== code(f[k]))) return result('CONFLITO_CODIGOS');
    if (!pairs.some(([k, v]) => v && v === code(f[k]))) return result('CHAVE_LEGADA_REQUER_REVISAO');
    // Compare originals, never a potentially damaged legacy normalized name.
    const descriptions = [f.Descricao_Neoenergia, f.Material].filter(v => text(v));
    if (!descriptions.length || descriptions.some(v => normalize(v) !== p.nome_normalizado)
      || normalize(f.Especificacao_Tecnica) !== normalize(p.especificacao_tecnica)
      || (p.descricao_completa && normalize(p.descricao_completa) !== p.nome_normalizado)
      || (text(f.Atributos_Essenciais) && normalize(f.Atributos_Essenciais) !== normalize(p.especificacao_tecnica))
      || (p.subfamilia && normalize(p.subfamilia) !== normalize(f.Subfamilia))) return result('DIVERGENCIA_TECNICA');
    if (f.Status !== 'ATIVO' || f.Tipo_Registro !== 'MATERIAL' || f.Revisao_Obrigatoria !== false) return result('DECISAO_HUMANA_PROTEGIDA');
    return result('IDENTIDADE_CONFIRMADA_PROPOSTA', { material_oficial_id: id(r.id),
      evidencia: { codigos: pairs.filter(([k, v]) => v && v === code(f[k])).map(([k]) => k),
        descricao: p.nome_normalizado, especificacao: normalize(p.especificacao_tecnica), etag_oficial: r.eTag ?? null },
      associacao_catalogo: 'PROPOSTA_SEM_ESCRITA' });
  }
  function association(decision, response) {
    const blocked = reason => ({ ...decision, proposta_lookup: null, motivo_associacao: reason });
    if (decision.motivo_revisao !== 'IDENTIDADE_CONFIRMADA_PROPOSTA' || !id(decision.material_oficial_id) || !id(decision.catalogo_item_id)) return blocked('IDENTIDADE_OU_ID_INVALIDO');
    if (response?.statusCode !== 200 || !response.body?.fields || id(response.body.id) !== decision.catalogo_item_id || !text(response.body.eTag)) return blocked('ORIGEM_NAO_CONFIRMADA');
    const source = prepare(response.body);
    if (source.conflitos_aliases.length || source.chave_identidade !== decision.chave_identidade
      || source.nome_normalizado !== decision.nome_normalizado || source.especificacao_tecnica !== decision.especificacao_tecnica
      || source.descricao_completa !== decision.descricao_completa || source.fonte !== decision.fonte) return blocked('ORIGEM_ALTERADA');
    const fields = response.body.fields;
    if (!Object.hasOwn(fields, 'Material_OficialLookupId')) return blocked('LOOKUP_NAO_CONFIRMADO');
    const current = fields.Material_OficialLookupId;
    if (current !== null && current !== '' && id(current) !== decision.material_oficial_id) return blocked('LOOKUP_EXISTENTE_PROTEGIDO');
    if (id(current) === decision.material_oficial_id) return blocked('JA_ASSOCIADO');
    return { ...decision, motivo_associacao: 'VALIDAR_SCHEMA_LOOKUP_ANTES_DE_ESCREVER',
      proposta_lookup: { item_id: decision.catalogo_item_id, if_match: response.body.eTag,
        fields: { Material_OficialLookupId: decision.material_oficial_id } } };
  }
  return { normalize, classify, prepare, decide, association };
}
