// Generates the Power BI project (PBIP) "3P-Compras": TMDL semantic model + report skeleton + 3P theme.
// Single source of truth for tables, Power Query, relationships and DAX measures.
// Usage: node system/analytics/powerbi/gerar-pbip.mjs            (writes ./3P-Compras next to this file)
// The repository copy keeps PLACEHOLDER site/list parameters; see preparar-copia-local.mjs for a filled local copy.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT = '3P-Compras';
export const PLACEHOLDERS = {
  SiteUrl: 'https://SEU-TENANT.sharepoint.com/sites/SEU-SITE',
  ListaItensId: '00000000-0000-0000-0000-000000000001',
  ListaOrcamentosId: '00000000-0000-0000-0000-000000000002',
  ListaMateriaisId: '00000000-0000-0000-0000-000000000003',
  ListaHistoricoId: '00000000-0000-0000-0000-000000000004',
};
const SYNTHETIC = 'HOMOLOG-3P';
const FMT = { brl: 'R$ #,0.00', int: '#,0', pct: '0.0%', idx: '0.00', date: 'dd/mm/yyyy', datetime: 'dd/mm/yyyy hh:nn' };

// ---------- Power Query (M) ----------
const fields = {
  itens: 'Id,Codigo_Item,Codigo_OrcamentoId,Numero_Item,Fornecedor,Descricao_Original,Quantidade,Unidade_Original,Preco_Unitario,Preco_Total,Status_Revisao,Enviado_Historico,Material_Sugerido_RefId,Material_AprovadoId,Data_Decisao,AprovadoPor,EmailAprovador,Decisao_Id,Correcao_Operacao_Id,Correcao_Humana_JSON,Responsavel_DecisaoId,Created',
  orcamentos: 'Id,Codigo_Orcamento,Numero_Orcamento,Fornecedor,Razao_Social,CNPJ_Fornecedor,Chave_Fornecedor,Data_Orcamento,Data_Importacao,Valor_Total,Quantidade_Itens,Fornecedor_Identificado,Validacao_Orcamento,Status_Processamento,Status_Revisao',
  materiais: 'Id,Title,Material,Familia,Subfamilia,Categoria,Unidade_Padrao,Status,Tipo_Registro,Origem_Catalogo,Codigo_Neoenergia',
  historico: 'Id,Title,Material_OficialId,Fornecedor,Data_Orcamento,Data_Aprovacao,Codigo_Orcamento,Orcamento_OrigemId,Item_OrigemId,ID_Item_Importado,Numero_Item,Preco_Unitario,Preco_Total,Quantidade,Unidade,AprovadoPor,EmailAprovador,Decisao_Id,Correcao_Operacao_Id,Chave_Historico,Created',
};
const notSynthetic = column => `not Text.StartsWith(Text.Upper(Text.From([${column}]) ?? ""), "${SYNTHETIC}")`;

const expressions = [
  ...Object.entries(PLACEHOLDERS).map(([name, value]) => ({
    name, parameter: true,
    source: `"${value}" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]`,
  })),
  { name: 'fnLerLista', description: 'Lê uma lista SharePoint pela API REST (nomes internos), com paginação por odata.nextLink.', source: `
(listId as text, campos as text) as table =>
let
    Pagina = (consulta as record) as record =>
        Json.Document(
            Web.Contents(
                SiteUrl,
                [
                    RelativePath = "_api/web/lists(guid'" & listId & "')/items",
                    Query = consulta,
                    Headers = [Accept = "application/json;odata=nometadata"]
                ]
            )
        ),
    Paginas = List.Generate(
        () => Pagina([#"$top" = "5000", #"$select" = campos]),
        each _ <> null,
        each if Record.HasFields(_, "odata.nextLink") then Pagina(Uri.Parts(Record.Field(_, "odata.nextLink"))[Query]) else null,
        each _[value]
    ),
    Linhas = List.Combine(Paginas),
    Tabela = Table.FromRecords(Linhas, Text.Split(campos, ","), MissingField.UseNull)
in
    Tabela` },
  { name: 'fnDataBrasilia', description: 'Texto ISO-8601 (UTC) do SharePoint para data no fuso de Brasília (UTC-3).', source: `
(valor as nullable text) as nullable date =>
    if valor = null or valor = "" then null
    else DateTime.Date(DateTimeZone.RemoveZone(DateTimeZone.SwitchZone(DateTimeZone.FromText(valor), -3)))` },
  { name: 'fnDataHoraBrasilia', description: 'Texto ISO-8601 (UTC) do SharePoint para data e hora no fuso de Brasília (UTC-3).', source: `
(valor as nullable text) as nullable datetime =>
    if valor = null or valor = "" then null
    else DateTimeZone.RemoveZone(DateTimeZone.SwitchZone(DateTimeZone.FromText(valor), -3))` },
  { name: 'fnChaveFornecedor', description: 'Chave de fornecedor: maiúsculas, sem espaços duplicados nem pontuação simples.', source: `
(nome as any) as nullable text =>
    let
        Texto = Text.Upper(Text.Trim(Text.From(nome) ?? "")),
        Partes = List.Select(Text.SplitAny(Texto, " .,-/"), each _ <> "")
    in
        if Texto = "" then null else Text.Combine(Partes, " ")` },
  { name: 'ItensBase', description: 'Itens_Importados sem registros sintéticos (HOMOLOG-3P). Base de Itens e CorrecoesCampos; não é carregada.', source: `
let
    Fonte = fnLerLista(ListaItensId, "${fields.itens}"),
    SemSinteticos = Table.SelectRows(Fonte, each ${notSynthetic('Codigo_Item')})
in
    SemSinteticos` },
];

const partitions = {
  Materiais: `
let
    Fonte = fnLerLista(ListaMateriaisId, "${fields.materiais}"),
    SemTeste = Table.SelectRows(Fonte, each [Tipo_Registro] <> "TESTE"),
    Renomeado = Table.RenameColumns(SemTeste, {{"Id", "ID"}, {"Title", "Codigo"}}),
    Rotulo = Table.AddColumn(Renomeado, "Material_Rotulo", each Text.Combine(List.RemoveNulls({[Codigo], [Material]}), " · "), type text),
    Tipos = Table.TransformColumnTypes(Rotulo, {{"ID", Int64.Type}, {"Codigo", type text}, {"Material", type text}, {"Familia", type text}, {"Subfamilia", type text}, {"Categoria", type text}, {"Unidade_Padrao", type text}, {"Status", type text}, {"Tipo_Registro", type text}, {"Origem_Catalogo", type text}, {"Codigo_Neoenergia", type text}})
in
    Tipos`,
  Orcamentos: `
let
    Fonte = fnLerLista(ListaOrcamentosId, "${fields.orcamentos}"),
    SemSinteticos = Table.SelectRows(Fonte, each ${notSynthetic('Codigo_Orcamento')}),
    Renomeado = Table.RenameColumns(SemSinteticos, {{"Id", "ID"}}),
    Datas = Table.TransformColumns(Renomeado, {{"Data_Orcamento", fnDataBrasilia}, {"Data_Importacao", fnDataHoraBrasilia}}),
    StatusNormalizado = Table.AddColumn(Datas, "Status_Revisao_Normalizado", each Text.Upper(Text.Trim([Status_Revisao] ?? "")), type text),
    Tipos = Table.TransformColumnTypes(StatusNormalizado, {{"ID", Int64.Type}, {"Codigo_Orcamento", type text}, {"Numero_Orcamento", type text}, {"Fornecedor", type text}, {"Razao_Social", type text}, {"CNPJ_Fornecedor", type text}, {"Chave_Fornecedor", type text}, {"Data_Orcamento", type date}, {"Data_Importacao", type datetime}, {"Valor_Total", Currency.Type}, {"Quantidade_Itens", Int64.Type}, {"Fornecedor_Identificado", type logical}, {"Validacao_Orcamento", type text}, {"Status_Processamento", type text}, {"Status_Revisao", type text}})
in
    Tipos`,
  Itens: `
let
    Fonte = Table.RemoveColumns(ItensBase, {"Correcao_Humana_JSON"}),
    Renomeado = Table.RenameColumns(Fonte, {{"Id", "ID"}, {"Codigo_OrcamentoId", "Orcamento_ID"}, {"Material_Sugerido_RefId", "Material_Sugerido_ID"}, {"Material_AprovadoId", "Material_Aprovado_ID"}, {"Responsavel_DecisaoId", "Responsavel_Legado_ID"}}),
    Datas = Table.TransformColumns(Renomeado, {{"Data_Decisao", fnDataHoraBrasilia}, {"Created", fnDataHoraBrasilia}}),
    StatusNormalizado = Table.AddColumn(Datas, "Status_Revisao_Normalizado", each Text.Upper(Text.Trim([Status_Revisao] ?? "")), type text),
    ChaveFornecedor = Table.AddColumn(StatusNormalizado, "Fornecedor_Chave", each fnChaveFornecedor([Fornecedor]), type text),
    TemCorrecao = Table.AddColumn(ChaveFornecedor, "Tem_Correcao", each Text.Trim([Correcao_Operacao_Id] ?? "") <> "", type logical),
    ExtracaoCompleta = Table.AddColumn(TemCorrecao, "Extracao_Completa", each Text.Trim([Descricao_Original] ?? "") <> "" and Text.Trim([Fornecedor] ?? "") <> "" and Text.Trim([Unidade_Original] ?? "") <> "" and ([Quantidade] ?? 0) > 0 and ([Preco_Unitario] ?? 0) > 0 and ([Preco_Total] ?? 0) > 0, type logical),
    TotalDivergente = Table.AddColumn(ExtracaoCompleta, "Total_Divergente", each [Quantidade] <> null and [Preco_Unitario] <> null and [Preco_Total] <> null and Number.Abs([Quantidade] * [Preco_Unitario] - [Preco_Total]) > 0.01, type logical),
    Rastreavel = Table.AddColumn(TotalDivergente, "Decisao_Rastreavel", each Text.Trim([Decisao_Id] ?? "") <> "" and Text.Contains([EmailAprovador] ?? "", "@"), type logical),
    OrigemDecisao = Table.AddColumn(Rastreavel, "Origem_Decisao", each if List.Contains({"APROVADO", "REJEITADO"}, [Status_Revisao_Normalizado]) then (if [Decisao_Rastreavel] then "Portal (rastreável)" else "Legado sem responsável") else "Sem decisão", type text),
    Tipos = Table.TransformColumnTypes(OrigemDecisao, {{"ID", Int64.Type}, {"Codigo_Item", type text}, {"Orcamento_ID", Int64.Type}, {"Numero_Item", Int64.Type}, {"Fornecedor", type text}, {"Descricao_Original", type text}, {"Quantidade", type number}, {"Unidade_Original", type text}, {"Preco_Unitario", Currency.Type}, {"Preco_Total", Currency.Type}, {"Status_Revisao", type text}, {"Enviado_Historico", type text}, {"Material_Sugerido_ID", Int64.Type}, {"Material_Aprovado_ID", Int64.Type}, {"Data_Decisao", type datetime}, {"AprovadoPor", type text}, {"EmailAprovador", type text}, {"Decisao_Id", type text}, {"Correcao_Operacao_Id", type text}, {"Responsavel_Legado_ID", Int64.Type}, {"Created", type datetime}})
in
    Tipos`,
  CorrecoesCampos: `
let
    Fonte = Table.SelectColumns(ItensBase, {"Id", "Correcao_Humana_JSON"}),
    ComRegistro = Table.SelectRows(Fonte, each Text.Trim([Correcao_Humana_JSON] ?? "") <> ""),
    Registro = Table.AddColumn(ComRegistro, "Registro", each try Json.Document([Correcao_Humana_JSON]) otherwise null),
    Validos = Table.SelectRows(Registro, each [Registro] is record),
    Dados = Table.AddColumn(Validos, "Dados", each [
        Corrigido_Por = try Text.From([Registro][approver][name]) otherwise null,
        Corrigido_Em = try fnDataHoraBrasilia([Registro][at]) otherwise null,
        Operacao_Id = try Text.From([Registro][operationId]) otherwise null,
        Mudancas = try List.Select([Registro][changes], each _ is record) otherwise {}
    ]),
    Expandido = Table.ExpandRecordColumn(Dados, "Dados", {"Corrigido_Por", "Corrigido_Em", "Operacao_Id", "Mudancas"}),
    PorCampo = Table.ExpandListColumn(Expandido, "Mudancas"),
    ComCampo = Table.SelectRows(PorCampo, each [Mudancas] is record),
    Campos = Table.ExpandRecordColumn(ComCampo, "Mudancas", {"field", "previous", "value", "extracted"}, {"Campo", "Valor_Anterior", "Valor_Corrigido", "Valor_Extraido"}),
    Rotulo = Table.AddColumn(Campos, "Campo_Rotulo", each Record.FieldOrDefault([description = "Descrição", quantity = "Quantidade", unit = "Unidade", unitPrice = "Preço unitário", totalPrice = "Preço total", supplier = "Fornecedor", materialId = "Material", observation = "Observação"], [Campo] ?? "", [Campo]), type text),
    Textos = Table.TransformColumns(Rotulo, {{"Valor_Anterior", each Text.From(_), type text}, {"Valor_Corrigido", each Text.From(_), type text}, {"Valor_Extraido", each Text.From(_), type text}}),
    Selecionado = Table.SelectColumns(Textos, {"Id", "Operacao_Id", "Corrigido_Por", "Corrigido_Em", "Campo", "Campo_Rotulo", "Valor_Extraido", "Valor_Anterior", "Valor_Corrigido"}),
    Renomeado = Table.RenameColumns(Selecionado, {{"Id", "Item_ID"}}),
    Tipos = Table.TransformColumnTypes(Renomeado, {{"Item_ID", Int64.Type}, {"Operacao_Id", type text}, {"Corrigido_Por", type text}, {"Corrigido_Em", type datetime}, {"Campo", type text}})
in
    Tipos`,
  Historico: `
let
    Fonte = fnLerLista(ListaHistoricoId, "${fields.historico}"),
    SemSinteticos = Table.SelectRows(Fonte, each ${notSynthetic('Codigo_Orcamento')} and ${notSynthetic('Title')}),
    Renomeado = Table.RenameColumns(SemSinteticos, {{"Id", "ID"}, {"Material_OficialId", "Material_ID"}, {"Orcamento_OrigemId", "Orcamento_ID"}, {"Item_OrigemId", "Item_Origem_ID"}}),
    Datas = Table.TransformColumns(Renomeado, {{"Data_Orcamento", fnDataBrasilia}, {"Data_Aprovacao", fnDataHoraBrasilia}, {"Created", fnDataHoraBrasilia}}),
    DataReferencia = Table.AddColumn(Datas, "Data_Referencia", each [Data_Orcamento] ?? (if [Data_Aprovacao] <> null then DateTime.Date([Data_Aprovacao]) else if [Created] <> null then DateTime.Date([Created]) else null), type date),
    ChaveFornecedor = Table.AddColumn(DataReferencia, "Fornecedor_Chave", each fnChaveFornecedor([Fornecedor]), type text),
    Valido = Table.AddColumn(ChaveFornecedor, "Registro_Valido_Preco", each [Material_ID] <> null and Text.Trim([Fornecedor] ?? "") <> "" and ([Preco_Unitario] ?? 0) > 0 and ([Quantidade] ?? 0) > 0, type logical),
    Rastreavel = Table.AddColumn(Valido, "Tem_Rastreabilidade", each Text.Trim([Decisao_Id] ?? "") <> "" and Text.Contains([EmailAprovador] ?? "", "@"), type logical),
    UnidadeNormalizada = Table.AddColumn(Rastreavel, "Unidade_Normalizada", each Text.Upper(Text.Trim([Unidade] ?? "")), type text),
    Tipos = Table.TransformColumnTypes(UnidadeNormalizada, {{"ID", Int64.Type}, {"Title", type text}, {"Material_ID", Int64.Type}, {"Fornecedor", type text}, {"Data_Orcamento", type date}, {"Data_Aprovacao", type datetime}, {"Codigo_Orcamento", type text}, {"Orcamento_ID", Int64.Type}, {"Item_Origem_ID", Int64.Type}, {"ID_Item_Importado", Int64.Type}, {"Numero_Item", Int64.Type}, {"Preco_Unitario", Currency.Type}, {"Preco_Total", Currency.Type}, {"Quantidade", type number}, {"Unidade", type text}, {"AprovadoPor", type text}, {"EmailAprovador", type text}, {"Decisao_Id", type text}, {"Correcao_Operacao_Id", type text}, {"Chave_Historico", type text}, {"Created", type datetime}})
in
    Tipos`,
  Fornecedores: `
let
    Nomes = Table.Combine({Table.SelectColumns(Itens, {"Fornecedor"}), Table.SelectColumns(Historico, {"Fornecedor"}), Table.SelectColumns(Orcamentos, {"Fornecedor"})}),
    ComChave = Table.AddColumn(Nomes, "Fornecedor_Chave", each fnChaveFornecedor([Fornecedor]), type text),
    Validos = Table.SelectRows(ComChave, each [Fornecedor_Chave] <> null),
    Agrupado = Table.Group(Validos, {"Fornecedor_Chave"}, {{"Fornecedor", each List.First(List.Sort(List.Distinct(List.Transform([Fornecedor], Text.Trim)))), type text}})
in
    Agrupado`,
};

// ---------- Columns ----------
const col = (name, dataType, extra = {}) => ({ name, dataType, sourceColumn: name, summarizeBy: 'none', ...extra });
const hidden = { isHidden: true };
const tables = [
  { name: 'Materiais', description: 'Catálogo Materiais_Oficiais (exclui Tipo_Registro = TESTE).', partition: { type: 'm', source: partitions.Materiais }, columns: [
    col('ID', 'int64', hidden), col('Codigo', 'string'), col('Material', 'string'), col('Material_Rotulo', 'string'), col('Familia', 'string'),
    col('Subfamilia', 'string'), col('Categoria', 'string'), col('Unidade_Padrao', 'string'), col('Status', 'string'), col('Tipo_Registro', 'string'),
    col('Origem_Catalogo', 'string'), col('Codigo_Neoenergia', 'string')] },
  { name: 'Orcamentos', description: 'Orçamentos importados (exclui HOMOLOG-3P).', partition: { type: 'm', source: partitions.Orcamentos }, columns: [
    col('ID', 'int64', hidden), col('Codigo_Orcamento', 'string'), col('Numero_Orcamento', 'string'), col('Fornecedor', 'string'), col('Razao_Social', 'string'),
    col('CNPJ_Fornecedor', 'string'), col('Chave_Fornecedor', 'string', hidden), col('Data_Orcamento', 'dateTime', { formatString: FMT.date }),
    col('Data_Importacao', 'dateTime', { formatString: FMT.datetime }), col('Valor_Total', 'decimal', { formatString: FMT.brl, summarizeBy: 'sum' }),
    col('Quantidade_Itens', 'int64', { summarizeBy: 'sum' }), col('Fornecedor_Identificado', 'boolean'), col('Validacao_Orcamento', 'string'),
    col('Status_Processamento', 'string'), col('Status_Revisao', 'string'), col('Status_Revisao_Normalizado', 'string', hidden)] },
  { name: 'Itens', description: 'Itens_Importados (exclui HOMOLOG-3P). Uma linha por item extraído de orçamento.', partition: { type: 'm', source: partitions.Itens }, columns: [
    col('ID', 'int64', hidden), col('Codigo_Item', 'string'), col('Orcamento_ID', 'int64', hidden), col('Numero_Item', 'int64'), col('Fornecedor', 'string'),
    col('Fornecedor_Chave', 'string', hidden), col('Descricao_Original', 'string'), col('Quantidade', 'double', { summarizeBy: 'sum' }), col('Unidade_Original', 'string'),
    col('Preco_Unitario', 'decimal', { formatString: FMT.brl }), col('Preco_Total', 'decimal', { formatString: FMT.brl, summarizeBy: 'sum' }),
    col('Status_Revisao', 'string'), col('Status_Revisao_Normalizado', 'string', hidden), col('Enviado_Historico', 'string'),
    col('Material_Sugerido_ID', 'int64', hidden), col('Material_Aprovado_ID', 'int64', hidden), col('Data_Decisao', 'dateTime', { formatString: FMT.datetime }),
    col('AprovadoPor', 'string'), col('EmailAprovador', 'string'), col('Decisao_Id', 'string'), col('Correcao_Operacao_Id', 'string', hidden),
    col('Responsavel_Legado_ID', 'int64', hidden), col('Created', 'dateTime', { formatString: FMT.datetime }), col('Tem_Correcao', 'boolean'),
    col('Extracao_Completa', 'boolean'), col('Total_Divergente', 'boolean'), col('Decisao_Rastreavel', 'boolean'), col('Origem_Decisao', 'string')] },
  { name: 'CorrecoesCampos', description: 'Campos alterados nas correções humanas (Correcao_Humana_JSON.changes).', partition: { type: 'm', source: partitions.CorrecoesCampos }, columns: [
    col('Item_ID', 'int64', hidden), col('Operacao_Id', 'string', hidden), col('Corrigido_Por', 'string'), col('Corrigido_Em', 'dateTime', { formatString: FMT.datetime }),
    col('Campo', 'string', hidden), col('Campo_Rotulo', 'string'), col('Valor_Extraido', 'string'), col('Valor_Anterior', 'string'), col('Valor_Corrigido', 'string')] },
  { name: 'Historico', description: 'Historico_Precos (exclui HOMOLOG-3P). Registro_Valido_Preco = material, fornecedor, preço e quantidade presentes.', partition: { type: 'm', source: partitions.Historico }, columns: [
    col('ID', 'int64', hidden), col('Title', 'string', hidden), col('Material_ID', 'int64', hidden), col('Fornecedor', 'string'), col('Fornecedor_Chave', 'string', hidden),
    col('Data_Orcamento', 'dateTime', { formatString: FMT.date }), col('Data_Aprovacao', 'dateTime', { formatString: FMT.datetime }),
    col('Data_Referencia', 'dateTime', { formatString: FMT.date }), col('Codigo_Orcamento', 'string'), col('Orcamento_ID', 'int64', hidden),
    col('Item_Origem_ID', 'int64', hidden), col('ID_Item_Importado', 'int64', hidden), col('Numero_Item', 'int64'),
    col('Preco_Unitario', 'decimal', { formatString: FMT.brl }), col('Preco_Total', 'decimal', { formatString: FMT.brl, summarizeBy: 'sum' }),
    col('Quantidade', 'double', { summarizeBy: 'sum' }), col('Unidade', 'string'), col('Unidade_Normalizada', 'string', hidden), col('AprovadoPor', 'string'),
    col('EmailAprovador', 'string'), col('Decisao_Id', 'string'), col('Correcao_Operacao_Id', 'string', hidden), col('Chave_Historico', 'string', hidden),
    col('Created', 'dateTime', { formatString: FMT.datetime, ...hidden }), col('Registro_Valido_Preco', 'boolean'), col('Tem_Rastreabilidade', 'boolean')] },
  { name: 'Fornecedores', description: 'Fornecedores normalizados a partir de Itens, Histórico e Orçamentos.', partition: { type: 'm', source: partitions.Fornecedores }, columns: [
    col('Fornecedor_Chave', 'string', hidden), col('Fornecedor', 'string')] },
  { name: 'Calendario', description: 'Calendário contínuo do primeiro ao último ano com dados.', dataCategory: 'Time', partition: { type: 'calculated', source: `
VAR _datas =
    UNION (
        SELECTCOLUMNS ( Historico, "d", Historico[Data_Referencia] ),
        SELECTCOLUMNS ( Orcamentos, "d", Orcamentos[Data_Orcamento] )
    )
VAR _inicio = DATE ( YEAR ( COALESCE ( MINX ( _datas, [d] ), TODAY () ) ), 1, 1 )
VAR _fim = DATE ( YEAR ( COALESCE ( MAXX ( _datas, [d] ), TODAY () ) ), 12, 31 )
RETURN
    ADDCOLUMNS (
        CALENDAR ( _inicio, _fim ),
        "Ano", YEAR ( [Date] ),
        "Mes_Numero", MONTH ( [Date] ),
        "Ano_Mes", YEAR ( [Date] ) * 100 + MONTH ( [Date] ),
        "Mes", FORMAT ( [Date], "mmm/yyyy" ),
        "Trimestre", "T" & QUARTER ( [Date] ) & "/" & YEAR ( [Date] )
    )` }, columns: [
    { name: 'Date', dataType: 'dateTime', sourceColumn: '[Date]', isKey: true, formatString: FMT.date, summarizeBy: 'none', inferred: true },
    { name: 'Ano', dataType: 'int64', sourceColumn: '[Ano]', summarizeBy: 'none', inferred: true },
    { name: 'Mes_Numero', dataType: 'int64', sourceColumn: '[Mes_Numero]', summarizeBy: 'none', inferred: true, isHidden: true },
    { name: 'Ano_Mes', dataType: 'int64', sourceColumn: '[Ano_Mes]', summarizeBy: 'none', inferred: true, isHidden: true },
    { name: 'Mes', dataType: 'string', sourceColumn: '[Mes]', summarizeBy: 'none', inferred: true, sortByColumn: 'Ano_Mes' },
    { name: 'Trimestre', dataType: 'string', sourceColumn: '[Trimestre]', summarizeBy: 'none', inferred: true }] },
];

// ---------- Measures ----------
const VALID = 'Historico[Registro_Valido_Preco] = TRUE ()';
const NO_SUPPLIER = 'REMOVEFILTERS ( Fornecedores ),\n    REMOVEFILTERS ( Historico[Fornecedor], Historico[Fornecedor_Chave] )';
const m = (folder, name, expression, formatString, description) => ({ folder, name, expression: expression.trim(), formatString, description });
const measures = [
  m('1 Preços', 'Cotações Válidas', `CALCULATE ( COUNTROWS ( Historico ), ${VALID} )`, FMT.int, 'Registros do histórico com material, fornecedor, preço e quantidade.'),
  m('1 Preços', 'Materiais Cotados', `CALCULATE ( DISTINCTCOUNT ( Historico[Material_ID] ), ${VALID} )`, FMT.int),
  m('1 Preços', 'Fornecedores Cotados', `CALCULATE ( DISTINCTCOUNT ( Historico[Fornecedor_Chave] ), ${VALID} )`, FMT.int),
  m('1 Preços', 'Preço Unitário Mínimo', `CALCULATE ( MIN ( Historico[Preco_Unitario] ), ${VALID} )`, FMT.brl),
  m('1 Preços', 'Preço Unitário Máximo', `CALCULATE ( MAX ( Historico[Preco_Unitario] ), ${VALID} )`, FMT.brl),
  m('1 Preços', 'Preço Unitário Médio Ponderado', `
DIVIDE (
    CALCULATE ( SUM ( Historico[Preco_Total] ), ${VALID} ),
    CALCULATE ( SUM ( Historico[Quantidade] ), ${VALID} )
)`, FMT.brl, 'Soma do preço total dividida pela soma das quantidades.'),
  m('1 Preços', 'Preço Mínimo do Mercado', `
CALCULATE (
    [Preço Unitário Mínimo],
    ${NO_SUPPLIER}
)`, FMT.brl, 'Menor preço unitário do mesmo material e período, entre todos os fornecedores.'),
  m('1 Preços', 'Dispersão de Preço %', `DIVIDE ( [Preço Unitário Máximo] - [Preço Unitário Mínimo], [Preço Unitário Mínimo] )`, FMT.pct),
  m('1 Preços', 'Último Preço Unitário', `
VAR _ultima = CALCULATE ( MAX ( Historico[Data_Referencia] ), ${VALID} )
RETURN
    CALCULATE ( [Preço Unitário Médio Ponderado], Historico[Data_Referencia] = _ultima )`, FMT.brl),
  m('1 Preços', 'Fornecedor com Menor Preço', `
VAR _minimo = [Preço Mínimo do Mercado]
RETURN
    CONCATENATEX (
        CALCULATETABLE (
            VALUES ( Historico[Fornecedor] ),
            ${NO_SUPPLIER},
            ${VALID},
            Historico[Preco_Unitario] = _minimo
        ),
        Historico[Fornecedor],
        ", "
    )`, undefined),
  m('2 Economia', 'Gasto Registrado', `CALCULATE ( SUM ( Historico[Preco_Total] ), ${VALID} )`, FMT.brl),
  m('2 Economia', 'Economia Potencial (R$)', `
SUMX (
    FILTER ( Historico, Historico[Registro_Valido_Preco] ),
    VAR _material = Historico[Material_ID]
    VAR _referencia =
        CALCULATE (
            MIN ( Historico[Preco_Unitario] ),
            ALLSELECTED ( Historico ),
            ${NO_SUPPLIER},
            Historico[Material_ID] = _material,
            ${VALID}
        )
    RETURN
        MAX ( 0, Historico[Preco_Unitario] - _referencia ) * Historico[Quantidade]
)`, FMT.brl, 'Quanto teria sido pago a menos comprando cada registro ao menor preço do mesmo material no período selecionado.'),
  m('2 Economia', 'Economia Potencial (%)', `DIVIDE ( [Economia Potencial (R$)], [Gasto Registrado] )`, FMT.pct),
  m('2 Economia', 'Gasto ao Menor Preço', `[Gasto Registrado] - [Economia Potencial (R$)]`, FMT.brl),
  m('3 Fornecedores', 'Índice de Competitividade', `
VAR _porMaterial =
    ADDCOLUMNS (
        CALCULATETABLE ( VALUES ( Historico[Material_ID] ), ${VALID} ),
        "@quantidade", CALCULATE ( SUM ( Historico[Quantidade] ), ${VALID} ),
        "@preco", [Preço Unitário Médio Ponderado],
        "@referencia", [Preço Mínimo do Mercado]
    )
RETURN
    DIVIDE (
        SUMX ( _porMaterial, DIVIDE ( [@preco], [@referencia] ) * [@quantidade] ),
        SUMX ( _porMaterial, [@quantidade] )
    )`, FMT.idx, '1,00 = sempre no menor preço do mercado; 1,15 = em média 15% acima (ponderado pela quantidade).'),
  m('3 Fornecedores', 'Materiais com Menor Preço', `
COUNTROWS (
    FILTER (
        CALCULATETABLE ( VALUES ( Historico[Material_ID] ), ${VALID} ),
        [Preço Unitário Mínimo] <= [Preço Mínimo do Mercado]
    )
)`, FMT.int, 'Materiais em que o fornecedor (no contexto) praticou o menor preço.'),
  m('4 Qualidade', 'Itens Importados', `COUNTROWS ( Itens )`, FMT.int),
  m('4 Qualidade', 'Itens com Extração Completa', `CALCULATE ( COUNTROWS ( Itens ), Itens[Extracao_Completa] = TRUE () )`, FMT.int),
  m('4 Qualidade', '% Extração Completa', `DIVIDE ( [Itens com Extração Completa], [Itens Importados] )`, FMT.pct),
  m('4 Qualidade', 'Itens com Total Divergente', `CALCULATE ( COUNTROWS ( Itens ), Itens[Total_Divergente] = TRUE () )`, FMT.int, 'Quantidade × preço unitário difere do total em mais de R$ 0,01.'),
  m('4 Qualidade', 'Itens sem Fornecedor', `CALCULATE ( COUNTROWS ( Itens ), ISBLANK ( Itens[Fornecedor_Chave] ) )`, FMT.int),
  m('4 Qualidade', 'Itens com Correção Humana', `CALCULATE ( COUNTROWS ( Itens ), Itens[Tem_Correcao] = TRUE () )`, FMT.int),
  m('4 Qualidade', '% Itens com Correção', `DIVIDE ( [Itens com Correção Humana], [Itens Importados] )`, FMT.pct),
  m('4 Qualidade', 'Campos Corrigidos', `COUNTROWS ( CorrecoesCampos )`, FMT.int),
  m('4 Qualidade', 'Acerto da Sugestão de Material', `
VAR _comparaveis =
    CALCULATE (
        COUNTROWS ( Itens ),
        Itens[Status_Revisao_Normalizado] = "APROVADO",
        NOT ISBLANK ( Itens[Material_Sugerido_ID] ),
        NOT ISBLANK ( Itens[Material_Aprovado_ID] )
    )
VAR _acertos =
    COUNTROWS (
        FILTER (
            Itens,
            Itens[Status_Revisao_Normalizado] = "APROVADO"
                && NOT ISBLANK ( Itens[Material_Aprovado_ID] )
                && Itens[Material_Sugerido_ID] = Itens[Material_Aprovado_ID]
        )
    )
RETURN
    DIVIDE ( _acertos, _comparaveis )`, FMT.pct, 'Entre aprovados com sugestão, % em que o material aprovado foi o sugerido.'),
  m('5 Aprovações', 'Itens Aprovados', `CALCULATE ( COUNTROWS ( Itens ), Itens[Status_Revisao_Normalizado] = "APROVADO" )`, FMT.int),
  m('5 Aprovações', 'Itens Rejeitados', `CALCULATE ( COUNTROWS ( Itens ), Itens[Status_Revisao_Normalizado] = "REJEITADO" )`, FMT.int),
  m('5 Aprovações', 'Itens Pendentes de Revisão', `CALCULATE ( COUNTROWS ( Itens ), Itens[Status_Revisao_Normalizado] IN { "PENDENTE", "EM_REVISAO", "CORRIGIR" } )`, FMT.int),
  m('5 Aprovações', '% Itens Revisados', `DIVIDE ( [Itens Aprovados] + [Itens Rejeitados], [Itens Importados] )`, FMT.pct),
  m('5 Aprovações', 'Decisões Rastreáveis', `CALCULATE ( COUNTROWS ( Itens ), Itens[Origem_Decisao] = "Portal (rastreável)" )`, FMT.int),
  m('5 Aprovações', 'Decisões Legadas sem Responsável', `CALCULATE ( COUNTROWS ( Itens ), Itens[Origem_Decisao] = "Legado sem responsável" )`, FMT.int),
  m('5 Aprovações', '% Rastreabilidade das Decisões', `DIVIDE ( [Decisões Rastreáveis], [Decisões Rastreáveis] + [Decisões Legadas sem Responsável] )`, FMT.pct),
  m('5 Aprovações', 'Responsáveis Distintos', `CALCULATE ( DISTINCTCOUNT ( Itens[EmailAprovador] ), Itens[Decisao_Rastreavel] = TRUE () )`, FMT.int),
  m('5 Aprovações', 'Dias Médios até a Decisão', `
AVERAGEX (
    FILTER ( Itens, NOT ISBLANK ( Itens[Data_Decisao] ) ),
    VAR _importacao = RELATED ( Orcamentos[Data_Importacao] )
    RETURN
        IF ( NOT ISBLANK ( _importacao ), DATEDIFF ( _importacao, Itens[Data_Decisao], HOUR ) / 24 )
)`, '0.0', 'Da importação do orçamento até a decisão no portal.'),
  m('6 Integridade', 'Aprovados Aguardando Envio', `
CALCULATE (
    COUNTROWS ( Itens ),
    Itens[Status_Revisao_Normalizado] = "APROVADO",
    Itens[Enviado_Historico] = "NAO"
)`, FMT.int, 'Aprovados ainda não enviados ao histórico (inclui aprovações legadas).'),
  m('6 Integridade', 'Enviados sem Histórico', `
VAR _comHistorico = CALCULATETABLE ( VALUES ( Historico[ID_Item_Importado] ), REMOVEFILTERS ( Historico ) )
RETURN
    COUNTROWS ( FILTER ( Itens, Itens[Enviado_Historico] = "SIM" && NOT ( Itens[ID] IN _comHistorico ) ) ) + 0`, FMT.int),
  m('6 Integridade', 'Histórico sem Item de Origem', `
VAR _itens = CALCULATETABLE ( VALUES ( Itens[ID] ), REMOVEFILTERS ( Itens ) )
RETURN
    COUNTROWS ( FILTER ( Historico, ISBLANK ( Historico[ID_Item_Importado] ) || NOT ( Historico[ID_Item_Importado] IN _itens ) ) ) + 0`, FMT.int),
  m('6 Integridade', 'Histórico Incompleto', `CALCULATE ( COUNTROWS ( Historico ), Historico[Registro_Valido_Preco] = FALSE () ) + 0`, FMT.int, 'Sem material, fornecedor, preço ou quantidade: fora dos indicadores de preço.'),
  m('6 Integridade', 'Histórico sem Rastreabilidade', `CALCULATE ( COUNTROWS ( Historico ), Historico[Tem_Rastreabilidade] = FALSE () ) + 0`, FMT.int),
  m('6 Integridade', 'Decisão Divergente Item × Histórico', `
COUNTROWS (
    FILTER (
        Historico,
        VAR _decisaoItem = LOOKUPVALUE ( Itens[Decisao_Id], Itens[ID], Historico[ID_Item_Importado] )
        RETURN
            NOT ISBLANK ( Historico[Decisao_Id] ) && NOT ISBLANK ( _decisaoItem ) && _decisaoItem <> Historico[Decisao_Id]
    )
) + 0`, FMT.int),
  m('6 Integridade', 'Chaves Duplicadas no Histórico', `
VAR _comChave = FILTER ( Historico, NOT ISBLANK ( Historico[ID_Item_Importado] ) )
RETURN
    COUNTROWS ( _comChave ) - COUNTROWS ( DISTINCT ( SELECTCOLUMNS ( _comChave, "k", Historico[ID_Item_Importado] ) ) ) + 0`, FMT.int),
  m('6 Integridade', 'Unidade Divergente do Padrão', `
COUNTROWS (
    FILTER (
        Historico,
        Historico[Registro_Valido_Preco]
            && NOT ISBLANK ( RELATED ( Materiais[Unidade_Padrao] ) )
            && Historico[Unidade_Normalizada] <> RELATED ( Materiais[Unidade_Padrao] )
    )
) + 0`, FMT.int, 'Preço comparado em unidade diferente da unidade padrão do material.'),
  m('6 Integridade', 'Material Fora do Catálogo', `
COUNTROWS ( FILTER ( Historico, NOT ISBLANK ( Historico[Material_ID] ) && ISBLANK ( RELATED ( Materiais[ID] ) ) ) ) + 0`, FMT.int),
  m('6 Integridade', 'Pendências de Integridade', `
[Enviados sem Histórico] + [Histórico sem Item de Origem] + [Decisão Divergente Item × Histórico]
    + [Chaves Duplicadas no Histórico] + [Unidade Divergente do Padrão] + [Material Fora do Catálogo]`, FMT.int, 'Soma das verificações críticas (não inclui histórico legado incompleto ou sem rastreabilidade).'),
  m('0 Executivo', 'Aviso de Base', `
VAR _cotacoes = [Cotações Válidas] + 0
RETURN
    IF (
        _cotacoes < 30,
        "Base ainda pequena: " & _cotacoes & " cotação(ões) válida(s) no histórico. Interprete preços e economia com cautela."
    )`, undefined, 'Alerta exibido enquanto o histórico tiver poucas cotações válidas.'),
];
tables.push({ name: '_Medidas', description: 'Medidas do painel de compras 3P.', partition: { type: 'calculated', source: 'ROW ( "Coluna", 0 )' },
  columns: [{ name: 'Coluna', dataType: 'int64', sourceColumn: '[Coluna]', isHidden: true, summarizeBy: 'none', inferred: true }], measures });

const relationships = [
  ['historico_material', 'Historico.Material_ID', 'Materiais.ID'],
  ['historico_orcamento', 'Historico.Orcamento_ID', 'Orcamentos.ID'],
  ['historico_fornecedor', 'Historico.Fornecedor_Chave', 'Fornecedores.Fornecedor_Chave'],
  ['historico_data', 'Historico.Data_Referencia', 'Calendario.Date'],
  ['itens_orcamento', 'Itens.Orcamento_ID', 'Orcamentos.ID'],
  ['itens_material_aprovado', 'Itens.Material_Aprovado_ID', 'Materiais.ID'],
  ['itens_material_sugerido', 'Itens.Material_Sugerido_ID', 'Materiais.ID', false],
  ['itens_fornecedor', 'Itens.Fornecedor_Chave', 'Fornecedores.Fornecedor_Chave'],
  ['correcoes_item', 'CorrecoesCampos.Item_ID', 'Itens.ID'],
];

// ---------- TMDL writer ----------
const T = n => '\t'.repeat(n);
const quote = name => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
const block = (text, depth) => text.replace(/^\n/, '').split('\n').map(line => (line.trim() ? T(depth) + line : '')).join('\n');
const docs = (text, depth) => text ? `${T(depth)}/// ${text}\n` : '';
function columnTmdl(c) {
  const lines = [`${T(1)}column ${quote(c.name)}`, `${T(2)}dataType: ${c.dataType}`];
  if (c.isKey) lines.push(`${T(2)}isKey`);
  if (c.isHidden) lines.push(`${T(2)}isHidden`);
  if (c.inferred) lines.push(`${T(2)}isNameInferred`, `${T(2)}isDataTypeInferred`);
  if (c.formatString) lines.push(`${T(2)}formatString: ${c.formatString}`);
  lines.push(`${T(2)}summarizeBy: ${c.summarizeBy ?? 'none'}`);
  lines.push(`${T(2)}sourceColumn: ${c.sourceColumn}`);
  if (c.sortByColumn) lines.push(`${T(2)}sortByColumn: ${quote(c.sortByColumn)}`);
  return lines.join('\n');
}
function measureTmdl(x) {
  const multi = x.expression.includes('\n');
  const head = multi ? `${T(1)}measure ${quote(x.name)} =\n${block(x.expression, 3)}` : `${T(1)}measure ${quote(x.name)} = ${x.expression}`;
  const lines = [docs(x.description, 1) + head];
  if (x.formatString) lines.push(`${T(2)}formatString: ${x.formatString}`);
  lines.push(`${T(2)}displayFolder: ${x.folder}`);
  return lines.join('\n');
}
function tableTmdl(t) {
  const parts = [`${docs(t.description, 0)}table ${quote(t.name)}`];
  if (t.dataCategory) parts[0] += `\n${T(1)}dataCategory: ${t.dataCategory}`;
  for (const x of t.measures ?? []) parts.push(measureTmdl(x));
  for (const c of t.columns) parts.push(columnTmdl(c));
  const p = t.partition;
  parts.push(`${T(1)}partition ${quote(t.name)} = ${p.type}\n${T(2)}mode: import\n${T(2)}source =\n${block(p.source, 3)}`);
  return parts.join('\n\n') + '\n';
}
function expressionTmdl(e) {
  const head = e.source.includes('\n') ? `expression ${quote(e.name)} =\n${block(e.source, 2)}` : `expression ${quote(e.name)} = ${e.source}`;
  return `${docs(e.description, 0)}${head}\n`;
}
const relationshipTmdl = ([name, from, to, active = true]) =>
  `relationship ${name}\n${active ? '' : `${T(1)}isActive: false\n`}${T(1)}fromColumn: ${from}\n${T(1)}toColumn: ${to}\n`;

const theme = {
  name: '3P Energia',
  dataColors: ['#0B3D2E', '#1F7A4D', '#4CAF7A', '#A5D6B7', '#C9A227', '#5B6B66', '#2E86AB', '#B42318'],
  background: '#FFFFFF', foreground: '#0B3D2E', tableAccent: '#1F7A4D', good: '#1F7A4D', neutral: '#C9A227', bad: '#B42318',
  maximum: '#0B3D2E', center: '#A5D6B7', minimum: '#FFFFFF',
  textClasses: {
    callout: { fontSize: 26, fontFace: 'Segoe UI Semibold', color: '#0B3D2E' },
    title: { fontSize: 12, fontFace: 'Segoe UI Semibold', color: '#0B3D2E' },
    header: { fontSize: 12, fontFace: 'Segoe UI Semibold', color: '#0B3D2E' },
    label: { fontSize: 10, fontFace: 'Segoe UI', color: '#33463F' },
  },
  visualStyles: {
    '*': { '*': {
      background: [{ show: true, color: { solid: { color: '#FFFFFF' } }, transparency: 0 }],
      border: [{ show: true, color: { solid: { color: '#DCE7E1' } }, radius: 8 }],
      title: [{ fontColor: { solid: { color: '#0B3D2E' } } }],
    } },
    page: { '*': { background: [{ color: { solid: { color: '#F3F7F4' } }, transparency: 0 }] } },
  },
};

const pages = ['Visão Executiva', 'Preços por Material', 'Fornecedores', 'Evolução de Preços', 'Qualidade das Extrações', 'Aprovações e Rastreabilidade', 'Integridade dos Dados'];
const report = {
  config: JSON.stringify({ version: '5.59', activeSectionIndex: 0 }),
  layoutOptimization: 0,
  sections: pages.map((displayName, ordinal) => ({
    name: `Pagina${String(ordinal + 1).padStart(2, '0')}`, displayName, ordinal, displayOption: 1, width: 1280, height: 720,
    filters: '[]', config: '{}', visualContainers: [],
  })),
};

export const SPEC = { tables, relationships, expressions, pages };

export function build(outDir = path.join(here, PROJECT), parameters = PLACEHOLDERS) {
  const model = path.join(outDir, `${PROJECT}.SemanticModel`);
  const def = path.join(model, 'definition');
  const rep = path.join(outDir, `${PROJECT}.Report`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(path.join(def, 'tables'), { recursive: true });
  mkdirSync(rep, { recursive: true });
  const write = (file, text) => writeFileSync(file, text.replace(/\n/g, '\r\n'), 'utf8');
  const exprs = expressions.map(e => e.parameter
    ? { ...e, source: `"${parameters[e.name]}" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]` } : e);

  write(path.join(outDir, `${PROJECT}.pbip`), JSON.stringify({ version: '1.0', artifacts: [{ report: { path: `${PROJECT}.Report` } }], settings: { enableAutoRecovery: true } }, null, 2) + '\n');
  write(path.join(outDir, '.gitignore'), '**/.pbi/localSettings.json\n**/.pbi/cache.abf\n');
  write(path.join(model, 'definition.pbism'), JSON.stringify({ version: '4.0', settings: {} }, null, 2) + '\n');
  write(path.join(def, 'database.tmdl'), 'database\n\tcompatibilityLevel: 1601\n');
  write(path.join(def, 'model.tmdl'), ['model Model', '\tculture: pt-BR', '\tdefaultPowerBIDataSourceVersion: powerBI_V3', '\tdiscourageImplicitMeasures',
    '\tsourceQueryCulture: pt-BR', '\tdataAccessOptions', '\t\tlegacyRedirects', '\t\treturnErrorValuesAsNull', '',
    ...tables.map(t => `ref table ${quote(t.name)}`), ''].join('\n'));
  write(path.join(def, 'expressions.tmdl'), exprs.map(expressionTmdl).join('\n'));
  write(path.join(def, 'relationships.tmdl'), relationships.map(relationshipTmdl).join('\n'));
  for (const t of tables) write(path.join(def, 'tables', `${t.name}.tmdl`), tableTmdl(t));
  write(path.join(rep, 'definition.pbir'), JSON.stringify({ version: '1.0', datasetReference: { byPath: { path: `../${PROJECT}.SemanticModel` } } }, null, 2) + '\n');
  write(path.join(rep, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  // Theme and TMDL-view script live inside outDir: a local copy never writes real IDs into the repository.
  write(path.join(outDir, 'tema-3P-Energia.json'), JSON.stringify(theme, null, 2) + '\n');
  // Same model as one script for Power BI Desktop "TMDL view" (fallback if the PBIP cannot be opened).
  const script = ['createOrReplace', '', ...exprs.map(expressionTmdl), ...tables.map(tableTmdl), ...relationships.map(relationshipTmdl)]
    .join('\n').split('\n').map((line, i) => (i === 0 || !line ? line : `\t${line}`)).join('\n');
  write(path.join(outDir, `${PROJECT}.tmdl-view.tmdl`), script + '\n');
  return { outDir, tables: tables.length, measures: measures.length, relationships: relationships.length, pages: pages.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(build());
}
