// PBIR visuals for the 7 pages of "3P-Compras" (format mirrored from Power BI Desktop 2.159 visual.json files).
// Layout grid: 1280 × 720. Header 0-58, slicers 64-118, content from 126.
const SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.7.0/schema.json';
export const COLORS = { dark: '#0B3D2E', green: '#1F7A4D', light: '#F3F7F4', grey: '#5B6B66', white: '#FFFFFF', alert: '#B42318' };

// ---------- field references ----------
export const M = name => ({ kind: 'measure', table: '_Medidas', name });
export const C = (table, name) => ({ kind: 'column', table, name });
const fieldExpr = f => f.kind === 'measure'
  ? { Measure: { Expression: { SourceRef: { Entity: f.table } }, Property: f.name } }
  : { Column: { Expression: { SourceRef: { Entity: f.table } }, Property: f.name } };
const projection = (f, active) => ({ field: fieldExpr(f), queryRef: `${f.table}.${f.name}`, nativeQueryRef: f.label ?? f.name, ...(active ? { active: true } : {}) });
// PBIR literals: numbers carry a type suffix and are NOT quoted ("20D", "2L"); only text is quoted ('Dropdown').
// Quoting "20D" made Desktop ignore font sizes, radius and transparency (23/10/2026).
const literal = value => ({ expr: { Literal: { Value:
  typeof value === 'string' && !/^-?\d+(\.\d+)?[DLM]$/.test(value) ? `'${value.replace(/'/g, "''")}'` : String(value) } } });
const color = hex => ({ solid: { color: literal(hex) } });

function container(title, extra = {}) {
  return {
    title: [{ properties: { show: literal(!!title), ...(title ? { text: literal(title), fontColor: color(COLORS.dark), fontSize: literal(extra.titleSize ?? '11D') } : {}) } }],
    background: [{ properties: { show: literal(true), color: color(extra.background ?? COLORS.white), transparency: literal('0D') } }],
    border: [{ properties: { show: literal(!extra.noBorder), color: color('#DCE7E1'), radius: literal('8D') } }],
    ...(extra.noHeader ? { visualHeader: [{ properties: { show: literal(false) } }] } : {}),
  };
}

// Categorical "In" filter on a column (visual level).
function inFilter(name, f, values) {
  return {
    name, type: 'Categorical', field: fieldExpr(f), howCreated: 'User',
    filter: { Version: 2, From: [{ Name: 'f', Entity: f.table, Type: 0 }],
      Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: 'f' } }, Property: f.name } }], Values: values.map(v => [literal(v).expr]) } } }] },
  };
}

// ---------- visual factories ----------
let counter = 0;
const id = prefix => `${prefix}${String(++counter).padStart(2, '0')}`;
const pos = (x, y, width, height, z) => ({ x, y, z: z * 1000, height, width, tabOrder: z * 1000 });

function visual(visualType, roles, at, { title, objects, sort, filters, extra } = {}) {
  const queryState = Object.fromEntries(Object.entries(roles).map(([role, fields]) =>
    // "active" marks drill/hierarchy axes only. On a table's Values role it made Desktop drop the measure columns.
    [role, { projections: fields.map(f => projection(f, ['Category', 'Rows', 'Columns'].includes(role) && f.kind === 'column')) }]));
  return {
    $schema: SCHEMA, name: id(visualType.slice(0, 3)), position: at,
    visual: {
      visualType, query: { queryState, ...(sort ? { sortDefinition: { sort: [{ field: fieldExpr(sort.field), direction: sort.direction ?? 'Descending' }], isDefaultSort: true } } : {}) },
      ...(objects ? { objects } : {}),
      visualContainerObjects: container(title, extra),
      drillFilterOtherVisuals: true,
    },
    ...(filters ? { filterConfig: { filters } } : {}),
  };
}

const header = (text, subtitle) => ({
  $schema: SCHEMA, name: id('tit'), position: pos(0, 0, 1280, 58, 0),
  visual: {
    visualType: 'textbox',
    objects: { general: [{ properties: { paragraphs: [
      { textRuns: [{ value: text, textStyle: { fontSize: '18pt', fontWeight: 'bold', color: COLORS.white } },
        { value: `   ${subtitle}`, textStyle: { fontSize: '10pt', color: '#CFE3D8' } }] },
    ] } }] },
    visualContainerObjects: container(null, { background: COLORS.dark, noBorder: true, noHeader: true }),
    drillFilterOtherVisuals: true,
  },
});

const slicer = (f, title, x, width, z) => visual('slicer', { Values: [f] }, pos(x, 64, width, 54, z), {
  title, objects: { data: [{ properties: { mode: literal('Dropdown') } }] },
});
const slicers = (z = 1) => [
  slicer(C('Calendario', 'Mes'), 'Período', 0, 310, z),
  slicer(C('Materiais', 'Familia'), 'Família', 323, 310, z + 1),
  slicer(C('Materiais', 'Material_Rotulo'), 'Material', 646, 310, z + 2),
  slicer(C('Fornecedores', 'Fornecedor'), 'Fornecedor', 969, 311, z + 3),
];
const card = (measure, title, x, y, width, height, z) => visual('card', { Values: [M(measure)] }, pos(x, y, width, height, z), {
  title, objects: { categoryLabels: [{ properties: { show: literal(false) } }], labels: [{ properties: { color: color(COLORS.dark), fontSize: literal('20D') } }] },
  extra: { titleSize: '9D' },
});
const cardRow = (items, y, height, z, x0 = 0, total = 1280, gap = 8) => {
  const width = Math.floor((total - gap * (items.length - 1)) / items.length);
  return items.map(([measure, title], i) => card(measure, title, x0 + i * (width + gap), y, width, height, z + i));
};
const warning = (y, z) => visual('card', { Values: [M('Aviso de Base')] }, pos(0, y, 1280, 44, z), {
  objects: { categoryLabels: [{ properties: { show: literal(false) } }], labels: [{ properties: { color: color(COLORS.alert), fontSize: literal('11D') } }],
    wordWrap: [{ properties: { show: literal(true) } }] },
  extra: { background: '#FDF3F2' },
});
const table = (fields, title, at, sort, filters) => visual('tableEx', { Values: fields }, at, { title, sort, filters });

// ---------- pages ----------
export function pageVisuals() {
  counter = 0;
  return [
    // 1 Visão Executiva
    [header('Visão Executiva — Compras 3P', 'menores preços, economia potencial e rastreabilidade'), ...slicers(),
      ...cardRow([['Gasto Registrado', 'Gasto registrado'], ['Economia Potencial (R$)', 'Economia potencial (R$)'], ['Economia Potencial (%)', 'Economia potencial (%)'],
        ['Materiais Cotados', 'Materiais cotados'], ['Fornecedores Cotados', 'Fornecedores cotados'], ['% Rastreabilidade das Decisões', 'Decisões rastreáveis'],
        ['Pendências de Integridade', 'Pendências de integridade']], 126, 86, 10),
      warning(218, 20),
      table([C('Materiais', 'Material_Rotulo'), M('Preço Mínimo do Mercado'), M('Fornecedor com Menor Preço'), M('Último Preço Unitário'), M('Cotações Válidas'), M('Economia Potencial (R$)')],
        'Melhor preço por material', pos(0, 270, 780, 450, 21), { field: M('Economia Potencial (R$)') }),
      visual('barChart', { Category: [C('Materiais', 'Material_Rotulo')], Y: [M('Economia Potencial (R$)')] }, pos(788, 270, 492, 450, 22),
        { title: 'Economia potencial por material (R$)', sort: { field: M('Economia Potencial (R$)') } })],
    // 2 Preços por Material
    [header('Preços por Material', 'preço médio ponderado por fornecedor e dispersão'), ...slicers(),
      visual('pivotTable', { Rows: [C('Materiais', 'Material_Rotulo')], Columns: [C('Fornecedores', 'Fornecedor')], Values: [M('Preço Unitário Médio Ponderado')] },
        pos(0, 126, 1280, 290, 10), { title: 'Preço unitário médio ponderado — material × fornecedor' }),
      table([C('Materiais', 'Material_Rotulo'), C('Materiais', 'Unidade_Padrao'), M('Preço Unitário Mínimo'), M('Preço Unitário Médio Ponderado'), M('Preço Unitário Máximo'),
        M('Dispersão de Preço %'), M('Cotações Válidas'), M('Unidade Divergente do Padrão')], 'Faixa de preço por material', pos(0, 424, 1280, 296, 11), { field: M('Cotações Válidas') })],
    // 3 Fornecedores
    [header('Fornecedores', 'competitividade frente ao menor preço do mercado (1,00 = sempre o menor)'), ...slicers(),
      visual('barChart', { Category: [C('Fornecedores', 'Fornecedor')], Y: [M('Índice de Competitividade')] }, pos(0, 126, 620, 300, 10),
        { title: 'Índice de competitividade por fornecedor', sort: { field: M('Índice de Competitividade'), direction: 'Ascending' } }),
      table([C('Fornecedores', 'Fornecedor'), M('Gasto Registrado'), M('Materiais Cotados'), M('Materiais com Menor Preço'), M('Economia Potencial (R$)'), M('Índice de Competitividade')],
        'Desempenho por fornecedor', pos(628, 126, 652, 300, 11), { field: M('Gasto Registrado') }),
      visual('scatterChart', { Category: [C('Fornecedores', 'Fornecedor')], X: [M('Gasto Registrado')], Y: [M('Índice de Competitividade')] }, pos(0, 434, 1280, 286, 12),
        { title: 'Gasto registrado × índice de competitividade' })],
    // 4 Evolução de Preços
    [header('Evolução de Preços', 'selecione um material para comparar ao menor preço do mercado'), ...slicers(),
      visual('lineChart', { Category: [C('Calendario', 'Mes')], Y: [M('Preço Unitário Médio Ponderado'), M('Preço Mínimo do Mercado')] }, pos(0, 126, 1280, 320, 10),
        { title: 'Preço unitário médio ponderado × menor preço do mercado por mês' }),
      table([C('Historico', 'Data_Referencia'), C('Materiais', 'Material_Rotulo'), C('Historico', 'Fornecedor'), C('Historico', 'Codigo_Orcamento'),
        C('Historico', 'Preco_Unitario'), C('Historico', 'Unidade'), M('Gasto Registrado')], 'Cotações registradas no histórico', pos(0, 454, 1280, 266, 11),
      { field: C('Historico', 'Data_Referencia') }, [inFilter('somenteValidas', C('Historico', 'Registro_Valido_Preco'), [true])])],
    // 5 Qualidade das Extrações
    [header('Qualidade das Extrações', 'completude da leitura por IA e correções humanas'), ...slicers(),
      ...cardRow([['Itens Importados', 'Itens importados'], ['% Extração Completa', 'Extração completa'], ['Itens sem Fornecedor', 'Itens sem fornecedor'],
        ['Itens com Total Divergente', 'Total divergente'], ['% Itens com Correção', 'Itens corrigidos'], ['Acerto da Sugestão de Material', 'Acerto da sugestão']], 126, 86, 10),
      visual('barChart', { Category: [C('CorrecoesCampos', 'Campo_Rotulo')], Y: [M('Campos Corrigidos')] }, pos(0, 220, 460, 500, 20),
        { title: 'Campos corrigidos pelas pessoas', sort: { field: M('Campos Corrigidos') } }),
      table([C('Itens', 'Codigo_Item'), C('CorrecoesCampos', 'Campo_Rotulo'), C('CorrecoesCampos', 'Valor_Extraido'), C('CorrecoesCampos', 'Valor_Corrigido'),
        C('CorrecoesCampos', 'Corrigido_Por'), C('CorrecoesCampos', 'Corrigido_Em')], 'Correções humanas (extraído → corrigido)', pos(468, 220, 812, 500, 21),
      { field: C('CorrecoesCampos', 'Corrigido_Em') })],
    // 6 Aprovações e Rastreabilidade
    [header('Aprovações e Rastreabilidade', 'quem decidiu, quando e com qual identificador'), ...slicers(),
      ...cardRow([['Itens Aprovados', 'Aprovados'], ['Itens Rejeitados', 'Rejeitados'], ['Itens Pendentes de Revisão', 'Pendentes de revisão'],
        ['% Itens Revisados', 'Itens revisados'], ['Responsáveis Distintos', 'Responsáveis'], ['Dias Médios até a Decisão', 'Dias até a decisão']], 126, 86, 10),
      visual('donutChart', { Category: [C('Itens', 'Origem_Decisao')], Y: [M('Itens Importados')] }, pos(0, 220, 420, 500, 20), { title: 'Origem das decisões' }),
      table([C('Itens', 'Codigo_Item'), C('Itens', 'Status_Revisao'), C('Itens', 'AprovadoPor'), C('Itens', 'EmailAprovador'), C('Itens', 'Data_Decisao'), C('Itens', 'Decisao_Id'),
        C('Itens', 'Origem_Decisao')], 'Decisões registradas', pos(428, 220, 852, 500, 21), { field: C('Itens', 'Data_Decisao') },
      [inFilter('somenteDecididos', C('Itens', 'Origem_Decisao'), ['Portal (rastreável)', 'Legado sem responsável'])])],
    // 7 Integridade dos Dados
    [header('Integridade dos Dados', 'verificações entre itens aprovados e histórico de preços (0 = íntegro)'), ...slicers(),
      ...cardRow([['Pendências de Integridade', 'Pendências críticas'], ['Enviados sem Histórico', 'Enviados sem histórico'], ['Histórico sem Item de Origem', 'Histórico sem item de origem'],
        ['Decisão Divergente Item × Histórico', 'Decisão divergente'], ['Chaves Duplicadas no Histórico', 'Chaves duplicadas']], 126, 80, 10),
      ...cardRow([['Unidade Divergente do Padrão', 'Unidade fora do padrão'], ['Material Fora do Catálogo', 'Material fora do catálogo'], ['Histórico Incompleto', 'Histórico incompleto (legado)'],
        ['Histórico sem Rastreabilidade', 'Histórico sem rastreabilidade'], ['Aprovados Aguardando Envio', 'Aprovados aguardando envio']], 214, 80, 20),
      table([C('Itens', 'Codigo_Item'), C('Itens', 'Status_Revisao'), C('Itens', 'Enviado_Historico'), C('Itens', 'Origem_Decisao'), C('Itens', 'Data_Decisao')],
        'Aprovados ainda não enviados ao histórico', pos(0, 302, 636, 418, 30), undefined,
        [inFilter('aprovados', C('Itens', 'Status_Revisao_Normalizado'), ['APROVADO']), inFilter('naoEnviados', C('Itens', 'Enviado_Historico'), ['NAO'])]),
      table([C('Historico', 'Codigo_Orcamento'), C('Historico', 'Fornecedor'), C('Historico', 'Preco_Unitario'), C('Historico', 'Data_Aprovacao'),
        C('Historico', 'Registro_Valido_Preco'), C('Historico', 'Tem_Rastreabilidade')], 'Histórico de preços — validade e rastreabilidade', pos(644, 302, 636, 418, 31))],
  ];
}

export function visualFields() {
  return pageVisuals().flat().flatMap(v => Object.values(v.visual.query?.queryState ?? {}).flatMap(r => r.projections.map(p => p.field)))
    .concat(pageVisuals().flat().flatMap(v => (v.filterConfig?.filters ?? []).map(f => f.field)));
}
