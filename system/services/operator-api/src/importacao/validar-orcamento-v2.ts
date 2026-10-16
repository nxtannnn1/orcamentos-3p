import { ErroContrato, validarImportacaoOrcamento, type ImportacaoOrcamento } from "./validar-orcamento";
import { objetoEstrito, textoEstrito, validarIdentificacaoFornecedor, type IdentificacaoFornecedor } from "./fornecedor-v2";

export type IdentidadeDocumento = { tipo: "drive"; driveId: string; arquivoId: string } |
  { tipo: "externa"; namespace: string; documentoId: string };
export interface ImportacaoOrcamentoV2 {
  versaoContrato: 2;
  origem: { sistema: "sharepoint"; identidade: IdentidadeDocumento; codigoOrcamento?: string | null; nomeArquivo?: string | null };
  fornecedor: { identificacao: IdentificacaoFornecedor; razaoSocialOrigem: string; nomeFantasiaOrigem?: string | null };
  orcamento: ImportacaoOrcamento["orcamento"];
  itens: ImportacaoOrcamento["itens"];
}
function opcional(o: Record<string, unknown>, chave: string, campo: string, max = 255) {
  return Object.hasOwn(o, chave) ? { [chave]: o[chave] === null ? null : textoEstrito(o[chave], `${campo}.${chave}`, max) } : {};
}

/** Apenas contrato: fontes permitidas, tenant e persistência são responsabilidade do serviço futuro. */
export function validarImportacaoOrcamentoV2(entrada: unknown): ImportacaoOrcamentoV2 {
  const root = objetoEstrito(entrada, "$", ["versaoContrato", "origem", "fornecedor", "orcamento", "itens"]);
  if (root.versaoContrato !== 2) throw new ErroContrato("versaoContrato", "VERSAO_INVALIDA");
  const origem = objetoEstrito(root.origem, "origem", ["sistema", "identidade", "codigoOrcamento", "nomeArquivo"]);
  if (origem.sistema !== "sharepoint") throw new ErroContrato("origem.sistema", "ORIGEM_INVALIDA");
  const id = objetoEstrito(origem.identidade, "origem.identidade", ["tipo", "driveId", "arquivoId", "namespace", "documentoId"]);
  let identidade: IdentidadeDocumento;
  if (id.tipo === "drive") {
    objetoEstrito(id, "origem.identidade", ["tipo", "driveId", "arquivoId"]);
    identidade = { tipo: "drive", driveId: textoEstrito(id.driveId, "origem.identidade.driveId"),
      arquivoId: textoEstrito(id.arquivoId, "origem.identidade.arquivoId") };
  } else if (id.tipo === "externa") {
    objetoEstrito(id, "origem.identidade", ["tipo", "namespace", "documentoId"]);
    identidade = { tipo: "externa", namespace: textoEstrito(id.namespace, "origem.identidade.namespace"),
      documentoId: textoEstrito(id.documentoId, "origem.identidade.documentoId") };
  } else throw new ErroContrato("origem.identidade.tipo", "IDENTIDADE_INVALIDA");
  const fornecedor = objetoEstrito(root.fornecedor, "fornecedor", ["identificacao", "razaoSocialOrigem", "nomeFantasiaOrigem"]);
  const identificacao = validarIdentificacaoFornecedor(fornecedor.identificacao);
  const razaoSocialOrigem = textoEstrito(fornecedor.razaoSocialOrigem, "fornecedor.razaoSocialOrigem");
  const nomeFantasia = opcional(fornecedor, "nomeFantasiaOrigem", "fornecedor");
  // Reutiliza exclusivamente as regras financeiras e de itens v1, sem modificar o contrato legado.
  const financeiro = validarImportacaoOrcamento({ versaoContrato: 1,
    origem: { sistema: "sharepoint", driveId: "validacao-v2", driveFileId: "validacao-v2" },
    fornecedor: { razaoSocial: razaoSocialOrigem }, orcamento: root.orcamento, itens: root.itens });
  return { versaoContrato: 2,
    origem: { sistema: "sharepoint", identidade, ...opcional(origem, "codigoOrcamento", "origem"),
      ...opcional(origem, "nomeArquivo", "origem", 1000) },
    fornecedor: { identificacao, razaoSocialOrigem, ...nomeFantasia },
    orcamento: financeiro.orcamento, itens: financeiro.itens };
}
