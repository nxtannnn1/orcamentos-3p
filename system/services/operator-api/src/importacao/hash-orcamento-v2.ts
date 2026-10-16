import { createHash } from "node:crypto";
import { validarImportacaoOrcamentoV2 } from "./validar-orcamento-v2";

export const VERSAO_CANONICALIZACAO_V2 = 2 as const;
type Json = null | string | number | Json[] | { [chave: string]: Json };
function serializar(valor: Json): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(serializar).join(",")}]`;
  return `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${serializar(valor[k])}`).join(",")}}`;
}
export function canonicalizarOrcamentoV2(entrada: unknown) {
  const v = validarImportacaoOrcamentoV2(entrada);
  const conteudo: Json = { versaoContrato: 2,
    fornecedor: { identificacao: { ...v.fornecedor.identificacao }, razaoSocialOrigem: v.fornecedor.razaoSocialOrigem,
      nomeFantasiaOrigem: v.fornecedor.nomeFantasiaOrigem ?? null },
    orcamento: { ...v.orcamento, data: v.orcamento.data == null ? null : new Date(v.orcamento.data).toISOString() },
    itens: [...v.itens].sort((a, b) => a.numero - b.numero).map(i => ({ ...i, observacaoOrigem: i.observacaoOrigem ?? null })) };
  return { versaoContrato: v.versaoContrato, versaoCanonicalizacao: VERSAO_CANONICALIZACAO_V2,
    identidade: { sistema: v.origem.sistema, ...v.origem.identidade },
    // Metadados são comparados/persistidos separadamente, não entram no hash semântico.
    codigoOrcamento: v.origem.codigoOrcamento ?? null, nomeArquivo: v.origem.nomeArquivo ?? null,
    jsonCanonico: serializar(conteudo) };
}
export function calcularHashOrcamentoV2(entrada: unknown) {
  const r = canonicalizarOrcamentoV2(entrada);
  return { ...r, conteudoSha256: createHash("sha256").update("3p-importacao-orcamento/canon-v2\n", "utf8")
    .update(r.jsonCanonico, "utf8").digest("hex") };
}
