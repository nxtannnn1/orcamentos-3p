import { describe, expect, it } from "vitest";
import { ErroContrato, validarImportacaoOrcamento } from "../src/importacao/validar-orcamento";

function exemplo() {
  return {
    versaoContrato: 1,
    origem: { sistema: "sharepoint", driveId: "drive-A", driveFileId: "arquivo-A", codigoOrcamento: "ORC-A" },
    fornecedor: { razaoSocial: "Fornecedor exemplo", cnpj: null },
    orcamento: { numero: "123", data: "2026-10-09T00:00:00-03:00", subtotal: "0.30",
      frete: "0.02", desconto: "0.01", tributos: "0.03", valorTotal: "0.34" },
    itens: [
      { codigoOrigem: "A-1", numero: 1, descricaoOriginal: "Item A", quantidade: "1", unidade: "UN", precoUnitario: "0.10", precoTotal: "0.10" },
      { codigoOrigem: "A-2", numero: 2, descricaoOriginal: "Item B", quantidade: "1", unidade: "UN", precoUnitario: "0.20", precoTotal: "0.20" },
    ],
  };
}
function conferirFalha(input: unknown, campo: string, codigo: string) {
  try { validarImportacaoOrcamento(input); throw new Error("Deveria rejeitar"); }
  catch (erro) { expect(erro).toBeInstanceOf(ErroContrato); expect(erro).toMatchObject({ campo, codigo }); }
}
function unico(quantidade: string, precoUnitario: string, precoTotal: string, subtotal: string) {
  const x = exemplo(); x.itens = [{ ...x.itens[0], quantidade, precoUnitario, precoTotal }];
  Object.assign(x.orcamento, { subtotal, valorTotal: subtotal, frete: "0", desconto: "0", tributos: "0" });
  return x;
}
describe("contrato isolado de importação", () => {
  it("valida múltiplos itens e soma 0.10 + 0.20 exatamente, sem mutar entrada", () => {
    const x = exemplo(), antes = structuredClone(x);
    const result = validarImportacaoOrcamento(x);
    expect(result.orcamento.valorTotal).toBe("0.34");
    expect(result.itens[0].quantidade).toBe("1.0000");
    expect(result.itens[1].precoTotal).toBe("0.2000");
    expect(result.origem).toEqual(x.origem);
    expect(x).toEqual(antes);
    expect(result.itens).not.toBe(x.itens);
  });
  it("preserva ausência e null opcionais, sem inventar valores", () => {
    const result = validarImportacaoOrcamento(exemplo());
    expect(result.fornecedor.cnpj).toBeNull();
    expect(Object.hasOwn(result.fornecedor, "nomeFantasia")).toBe(false);
    expect(Object.hasOwn(result.itens[0], "observacaoOrigem")).toBe(false);
  });
  it.each(["-1", "0", "NaN", "Infinity", "1e2", "1,2", " 1", "01", "1.", "0.00001", 1, null, undefined])("rejeita quantidade %s", valor => {
    const x = exemplo(); (x.itens[0] as Record<string, unknown>).quantidade = valor;
    expect(() => validarImportacaoOrcamento(x)).toThrow(ErroContrato);
  });
  it.each(["-0.1", "NaN", "Infinity", "1e2", "1,20", "1.00001", "100000000000000", 0.1, null, undefined])("rejeita preço %s", valor => {
    const x = exemplo(); (x.itens[0] as Record<string, unknown>).precoUnitario = valor;
    expect(() => validarImportacaoOrcamento(x)).toThrow(ErroContrato);
  });
  it("aceita preço zero explícito", () => expect(validarImportacaoOrcamento(unico("1", "0", "0", "0")).itens[0].precoTotal).toBe("0.0000"));
  it("rejeita número de item repetido", () => {
    const x = exemplo(); x.itens[1].numero = 1;
    conferirFalha(x, "itens[1].numero", "ITEM_DUPLICADO");
  });
  it("rejeita código externo repetido mesmo com outro número", () => {
    const x = exemplo(); x.itens[1].codigoOrigem = "A-1";
    conferirFalha(x, "itens[1].codigoOrigem", "ITEM_DUPLICADO");
  });
  it("rejeita subtotal inconsistente", () => {
    const x = exemplo(); x.orcamento.subtotal = "0.31";
    conferirFalha(x, "orcamento.subtotal", "SUBTOTAL_DIVERGENTE");
  });
  it("rejeita total de item inconsistente", () => {
    const x = exemplo(); x.itens[0].precoTotal = "0.11";
    conferirFalha(x, "itens[0].precoTotal", "TOTAL_ITEM_DIVERGENTE");
  });
  it("rejeita total de orçamento inconsistente", () => {
    const x = exemplo(); x.orcamento.valorTotal = "0.33";
    conferirFalha(x, "orcamento.valorTotal", "TOTAL_ORCAMENTO_DIVERGENTE");
  });
  it.each(["$", "origem", "fornecedor", "orcamento", "item"])("rejeita campo desconhecido em %s", local => {
    const x = exemplo();
    const alvo = local === "$" ? x : local === "item" ? x.itens[0] : x[local as "origem" | "fornecedor" | "orcamento"];
    Object.assign(alvo, { campoExtra: "não descartar" });
    expect(() => validarImportacaoOrcamento(x)).toThrow(ErroContrato);
  });
  it.each(["versaoContrato", "origem", "fornecedor", "orcamento", "itens"])("rejeita objeto obrigatório ausente: %s", chave => {
    const x: Record<string, unknown> = exemplo(); delete x[chave];
    expect(() => validarImportacaoOrcamento(x)).toThrow(ErroContrato);
  });
  it.each(["subtotal", "frete", "desconto", "tributos", "valorTotal"])("rejeita financeiro ausente: %s", chave => {
    const x = exemplo(); delete (x.orcamento as Record<string, unknown>)[chave];
    conferirFalha(x, `orcamento.${chave}`, "DECIMAL_INVALIDO");
  });
  it.each(["numero", "codigoOrigem", "descricaoOriginal", "quantidade", "unidade", "precoUnitario", "precoTotal"])("rejeita campo essencial do item ausente: %s", chave => {
    const x = exemplo(); delete (x.itens[0] as Record<string, unknown>)[chave];
    expect(() => validarImportacaoOrcamento(x)).toThrow(ErroContrato);
  });
  it("usa half-up no produto com oito casas para quatro", () => {
    const x = unico("0.5", "0.0001", "0.0001", "0.00");
    expect(validarImportacaoOrcamento(x).itens[0].precoTotal).toBe("0.0001");
    x.itens[0].precoTotal = "0";
    expect(() => validarImportacaoOrcamento(x)).toThrow(ErroContrato);
  });
  it.each([["1.0049", "1.00"], ["1.0050", "1.01"], ["1.0051", "1.01"]])("arredonda subtotal %s para %s", (preco, subtotal) => {
    expect(validarImportacaoOrcamento(unico("1", preco, preco, subtotal)).orcamento.subtotal).toBe(subtotal);
  });
  it("soma antes de arredondar a centavos", () => {
    const x = exemplo(); x.itens.forEach(item => {item.precoUnitario = "0.0049"; item.precoTotal = "0.0049";});
    Object.assign(x.orcamento, { subtotal: "0.01", frete: "0", desconto: "0", tributos: "0", valorTotal: "0.01" });
    expect(validarImportacaoOrcamento(x).orcamento.subtotal).toBe("0.01");
  });
  it("mantém valor acima da precisão segura de Number", () => {
    const x = unico("1", "99999999999999.9999", "99999999999999.9999", "100000000000000.00");
    expect(validarImportacaoOrcamento(x).itens[0].precoTotal).toBe("99999999999999.9999");
  });
  it("rejeita overflow do subtotal em NUMERIC(18,2)", () => {
    const x = exemplo(); x.orcamento.subtotal = "10000000000000000.00";
    conferirFalha(x, "orcamento.subtotal", "DECIMAL_FORA_DA_FAIXA");
  });
  it.each(["2026-02-30T00:00:00Z", "2026-10-09", "2026-10-09T24:00:00Z", "2026-10-09T00:00:00+14:01"])("rejeita data inválida %s", data => {
    const x = exemplo(); x.orcamento.data = data;
    conferirFalha(x, "orcamento.data", "DATA_INVALIDA");
  });
  it("aceita data ausente ou null", () => {
    const x = exemplo(); delete (x.orcamento as Record<string, unknown>).data;
    expect(validarImportacaoOrcamento(x).orcamento.data).toBeUndefined();
    Object.assign(x.orcamento, {data: null});
    expect(validarImportacaoOrcamento(x).orcamento.data).toBeNull();
  });
  it.each([0, 1.5, 2147483648])("rejeita número de item inválido %s", numero => {
    const x = exemplo(); x.itens[0].numero = numero;
    expect(() => validarImportacaoOrcamento(x)).toThrow(ErroContrato);
  });
  it("rejeita itens vazios e excesso de itens", () => {
    const x = exemplo(); x.itens = [];
    expect(() => validarImportacaoOrcamento(x)).toThrow(ErroContrato);
    x.itens = Array.from({length: 1001}, () => exemplo().itens[0]);
    conferirFalha(x, "itens", "LIMITE_ITENS");
  });
  it.each([null, [], "{}", 1])("rejeita raiz não objeto %s", entrada => expect(() => validarImportacaoOrcamento(entrada)).toThrow(ErroContrato));
  it("não inclui dados recebidos na mensagem do erro", () => {
    const x = exemplo(); x.itens[0].precoUnitario = "segredo-de-exemplo";
    try {validarImportacaoOrcamento(x);} catch (erro) {expect((erro as Error).message).not.toContain("segredo-de-exemplo");}
  });
});
