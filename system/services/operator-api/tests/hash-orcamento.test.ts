import { expect, it } from "vitest";
import { calcularHashOrcamento } from "../src/importacao/hash-orcamento";
import { ErroContrato, validarImportacaoOrcamento } from "../src/importacao/validar-orcamento";

function exemplo() {
  return {
    versaoContrato: 1,
    origem: { sistema: "sharepoint", driveId: "drive-A", driveFileId: "arquivo-A", nomeArquivo: "a.pdf", codigoOrcamento: "externo-A" },
    fornecedor: { razaoSocial: "Fornecedor A" },
    orcamento: { numero: "123", data: "2026-10-09T00:00:00-03:00", subtotal: "3.00", frete: "0", desconto: "0", tributos: "0", valorTotal: "3" },
    itens: [
      { codigoOrigem: "A-1", numero: 1, descricaoOriginal: "Item A", quantidade: "1", unidade: "UN", precoUnitario: "1", precoTotal: "1" },
      { codigoOrigem: "A-2", numero: 2, descricaoOriginal: "Item B", quantidade: "1", unidade: "UN", precoUnitario: "2", precoTotal: "2" },
    ],
  };
}
function inverterChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(inverterChaves);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).reverse().map(([k,v]) => [k,inverterChaves(v)]));
  return valor;
}
it("ordem de propriedades não muda JSON nem hash", () => {
  expect(calcularHashOrcamento(inverterChaves(exemplo()))).toEqual(calcularHashOrcamento(exemplo()));
});
it("decimais equivalentes são normalizados sem float", () => {
  const x = exemplo(); x.itens[0].quantidade = "1.0000"; x.itens[0].precoUnitario = "1.00";
  x.orcamento.valorTotal = "3.00";
  expect(calcularHashOrcamento(x)).toEqual(calcularHashOrcamento(exemplo()));
});
it("ordena itens sem mutar entrada", () => {
  const x = exemplo(); x.itens.reverse(); const antes = structuredClone(x);
  expect(calcularHashOrcamento(x)).toEqual(calcularHashOrcamento(exemplo())); expect(x).toEqual(antes);
});
it.each(["quantidade", "precoUnitario", "descricaoOriginal"])("mudança semântica em %s altera hash", campo => {
  const x = exemplo();
  if (campo === "descricaoOriginal") x.itens[0].descricaoOriginal = "Outro item";
  else { x.itens[0][campo as "quantidade" | "precoUnitario"] = "2"; x.itens[0].precoTotal = "2"; x.orcamento.subtotal = "4"; x.orcamento.valorTotal = "4"; }
  expect(calcularHashOrcamento(x).conteudoSha256).not.toBe(calcularHashOrcamento(exemplo()).conteudoSha256);
});
it("opcionais ausentes equivalem a null", () => {
  const x = exemplo(); Object.assign(x.fornecedor, { nomeFantasia: null, cnpj: null });
  x.itens.forEach(item => Object.assign(item, {observacaoOrigem: null}));
  expect(calcularHashOrcamento(x)).toEqual(calcularHashOrcamento(exemplo()));
  const semData = exemplo(); delete (semData.orcamento as Record<string,unknown>).data;
  const dataNull = structuredClone(semData); Object.assign(dataNull.orcamento, {data: null});
  expect(calcularHashOrcamento(semData)).toEqual(calcularHashOrcamento(dataNull));
});
it("fornecedor altera conteúdo", () => {
  const x = exemplo(); x.fornecedor.razaoSocial = "Fornecedor B";
  expect(calcularHashOrcamento(x).conteudoSha256).not.toBe(calcularHashOrcamento(exemplo()).conteudoSha256);
});
it.each(["driveId", "driveFileId"])("%s altera identidade mas preserva hash de conteúdo", campo => {
  const x = exemplo(); x.origem[campo as "driveId" | "driveFileId"] = "outro";
  const a = calcularHashOrcamento(x), b = calcularHashOrcamento(exemplo());
  expect(a.identidade).not.toEqual(b.identidade); expect(a.conteudoSha256).toBe(b.conteudoSha256);
});
it("metadados externos não semânticos ficam fora do conteúdo", () => {
  const x = exemplo(); x.origem.nomeArquivo = "renomeado.pdf"; x.origem.codigoOrcamento = "outro-codigo";
  expect(calcularHashOrcamento(x)).toEqual(calcularHashOrcamento(exemplo()));
});
it("horários equivalentes produzem os mesmos bytes", () => {
  const x = exemplo(); x.orcamento.data = "2026-10-09T03:00:00.000Z";
  expect(calcularHashOrcamento(x)).toEqual(calcularHashOrcamento(exemplo()));
});
it("preserva precisão acima do limite seguro de Number", () => {
  const x = exemplo(); x.itens = [{...x.itens[0], precoUnitario: "99999999999999.9999", precoTotal: "99999999999999.9999"}];
  x.orcamento.subtotal = "100000000000000.00"; x.orcamento.valorTotal = x.orcamento.subtotal;
  expect(calcularHashOrcamento(x).jsonCanonico).toContain('"precoUnitario":"99999999999999.9999"');
});
it("preserva distinção Unicode sem normalização implícita", () => {
  const x = exemplo(), y = exemplo(); x.itens[0].descricaoOriginal = "Café"; y.itens[0].descricaoOriginal = "Cafe\u0301";
  expect(calcularHashOrcamento(x).conteudoSha256).not.toBe(calcularHashOrcamento(y).conteudoSha256);
});
it("compatível com saída validada e determinístico em chamadas repetidas", () => {
  const x = exemplo(), esperado = calcularHashOrcamento(x);
  expect(calcularHashOrcamento(validarImportacaoOrcamento(x))).toEqual(esperado);
  for (let i=0;i<10;i++) expect(calcularHashOrcamento(x)).toEqual(esperado);
  expect(esperado.versaoCanonicalizacao).toBe(1); expect(esperado.conteudoSha256).toMatch(/^[a-f0-9]{64}$/);
});
it.each(["token", "executadoEm", "usuarioAdministrador"])("rejeita %s em vez de incorporá-lo ao hash", campo => {
  const x = exemplo(); Object.assign(x, {[campo]: "dado-nao-permitido"});
  expect(() => calcularHashOrcamento(x)).toThrow(ErroContrato);
});
it("não ignora financeiro inválido", () => {
  const x = exemplo(); x.itens[0].precoUnitario = "NaN";
  expect(() => calcularHashOrcamento(x)).toThrow(ErroContrato);
});
it("fixa bytes e digest v1 conferido independentemente com SHA256 .NET", () => {
  const json = '{"fornecedor":{"cnpj":null,"nomeFantasia":null,"razaoSocial":"Fornecedor A"},"itens":[{"codigoOrigem":"A-1","descricaoOriginal":"Item A","numero":1,"observacaoOrigem":null,"precoTotal":"1.0000","precoUnitario":"1.0000","quantidade":"1.0000","unidade":"UN"},{"codigoOrigem":"A-2","descricaoOriginal":"Item B","numero":2,"observacaoOrigem":null,"precoTotal":"2.0000","precoUnitario":"2.0000","quantidade":"1.0000","unidade":"UN"}],"orcamento":{"data":"2026-10-09T03:00:00.000Z","desconto":"0.00","frete":"0.00","numero":"123","subtotal":"3.00","tributos":"0.00","valorTotal":"3.00"},"versaoContrato":1}';
  const resultado = calcularHashOrcamento(exemplo());
  expect(resultado.jsonCanonico).toBe(json);
  expect(resultado.conteudoSha256).toBe("d9e40e40ebc3f4b74e33cbf741d74ca7d0a7d8ae2de8f7ef6111821d0ad170cb");
});
it.each(["codigoOrigem", "numero", "unidade", "observacaoOrigem"])("preserva semântica de %s no item", campo => {
  const x = exemplo(); Object.assign(x.itens[0], {[campo]: campo === "numero" ? 3 : "outro"});
  expect(calcularHashOrcamento(x).conteudoSha256).not.toBe(calcularHashOrcamento(exemplo()).conteudoSha256);
});
it.each(["cnpj", "nomeFantasia"])("preserva %s do fornecedor no hash", campo => {
  const x = exemplo(); Object.assign(x.fornecedor, {[campo]: campo === "cnpj" ? "12345678000190" : "Fantasia"});
  expect(calcularHashOrcamento(x).conteudoSha256).not.toBe(calcularHashOrcamento(exemplo()).conteudoSha256);
});
