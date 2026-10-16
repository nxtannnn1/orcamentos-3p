import { createHash } from "node:crypto";
import { validarImportacaoOrcamento } from "./validar-orcamento";

export const VERSAO_CANONICALIZACAO = 1 as const;
const DOMINIO = "3p-importacao-orcamento/canon-v1\n";
type Json = null | string | number | Json[] | { [chave: string]: Json };

// As chaves da projeção são ASCII fixas. sort() usa ordem UTF-16, sem locale.
function serializar(valor: Json): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(serializar).join(",")}]`;
  return `{${Object.keys(valor).sort().map(chave =>
    `${JSON.stringify(chave)}:${serializar(valor[chave])}`).join(",")}}`;
}

/** Puro: valida a entrada, não lê configuração/relógio e não acessa o banco. */
export function canonicalizarOrcamento(entrada: unknown) {
  const validado = validarImportacaoOrcamento(entrada);
  const { fornecedor, orcamento } = validado;
  const conteudo: Json = {
    versaoContrato: validado.versaoContrato,
    fornecedor: { razaoSocial: fornecedor.razaoSocial,
      nomeFantasia: fornecedor.nomeFantasia ?? null, cnpj: fornecedor.cnpj ?? null },
    orcamento: { numero: orcamento.numero,
      data: orcamento.data == null ? null : new Date(orcamento.data).toISOString(),
      subtotal: orcamento.subtotal, frete: orcamento.frete, desconto: orcamento.desconto,
      tributos: orcamento.tributos, valorTotal: orcamento.valorTotal },
    itens: [...validado.itens].sort((a, b) => a.numero - b.numero).map(item => ({
      codigoOrigem: item.codigoOrigem, numero: item.numero,
      descricaoOriginal: item.descricaoOriginal, quantidade: item.quantidade,
      unidade: item.unidade, precoUnitario: item.precoUnitario, precoTotal: item.precoTotal,
      observacaoOrigem: item.observacaoOrigem ?? null,
    })),
  };
  return {
    versaoContrato: validado.versaoContrato,
    versaoCanonicalizacao: VERSAO_CANONICALIZACAO,
    // Identidade é comparada separadamente; hash igual não identifica documento.
    identidade: { sistemaOrigem: validado.origem.sistema, tipoIdentidade: "drive" as const,
      escopoOrigem: validado.origem.driveId, documentoOrigemId: validado.origem.driveFileId },
    jsonCanonico: serializar(conteudo),
  };
}

export function calcularHashOrcamento(entrada: unknown) {
  const resultado = canonicalizarOrcamento(entrada);
  return { ...resultado, conteudoSha256: createHash("sha256")
    .update(DOMINIO, "utf8").update(resultado.jsonCanonico, "utf8").digest("hex") };
}
