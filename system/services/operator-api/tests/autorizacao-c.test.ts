import { afterEach, expect, it, vi } from "vitest";
import { criarSimulacaoAutorizacao } from "../src/seguranca/simulacao-autorizacao";
import type { AtestadoCorporativo, Concessao, IdentidadeAutenticada, PedidoAutorizacao, RegistroCatalogo } from "../src/seguranca/contratos";
import { protectedRead } from "../src/server/http";
afterEach(() => vi.unstubAllEnvs());

function laboratorio(usuario = false) {
  let now = 1000;
  const pedido: PedidoAutorizacao = { tenant: "tenant-A", origem: { fonte: "sharepoint", tipo: "drive", escopo: "drive-A", documentoId: "doc-A" },
    operacao: usuario ? "financeiro:editar" : "importacoes:orcamentos", orcamentoId: usuario ? "budget-A" : null };
  const identidade: IdentidadeAutenticada = { sujeito: usuario ? "oid-A" : "n8n-A", tipo: usuario ? "usuario" : "servico", tenant: "tenant-A",
    emissor: "identidade-teste", audiencia: "api-teste", autenticadoEm: 990, expiraEm: 2000,
    modo: usuario ? "entra" : "servico", papeis: usuario ? ["Comprador"] : [], permissoes: [pedido.operacao] };
  const atestado: AtestadoCorporativo = { ...structuredClone(pedido), sujeito: identidade.sujeito, tipoSolicitante: identidade.tipo,
    emissor: "atestado-teste", audiencia: "api-teste", emitidoEm: 995, expiraEm: 1050 };
  const grants: Concessao[] = [{ ...structuredClone(pedido), sujeito: identidade.sujeito, tipoSolicitante: identidade.tipo, expiraEm: 1500 }];
  const catalogo: RegistroCatalogo[] = [{ tenant: "tenant-A", fonte: "sharepoint", tipo: "drive", escopo: "drive-A", fornecedorId: "001",
    ativo: true, identificacao: { tipo: "cnpj", valor: "12ABC34501DE35" } }];
  const verificarIdentidade = vi.fn(async (token: string): Promise<unknown> => token === "credencial-conhecida" ? identidade : null);
  const verificarAtestado = vi.fn(async (token: string): Promise<unknown> => token === "atestado-conhecido" ? atestado : null);
  const consultarConcessoes = vi.fn(async () => grants);
  const consultarCatalogo = vi.fn(async () => catalogo);
  const deps = { identidade: { verificar: verificarIdentidade }, atestado: { verificar: verificarAtestado },
    concessoes: { consultar: consultarConcessoes }, catalogo: { consultar: consultarCatalogo }, agora: () => now,
    tenants: ["tenant-A", "tenant-B"], emissorIdentidade: "identidade-teste", emissorAtestado: "atestado-teste", audiencia: "api-teste" };
  const api = criarSimulacaoAutorizacao(deps);
  async function provas() {
    return { i: await api.autenticar("credencial-conhecida"), a: await api.validarAtestado("atestado-conhecido") };
  }
  async function decisao() { const { i, a } = await provas(); return api.decidir(i, a, pedido); }
  async function contexto() { const d = await decisao(); if (!d.autorizado) throw new Error(d.codigo); return d.contexto; }
  return { api, deps, pedido, identidade, atestado, grants, catalogo, provas, decisao, contexto,
    verificarIdentidade, verificarAtestado, consultarConcessoes, consultarCatalogo, setNow: (n: number) => { now = n; } };
}
it("autoriza importador autenticado com atestado e concessão exatos", async () => {
  const l = laboratorio(); expect(await l.decisao()).toMatchObject({ autorizado: true, contexto: { simulado: true, sujeito: "n8n-A" } });
});
it("autoriza Comprador corporativo com concessão no orçamento", async () => expect(await laboratorio(true).decisao()).toMatchObject({ autorizado: true }));
it("consulta documental também exige permissão e concessão", async () => {
  const l = laboratorio(true); Object.assign(l.pedido, { operacao: "documentos:ler", orcamentoId: null });
  Object.assign(l.atestado, { operacao: "documentos:ler", orcamentoId: null });
  Object.assign(l.grants[0], { operacao: "documentos:ler", orcamentoId: null });
  Object.assign(l.identidade, { papeis: ["Consulta"], permissoes: ["documentos:ler"] });
  expect(await l.decisao()).toMatchObject({ autorizado: true });
  l.grants.length = 0; expect(await l.decisao()).toEqual({ autorizado: false, codigo: "CONCESSAO_AUSENTE" });
});
it.each([null, "", "invalida", { sujeito: "n8n-A" }])("recusa credencial ausente/arbitrária %j", async token => {
  const l = laboratorio(); await expect(l.api.autenticar(token)).rejects.toThrow("AUTENTICACAO_NEGADA");
});
it.each([null, "", "invalido", { tenant: "tenant-A" }])("recusa atestado ausente/arbitrário %j", async token => {
  const l = laboratorio(); await expect(l.api.validarAtestado(token)).rejects.toThrow("ATESTADO_NEGADO");
});
it("objetos estruturalmente válidos e cópias de provas não são confiáveis", async () => {
  const l = laboratorio(), { i, a } = await l.provas();
  expect(await l.api.decidir(l.identidade, a, l.pedido)).toMatchObject({ autorizado: false, codigo: "IDENTIDADE_NAO_CONFIAVEL" });
  expect(await l.api.decidir(i, l.atestado, l.pedido)).toMatchObject({ autorizado: false, codigo: "ATESTADO_NAO_CONFIAVEL" });
  expect(await l.api.decidir({ ...i }, a, l.pedido)).toMatchObject({ autorizado: false });
  expect(await l.api.decidir(i, { ...a }, l.pedido)).toMatchObject({ autorizado: false });
  expect(await l.api.decidir(null, a, l.pedido)).toMatchObject({ autorizado: false });
});
it("provas de outra instância de laboratório não atravessam a fronteira de confiança", async () => {
  const l = laboratorio(), outra = laboratorio(), { i, a } = await outra.provas();
  expect(await l.api.decidir(i, a, l.pedido)).toMatchObject({ autorizado: false });
});
it.each([
  { tenant: "tenant-X" }, { emissor: "forjado" }, { audiencia: "graph" }, { autenticadoEm: 1001 },
  { expiraEm: 1000 }, { expiraEm: NaN }, { expiraEm: 1.5 }, { modo: "local-mock-bypass" },
  { papeis: ["Administrador"] }, { permissoes: ["*"] }, { sujeito: "" }, { papel: "Comprador" },
])("identidade inválida falha fechada %j", async override => {
  const l = laboratorio(true); Object.assign(l.identidade, override);
  await expect(l.api.autenticar("credencial-conhecida")).rejects.toThrow("AUTENTICACAO_NEGADA");
});
it.each([
  { tenant: "tenant-X" }, { emissor: "forjado" }, { audiencia: "graph" }, { emitidoEm: 1001 },
  { expiraEm: 1000 }, { expiraEm: 1100 }, { expiraEm: NaN }, { tipoSolicitante: "admin" }, { papel: "Comprador" },
])("atestado inválido falha fechado %j", async override => {
  const l = laboratorio(); Object.assign(l.atestado, override);
  await expect(l.api.validarAtestado("atestado-conhecido")).rejects.toThrow("ATESTADO_NEGADO");
});
it.each(["tenant", "sujeito", "tipoSolicitante", "operacao", "orcamentoId"])("atestado não pode alterar vínculo %s", async campo => {
  const l = laboratorio(true);
  if (campo === "tenant") Object.assign(l.atestado, { tenant: "tenant-B" });
  else if (campo === "tipoSolicitante") Object.assign(l.atestado, { tipoSolicitante: "servico" });
  else if (campo === "operacao") Object.assign(l.atestado, { operacao: "documentos:ler", orcamentoId: null });
  else Object.assign(l.atestado, { [campo]: "outro" });
  expect(await l.decisao()).toMatchObject({ autorizado: false });
});
it.each(["fonte", "tipo", "escopo", "documentoId"])("fonte/vínculo documental alterado %s é negado", async campo => {
  const l = laboratorio(); Object.assign(l.pedido.origem, { [campo]: campo === "tipo" ? "externa" : "outro" });
  expect(await l.decisao()).toMatchObject({ autorizado: false });
});
it("mesmo documento sem grant de fonte/escopo é negado", async () => {
  const l = laboratorio(); Object.assign(l.grants[0].origem, { escopo: "drive-B" });
  expect(await l.decisao()).toEqual({ autorizado: false, codigo: "CONCESSAO_AUSENTE" });
});
it.each(["Consulta", "Operador"])("%s não recebe edição financeira mesmo com permissão e grant", async papel => {
  const l = laboratorio(true); Object.assign(l.identidade, { papeis: [papel] });
  expect(await l.decisao()).toEqual({ autorizado: false, codigo: "PAPEL_NEGADO" });
});
it("serviço não edita e usuário não importa, mesmo com claims permissivas", async () => {
  const l = laboratorio(true); Object.assign(l.identidade, { tipo: "servico", modo: "servico", papeis: [] });
  Object.assign(l.atestado, { tipoSolicitante: "servico" }); Object.assign(l.grants[0], { tipoSolicitante: "servico" });
  expect(await l.decisao()).toMatchObject({ autorizado: false, codigo: "PAPEL_NEGADO" });
  const u = laboratorio(); Object.assign(u.identidade, { tipo: "usuario", modo: "entra", papeis: ["Comprador"] });
  Object.assign(u.atestado, { tipoSolicitante: "usuario" }); Object.assign(u.grants[0], { tipoSolicitante: "usuario" });
  expect(await u.decisao()).toMatchObject({ autorizado: false, codigo: "PAPEL_NEGADO" });
});
it("operação sem permissão e pedido desconhecido são negados", async () => {
  const l = laboratorio(); Object.assign(l.identidade, { permissoes: [] });
  expect(await l.decisao()).toEqual({ autorizado: false, codigo: "PERMISSAO_NEGADA" });
  const { i, a } = await l.provas();
  expect(await l.api.decidir(i, a, { ...l.pedido, operacao: "admin" })).toMatchObject({ autorizado: false });
  expect(await l.api.decidir(i, a, { ...l.pedido, sujeito: "admin" })).toMatchObject({ autorizado: false });
});
it("expiração é exclusiva e conferida novamente após autenticação", async () => {
  const l = laboratorio(), { i, a } = await l.provas(); l.setNow(1050);
  expect(await l.api.decidir(i, a, l.pedido)).toEqual({ autorizado: false, codigo: "VALIDADE_NEGADA" });
});
it("atestado não pode sobreviver à identidade autenticada", async () => {
  const l = laboratorio(); Object.assign(l.identidade, { expiraEm: 1040 });
  expect(await l.decisao()).toMatchObject({ autorizado: false, codigo: "VALIDADE_NEGADA" });
});
it("grant expirado, de outro tenant, sujeito ou orçamento não concede acesso", async () => {
  for (const override of [{ expiraEm: 1000 }, { tenant: "tenant-B" }, { sujeito: "outro" }, { orcamentoId: "budget-B" }]) {
    const l = laboratorio(true); Object.assign(l.grants[0], override);
    expect(await l.decisao()).toMatchObject({ autorizado: false });
  }
});
it("falhas internas não expõem mensagens nem concedem acesso", async () => {
  const l = laboratorio(); l.verificarIdentidade.mockRejectedValue(new Error("segredo identidade"));
  await expect(l.api.autenticar("credencial-conhecida")).rejects.toThrow(/^AUTENTICACAO_NEGADA$/);
  const a = laboratorio(); a.verificarAtestado.mockRejectedValue(new Error("segredo assinatura"));
  await expect(a.api.validarAtestado("atestado-conhecido")).rejects.toThrow(/^ATESTADO_NEGADO$/);
  const b = laboratorio(); b.consultarConcessoes.mockRejectedValue(new Error("SQL segredo"));
  expect(await b.decisao()).toEqual({ autorizado: false, codigo: "SEGURANCA_INDISPONIVEL" });
});
it("provas são cópias profundamente congeladas, imunes à alteração dos mocks", async () => {
  const l = laboratorio(true), { i, a } = await l.provas();
  expect(() => Object.assign(i, { sujeito: "admin" })).toThrow();
  expect(() => (i.papeis as string[]).push("Administrador")).toThrow();
  expect(() => Object.assign(a.origem, { escopo: "drive-B" })).toThrow();
  Object.assign(l.identidade, { sujeito: "admin" }); Object.assign(l.atestado.origem, { escopo: "drive-B" });
  expect(await l.api.decidir(i, a, l.pedido)).toMatchObject({ autorizado: true });
});
it("catálogo é filtrado por tenant, fonte, tipo e escopo antes da resolução v2", async () => {
  const l = laboratorio(); const original = l.catalogo[0];
  for (const override of [{ tenant: "tenant-B" }, { fonte: "outro" }, { tipo: "externa" }, { escopo: "drive-B" }])
    l.catalogo.push({ ...original, ...override, fornecedorId: "fora" } as RegistroCatalogo);
  expect(await l.api.resolverFornecedorAutorizado(await l.contexto(), original.identificacao)).toBe("001");
  expect(l.catalogo).toHaveLength(5);
});
it("fornecedor exclusivamente fora do escopo é negado", async () => {
  const l = laboratorio(); Object.assign(l.catalogo[0], { tenant: "tenant-B" });
  await expect(l.api.resolverFornecedorAutorizado(await l.contexto(), l.catalogo[0].identificacao)).rejects.toThrow(/^FORNECEDOR_NEGADO$/);
});
it("contexto forjado/copiado e operação diferente não abrem catálogo", async () => {
  const l = laboratorio(), c = await l.contexto();
  await expect(l.api.resolverFornecedorAutorizado({ ...c }, l.catalogo[0].identificacao)).rejects.toThrow("CONTEXTO_NAO_CONFIAVEL");
  const u = laboratorio(true);
  await expect(u.api.resolverFornecedorAutorizado(await u.contexto(), u.catalogo[0].identificacao)).rejects.toThrow("CONTEXTO_NAO_CONFIAVEL");
  expect(l.consultarCatalogo).not.toHaveBeenCalled(); expect(u.consultarCatalogo).not.toHaveBeenCalled();
});
it("revogação de grant após decisão bloqueia catálogo", async () => {
  const l = laboratorio(), c = await l.contexto(); l.grants.length = 0;
  await expect(l.api.resolverFornecedorAutorizado(c, l.catalogo[0].identificacao)).rejects.toThrow("CONCESSAO_AUSENTE");
  expect(l.consultarCatalogo).not.toHaveBeenCalled();
});
it("expiração e revogação durante consultas assíncronas também bloqueiam", async () => {
  const l = laboratorio(), c = await l.contexto();
  l.consultarCatalogo.mockImplementation(async () => { l.setNow(1050); return l.catalogo; });
  await expect(l.api.resolverFornecedorAutorizado(c, l.catalogo[0].identificacao)).rejects.toThrow("VALIDADE_NEGADA");
  const u = laboratorio(), ctx = await u.contexto();
  u.consultarCatalogo.mockImplementation(async () => { u.grants.length = 0; return u.catalogo; });
  await expect(u.api.resolverFornecedorAutorizado(ctx, u.catalogo[0].identificacao)).rejects.toThrow("CONCESSAO_AUSENTE");
});
it("falha do catálogo e fornecedor inativo/ambíguo são negados sem detalhes", async () => {
  for (const modo of ["falha", "inativo", "ambiguo"]) {
    const l = laboratorio(), c = await l.contexto();
    if (modo === "falha") l.consultarCatalogo.mockRejectedValue(new Error("segredo banco"));
    if (modo === "inativo") Object.assign(l.catalogo[0], { ativo: false });
    if (modo === "ambiguo") l.catalogo.push({ ...l.catalogo[0], fornecedorId: "2" });
    await expect(l.api.resolverFornecedorAutorizado(c, l.catalogo[0].identificacao)).rejects.toThrow(/^FORNECEDOR_NEGADO$/);
  }
});
it("tenant B não reutiliza concessão/catalogo de A mesmo com o mesmo sujeito/documento", async () => {
  const l = laboratorio(); Object.assign(l.identidade, { tenant: "tenant-B" }); Object.assign(l.atestado, { tenant: "tenant-B" }); Object.assign(l.pedido, { tenant: "tenant-B" });
  expect(await l.decisao()).toMatchObject({ autorizado: false, codigo: "CONCESSAO_AUSENTE" });
  Object.assign(l.grants[0], { tenant: "tenant-B" });
  await expect(l.api.resolverFornecedorAutorizado(await l.contexto(), l.catalogo[0].identificacao)).rejects.toThrow("FORNECEDOR_NEGADO");
});
it("permite identidade documental externa apenas com grant e catálogo exatos", async () => {
  const l = laboratorio(); for (const o of [l.pedido.origem, l.atestado.origem, l.grants[0].origem]) Object.assign(o, { tipo: "externa", escopo: "ERP-A" });
  Object.assign(l.catalogo[0], { tipo: "externa", escopo: "ERP-A" });
  expect(await l.api.resolverFornecedorAutorizado(await l.contexto(), l.catalogo[0].identificacao)).toBe("001");
});
it.each(["production", "development", undefined])("simulação não inicializa em %s", ambiente => {
  const l = laboratorio(); vi.stubEnv("NODE_ENV", ambiente);
  expect(() => criarSimulacaoAutorizacao(l.deps)).toThrow("SIMULACAO_DESABILITADA");
});
it("instância criada em teste é bloqueada se o ambiente mudar", async () => {
  const l = laboratorio(), { i, a } = await l.provas(), c = await l.contexto(); vi.stubEnv("NODE_ENV", "production");
  await expect(l.api.autenticar("credencial-conhecida")).rejects.toThrow("SIMULACAO_DESABILITADA");
  await expect(l.api.validarAtestado("atestado-conhecido")).rejects.toThrow("SIMULACAO_DESABILITADA");
  expect(await l.api.decidir(i, a, l.pedido)).toEqual({ autorizado: false, codigo: "SIMULACAO_DESABILITADA" });
  await expect(l.api.resolverFornecedorAutorizado(c, l.catalogo[0].identificacao)).rejects.toThrow("SIMULACAO_DESABILITADA");
});
it("configuração vazia, relógio inválido e retorno malformado negam acesso", async () => {
  const l = laboratorio(); expect(() => criarSimulacaoAutorizacao({ ...l.deps, tenants: [] })).toThrow("CONFIGURACAO_INVALIDA");
  l.setNow(NaN); await expect(l.api.autenticar("credencial-conhecida")).rejects.toThrow("AUTENTICACAO_NEGADA");
  const u = laboratorio(); u.consultarConcessoes.mockResolvedValue(null as unknown as Concessao[]);
  expect(await u.decisao()).toMatchObject({ autorizado: false });
});
it("NODE_ENV=test sem marcador do executor de testes não ativa mocks", () => {
  const l = laboratorio(); vi.stubEnv("VITEST", undefined);
  expect(() => criarSimulacaoAutorizacao(l.deps)).toThrow("SIMULACAO_DESABILITADA");
});
it("fluxo simulado completo não faz chamadas externas", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("chamada externa proibida"));
  try {
    const l = laboratorio();
    expect(await l.api.resolverFornecedorAutorizado(await l.contexto(), l.catalogo[0].identificacao)).toBe("001");
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
it.each(["POST", "PATCH", "PUT", "DELETE"])("guard HTTP existente continua bloqueando %s antes da ação", async method => {
  const action = vi.fn(); const resposta = await protectedRead(new Request("http://localhost/", { method }), action);
  expect(resposta.status).toBe(405); expect(action).not.toHaveBeenCalled();
});
