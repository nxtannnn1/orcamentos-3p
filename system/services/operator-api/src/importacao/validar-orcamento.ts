/** Validação pura: não importa HTTP, configuração, ORM ou acesso ao banco. */
export class ErroContrato extends Error {
  constructor(public readonly campo: string, public readonly codigo: string) {
    super(`Contrato inválido: ${campo} (${codigo}).`);
    this.name = "ErroContrato";
  }
}
type Objeto = Record<string, unknown>;
export interface ImportacaoOrcamento {
  versaoContrato: 1;
  origem: { sistema: "sharepoint"; driveId: string; driveFileId: string;
    codigoOrcamento?: string | null; nomeArquivo?: string | null };
  fornecedor: { razaoSocial: string; nomeFantasia?: string | null; cnpj?: string | null };
  orcamento: { numero: string; data?: string | null; subtotal: string; frete: string;
    desconto: string; tributos: string; valorTotal: string };
  itens: { codigoOrigem: string; numero: number; descricaoOriginal: string;
    quantidade: string; unidade: string; precoUnitario: string; precoTotal: string;
    observacaoOrigem?: string | null }[];
}
function falha(campo: string, codigo: string): never { throw new ErroContrato(campo, codigo); }
function objeto(valor: unknown, campo: string, permitidos: string[]): Objeto {
  if (!valor || typeof valor !== "object" || Array.isArray(valor) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(valor))) falha(campo, "OBJETO_OBRIGATORIO");
  for (const chave of Object.keys(valor))
    if (!permitidos.includes(chave)) falha(`${campo}.${chave}`, "CAMPO_DESCONHECIDO");
  return valor as Objeto;
}
function texto(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== "string" || !valor.trim() || valor !== valor.trim() ||
      [...valor].length > max || /[\u0000-\u001f\u007f]/u.test(valor)) falha(campo, "TEXTO_INVALIDO");
  return valor;
}
function opcional(o: Objeto, chave: string, campo: string, max: number): Objeto {
  if (!Object.hasOwn(o, chave)) return {};
  return { [chave]: o[chave] === null ? null : texto(o[chave], `${campo}.${chave}`, max) };
}
const LIMITE_NUMERIC = 10n ** 18n;
function decimal(valor: unknown, campo: string, escala: number, positivo = false): bigint {
  // Limite de tamanho antes da expressão/BigInt; não aceita expoente, vírgula ou sinal.
  if (typeof valor !== "string" || valor.length > 20 ||
      !new RegExp(`^(0|[1-9][0-9]*)(\\.[0-9]{1,${escala}})?$`).test(valor)) falha(campo, "DECIMAL_INVALIDO");
  const [inteiro, fracao = ""] = valor.split(".");
  const unidades = BigInt(inteiro + fracao.padEnd(escala, "0"));
  if (unidades >= LIMITE_NUMERIC || (positivo && unidades === 0n)) falha(campo, "DECIMAL_FORA_DA_FAIXA");
  return unidades;
}
function formatar(unidades: bigint, escala: number): string {
  const valor = unidades.toString().padStart(escala + 1, "0");
  return `${valor.slice(0, -escala)}.${valor.slice(-escala)}`;
}
// Half-up para valores não negativos; excesso de casas na entrada é rejeitado.
function arredondar(unidades: bigint, casasRemovidas: number): bigint {
  const divisor = 10n ** BigInt(casasRemovidas);
  return (unidades + divisor / 2n) / divisor;
}
function dataOpcional(o: Objeto): Objeto {
  const result = opcional(o, "data", "orcamento", 35);
  if (typeof result.data === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(result.data);
    if (!m) falha("orcamento.data", "DATA_INVALIDA");
    const ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3]);
    const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
    const dias = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > dias[mes - 1] ||
        Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59 ||
        Number(m[8] ?? 0) > 14 || Number(m[9] ?? 0) > 59 ||
        (Number(m[8]) === 14 && Number(m[9]) !== 0)) falha("orcamento.data", "DATA_INVALIDA");
  }
  return result;
}
export function validarImportacaoOrcamento(entrada: unknown): ImportacaoOrcamento {
  const root = objeto(entrada, "$", ["versaoContrato", "origem", "fornecedor", "orcamento", "itens"]);
  if (root.versaoContrato !== 1) falha("versaoContrato", "VERSAO_INVALIDA");
  const origem = objeto(root.origem, "origem", ["sistema", "driveId", "driveFileId", "codigoOrcamento", "nomeArquivo"]);
  if (origem.sistema !== "sharepoint") falha("origem.sistema", "ORIGEM_INVALIDA");
  const fornecedor = objeto(root.fornecedor, "fornecedor", ["razaoSocial", "nomeFantasia", "cnpj"]);
  const cnpj = opcional(fornecedor, "cnpj", "fornecedor", 14);
  if (typeof cnpj.cnpj === "string" && !/^[0-9]{14}$/.test(cnpj.cnpj)) falha("fornecedor.cnpj", "CNPJ_FORMATO_INVALIDO");
  const orcamento = objeto(root.orcamento, "orcamento", ["numero", "data", "subtotal", "frete", "desconto", "tributos", "valorTotal"]);
  const valores = Object.fromEntries(["subtotal", "frete", "desconto", "tributos", "valorTotal"]
    .map(chave => [chave, decimal(orcamento[chave], `orcamento.${chave}`, 2)]));
  if (!Array.isArray(root.itens) || root.itens.length < 1 || root.itens.length > 1000) falha("itens", "LIMITE_ITENS");
  const numeros = new Set<number>(), codigos = new Set<string>();
  let soma = 0n;
  const itens = root.itens.map((entradaItem, indice) => {
    const campo = `itens[${indice}]`;
    const item = objeto(entradaItem, campo, ["codigoOrigem", "numero", "descricaoOriginal", "quantidade", "unidade", "precoUnitario", "precoTotal", "observacaoOrigem"]);
    const numero = item.numero;
    if (typeof numero !== "number" || !Number.isInteger(numero) || numero < 1 || numero > 2147483647) falha(`${campo}.numero`, "NUMERO_ITEM_INVALIDO");
    const codigo = texto(item.codigoOrigem, `${campo}.codigoOrigem`, 255);
    if (numeros.has(numero)) falha(`${campo}.numero`, "ITEM_DUPLICADO");
    if (codigos.has(codigo)) falha(`${campo}.codigoOrigem`, "ITEM_DUPLICADO");
    numeros.add(numero); codigos.add(codigo);
    const quantidade = decimal(item.quantidade, `${campo}.quantidade`, 4, true);
    const preco = decimal(item.precoUnitario, `${campo}.precoUnitario`, 4);
    const total = decimal(item.precoTotal, `${campo}.precoTotal`, 4);
    if (arredondar(quantidade * preco, 4) !== total) falha(`${campo}.precoTotal`, "TOTAL_ITEM_DIVERGENTE");
    soma += total;
    return { codigoOrigem: codigo, numero,
      descricaoOriginal: texto(item.descricaoOriginal, `${campo}.descricaoOriginal`, 10000),
      quantidade: formatar(quantidade, 4), unidade: texto(item.unidade, `${campo}.unidade`, 50),
      precoUnitario: formatar(preco, 4), precoTotal: formatar(total, 4),
      ...opcional(item, "observacaoOrigem", campo, 10000) };
  });
  if (arredondar(soma, 2) !== valores.subtotal) falha("orcamento.subtotal", "SUBTOTAL_DIVERGENTE");
  if (valores.subtotal + valores.frete - valores.desconto + valores.tributos !== valores.valorTotal)
    falha("orcamento.valorTotal", "TOTAL_ORCAMENTO_DIVERGENTE");
  return {
    versaoContrato: 1,
    origem: { sistema: "sharepoint", driveId: texto(origem.driveId, "origem.driveId", 255),
      driveFileId: texto(origem.driveFileId, "origem.driveFileId", 255),
      ...opcional(origem, "codigoOrcamento", "origem", 255), ...opcional(origem, "nomeArquivo", "origem", 1000) },
    fornecedor: { razaoSocial: texto(fornecedor.razaoSocial, "fornecedor.razaoSocial", 255),
      ...opcional(fornecedor, "nomeFantasia", "fornecedor", 255), ...cnpj },
    orcamento: { numero: texto(orcamento.numero, "orcamento.numero", 100), ...dataOpcional(orcamento),
      subtotal: formatar(valores.subtotal, 2), frete: formatar(valores.frete, 2),
      desconto: formatar(valores.desconto, 2), tributos: formatar(valores.tributos, 2), valorTotal: formatar(valores.valorTotal, 2) }, itens,
  };
}
