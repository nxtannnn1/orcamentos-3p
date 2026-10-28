// Pure plan/approval policy for the SAP bridge (R02). Embedded verbatim in the n8n Code nodes
// by build-material-bridge-sap.mjs, on top of bridgePolicy(). No network, no Node built-ins.
export function planPolicy(base) {
  const VERSION = 'ponte-sap-r02';
  const text = v => String(v ?? '').trim();
  const id = v => /^[1-9]\d*$/.test(text(v)) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
  const CODE_FIELDS = { Codigo_Nordeste: 'codigo_neoenergia', Codigo_Elektro: 'codigo_elektro', Codigo_Brasilia: 'codigo_brasilia' };
  const OFFICIAL_CODE = { codigo_neoenergia: 'Codigo_Neoenergia', codigo_elektro: 'Codigo_Elektro', codigo_brasilia: 'Codigo_Brasilia' };
  const LOOKUP = 'Material_OficialLookupId';
  const escaped = v => text(v).replace(/'/g, "''");
  const blocked = (etapa, motivo, extra = {}) => ({ versao_politica: VERSION, etapa, status: 'BLOQUEADO', motivo,
    escrita_permitida: false, revisao_humana_obrigatoria: true, ...extra });

  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
    return JSON.stringify(v ?? null);
  }
  // SHA-256 without crypto: n8n may not allow built-in modules in Code nodes.
  function sha256(value) {
    const bytes = [];
    for (const ch of String(value)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) bytes.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else bytes.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    const rotr = (x, n) => x >>> n | x << 32 - n;
    const h = [], k = [];
    for (let n = 2, found = 0; found < 64; n++) {
      let prime = true;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
      if (!prime) continue;
      if (found < 8) h[found] = Math.pow(n, 1 / 2) * 2 ** 32 | 0;
      k[found++] = Math.pow(n, 1 / 3) * 2 ** 32 | 0;
    }
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLength / 2 ** (i * 8)) & 255);
    for (let off = 0; off < bytes.length; off += 64) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = bytes[off + i * 4] << 24 | bytes[off + i * 4 + 1] << 16 | bytes[off + i * 4 + 2] << 8 | bytes[off + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
        w[i] = w[i - 16] + s0 + w[i - 7] + s1 | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + (e & f ^ ~e & g) + k[i] + w[i] | 0;
        const t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + (a & b ^ a & c ^ b & c) | 0;
        hh = g; g = f; f = e; e = d + t1 | 0; d = c; c = b; b = a; a = t1 + t2 | 0;
      }
      [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = h[i] + v | 0; });
    }
    return h.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function configIssues(config) {
    const issues = [];
    const values = [config?.graph_base, config?.site, config?.listas?.CATALOGO_NEOENERGIA, config?.listas?.MATERIAIS_OFICIAIS];
    if (values.some(v => !text(v) || /PLACEHOLDER/.test(v))) issues.push('CONFIG_AMBIENTE_PENDENTE');
    if (text(config?.graph_base) && !/^https:\/\/graph\.microsoft\.com\/v1\.0$/.test(config.graph_base)) issues.push('CONFIG_GRAPH_BASE_INVALIDA');
    return issues;
  }

  function entrada(raw, config) {
    const modo = text(raw?.modo || 'PREPARAR').toUpperCase();
    const campo = text(raw?.campo_codigo || 'Codigo_Nordeste');
    const codigo = text(raw?.codigo_sap);
    const common = { modo, campo_codigo: campo, codigo_sap: codigo };
    if (!['PREPARAR', 'APLICAR'].includes(modo)) return blocked('ENTRADA', 'MODO_INVALIDO', common);
    if (!Object.hasOwn(CODE_FIELDS, campo)) return blocked('ENTRADA', 'CAMPO_CODIGO_INVALIDO', common);
    if (!/^[0-9A-Za-z][0-9A-Za-z._\/-]{0,39}$/.test(codigo) || /^(0+|null|undefined)$/i.test(codigo)) return blocked('ENTRADA', 'CODIGO_SAP_INVALIDO', common);
    const issues = configIssues(config);
    if (issues.length) return blocked('ENTRADA', issues[0], common);
    const root = `${config.graph_base}/sites/${config.site}/lists/`;
    return { versao_politica: VERSION, etapa: 'ENTRADA', status: 'OK', motivo: null, ...common,
      aprovacao: raw?.aprovacao ?? null,
      filtro_catalogo_odata: `fields/${campo} eq '${escaped(codigo)}'`,
      urls: { catalogo_itens: root + config.listas.CATALOGO_NEOENERGIA + '/items',
        oficiais_itens: root + config.listas.MATERIAIS_OFICIAIS + '/items' } };
  }

  function complete(response) {
    return response && !response.error && response.statusCode === 200 && Array.isArray(response.body?.value)
      && !response.body.error && !response.body['@odata.nextLink'];
  }
  const httpDetail = r => ({ http_status: r?.statusCode ?? null, erro_transporte: r?.error ? text(r.error.message ?? r.error).slice(0, 200) : null });

  function agrupar(input, response) {
    const ctx = { modo: input.modo, codigo_sap: input.codigo_sap, campo_codigo: input.campo_codigo };
    if (!complete(response)) return blocked('CATALOGO', 'CONSULTA_CATALOGO_INCOMPLETA', { ...ctx, ...httpDetail(response) });
    const rows = response.body.value;
    if (!rows.length) return blocked('CATALOGO', 'SAP_NAO_ENCONTRADO_NO_CATALOGO', ctx);
    const registros = [];
    for (const row of rows) {
      const catalogoId = id(row?.id);
      if (!catalogoId || !row.fields) return blocked('CATALOGO', 'CATALOGO_ITEM_ID_INVALIDO', ctx);
      if (!text(row.eTag)) return blocked('CATALOGO', 'ETAG_CATALOGO_AUSENTE', { ...ctx, catalogo_item_id: catalogoId });
      if (text(row.fields[input.campo_codigo]) !== input.codigo_sap) return blocked('CATALOGO', 'RESPOSTA_CATALOGO_INCONSISTENTE', { ...ctx, catalogo_item_id: catalogoId });
      const p = base.prepare(row);
      if (p.conflitos_aliases.length) return blocked('CATALOGO', 'CONFLITO_ALIASES', { ...ctx, catalogo_item_id: catalogoId, conflitos: p.conflitos_aliases });
      const hasLookup = Object.hasOwn(row.fields, LOOKUP);
      const rawLookup = row.fields[LOOKUP];
      const empty = !hasLookup || rawLookup === null || rawLookup === '';
      if (!empty && !id(rawLookup)) return blocked('CATALOGO', 'LOOKUP_INVALIDO', { ...ctx, catalogo_item_id: catalogoId });
      registros.push({ catalogo_item_id: catalogoId, etag: row.eTag, lookup_atual: empty ? null : id(rawLookup),
        // Graph omits empty columns; absence is read as empty and re-checked by If-Match and the confirmation GET.
        lookup_inferido_vazio: !hasLookup, fornecedor: text(row.fields.Fornecedor), status_homologacao: text(row.fields.Status_Homologacao),
        fonte: p.fonte, preparado: p });
    }
    const tech = r => canonical([r.preparado.nome_normalizado, base.normalize(r.preparado.especificacao_tecnica),
      base.normalize(r.preparado.subfamilia), base.normalize(r.preparado.descricao_completa)]);
    const groups = {};
    for (const r of registros) (groups[tech(r)] ||= []).push(r.catalogo_item_id);
    const summary = registros.map(({ preparado, ...r }) => r);
    if (Object.keys(groups).length > 1) return blocked('CATALOGO', 'AMBIGUIDADE_TECNICA', { ...ctx, grupos: Object.values(groups), registros: summary });
    const merged = {};
    for (const [field, key] of Object.entries(CODE_FIELDS)) {
      const values = [...new Set(registros.map(r => r.preparado[key]).filter(Boolean))];
      if (values.length > 1) return blocked('CATALOGO', 'CONFLITO_CODIGOS_CATALOGO', { ...ctx, campo: field, registros: summary });
      merged[field] = values[0] ?? '';
    }
    const first = registros[0].preparado;
    const identidade = base.prepare({ ...merged, Descricao: first.descricao, Descricao_Completa: first.descricao_completa,
      Especificacao_Tecnica: first.especificacao_tecnica, SubFamilia: first.subfamilia, Familia: first.familia_origem, Fonte: first.fonte });
    if (!identidade.possui_codigo_identidade || !identidade.nome_valido || !text(identidade.especificacao_tecnica)) {
      return blocked('CATALOGO', 'IDENTIDADE_INSUFICIENTE', { ...ctx, registros: summary });
    }
    const fontes = [...new Set(registros.map(r => r.fonte).filter(Boolean))];
    return { versao_politica: VERSION, etapa: 'CATALOGO', status: 'OK', motivo: null, ...ctx, identidade, registros: summary,
      alertas: fontes.length > 1 ? ['FONTES_MULTIPLAS'] : [], filtro_oficiais_odata: identidade.filtro_identidade_odata };
  }

  function criarPayload(p, config) {
    const familia = p.familia_sugerida;
    if (!familia || familia === 'OUTROS') return { erro: 'FAMILIA_NAO_CLASSIFICADA' };
    const confirmed = config?.choices_confirmados ?? {};
    if (!(confirmed.Familia ?? []).includes(familia)) return { erro: 'CHOICE_NAO_CONFIRMADO', campo: 'Familia', valor: familia };
    const fields = { Title: p.descricao, Material: p.descricao, Descricao_Neoenergia: p.descricao, Nome_Normalizado: p.nome_normalizado,
      Especificacao_Tecnica: p.especificacao_tecnica, Familia: familia, Categoria: familia, Revisao_Obrigatoria: true };
    if (p.subfamilia) fields.Subfamilia = p.subfamilia;
    for (const [key, field] of Object.entries(OFFICIAL_CODE)) if (p[key]) fields[field] = p[key];
    // Historical format (all officials read on 2026-10-28). Not unique in SharePoint; Codigo_Neoenergia is.
    if (p.codigo_neoenergia) fields.Chave_Normalizada = `NEOENERGIA_${p.codigo_neoenergia}`;
    // Optional Choice values are written only when explicitly configured and confirmed for this list.
    for (const [field, value] of Object.entries(config?.valores_novo_material ?? {})) {
      if (value === null || value === undefined || value === '') continue;
      if (!['Status', 'Tipo_Registro', 'Origem_Catalogo', 'Unidade_Padrao'].includes(field)) return { erro: 'CAMPO_NAO_PERMITIDO', campo: field };
      if (!(confirmed[field] ?? []).includes(value)) return { erro: 'CHOICE_NAO_CONFIRMADO', campo: field, valor: value };
      if (field === 'Status' && value === 'ATIVO') return { erro: 'STATUS_ATIVO_PROIBIDO_NA_CRIACAO', campo: field };
      fields[field] = value;
    }
    return { fields };
  }

  // Field-level comparison for reporting only; it never authorizes a write.
  function diferencas(p, f, config) {
    const list = [];
    const codeOf = v => /^(0|null|undefined)$/i.test(text(v)) ? '' : text(v);
    for (const [key, field] of Object.entries(OFFICIAL_CODE)) {
      const mine = p[key], theirs = codeOf(f[field]);
      if (mine && theirs && mine !== theirs) list.push({ campo: field, tipo: 'CONFLITO_CODIGO' });
      else if (mine && !theirs) list.push({ campo: field, tipo: 'AUSENTE_NO_OFICIAL' });
    }
    for (const [field, mine] of [['Material', p.descricao], ['Descricao_Neoenergia', p.descricao], ['Especificacao_Tecnica', p.especificacao_tecnica], ['Subfamilia', p.subfamilia]]) {
      if (!text(mine)) continue;
      if (!text(f[field])) list.push({ campo: field, tipo: 'AUSENTE_NO_OFICIAL' });
      else if (base.normalize(f[field]) !== base.normalize(mine)) list.push({ campo: field, tipo: 'TEXTO_DIVERGENTE' });
    }
    if (p.familia_sugerida && text(f.Familia) !== p.familia_sugerida) list.push({ campo: 'Familia', tipo: 'DIFERENTE_DA_SUGESTAO' });
    if (text(f.Familia) && !(config?.choices_confirmados?.Familia ?? []).includes(text(f.Familia))) list.push({ campo: 'Familia', tipo: 'CHOICE_NAO_CONFIRMADO' });
    return list;
  }
  const estadoOficial = (row) => ({ id: id(row.id), etag: row.eTag ?? null, Status: row.fields.Status ?? null, Tipo_Registro: row.fields.Tipo_Registro ?? null,
    Revisao_Obrigatoria: row.fields.Revisao_Obrigatoria ?? null, Familia: row.fields.Familia ?? null, Categoria: row.fields.Categoria ?? null });

  function planejar(grupo, response, config) {
    const ctx = { modo: grupo.modo, codigo_sap: grupo.codigo_sap, campo_codigo: grupo.campo_codigo, registros: grupo.registros };
    const p = grupo.identidade;
    const decision = base.decide(p, response);
    const reason = decision.motivo_revisao;
    const rows = complete(response) ? response.body.value : [];
    const linked = [...new Set(grupo.registros.map(r => r.lookup_atual).filter(Boolean))];
    const allLinkedTo = linked.length === 1 && grupo.registros.every(r => r.lookup_atual === linked[0]) ? linked[0] : null;
    // A group already fully linked to the single official returned by the search is consistent:
    // nothing is proposed, whatever the official's state; differences go to human review.
    if (allLinkedTo && complete(response) && rows.length === 1 && rows[0]?.fields && id(rows[0].id) === allLinkedTo) {
      const divergencias = diferencas(p, rows[0].fields, config);
      return { versao_politica: VERSION, etapa: 'PLANO', status: 'SEM_ALTERACAO',
        motivo: divergencias.length ? 'JA_CONSOLIDADO_COM_DIVERGENCIAS' : 'JA_CONSOLIDADO', ...ctx,
        material_oficial_id: allLinkedTo, material_oficial: estadoOficial(rows[0]), divergencias,
        alertas: [...grupo.alertas, ...(reason === 'IDENTIDADE_CONFIRMADA_PROPOSTA' ? [] : [`GUARDA_DE_ASSOCIACAO: ${reason}`])],
        operacoes: [], escrita_permitida: false, revisao_humana_obrigatoria: divergencias.length > 0 };
    }
    if (allLinkedTo && complete(response) && !rows.some(r => id(r?.id) === allLinkedTo)) {
      return blocked('PLANO', 'VINCULADO_A_MATERIAL_NAO_LOCALIZADO', { ...ctx, material_oficial_id: allLinkedTo,
        oficiais_encontrados: rows.map(r => id(r?.id)) });
    }
    let target = null, official = null;
    if (reason === 'IDENTIDADE_CONFIRMADA_PROPOSTA') {
      target = decision.material_oficial_id; official = rows[0];
    } else if (reason === 'DECISAO_HUMANA_PROTEGIDA') {
      // Protected state blocks new links; a fully linked group was already handled above.
      return blocked('PLANO', 'MATERIAL_OFICIAL_PROTEGIDO', { ...ctx, material_oficial_id: id(rows[0].id) });
    } else if (reason !== 'NOVO_CANDIDATO_SEM_CADASTRO') {
      return blocked('PLANO', reason === 'CONSULTA_INCOMPLETA' ? 'CONSULTA_OFICIAIS_INCOMPLETA' : reason, { ...ctx, ...httpDetail(response) });
    }
    if (linked.some(v => v !== target)) return blocked('PLANO', 'VINCULO_CONFLITANTE', { ...ctx, material_oficial_id: target, vinculos_existentes: linked });
    const plano = { versao_politica: VERSION, codigo_sap: grupo.codigo_sap, campo_codigo: grupo.campo_codigo,
      identidade: { chave: p.chave_identidade, nome_normalizado: p.nome_normalizado, especificacao: base.normalize(p.especificacao_tecnica),
        subfamilia: p.subfamilia, familia_sugerida: p.familia_sugerida },
      material_oficial: target ? { acao: 'REUTILIZAR', id: target, etag: official?.eTag ?? null } : { acao: 'CRIAR' },
      operacoes: [], ja_associados: grupo.registros.filter(r => r.lookup_atual === target && target).map(r => r.catalogo_item_id),
      estado_lido: grupo.registros.map(r => ({ catalogo_item_id: r.catalogo_item_id, etag: r.etag, lookup_atual: r.lookup_atual })) };
    if (!target) {
      const payload = criarPayload(p, config);
      if (payload.erro) return blocked('PLANO', payload.erro, { ...ctx, detalhe: payload });
      plano.material_oficial.fields_post = payload.fields;
      plano.operacoes.push({ tipo: 'CRIAR_MATERIAL_OFICIAL' });
    }
    for (const r of grupo.registros.filter(r => r.lookup_atual === null)) {
      plano.operacoes.push({ tipo: 'ASSOCIAR_CATALOGO', catalogo_item_id: r.catalogo_item_id, if_match: r.etag,
        material_oficial_id: target ?? 'CRIADO_NESTE_PLANO', fornecedor: r.fornecedor });
    }
    if (!plano.operacoes.length) {
      return { versao_politica: VERSION, etapa: 'PLANO', status: 'SEM_ALTERACAO', motivo: 'JA_CONSOLIDADO', ...ctx,
        material_oficial_id: target, operacoes: [], alertas: grupo.alertas, escrita_permitida: false, revisao_humana_obrigatoria: false };
    }
    const alertas = [...grupo.alertas, ...grupo.registros.filter(r => r.lookup_inferido_vazio && r.lookup_atual === null).length ? ['LOOKUP_VAZIO_INFERIDO_POR_AUSENCIA'] : []];
    return { versao_politica: VERSION, etapa: 'PLANO', status: 'PROPOSTA', motivo: target ? 'ASSOCIAR_A_EXISTENTE' : 'CRIAR_E_ASSOCIAR',
      ...ctx, plano, plano_hash: sha256(canonical(plano)), alertas, escrita_permitida: false, revisao_humana_obrigatoria: true };
  }

  function autorizar(plan, input, config) {
    if (plan.status !== 'PROPOSTA') return plan;
    if (input.modo !== 'APLICAR') return { ...plan, status: 'PREPARADO', motivo: 'AGUARDANDO_APROVACAO_HUMANA',
      instrucao: 'Revisar o plano e reexecutar com modo APLICAR, aprovacao.plano_hash, aprovacao.aprovado_por e aprovacao.confirmacao = APLICAR_PLANO.' };
    const approval = input.aprovacao ?? {};
    const ctx = { modo: plan.modo, codigo_sap: plan.codigo_sap, plano_hash_atual: plan.plano_hash, plano: plan.plano };
    if (config?.escrita_habilitada !== true) return blocked('APROVACAO', 'ESCRITA_DESABILITADA_NO_AMBIENTE', ctx);
    if (text(approval.confirmacao) !== 'APLICAR_PLANO' || text(approval.aprovado_por).length < 3 || !/^[0-9a-f]{64}$/.test(text(approval.plano_hash))) {
      return blocked('APROVACAO', 'APROVACAO_AUSENTE_OU_INVALIDA', ctx);
    }
    // The plan is recomputed from fresh reads; any change to records or ETags changes the hash.
    if (approval.plano_hash !== plan.plano_hash) return blocked('APROVACAO', 'PLANO_DIVERGENTE_REPREPARAR', ctx);
    return { versao_politica: VERSION, etapa: 'APROVACAO', status: 'AUTORIZADO', motivo: null, codigo_sap: plan.codigo_sap,
      plano: plan.plano, plano_hash: plan.plano_hash, aprovado_por: text(approval.aprovado_por),
      requer_criacao: plan.plano.material_oficial.acao === 'CRIAR', fields_post: plan.plano.material_oficial.fields_post ?? null };
  }

  function verificarCriacao(autz, response, oficiaisUrl) {
    const created = response?.body;
    if (response?.statusCode === 409) return blocked('CRIACAO', 'CRIACAO_CONFLITO_DUPLICIDADE', { ...httpDetail(response), plano_hash: autz.plano_hash });
    if (response?.statusCode !== 201 || !id(created?.id)) return blocked('CRIACAO', 'CRIACAO_NAO_CONFIRMADA', { ...httpDetail(response), plano_hash: autz.plano_hash,
      instrucao: 'Nao repetir a aplicacao. Reexecutar PREPARAR para verificar se o material foi criado.' });
    return { versao_politica: VERSION, etapa: 'CRIACAO', status: 'OK', material_oficial_id: id(created.id), url_confirmacao: `${oficiaisUrl}/${id(created.id)}` };
  }

  function confirmarCriacao(autz, criacao, response) {
    const f = response?.body?.fields;
    const expected = autz.fields_post ?? {};
    const same = f && id(response.body.id) === criacao.material_oficial_id && f.Revisao_Obrigatoria === true
      && Object.values(OFFICIAL_CODE).every(k => text(f[k]) === text(expected[k])) && text(f.Status) !== 'ATIVO'
      && ['Status', 'Tipo_Registro', 'Unidade_Padrao', 'Chave_Normalizada'].every(k => expected[k] === undefined || text(f[k]) === text(expected[k]))
      && base.normalize(f.Material) === base.normalize(expected.Material)
      && base.normalize(f.Especificacao_Tecnica) === base.normalize(expected.Especificacao_Tecnica);
    if (response?.statusCode !== 200 || !same) return blocked('CRIACAO', 'CRIACAO_NAO_CONFIRMADA_POR_LEITURA', { material_oficial_id: criacao.material_oficial_id, ...httpDetail(response) });
    return { ...criacao, status: 'CONFIRMADO' };
  }

  function associacoes(autz, criacao, catalogoUrl) {
    const target = autz.requer_criacao ? criacao.material_oficial_id : autz.plano.material_oficial.id;
    return autz.plano.operacoes.filter(o => o.tipo === 'ASSOCIAR_CATALOGO').map(o => ({
      versao_politica: VERSION, etapa: 'ASSOCIACAO', catalogo_item_id: o.catalogo_item_id, material_oficial_id: target,
      if_match: o.if_match, fornecedor: o.fornecedor,
      fields_patch: { [LOOKUP]: String(target) },
      url_patch: `${catalogoUrl}/${o.catalogo_item_id}/fields`, url_item: `${catalogoUrl}/${o.catalogo_item_id}` }));
  }

  function verificarAssociacao(op, patch, check) {
    const read = check?.statusCode === 200 && id(check.body?.id) === op.catalogo_item_id ? check.body.fields ?? {} : null;
    const current = read ? id(read[LOOKUP]) : null;
    const result = (status, motivo) => ({ catalogo_item_id: op.catalogo_item_id, fornecedor: op.fornecedor, material_oficial_id: op.material_oficial_id,
      status, motivo, http_patch: patch?.statusCode ?? null, http_confirmacao: check?.statusCode ?? null, lookup_lido: current });
    if (!read) return result('NAO_CONFIRMADO', 'LEITURA_DE_CONFIRMACAO_FALHOU');
    if (patch?.statusCode === 200) return current === op.material_oficial_id ? result('ASSOCIADO', 'CONFIRMADO_POR_LEITURA') : result('DIVERGENTE', 'VALOR_LIDO_DIFERENTE_APOS_ESCRITA');
    if (current === op.material_oficial_id) return result('ASSOCIADO', 'CONFIRMADO_POR_LEITURA_APOS_RESPOSTA_DE_FALHA');
    if (patch?.statusCode === 412) return result('CONFLITO', 'ETAG_DESATUALIZADO_SEM_REAPLICACAO');
    return result('FALHA', patch?.error ? 'ERRO_DE_TRANSPORTE' : `HTTP_${patch?.statusCode ?? 'SEM_RESPOSTA'}`);
  }

  function relatorio(autz, criacao, resultados) {
    const ok = resultados.filter(r => r.status === 'ASSOCIADO').length;
    return { versao_politica: VERSION, etapa: 'RELATORIO', status: ok === resultados.length ? 'CONCLUIDO' : ok ? 'CONCLUIDO_PARCIAL' : 'FALHOU',
      codigo_sap: autz.codigo_sap, plano_hash: autz.plano_hash, aprovado_por: autz.aprovado_por,
      material_oficial: { id: criacao?.material_oficial_id ?? autz.plano.material_oficial.id, criado_nesta_execucao: autz.requer_criacao },
      associacoes: resultados, pendentes_revisao: resultados.filter(r => r.status !== 'ASSOCIADO').map(r => r.catalogo_item_id),
      instrucao: ok === resultados.length ? null : 'Itens nao associados voltam para revisao. Reexecutar PREPARAR; nunca reaplicar o mesmo plano.' };
  }

  return { sha256, canonical, entrada, agrupar, criarPayload, planejar, autorizar, verificarCriacao, confirmarCriacao, associacoes, verificarAssociacao, relatorio };
}
