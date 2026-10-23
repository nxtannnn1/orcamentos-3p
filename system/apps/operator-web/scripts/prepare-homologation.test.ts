import { describe, expect, it } from "vitest";
import { buildArtifacts } from "./prepare-homologation.mjs";
import { evaluateExpression } from "./power-automate-expression-check.mjs";

const artifacts = buildArtifacts();
const definition = artifacts["flow.definition.candidate.json"];
type Action = { type?: string; expression?: unknown; actions?: Record<string, Action>; else?: { actions: Record<string, Action> }; inputs?: Record<string, unknown>; runAfter?: Record<string, string[]> };
function allActions(actions: Record<string, Action>, result: Record<string, Action> = {}) {
  for (const [name, action] of Object.entries(actions)) {
    if (result[name]) throw new Error(`Duplicate action ${name}`);
    result[name] = action;
    allActions(action.actions ?? {}, result);
    allActions(action.else?.actions ?? {}, result);
  }
  return result;
}
const actions = allActions(definition.actions as Record<string, Action>);
const source = { ID: 10, Status_Revisao: { Value: "APROVADO" }, Enviado_Historico: { Value: "NAO" }, Material_Aprovado: { Id: 1 }, Codigo_Orcamento: { Id: 2 }, Quantidade: 2, Preco_Unitario: 10, Preco_Total: 20, Fornecedor: "Synthetic A", Descricao_Original: "Synthetic", Unidade_Original: "UN", AprovadoPor: "Pessoa Sintética", EmailAprovador: "pessoa.sintetica@example.com", Data_Decisao: "2026-10-01T12:00:00Z", Revisado_Por_Oid: "synthetic-oid", Decisao_Id: "synthetic-decision", "@odata.etag": '"1"' };
function context(item: Record<string, unknown> = source) {
  return { bodies: { Ler_item_atual: item, Validar_tipos: item, Obter_material: { ID: 1, Unidade_Padrao: { Value: "UN" }, Codigo_Neoenergia: "TEST-NE", "@odata.etag": '"1"' }, Obter_orcamento: { ID: 2, Codigo_Orcamento: "TEST-B", Data_Orcamento: "2026-10-01", "@odata.etag": '"1"' } } as Record<string, unknown>, outputs: {} as Record<string, unknown>, parameters: { siteUrl: "https://example.invalid/sites/3p-homolog", approvedIsolatedSiteUrl: "https://example.invalid/sites/3p-homolog", isolationConfirmed: true, itemsListId: "synthetic-list" }, trigger: { ID: 10 } };
}
function condition(name: string, ctx = context()): boolean {
  const expression = actions[name].expression as { and: { equals: [string, boolean] }[] };
  return expression.and.every(x => evaluateExpression(x.equals[0], ctx) === x.equals[1]);
}
function numericTypes(item: typeof source) {
  const schema = (actions.Validar_tipos.inputs as { schema: { properties: Record<string, { type: string[] }>; required: string[] } }).schema;
  const value = item as Record<string, unknown>;
  return schema.required.every(k => Object.hasOwn(value, k)) && Object.entries(schema.properties).every(([k, p]) => value[k] === undefined || p.type.includes(value[k] === null ? "null" : typeof value[k]));
}
describe("artefatos locais de homologação — sem motor/conectores reais", () => {
  it("fica bloqueado por padrão e não contém IDs, sites ou segredos produtivos", () => {
    expect(definition.parameters.isolationConfirmed.defaultValue).toBe(false);
    expect(definition.parameters.siteUrl.defaultValue).toBe("");
    expect(artifacts["manifest.json"].engineValidated).toBe(false);
    expect(JSON.stringify(artifacts)).not.toContain("3penergiasolar.sharepoint.com");
    expect(condition("Isolamento")).toBe(true);
    const ctx = context(); ctx.parameters.isolationConfirmed = false;
    expect(condition("Isolamento", ctx)).toBe(false);
  });
  it("todas as dependências runAfter existem no mesmo escopo", () => {
    const check = (scope: Record<string, Action>) => {
      for (const action of Object.values(scope)) {
        for (const dependency of Object.keys(action.runAfter ?? {})) expect(scope).toHaveProperty(dependency);
        check(action.actions ?? {}); check(action.else?.actions ?? {});
      }
    };
    check(definition.actions as Record<string, Action>);
  });
  it("todas as referências a ações existem e os delimitadores são avaliáveis", () => {
    const ctx = context();
    ctx.outputs.Snapshot = {};
    ctx.bodies.Buscar_historico = { value: [] };
    const visit = (value: unknown) => {
      if (typeof value === "string" && value.startsWith("@")) {
        for (const match of value.matchAll(/(?:body|outputs)\('([^']+)'\)/g)) expect(actions).toHaveProperty(match[1]);
        expect(() => evaluateExpression(value, ctx)).not.toThrow();
      } else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    // Only action expressions; trigger splitOn uses the same limited grammar.
    visit(definition.actions);
  });
  it.each([null, 0, -1, "2", "invalid", " "])("bloqueia quantidade incompleta/inválida: %s", value => {
    const item = { ...source, Quantidade: value } as unknown as typeof source;
    expect(numericTypes(item) && condition("Validar_valores", context(item))).toBe(false);
  });
  it.each([null, 0, -1, "10", "invalid"])("bloqueia preço inválido: %s", value => {
    const item = { ...source, Preco_Unitario: value } as unknown as typeof source;
    expect(numericTypes(item) && condition("Validar_valores", context(item))).toBe(false);
  });
  it("aceita item completo e bloqueia pendente, espaços, material ou autoria ausentes", () => {
    expect(condition("Validar_valores")).toBe(true);
    expect(condition("Item_aprovado", context({ ...source, Status_Revisao: { Value: "PENDENTE" } }))).toBe(false);
    for (const patch of [{ Fornecedor: " " }, { Unidade_Original: " " }, { Descricao_Original: " " }, { Material_Aprovado: null }, { AprovadoPor: null }, { AprovadoPor: " " }, { EmailAprovador: null }, { Data_Decisao: null }, { Decisao_Id: null }])
      expect(condition("Validar_valores", context({ ...source, ...patch }))).toBe(false);
  });
  it("valida relacionamentos e unidade", () => {
    expect(condition("Validar_relacoes")).toBe(true);
    expect(condition("Validar_relacoes", context({ ...source, Unidade_Original: "KG" }))).toBe(false);
  });
  it("snapshot completo, sem código interno inventado ou aprovação artificial", () => {
    const snapshot = actions.Snapshot.inputs!;
    const ctx = context();
    const evaluated = Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, evaluateExpression(String(v), ctx)]));
    expect(evaluated).toMatchObject({ "Item_Origem/Id": 10, "Material_Oficial/Id": 1, "Orcamento_Origem/Id": 2, ID_Item_Importado: 10, Data_Aprovacao: source.Data_Decisao, AprovadoPor: source.AprovadoPor, EmailAprovador: source.EmailAprovador, Chave_Historico: "Itens_Importados:10" });
    expect(JSON.stringify(definition)).not.toContain("['Codigo_Material']");
    expect(JSON.stringify(snapshot)).not.toContain("utcNow");
    expect(evaluated.Preco_Total).toBe(20);
    ctx.outputs.Snapshot = evaluated;
    ctx.bodies.Reler_historico = evaluated;
    expect(condition("Conferir_criado", ctx)).toBe(true);
    ctx.bodies.Reler_historico = { ...evaluated, Fornecedor: null };
    expect(condition("Conferir_criado", ctx)).toBe(false);
  });
  it.each([undefined, null, 0, -1, "20", "invalid"])("bloqueia total inválido sem calcular um substituto: %s", value => {
    const item = { ...source, Preco_Total: value } as unknown as typeof source;
    expect(numericTypes(item) && condition("Validar_valores", context(item))).toBe(false);
  });
  it("deduplica por três identidades e não confirma existência ambígua", () => {
    const query = (actions.Buscar_historico.inputs as { parameters: Record<string, unknown> }).parameters.$filter;
    expect(evaluateExpression(String(query), context())).toBe("ID_Item_Importado eq 10 or Chave_Historico eq 'Itens_Importados:10' or Item_OrigemId eq 10");
    const ctx = context(); ctx.bodies.Buscar_historico = { value: [{}, {}] };
    expect(condition("Validar_existente", ctx)).toBe(false);
  });
  it("nunca usa ETag curinga nem repete criação cegamente", () => {
    for (const name of ["Marcar_enviado_criado", "Marcar_enviado_existente"]) {
      const input = actions[name].inputs as { parameters: Record<string, unknown>; retryPolicy: { type: string } };
      expect((input.parameters["parameters/headers"] as Record<string, string>)["IF-MATCH"]).toContain("@odata.etag");
      expect(input.retryPolicy.type).toBe("none");
    }
    expect((actions.Criar_historico.inputs as { retryPolicy: { type: string } }).retryPolicy.type).toBe("none");
  });
  it("listas têm lookups isolados e unicidade do histórico", () => {
    const lists = artifacts["lists.templates.json"].lists;
    expect(lists.history.columns.find(c => c.name === "ID_Item_Importado")).toMatchObject({ enforceUniqueValues: true });
    expect(lists.history.columns.find(c => c.name === "Item_Origem")).toMatchObject({ lookup: { listId: "REPLACE_ITEMS_LIST_ID" } });
  });
  // Auditoria 23/10/2026 (item real marcado SIM sem histórico): o candidato só marca após histórico relido e conferido.
  function ancestry(target: string, scope: Record<string, Action> = definition.actions as Record<string, Action>, path: string[] = []): string[] | null {
    for (const [name, action] of Object.entries(scope)) {
      if (name === target) return [...path, name];
      const found = ancestry(target, action.actions ?? {}, [...path, name]) ?? ancestry(target, action.else?.actions ?? {}, [...path, `${name}:else`]);
      if (found) return found;
    }
    return null;
  }
  it("marca Enviado_Historico=SIM somente depois de criar, reler e conferir o histórico", () => {
    expect(ancestry("Marcar_enviado_criado")).toEqual(["Isolamento", "Processar", "Item_aprovado", "Validar_valores", "Validar_relacoes",
      "Existe_historico", "Primeira_aprovacao", "Conferir_criado", "Conferir_versao_criado", "Marcar_enviado_criado"]);
    expect(actions.Reler_historico.runAfter).toEqual({ Criar_historico: ["Succeeded"] });
    expect(actions.Conferir_criado.runAfter).toEqual({ Reler_historico: ["Succeeded"] });
    // Recovery path: an existing, equivalent history row is the only other way to reach the mark.
    expect(ancestry("Marcar_enviado_existente")).toContain("Conferir_existente");
    const marks = Object.entries(actions).filter(([, a]) => JSON.stringify(a.inputs ?? {}).includes("Enviado_Historico\\\":\\\"SIM"));
    expect(marks.map(([name]) => name).sort()).toEqual(["Marcar_enviado_criado", "Marcar_enviado_existente"]);
  });
  it("item SIM sem histórico para em SENT_WITHOUT_HISTORY, sem criar nem marcar", () => {
    const sent = { ...source, Enviado_Historico: { Value: "SIM" } };
    const ctx = context(sent); ctx.bodies.Buscar_historico = { value: [] };
    expect(condition("Item_aprovado", ctx)).toBe(true);
    expect(condition("Primeira_aprovacao", ctx)).toBe(false);
    const blocked = Object.keys(actions.Primeira_aprovacao.else!.actions);
    expect(blocked).toHaveLength(1);
    expect((actions.Primeira_aprovacao.else!.actions[blocked[0]].inputs as { runError: { code: string } }).runError.code).toBe("SENT_WITHOUT_HISTORY");
  });
  it("não executa fora de um site isolado -homolog", () => {
    const gate = (actions.Isolamento.expression as { and: { equals: [string, boolean] }[] }).and.map(x => x.equals[0]);
    expect(gate).toEqual(expect.arrayContaining(["@equals(parameters('isolationConfirmed'),true)", "@endsWith(parameters('siteUrl'),'-homolog')"]));
  });
});
