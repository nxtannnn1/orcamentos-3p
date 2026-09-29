import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharePointFieldMap } from "../../server/sharepoint/sharepoint-types";
import { BffOperatorRepository } from "../../repositories/bff/bff-operator-repository";
import { ReviewController } from "../../domain/review-controller";
vi.mock("server-only", () => ({}));

const fields: SharePointFieldMap = {
  budgets: { code: "Title", number: "Number", supplier: "Supplier", date: "Date", status: "Status" },
  items: { code: "Title", budgetLookupId: "Codigo_Orcamento", itemNumber: "Numero", description: "Descricao", quantity: "Quantidade", unit: "Unidade", unitPrice: "Preco", totalPrice: "Total", status: "Status_Revisao", suggestedMaterialLookupId: "Material_Sugerido_Ref", approvedMaterialLookupId: "Material_Aprovado", observation: "Observacao_Item" },
  materials: { code: "Codigo", name: "Material" },
};
let patchRoute: typeof import("./itens/[id]/decisao/route").PATCH;
let upstream: ReturnType<typeof vi.fn<typeof fetch>>;
let grant: string;
let patchStatus: number;
let stored: Record<string, unknown>;
let repository: BffOperatorRepository;
const request = (body: unknown, headers: Record<string, string> = {}) => patchRoute(new Request("http://localhost/api/itens/1/decisao", {
  method: "PATCH", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
}), { params: Promise.resolve({ id: "1" }) });
const patches = () => upstream.mock.calls.filter(([, options]) => options?.method === "PATCH");

beforeEach(async () => {
  vi.resetModules();
  const env = { DATA_SOURCE: "sharepoint", MICROSOFT_TENANT_ID: "fake-tenant", MICROSOFT_CLIENT_ID: "fake-client", MICROSOFT_CLIENT_SECRET: "fake-secret", SHAREPOINT_SITE_ID: "fake-site", SHAREPOINT_ORCAMENTOS_LIST_ID: "budgets", SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: "items", SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID: "materials", SHAREPOINT_FIELD_MAP_JSON: JSON.stringify(fields) };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  grant = "write";
  patchStatus = 200;
  stored = { Codigo_OrcamentoLookupId: "10", Numero: 1, Descricao: "Original", Quantidade: 2, Material_Sugerido_RefLookupId: "21", Material_AprovadoLookupId: null, Status_Revisao: "PENDENTE", Observacao_Item: "" };
  upstream = vi.fn<typeof fetch>(async (input, options) => {
    const url = String(input);
    if (url.startsWith("https://login.microsoftonline.com/")) return Response.json({ access_token: `header.${Buffer.from(JSON.stringify({ roles: ["Lists.SelectedOperations.Selected"] })).toString("base64url")}.signature`, expires_in: 3600 });
    if (url.endsWith("/permissions")) return Response.json({ value: [{ roles: [grant], grantedToV2: { application: { id: "fake-client" } } }] });
    if (url.includes("/lists/materials/items")) return Response.json({ value: [{ id: "21", fields: { Codigo: "SUG", Material: "Sugestão" } }, { id: "22", fields: { Codigo: "HUM", Material: "Escolha humana" } }] });
    if (url.endsWith("/items/1/fields") && options?.method === "PATCH") {
      if (patchStatus !== 200) return Response.json({ error: { code: "accessDenied" } }, { status: patchStatus });
      Object.assign(stored, JSON.parse(String(options.body)));
      return Response.json(stored);
    }
    if (url.endsWith("/items/1?$expand=fields")) return Response.json({ id: "1", fields: stored });
    if (url.endsWith("/lists/items/items?$expand=fields")) return Response.json({ value: [{ id: "1", fields: stored }, { id: "2", fields: { ...stored, Numero: 2 } }] });
    throw new Error(`Unexpected simulated request: ${url}`);
  });
  patchRoute = (await import("./itens/[id]/decisao/route")).PATCH;
  const itemsGet = (await import("./orcamentos/[id]/itens/route")).GET;
  const materialsGet = (await import("./materiais/route")).GET;
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, options) => {
    const url = String(input);
    if (url.startsWith("https://")) return upstream(input, options);
    const req = new Request(`http://localhost${url}`, options);
    if (url === "/api/itens/1/decisao") return patchRoute(req, { params: Promise.resolve({ id: "1" }) });
    if (url === "/api/orcamentos/10/itens") return itemsGet(req, { params: Promise.resolve({ id: "10" }) });
    if (url === "/api/materiais") return materialsGet(req);
    throw new Error(`Unexpected BFF request: ${url}`);
  }));
  repository = new BffOperatorRepository();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("controller → BFF → SharePoint → Graph simulado", () => {
  it("aprova com escolha humana, avança e relê; rejeita limpando o lookup, sem tocar a sugestão", async () => {
    const controller = new ReviewController(repository);
    const initial = await controller.load("10");
    expect(initial.items[0].approvedMaterial).toBeNull();
    const material = (await repository.listOfficialMaterials())[1];
    const approved = await controller.approveAndNext({ ...material, name: "Nome adulterado pelo cliente" }, "Conferido");
    expect(approved.selectedIndex).toBe(1);
    expect(approved.items[0].approvedMaterial?.name).toBe("Escolha humana");
    expect(JSON.parse(String(patches()[0][1]?.body))).toEqual({ Material_AprovadoLookupId: "22", Status_Revisao: "APROVADO", Observacao_Item: "Conferido" });
    expect((await repository.listItemsByBudget("10"))[0].reviewStatus).toBe("APROVADO");
    controller.select("1");
    const rejected = await controller.reject("Incompatível");
    expect(rejected.selectedIndex).toBe(0);
    expect(rejected.items[0].approvedMaterial).toBeNull();
    expect(JSON.parse(String(patches()[1][1]?.body))).toEqual({ Material_AprovadoLookupId: null, Status_Revisao: "REJEITADO", Observacao_Item: "Incompatível" });
    const reloaded = (await repository.listItemsByBudget("10"))[0];
    expect(reloaded.reviewStatus).toBe("REJEITADO");
    expect(reloaded.suggestedMaterial?.id).toBe("21");
    expect(stored.Material_Sugerido_RefLookupId).toBe("21");
  });
  it("concessão read retorna erro claro e não envia PATCH nem altera a sessão", async () => {
    grant = "read";
    const controller = new ReviewController(repository);
    const before = await controller.load("10");
    await expect(controller.reject("Sem acesso")).rejects.toThrow("write");
    expect(controller.session).toEqual(before);
    expect(patches()).toHaveLength(0);
  });
  it("Graph 403 preserva estado e permite nova tentativa após correção", async () => {
    patchStatus = 403;
    const controller = new ReviewController(repository);
    const before = await controller.load("10");
    await expect(controller.reject("Negado")).rejects.toThrow("recusou");
    expect(controller.session).toEqual(before);
    patchStatus = 200;
    expect((await controller.reject("Liberado")).items[0].reviewStatus).toBe("REJEITADO");
  });
  it.each([
    { action: "APPROVE", approvedMaterialId: null, observation: "" },
    { action: "APPROVE", approvedMaterialId: "999", observation: "" },
    { action: "REJECT", approvedMaterialId: "22", observation: "" },
    { action: "OTHER", approvedMaterialId: null, observation: "" },
    { action: "REJECT", approvedMaterialId: null, observation: 1 },
    { action: "REJECT", approvedMaterialId: null, observation: "", Material_Sugerido_Ref: "22" },
  ])("rejeita entrada inválida sem PATCH: %j", async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(patches()).toHaveLength(0);
  });
  it("bloqueia origem externa", async () => {
    expect((await request({ action: "REJECT", approvedMaterialId: null, observation: "" }, { Origin: "https://external.example" })).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("bloqueia JSON malformado e content-type incorreto", async () => {
    const response = await patchRoute(new Request("http://localhost/api/itens/1/decisao", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{" }), { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(400);
    expect((await request({}, { "Content-Type": "text/plain" })).status).toBe(415);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("mock mantém a decisão entre chamadas do BFF sem acessar Graph", async () => {
    vi.stubEnv("DATA_SOURCE", "mock");
    const { createServerOperatorRepository } = await import("../../server/data-source/operator-repository-factory");
    const mock = createServerOperatorRepository();
    const item = (await mock.listItemsByBudget("budget-demo-01"))[0];
    const response = await patchRoute(new Request("http://localhost/api/itens/mock/decisao", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REJECT", approvedMaterialId: null, observation: "Mock persistido" }) }), { params: Promise.resolve({ id: item.id }) });
    expect(response.status).toBe(200);
    expect((await createServerOperatorRepository().listItemsByBudget("budget-demo-01"))[0].observation).toBe("Mock persistido");
    expect(upstream).not.toHaveBeenCalled();
  });
});

// Estes testes cobrem os dados; a autenticação real tem suíte própria.
vi.mock("../../server/auth/session", () => ({ requireSession: vi.fn(async () => ({ roles: ["Operador"] })), authErrorResponse: () => null }));
