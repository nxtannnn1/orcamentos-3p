import { expect, it } from "vitest";
import { cnpjValido, chaveFornecedor, resolverFornecedor } from "../src/importacao/fornecedor-v2";
import { validarImportacaoOrcamentoV2 } from "../src/importacao/validar-orcamento-v2";
import { calcularHashOrcamentoV2 } from "../src/importacao/hash-orcamento-v2";
import { ErroContrato } from "../src/importacao/validar-orcamento";

function exemplo() {
  return { versaoContrato: 2,
    origem: { sistema: "sharepoint", identidade: { tipo: "drive", driveId: "drive-A", arquivoId: "arquivo-A" } },
    fornecedor: { identificacao: { tipo: "cnpj", valor: "12ABC34501DE35" }, razaoSocialOrigem: "Fornecedor A" },
    orcamento: { numero: "123", subtotal: "3", frete: "0", desconto: "0", tributos: "0", valorTotal: "3" },
    itens: [
      { codigoOrigem: "A-1", numero: 1, descricaoOriginal: "Item A", quantidade: "1", unidade: "UN", precoUnitario: "1", precoTotal: "1" },
      { codigoOrigem: "A-2", numero: 2, descricaoOriginal: "Item B", quantidade: "1", unidade: "UN", precoUnitario: "2", precoTotal: "2" },
    ] };
}
function erro(entrada: unknown, codigo: string) {
  try { validarImportacaoOrcamentoV2(entrada); throw new Error("deveria rejeitar"); }
  catch (e) { expect(e).toBeInstanceOf(ErroContrato); expect((e as ErroContrato).codigo).toBe(codigo); }
}
it.each(["12ABC34501DE35", "11222333000181", "00000000000191"])("aceita CNPJ canônico válido %s", cnpj => {
  expect(cnpjValido(cnpj)).toBe(true);
  const x = exemplo(); x.fornecedor.identificacao.valor = cnpj;
  expect(validarImportacaoOrcamentoV2(x).fornecedor.identificacao).toEqual({ tipo: "cnpj", valor: cnpj });
});
it.each(["12ABC34501DE34", "12ABC34501DE3A", "12abc34501de35", "12.ABC.345/01DE-35", " 12ABC34501DE35", "00000000000000", "11111111111111", "11222333000182", "12ÁBC34501DE35", "", null])("rejeita CNPJ inválido %s", cnpj => {
  expect(cnpjValido(cnpj)).toBe(false);
  const x = exemplo(); Object.assign(x.fornecedor.identificacao, { valor: cnpj }); erro(x, "CNPJ_INVALIDO");
});
it("aceita documento externo e fornecedor externo preservando zeros e caixa", () => {
  const x = exemplo(); Object.assign(x.origem, { identidade: { tipo: "externa", namespace: "ERP-A", documentoId: "0001" } });
  Object.assign(x.fornecedor, { identificacao: { tipo: "externa", sistema: "erp", escopo: "3p", id: "0002" } });
  const r = validarImportacaoOrcamentoV2(x);
  expect(r.origem.identidade).toEqual({ tipo: "externa", namespace: "ERP-A", documentoId: "0001" });
  expect(r.fornecedor.identificacao).toEqual({ tipo: "externa", sistema: "erp", escopo: "3p", id: "0002" });
});
it.each(["sistema", "escopo", "id"])("identificação externa exige %s", campo => {
  const x = exemplo(), id: Record<string, unknown> = { tipo: "externa", sistema: "erp", escopo: "3p", id: "001" };
  delete id[campo]; Object.assign(x.fornecedor, { identificacao: id }); erro(x, "TEXTO_INVALIDO");
});
it.each(["namespace", "documentoId"])("identidade externa exige %s", campo => {
  const x = exemplo(), id: Record<string, unknown> = { tipo: "externa", namespace: "erp", documentoId: "001" };
  delete id[campo]; Object.assign(x.origem, { identidade: id }); erro(x, "TEXTO_INVALIDO");
});
it.each(["driveId", "arquivoId"])("identidade drive exige %s", campo => {
  const x = exemplo(); delete (x.origem.identidade as Record<string, unknown>)[campo]; erro(x, "TEXTO_INVALIDO");
});
it.each(["root", "origem", "identidade", "fornecedor", "identificacao", "orcamento", "item"])("rejeita campo desconhecido em %s", nivel => {
  const x = exemplo(); const alvos: Record<string, object> = { root: x, origem: x.origem, identidade: x.origem.identidade,
    fornecedor: x.fornecedor, identificacao: x.fornecedor.identificacao, orcamento: x.orcamento, item: x.itens[0] };
  Object.assign(alvos[nivel], { usuario: "não confiável" }); erro(x, "CAMPO_DESCONHECIDO");
});
it("rejeita união de identificações e de identidades", () => {
  const x = exemplo(); Object.assign(x.fornecedor.identificacao, { id: "001" }); erro(x, "CAMPO_DESCONHECIDO");
  const y = exemplo(); Object.assign(y.origem.identidade, { namespace: "erp" }); erro(y, "CAMPO_DESCONHECIDO");
});
it.each([1, 3, null, "2"])("rejeita versão %s", versaoContrato => erro({ ...exemplo(), versaoContrato }, "VERSAO_INVALIDA"));
it.each(["", " drive", "drive\u0000", "x".repeat(256)])("rejeita identificador malformado", driveId => {
  const x = exemplo(); x.origem.identidade.driveId = driveId; erro(x, "TEXTO_INVALIDO");
});
it("rejeita fonte e tipos desconhecidos", () => {
  const x = exemplo(); x.origem.sistema = "outro"; erro(x, "ORIGEM_INVALIDA");
  const y = exemplo(); y.origem.identidade.tipo = "nomeArquivo"; erro(y, "IDENTIDADE_INVALIDA");
  const z = exemplo(); z.fornecedor.identificacao.tipo = "nome"; erro(z, "IDENTIFICACAO_INVALIDA");
});
it("normaliza sem mutar e mantém preço zero explícito", () => {
  const x = exemplo(), antes = structuredClone(x);
  expect(validarImportacaoOrcamentoV2(x).itens[0].quantidade).toBe("1.0000"); expect(x).toEqual(antes);
  x.itens[0].precoUnitario = "0"; x.itens[0].precoTotal = "0"; x.orcamento.subtotal = "2"; x.orcamento.valorTotal = "2";
  expect(validarImportacaoOrcamentoV2(x).itens[0].precoTotal).toBe("0.0000");
});
it.each(["1e2", "1,2", "-1", "1.00001", "NaN", "99999999999999999999"])("rejeita quantidade %s", quantidade => {
  const x = exemplo(); x.itens[0].quantidade = quantidade; expect(() => validarImportacaoOrcamentoV2(x)).toThrow(ErroContrato);
});
it("preserva precisão além de Number e arredondamento half-up", () => {
  const x = exemplo(); x.itens = [{ ...x.itens[0], precoUnitario: "99999999999999.9999", precoTotal: "99999999999999.9999" }];
  x.orcamento.subtotal = "100000000000000.00"; x.orcamento.valorTotal = x.orcamento.subtotal;
  expect(calcularHashOrcamentoV2(x).jsonCanonico).toContain('"precoUnitario":"99999999999999.9999"');
  x.itens[0].quantidade = "0.5"; x.itens[0].precoUnitario = "0.0001"; x.itens[0].precoTotal = "0.0001";
  x.orcamento.subtotal = "0"; x.orcamento.valorTotal = "0";
  expect(validarImportacaoOrcamentoV2(x).itens[0].precoTotal).toBe("0.0001");
});
it.each(["subtotal", "valorTotal"])("rejeita %s divergente e ausente", campo => {
  const x = exemplo(); x.orcamento[campo as "subtotal"] = "4"; expect(() => validarImportacaoOrcamentoV2(x)).toThrow(ErroContrato);
  delete (x.orcamento as Record<string, unknown>)[campo]; expect(() => validarImportacaoOrcamentoV2(x)).toThrow(ErroContrato);
});
it("rejeita itens duplicados e quantidade zero", () => {
  const x = exemplo(); x.itens[1].numero = 1; erro(x, "ITEM_DUPLICADO");
  const y = exemplo(); y.itens[1].codigoOrigem = y.itens[0].codigoOrigem; erro(y, "ITEM_DUPLICADO");
  const z = exemplo(); z.itens[0].quantidade = "0"; erro(z, "DECIMAL_FORA_DA_FAIXA");
});
it.each(["2026-10-09", "2026-02-30T00:00:00Z", "2026-10-09T00:00:00", "2026-10-09T00:00:00+14:01"])("rejeita data %s", data => {
  const x = exemplo(); Object.assign(x.orcamento, { data }); erro(x, "DATA_INVALIDA");
});
it("resolve por identificação exata, recusando cadastro ausente, inativo ou ambíguo", () => {
  const id = validarImportacaoOrcamentoV2(exemplo()).fornecedor.identificacao;
  const registro = { fornecedorId: "9007199254740993", ativo: true, identificacao: id };
  expect(resolverFornecedor(id, [registro])).toBe("9007199254740993");
  expect(() => resolverFornecedor(id, [])).toThrow(/SUPPLIER_UNRESOLVED/);
  expect(() => resolverFornecedor(id, [{ ...registro, ativo: false }])).toThrow(/SUPPLIER_UNRESOLVED/);
  expect(() => resolverFornecedor(id, [registro, { ...registro, fornecedorId: "2" }])).toThrow(/SUPPLIER_AMBIGUOUS/);
});
it("não resolve nome parecido nem escopo/id alterados e evita colisões de separadores", () => {
  const a = { tipo: "externa" as const, sistema: "erp:a", escopo: "b", id: "001" };
  const b = { tipo: "externa" as const, sistema: "erp", escopo: "a:b", id: "001" };
  expect(chaveFornecedor(a)).not.toBe(chaveFornecedor(b));
  expect(() => resolverFornecedor(b, [{ fornecedorId: "1", ativo: true, identificacao: a }])).toThrow(/SUPPLIER_UNRESOLVED/);
  expect(chaveFornecedor(a)).not.toBe(chaveFornecedor({ ...a, id: "1" }));
  expect(chaveFornecedor(a)).not.toBe(chaveFornecedor({ ...a, sistema: "ERP:a" }));
});
it("hash independente de ordem, decimais equivalentes e opcionais null", () => {
  const x = exemplo(); x.itens.reverse(); x.itens[0].quantidade = "1.0000";
  Object.assign(x.fornecedor, { nomeFantasiaOrigem: null }); Object.assign(x.orcamento, { data: null });
  x.itens.forEach(i => Object.assign(i, { observacaoOrigem: null }));
  function inverter(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(inverter);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).reverse().map(([k, val]) => [k, inverter(val)]));
    return v;
  }
  expect(calcularHashOrcamentoV2(inverter(x))).toEqual(calcularHashOrcamentoV2(exemplo()));
});
it("identidade e metadados separados do hash; dados semânticos mudam hash", () => {
  const x = exemplo(), base = calcularHashOrcamentoV2(x);
  x.origem.identidade.arquivoId = "outro"; Object.assign(x.origem, { nomeArquivo: "novo.pdf", codigoOrcamento: "001" });
  const novo = calcularHashOrcamentoV2(x);
  expect(novo.conteudoSha256).toBe(base.conteudoSha256); expect(novo.identidade).not.toEqual(base.identidade);
  expect(novo.codigoOrcamento).toBe("001"); expect(novo.nomeArquivo).toBe("novo.pdf");
  x.fornecedor.razaoSocialOrigem = "Fornecedor B";
  expect(calcularHashOrcamentoV2(x).conteudoSha256).not.toBe(base.conteudoSha256);
});
it("identificação do fornecedor integra hash e saída validada é estável", () => {
  const x = exemplo(), base = calcularHashOrcamentoV2(x);
  expect(calcularHashOrcamentoV2(validarImportacaoOrcamentoV2(x))).toEqual(base);
  x.fornecedor.identificacao.valor = "11222333000181";
  expect(calcularHashOrcamentoV2(x).conteudoSha256).not.toBe(base.conteudoSha256);
  expect(base.versaoCanonicalizacao).toBe(2);
});
it("fixa bytes e digest v2 conferido independentemente com SHA256 .NET", () => {
  const esperado = '{"fornecedor":{"identificacao":{"tipo":"cnpj","valor":"12ABC34501DE35"},"nomeFantasiaOrigem":null,"razaoSocialOrigem":"Fornecedor A"},"itens":[{"codigoOrigem":"A-1","descricaoOriginal":"Item A","numero":1,"observacaoOrigem":null,"precoTotal":"1.0000","precoUnitario":"1.0000","quantidade":"1.0000","unidade":"UN"},{"codigoOrigem":"A-2","descricaoOriginal":"Item B","numero":2,"observacaoOrigem":null,"precoTotal":"2.0000","precoUnitario":"2.0000","quantidade":"1.0000","unidade":"UN"}],"orcamento":{"data":null,"desconto":"0.00","frete":"0.00","numero":"123","subtotal":"3.00","tributos":"0.00","valorTotal":"3.00"},"versaoContrato":2}';
  expect(calcularHashOrcamentoV2(exemplo()).jsonCanonico).toBe(esperado);
  expect(calcularHashOrcamentoV2(exemplo()).conteudoSha256).toBe("10f8830c7ac7587f14e7982d667f396ca950741357ecbbd54f387b25a35cfe3c");
});
it("datas equivalentes normalizam para UTC e não mutam a entrada", () => {
  const x = exemplo(), y = exemplo();
  Object.assign(x.orcamento, { data: "2026-10-09T00:00:00-03:00" });
  Object.assign(y.orcamento, { data: "2026-10-09T03:00:00.000Z" });
  const antes = structuredClone(x);
  expect(calcularHashOrcamentoV2(x)).toEqual(calcularHashOrcamentoV2(y)); expect(x).toEqual(antes);
});
it.each(["codigoOrigem", "numero", "descricaoOriginal", "unidade", "observacaoOrigem"])("hash inclui semântica do item %s", campo => {
  const x = exemplo(); Object.assign(x.itens[0], { [campo]: campo === "numero" ? 3 : "outro" });
  expect(calcularHashOrcamentoV2(x).conteudoSha256).not.toBe(calcularHashOrcamentoV2(exemplo()).conteudoSha256);
});
it("somatório arredonda só após somar itens e preserva regra de total", () => {
  const x = exemplo(); x.itens.forEach(i => { i.precoUnitario = "0.0049"; i.precoTotal = "0.0049"; });
  x.orcamento.subtotal = "0.01"; x.orcamento.frete = "0.10"; x.orcamento.desconto = "0.02";
  x.orcamento.tributos = "0.03"; x.orcamento.valorTotal = "0.12";
  expect(validarImportacaoOrcamentoV2(x).orcamento.valorTotal).toBe("0.12");
  x.orcamento.subtotal = "0"; erro(x, "SUBTOTAL_DIVERGENTE");
});
it("limita número de itens, rejeita financeiro null e fornecedor sem identificação", () => {
  const x = exemplo(); x.itens = []; erro(x, "LIMITE_ITENS");
  const y = exemplo(); y.itens = Array.from({ length: 1001 }, () => ({ ...y.itens[0] })); erro(y, "LIMITE_ITENS");
  const z = exemplo(); Object.assign(z.orcamento, { frete: null }); erro(z, "DECIMAL_INVALIDO");
  const w = exemplo(); delete (w.fornecedor as Record<string, unknown>).identificacao; erro(w, "OBJETO_OBRIGATORIO");
});
