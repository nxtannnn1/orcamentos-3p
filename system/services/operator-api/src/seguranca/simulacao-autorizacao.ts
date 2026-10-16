import "server-only";
import type { AtestadoCorporativo, ContextoAutorizado, Decisao, EscopoDocumental, IdentidadeAutenticada,
  Operacao, PedidoAutorizacao, RepositorioCatalogo, RepositorioConcessoes, VerificadorAtestado, VerificadorIdentidade } from "./contratos";
import { resolverFornecedor, validarIdentificacaoFornecedor } from "../importacao/fornecedor-v2";

export class ErroSeguranca extends Error {
  constructor(readonly codigo: string) { super(codigo); this.name = "ErroSeguranca"; }
}
const operacoes: readonly Operacao[] = ["documentos:ler", "importacoes:orcamentos", "financeiro:editar"];
function falha(codigo: string): never { throw new ErroSeguranca(codigo); }
function objeto(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) falha("CLAIMS_INVALIDAS");
  return v as Record<string, unknown>;
}
function estrito(v: unknown, chaves: string[]) {
  const o = objeto(v);
  if (Object.keys(o).some(k => !chaves.includes(k))) falha("CLAIMS_INVALIDAS");
  return o;
}
function texto(v: unknown): string {
  if (typeof v !== "string" || !v || v !== v.trim() || v.length > 1024 || /[\u0000-\u001f\u007f]/u.test(v)) falha("CLAIMS_INVALIDAS");
  return v;
}
function instante(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) falha("CLAIMS_INVALIDAS");
  return v;
}
function operacao(v: unknown): Operacao {
  if (!operacoes.includes(v as Operacao)) falha("OPERACAO_NEGADA");
  return v as Operacao;
}
function origem(v: unknown): EscopoDocumental {
  const o = estrito(v, ["fonte", "tipo", "escopo", "documentoId"]);
  if (o.fonte !== "sharepoint" || !["drive", "externa"].includes(o.tipo as string)) falha("FONTE_NEGADA");
  return Object.freeze({ fonte: "sharepoint", tipo: o.tipo as "drive" | "externa", escopo: texto(o.escopo), documentoId: texto(o.documentoId) });
}
function pedido(v: unknown): PedidoAutorizacao {
  const o = estrito(v, ["tenant", "origem", "operacao", "orcamentoId"]);
  const op = operacao(o.operacao);
  const budget = o.orcamentoId === null ? null : texto(o.orcamentoId);
  if ((op === "financeiro:editar") !== (budget !== null)) falha("ESCOPO_NEGADO");
  return Object.freeze({ tenant: texto(o.tenant), origem: origem(o.origem), operacao: op, orcamentoId: budget });
}
function mesmaOrigem(a: EscopoDocumental, b: EscopoDocumental) {
  return a.fonte === b.fonte && a.tipo === b.tipo && a.escopo === b.escopo && a.documentoId === b.documentoId;
}
function mesmoPedido(a: PedidoAutorizacao, b: PedidoAutorizacao) {
  return a.tenant === b.tenant && a.operacao === b.operacao && a.orcamentoId === b.orcamentoId && mesmaOrigem(a.origem, b.origem);
}
export interface DependenciasSimulacao {
  identidade: VerificadorIdentidade;
  atestado: VerificadorAtestado;
  concessoes: RepositorioConcessoes;
  catalogo: RepositorioCatalogo;
  agora: () => number;
  tenants: readonly string[];
  emissorIdentidade: string;
  emissorAtestado: string;
  audiencia: string;
}

/** Somente laboratório de testes. Não é um adaptador de autenticação de produção. */
export function criarSimulacaoAutorizacao(deps: DependenciasSimulacao) {
  function somenteTeste() {
    if (process.env.NODE_ENV !== "test" || process.env.VITEST !== "true") falha("SIMULACAO_DESABILITADA");
  }
  somenteTeste();
  const tenants = Object.freeze(deps.tenants.map(texto));
  if (!tenants.length) falha("CONFIGURACAO_INVALIDA");
  const emissorIdentidade = texto(deps.emissorIdentidade), emissorAtestado = texto(deps.emissorAtestado), audiencia = texto(deps.audiencia);
  // Captura portas: trocar propriedades da configuração depois não troca verificadores.
  const verificarIdentidade = deps.identidade.verificar.bind(deps.identidade);
  const verificarAtestado = deps.atestado.verificar.bind(deps.atestado);
  const consultarConcessoes = deps.concessoes.consultar.bind(deps.concessoes);
  const consultarCatalogo = deps.catalogo.consultar.bind(deps.catalogo);
  const relogio = deps.agora;
  const identidades = new WeakSet<object>(), atestados = new WeakSet<object>();
  const contextos = new WeakMap<object, { identidade: IdentidadeAutenticada; atestado: AtestadoCorporativo }>();
  function agora() { somenteTeste(); return instante(relogio()); }
  function vigente(inicio: number, fim: number, now: number) { return inicio <= now && now < fim && inicio < fim; }

  async function autenticar(credencial: unknown): Promise<IdentidadeAutenticada> {
    somenteTeste();
    try {
      const raw = await verificarIdentidade(texto(credencial));
      const o = estrito(raw, ["sujeito", "tipo", "tenant", "emissor", "audiencia", "autenticadoEm", "expiraEm", "modo", "papeis", "permissoes"]);
      if (!Array.isArray(o.papeis) || !Array.isArray(o.permissoes) ||
          o.papeis.some(p => !["Consulta", "Operador", "Comprador"].includes(p)) ||
          o.permissoes.some(p => !operacoes.includes(p))) falha("IDENTIDADE_INVALIDA");
      if (!((o.tipo === "usuario" && o.modo === "entra" && o.papeis.length > 0) ||
          (o.tipo === "servico" && o.modo === "servico" && o.papeis.length === 0))) falha("IDENTIDADE_INVALIDA");
      const i: IdentidadeAutenticada = Object.freeze({ sujeito: texto(o.sujeito), tipo: o.tipo as "usuario" | "servico",
        tenant: texto(o.tenant), emissor: texto(o.emissor), audiencia: texto(o.audiencia),
        autenticadoEm: instante(o.autenticadoEm), expiraEm: instante(o.expiraEm), modo: o.modo as "entra" | "servico",
        papeis: Object.freeze([...o.papeis]), permissoes: Object.freeze([...o.permissoes]) });
      if (!tenants.includes(i.tenant) || i.emissor !== emissorIdentidade || i.audiencia !== audiencia ||
          !vigente(i.autenticadoEm, i.expiraEm, agora())) falha("IDENTIDADE_INVALIDA");
      identidades.add(i); return i;
    } catch { falha("AUTENTICACAO_NEGADA"); }
  }
  async function validarAtestado(token: unknown): Promise<AtestadoCorporativo> {
    somenteTeste();
    try {
      const o = estrito(await verificarAtestado(texto(token)), ["tenant", "origem", "operacao", "orcamentoId", "sujeito", "tipoSolicitante", "emissor", "audiencia", "emitidoEm", "expiraEm"]);
      const p = pedido({ tenant: o.tenant, origem: o.origem, operacao: o.operacao, orcamentoId: o.orcamentoId });
      if (!["usuario", "servico"].includes(o.tipoSolicitante as string)) falha("ATESTADO_INVALIDO");
      const a: AtestadoCorporativo = Object.freeze({ ...p, sujeito: texto(o.sujeito), tipoSolicitante: o.tipoSolicitante as "usuario" | "servico",
        emissor: texto(o.emissor), audiencia: texto(o.audiencia), emitidoEm: instante(o.emitidoEm), expiraEm: instante(o.expiraEm) });
      if (!tenants.includes(a.tenant) || a.emissor !== emissorAtestado || a.audiencia !== audiencia ||
          !vigente(a.emitidoEm, a.expiraEm, agora()) || a.expiraEm - a.emitidoEm > 60) falha("ATESTADO_INVALIDO");
      atestados.add(a); return a;
    } catch { falha("ATESTADO_NEGADO"); }
  }
  async function decidir(i: IdentidadeAutenticada | null, a: AtestadoCorporativo | null, entrada: unknown): Promise<Decisao> {
    try {
      somenteTeste();
      if (!i || !identidades.has(i)) falha("IDENTIDADE_NAO_CONFIAVEL");
      if (!a || !atestados.has(a)) falha("ATESTADO_NAO_CONFIAVEL");
      const p = pedido(entrada), now = agora();
      if (!vigente(i.autenticadoEm, i.expiraEm, now) || !vigente(a.emitidoEm, a.expiraEm, now) || a.expiraEm > i.expiraEm) falha("VALIDADE_NEGADA");
      if (i.tenant !== p.tenant || a.tenant !== i.tenant || !tenants.includes(p.tenant)) falha("TENANT_NEGADO");
      if (a.sujeito !== i.sujeito || a.tipoSolicitante !== i.tipo || !mesmoPedido(a, p)) falha("VINCULO_NEGADO");
      if (!i.permissoes.includes(p.operacao)) falha("PERMISSAO_NEGADA");
      if (p.operacao === "financeiro:editar" && (i.tipo !== "usuario" || !i.papeis.includes("Comprador"))) falha("PAPEL_NEGADO");
      if (p.operacao === "importacoes:orcamentos" && i.tipo !== "servico") falha("PAPEL_NEGADO");
      const grants = await consultarConcessoes(p);
      if (!Array.isArray(grants)) falha("SEGURANCA_INDISPONIVEL");
      const concedido = grants.some(g => g.sujeito === i.sujeito && g.tipoSolicitante === i.tipo &&
        mesmoPedido(g, p) && instante(g.expiraEm) > agora());
      if (!concedido) falha("CONCESSAO_AUSENTE");
      // Reconfere tempo após dependência assíncrona.
      if (!vigente(i.autenticadoEm, i.expiraEm, agora()) || !vigente(a.emitidoEm, a.expiraEm, agora())) falha("VALIDADE_NEGADA");
      const contexto: ContextoAutorizado = Object.freeze({ ...p, sujeito: i.sujeito, simulado: true });
      contextos.set(contexto, { identidade: i, atestado: a }); return Object.freeze({ autorizado: true, contexto });
    } catch (e) {
      return Object.freeze({ autorizado: false, codigo: e instanceof ErroSeguranca ? e.codigo : "SEGURANCA_INDISPONIVEL" });
    }
  }
  async function resolverFornecedorAutorizado(contexto: ContextoAutorizado, identificacao: unknown): Promise<string> {
    somenteTeste();
    try {
      const prova = contextos.get(contexto);
      if (!prova || contexto.operacao !== "importacoes:orcamentos") falha("CONTEXTO_NAO_CONFIAVEL");
      // Concessões podem ter sido revogadas desde a decisão anterior.
      const antes = await decidir(prova.identidade, prova.atestado, {
        tenant: contexto.tenant, origem: contexto.origem, operacao: contexto.operacao, orcamentoId: contexto.orcamentoId });
      if (!antes.autorizado) falha(antes.codigo);
      const rows = await consultarCatalogo();
      if (!Array.isArray(rows)) falha("SEGURANCA_INDISPONIVEL");
      const limitado = rows.filter(r => r.tenant === contexto.tenant && r.fonte === contexto.origem.fonte &&
        r.tipo === contexto.origem.tipo && r.escopo === contexto.origem.escopo).map(r => {
          if (typeof r.ativo !== "boolean") falha("CATALOGO_INVALIDO");
          return { fornecedorId: texto(r.fornecedorId), ativo: r.ativo, identificacao: validarIdentificacaoFornecedor(r.identificacao) };
        });
      const resultado = resolverFornecedor(identificacao, limitado);
      const depois = await decidir(prova.identidade, prova.atestado, {
        tenant: contexto.tenant, origem: contexto.origem, operacao: contexto.operacao, orcamentoId: contexto.orcamentoId });
      if (!depois.autorizado) falha(depois.codigo);
      return resultado;
    } catch (e) {
      if (e instanceof ErroSeguranca) throw e;
      // Não expõe mensagens internas ou linhas de catálogo.
      falha("FORNECEDOR_NEGADO");
    }
  }
  return Object.freeze({ autenticar, validarAtestado, decidir, resolverFornecedorAutorizado });
}
