export type Operacao = "documentos:ler" | "importacoes:orcamentos" | "financeiro:editar";
export type Papel = "Consulta" | "Operador" | "Comprador";
export interface IdentidadeAutenticada {
  readonly sujeito: string;
  readonly tipo: "usuario" | "servico";
  readonly tenant: string;
  readonly emissor: string;
  readonly audiencia: string;
  readonly autenticadoEm: number;
  readonly expiraEm: number;
  readonly modo: "entra" | "servico";
  readonly papeis: readonly Papel[];
  readonly permissoes: readonly Operacao[];
}
export interface EscopoDocumental {
  readonly fonte: "sharepoint";
  readonly tipo: "drive" | "externa";
  readonly escopo: string;
  readonly documentoId: string;
}
export interface PedidoAutorizacao {
  readonly tenant: string;
  readonly origem: EscopoDocumental;
  readonly operacao: Operacao;
  readonly orcamentoId: string | null;
}
export interface AtestadoCorporativo extends PedidoAutorizacao {
  readonly sujeito: string;
  readonly tipoSolicitante: "usuario" | "servico";
  readonly emissor: string;
  readonly audiencia: string;
  readonly emitidoEm: number;
  readonly expiraEm: number;
}
/** Portas confiáveis do servidor; objetos de cliente nunca implementam essas interfaces. */
export interface VerificadorIdentidade { verificar(credencial: string): Promise<unknown>; }
export interface VerificadorAtestado { verificar(atestado: string): Promise<unknown>; }
export interface Concessao extends PedidoAutorizacao {
  readonly sujeito: string;
  readonly tipoSolicitante: "usuario" | "servico";
  readonly expiraEm: number;
}
export interface RepositorioConcessoes { consultar(pedido: PedidoAutorizacao): Promise<readonly Concessao[]>; }
export interface RegistroCatalogo {
  readonly tenant: string;
  readonly fonte: "sharepoint";
  readonly tipo: "drive" | "externa";
  readonly escopo: string;
  readonly fornecedorId: string;
  readonly ativo: boolean;
  readonly identificacao: import("../importacao/fornecedor-v2").IdentificacaoFornecedor;
}
export interface RepositorioCatalogo { consultar(): Promise<readonly RegistroCatalogo[]>; }
export type Decisao = { readonly autorizado: false; readonly codigo: string } |
  { readonly autorizado: true; readonly contexto: ContextoAutorizado };
export interface ContextoAutorizado extends PedidoAutorizacao {
  readonly sujeito: string;
  readonly simulado: true;
}
