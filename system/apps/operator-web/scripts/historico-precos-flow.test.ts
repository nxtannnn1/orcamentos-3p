import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { upgradeFlowDefinition } from "./historico-precos-flow.mjs";
import { evaluateExpression } from "./power-automate-expression-check.mjs";

// Sanitized copy of the published v1 export (no site, list IDs, users or tenant).
const v1 = JSON.parse(readFileSync(new URL("./fixtures/historico-precos-flow.v1.sanitized.json", import.meta.url), "utf8"));
const v2 = upgradeFlowDefinition(v1);
type Node = { type?: string; actions?: Record<string, Node>; else?: { actions: Record<string, Node> }; expression?: Cond;
  runAfter?: Record<string, string[]>; inputs?: { parameters?: Record<string, unknown>; host?: Record<string, string>; runError?: { code: string }; runStatus?: string } };
type Cond = { and?: Cond[]; equals?: [unknown, unknown]; not?: Cond; greater?: [unknown, unknown] };
const outer = v2.properties.definition.actions["Condição"] as Node;
const validate = outer.actions!.Validar_item_relido;
const confirm = validate.actions!.Conferir_historico;
const create = validate.actions!["Condição_1"].actions!.Criar_item_1;
const mark = confirm.actions!["Enviar_uma_solicitação_HTTP_ao_SharePoint"];

const approved = { ID: 345, "@odata.etag": "\"3\"", Status_Revisao: { Value: "APROVADO" }, Enviado_Historico: { Value: "NAO" },
  Decisao_Id: "decisao-sintetica", EmailAprovador: "pessoa.sintetica@example.com", AprovadoPor: "Pessoa Sintética",
  Data_Decisao: "2026-10-23T12:00:00Z", Revisado_Por_Oid: "oid-sintetico", Material_Aprovado: { Id: 133 },
  Codigo_Orcamento: { Id: 117, Value: "HOMOLOG-3P" }, Numero_Item: 1, Descricao_Original: "Item sintético", Quantidade: 2,
  Preco_Unitario: 1.5, Preco_Total: 3, Fornecedor: "HOMOLOG", Unidade_Original: "UN", DriveFileId: null,
  Correcao_Operacao_Id: "op-sintetica", Extracao_Original_JSON: JSON.stringify({ hash: "a".repeat(64) }) };
const history = { Decisao_Id: "decisao-sintetica", Chave_Historico: "Itens_Importados:345", ID_Item_Importado: 345,
  Material_Oficial: { Id: 133 }, EmailAprovador: "pessoa.sintetica@example.com", Preco_Unitario: 1.5, Preco_Total: 3, Quantidade: 2 };
const ctx = (item: Record<string, unknown> = approved, rows: unknown[] = [history]) =>
  ({ trigger: { ID: 345 }, bodies: { Reler_item_aprovado: item, Reler_historico: { value: rows } }, outputs: {} });
const value = (x: unknown, c: object) => typeof x === "string" && x.startsWith("@") ? evaluateExpression(x, c) : x;
function holds(cond: Cond, c: object): boolean {
  if (cond.and) return cond.and.every(x => holds(x, c));
  if (cond.not) return !holds(cond.not, c);
  if (cond.equals) return value(cond.equals[0], c) === value(cond.equals[1], c);
  if (cond.greater) return (value(cond.greater[0], c) as number) > (value(cond.greater[1], c) as number);
  throw new Error("condição não suportada");
}

describe("fluxo Historico_Precos v2 (transformação local, sem motor real)", () => {
  it("recusa entrada que não seja a v1 e não reaplica a transformação", () => {
    expect(() => upgradeFlowDefinition({})).toThrow("v1 esperada");
    expect(() => upgradeFlowDefinition(v2)).toThrow("já está na v2");
    expect(v1.properties.definition.actions["Condição"].actions.Reler_item_aprovado).toBeUndefined();
  });
  it("preserva gatilho, conexões e o filtro rápido do gatilho", () => {
    expect(v2.properties.definition.triggers).toEqual(v1.properties.definition.triggers);
    expect(v2.properties.connectionReferences).toEqual(v1.properties.connectionReferences);
    expect(outer.expression).toEqual(v1.properties.definition.actions["Condição"].expression);
    expect(create.inputs!.host).toEqual(v1.properties.definition.actions["Condição"].actions["Condição_1"].actions.Criar_item_1.inputs.host);
    expect(mark.inputs!.host).toEqual(v1.properties.definition.actions["Condição"].actions["Enviar_uma_solicitação_HTTP_ao_SharePoint"].inputs.host);
  });
  it("ordem: reler item → validar → criar ou confirmar → reler histórico → conferir → marcar", () => {
    expect(Object.keys(outer.actions!)).toEqual(["Reler_item_aprovado", "Validar_item_relido"]);
    expect(outer.actions!.Reler_item_aprovado.inputs!.host!.operationId).toBe("GetItem");
    expect(validate.runAfter).toEqual({ Reler_item_aprovado: ["Succeeded"] });
    expect(Object.keys(validate.actions!)).toEqual(["Obter_item", "Obter_item_1", "Obter_itens", "Condição_1", "Reler_historico", "Conferir_historico"]);
    expect(validate.actions!.Reler_historico.runAfter).toEqual({ "Condição_1": ["Succeeded"] });
    expect(confirm.runAfter).toEqual({ Reler_historico: ["Succeeded"] });
    expect(Object.keys(confirm.actions!)).toEqual(["Enviar_uma_solicitação_HTTP_ao_SharePoint"]);
    expect(mark.runAfter).toBeUndefined();
    expect(validate.actions!.Obter_itens.inputs!.parameters!.$top).toBe(2);
  });
  it("marca com If-Match da versão relida, nunca \"*\"", () => {
    expect(JSON.stringify(v2)).not.toContain("\"IF-MATCH\":\"*\"");
    const headers = mark.inputs!.parameters!["parameters/headers"] as Record<string, string>;
    expect(evaluateExpression(headers["IF-MATCH"], ctx())).toBe("\"3\"");
    expect(headers["X-HTTP-Method"]).toBe("MERGE");
    expect(mark.inputs!.parameters!["parameters/body"]).toBe("{\"Enviado_Historico\":\"SIM\"}");
    expect(evaluateExpression(String(mark.inputs!.parameters!["parameters/uri"]), ctx())).toBe("_api/web/lists/getbytitle('Itens_Importados')/items(345)");
  });
  it("valida o item relido: aprovação do portal completa passa", () => {
    expect(holds(validate.expression!, ctx())).toBe(true);
  });
  it.each([
    ["já enviado", { Enviado_Historico: { Value: "SIM" } }], ["não aprovado", { Status_Revisao: { Value: "PENDENTE" } }],
    ["sem Decisao_Id (legado)", { Decisao_Id: null }], ["Decisao_Id em branco", { Decisao_Id: "  " }],
    ["sem e-mail (legado)", { EmailAprovador: null }], ["e-mail sem @", { EmailAprovador: "pessoa.example.com" }],
    ["e-mail com espaço", { EmailAprovador: "pessoa @example.com" }], ["e-mail sem usuário", { EmailAprovador: "@example.com" }],
    ["e-mail sem domínio", { EmailAprovador: "pessoa@example" }], ["sem aprovador", { AprovadoPor: "" }],
    ["sem data", { Data_Decisao: null }], ["quantidade zero", { Quantidade: 0 }], ["sem material", { Material_Aprovado: { Id: null } }],
  ])("não cria nem marca quando o item relido está %s", (_c, change) => {
    expect(holds(validate.expression!, ctx({ ...approved, ...change }))).toBe(false);
    expect(validate.else!.actions).toEqual({});
  });
  it("cria o histórico só com valores relidos e com rastreabilidade", () => {
    const params = create.inputs!.parameters!;
    expect(JSON.stringify(params)).not.toContain("triggerBody");
    const got = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, value(v, ctx())]));
    expect(got).toMatchObject({ "item/Title": "HOMOLOG-3P-ITEM-1", "item/ID_Item_Importado": 345, "item/Item_Origem/Id": 345,
      "item/Chave_Historico": "Itens_Importados:345", "item/Material_Oficial/Id": 133, "item/Preco_Unitario": 1.5,
      "item/Data_Aprovacao": approved.Data_Decisao, "item/AprovadoPor": approved.AprovadoPor, "item/EmailAprovador": approved.EmailAprovador,
      "item/Decisao_Id": approved.Decisao_Id, "item/Revisado_Por_Oid": approved.Revisado_Por_Oid,
      "item/Correcao_Operacao_Id": approved.Correcao_Operacao_Id, "item/Extracao_Original_Hash": "a".repeat(64) });
    expect(value(params["item/Extracao_Original_Hash"], ctx({ ...approved, Extracao_Original_JSON: null }))).toBeUndefined();
    expect(validate.actions!["Condição_1"].expression).toEqual(v1.properties.definition.actions["Condição"].actions["Condição_1"].expression);
  });
  it("confere que o histórico é único, da mesma decisão e consistente", () => {
    expect(holds(confirm.expression!, ctx())).toBe(true);
  });
  it.each([
    ["ausente", []], ["duplicado", [history, history]], ["de outra decisão", [{ ...history, Decisao_Id: "outra" }]],
    ["legado sem decisão", [{ ...history, Decisao_Id: null, EmailAprovador: null }]], ["de outro item", [{ ...history, ID_Item_Importado: 999 }]],
    ["preço divergente", [{ ...history, Preco_Unitario: 2 }]], ["material divergente", [{ ...history, Material_Oficial: { Id: 1 } }]],
  ])("histórico %s: não marca e falha de forma visível", (_c, rows) => {
    expect(holds(confirm.expression!, ctx(approved, rows as unknown[]))).toBe(false);
    const stop = confirm.else!.actions.Historico_divergente;
    expect(stop.type).toBe("Terminate");
    expect(stop.inputs).toMatchObject({ runStatus: "Failed", runError: { code: "HISTORICO_DIVERGENTE" } });
  });
});
