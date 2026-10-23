import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareSnapshots, confirmationPhrase, execute, inspect, plan, sanitizePlan } from "./approver-write-rehearsal.mjs";

const secret = "synthetic-secret-not-printed";
const token = `h.${Buffer.from(JSON.stringify({ roles: ["Lists.SelectedOperations.Selected"] })).toString("base64url")}.s`;
const env = {
  MICROSOFT_TENANT_ID: "tenant", MICROSOFT_CLIENT_ID: "app-client", MICROSOFT_CLIENT_SECRET: secret,
  SHAREPOINT_SITE_ID: "host,site-a,web-b", SHAREPOINT_ITENS_IMPORTADOS_LIST_ID: "items-list",
  SHAREPOINT_FIELD_MAP_JSON: JSON.stringify({ items: { reviewedByPerson: "Responsavel_Decisao", reviewedByOid: "Revisado_Por_Oid", reviewedAt: "Data_Decisao", decisionId: "Decisao_Id" } }),
};
const columns = [
  { name: "Responsavel_Decisao", displayName: "Responsável", personOrGroup: { allowMultipleSelection: false, chooseFromType: "peopleOnly" } },
  { name: "Revisado_Por_Oid", text: {} }, { name: "Data_Decisao", dateTime: {} }, { name: "Decisao_Id", text: {} },
  { name: "Status_Revisao", choice: { choices: ["PENDENTE", "APROVADO", "REJEITADO"] } },
  { name: "Enviado_Historico", required: true, choice: { choices: ["SIM", "NAO"] } }, { name: "Codigo_Item", text: {} },
];

interface FakeOptions { fields?: Record<string, unknown>; patchStatus?: number; persist?: boolean; sideEffect?: Record<string, unknown>; personStatus?: number }

function fakeGraph(options: FakeOptions = {}) {
  let fields: Record<string, unknown> = { Codigo_Item: "HOMOLOG-3P-001", Status_Revisao: "PENDENTE", Enviado_Historico: "NAO", Fornecedor: "Fictício", Modified: "2026-10-22T10:00:00Z", ...options.fields };
  let etag = '"v1,1"';
  const calls: { method: string; url: string; headers?: Record<string, string>; body?: string }[] = [];
  const fetcher = async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    const method = init.method ?? "GET";
    calls.push({ method, url: href, headers: init.headers as Record<string, string>, body: typeof init.body === "string" ? init.body : undefined });
    if (href.startsWith("https://login.microsoftonline.com/")) return Response.json({ access_token: token });
    if (method === "PATCH") {
      if (options.patchStatus && options.patchStatus >= 300) return Response.json({ error: { code: "invalidRequest" } }, { status: options.patchStatus });
      if (options.persist !== false) fields = { ...fields, ...JSON.parse(String(init.body)), ...options.sideEffect, Modified: "2026-10-22T11:00:00Z" };
      etag = '"v1,2"';
      return Response.json(fields, { status: options.patchStatus ?? 200 });
    }
    const pathname = decodeURIComponent(new URL(href).pathname);
    if (pathname.endsWith("/columns")) return Response.json({ value: columns });
    if (pathname.endsWith("/permissions")) return Response.json({ value: [{ roles: ["write"], grantedToV2: { application: { id: "app-client" } } }] });
    if (pathname.includes("/lists/User Information List/")) return options.personStatus && options.personStatus !== 200
      ? new Response(null, { status: options.personStatus }) : Response.json({ fields: { ContentType: "Person" } });
    if (pathname.endsWith("/items/7")) return Response.json({ id: "7", eTag: etag, fields });
    if (pathname.endsWith("/items")) return Response.json({ value: [{ id: "7", fields }, { id: "8", fields: { Codigo_Item: "REAL-1" } }] });
    return new Response(null, { status: 404 });
  };
  return { fetcher: fetcher as typeof fetch, calls };
}

const dirs: string[] = [];
const tempDir = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "approver-")); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe("ensaio isolado de persistência do Aprovador", () => {
  it("inspect é somente leitura e descreve a coluna Pessoa sem valores de itens", async () => {
    const { fetcher, calls } = fakeGraph();
    const report = await inspect(env, { fetcher }) as Record<string, unknown>;
    expect(calls.filter(call => call.method !== "GET").map(call => call.url)).toEqual([expect.stringContaining("login.microsoftonline.com")]);
    expect(report.personColumnWritable).toBe(true);
    expect(report.listWriteGrant).toBe("WRITE_GRANT_PRESENT");
    expect(report.syntheticCandidates).toEqual([{ itemId: "7", status: "PENDENTE", sentToHistory: "NAO" }]);
    expect(JSON.stringify(report)).not.toMatch(new RegExp(`${secret}|Fictício|${token}`));
  });

  it("plan não grava e a prévia sanitizada omite ETag bruto e valores", async () => {
    const { fetcher, calls } = fakeGraph();
    const prepared = await plan(env, { itemId: "7", personLookupId: "12", fetcher });
    expect(calls.some(call => call.method === "PATCH")).toBe(false);
    expect(prepared.blockers).toEqual([]);
    expect(prepared.payload).toEqual({ Responsavel_DecisaoLookupId: "12" });
    const shown = JSON.stringify(sanitizePlan(prepared));
    expect(shown).not.toContain('"v1,1"');
    expect(shown).not.toContain("Fictício");
  });

  it.each([
    [{ Codigo_Item: "ORC-REAL-1" }, "NOT_MARKED_SYNTHETIC"],
    [{ Status_Revisao: "APROVADO" }, "STATUS_NOT_PENDENTE"],
    [{ Enviado_Historico: undefined }, "ENVIADO_HISTORICO_NOT_NAO"],
    [{ Responsavel_DecisaoLookupId: "12" }, "TARGET_VALUE_ALREADY_PRESENT"],
  ])("bloqueia item fora do contrato sintético %o", async (fields, blocker) => {
    const { fetcher } = fakeGraph({ fields });
    expect((await plan(env, { itemId: "7", personLookupId: "12", fetcher })).blockers).toContain(blocker);
  });

  it("recusa execução com confirmação divergente sem enviar PATCH nem marcar tentativa", async () => {
    const { fetcher, calls } = fakeGraph();
    const evidenceDir = tempDir();
    await expect(execute(env, { itemId: "7", personLookupId: "12", confirm: "sim", evidenceDir, fetcher })).rejects.toThrow("CONFIRMATION_MISMATCH");
    expect(calls.some(call => call.method === "PATCH")).toBe(false);
    expect(fs.readdirSync(evidenceDir)).toEqual([]);
  });

  it("exige atestação humana quando a Pessoa não pode ser verificada no site", async () => {
    const { fetcher, calls } = fakeGraph({ personStatus: 403 });
    const confirm = confirmationPhrase("7", "Responsavel_Decisao", "12", '"v1,1"');
    await expect(execute(env, { itemId: "7", personLookupId: "12", confirm, evidenceDir: tempDir(), fetcher })).rejects.toThrow("PERSON_NOT_VERIFIED");
    expect(calls.some(call => call.method === "PATCH")).toBe(false);
  });

  it("executa um único PATCH com If-Match, relê e confirma somente com o valor persistido", async () => {
    const { fetcher, calls } = fakeGraph();
    const evidenceDir = tempDir();
    const confirm = confirmationPhrase("7", "Responsavel_Decisao", "12", '"v1,1"');
    const evidence = await execute(env, { itemId: "7", personLookupId: "12", confirm, evidenceDir, fetcher });
    const patches = calls.filter(call => call.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toMatch(/\/items\/7\/fields$/);
    expect(patches[0].headers?.["If-Match"]).toBe('"v1,1"');
    expect(JSON.parse(String(patches[0].body))).toEqual({ Responsavel_DecisaoLookupId: "12" });
    expect(calls.at(-1)?.method).toBe("GET");
    expect(evidence.result).toBe("PERSISTED_AND_VERIFIED");
    expect(evidence.unexpectedChanges).toEqual([]);
    const files = fs.readdirSync(evidenceDir);
    expect(files.some(file => file.startsWith("evidence-item-7"))).toBe(true);
    const stored = files.map(file => fs.readFileSync(path.join(evidenceDir, file), "utf8")).join("");
    expect(stored).not.toMatch(new RegExp(`${secret}|Fictício|v1,1|${token}`));
    await expect(execute(env, { itemId: "7", personLookupId: "13", confirm: confirmationPhrase("7", "Responsavel_Decisao", "13", '"v1,2"'), evidenceDir, fetcher }))
      .rejects.toThrow("ALREADY_ATTEMPTED");
    expect(calls.filter(call => call.method === "PATCH")).toHaveLength(1);
  });

  it("HTTP 200 sem valor relido não é sucesso", async () => {
    const { fetcher } = fakeGraph({ persist: false });
    const confirm = confirmationPhrase("7", "Responsavel_Decisao", "12", '"v1,1"');
    const evidence = await execute(env, { itemId: "7", personLookupId: "12", confirm, evidenceDir: tempDir(), fetcher });
    expect(evidence.checks.patchStatus).toBe(200);
    expect(evidence.checks.personPersisted).toBe(false);
    expect(evidence.result).toBe("NOT_CONFIRMED");
  });

  it("aponta alteração indevida de outro campo e não declara sucesso", async () => {
    const { fetcher } = fakeGraph({ sideEffect: { Fornecedor: "Outro" } });
    const confirm = confirmationPhrase("7", "Responsavel_Decisao", "12", '"v1,1"');
    const evidence = await execute(env, { itemId: "7", personLookupId: "12", confirm, evidenceDir: tempDir(), fetcher });
    expect(evidence.unexpectedChanges).toEqual(["Fornecedor"]);
    expect(evidence.result).toBe("NOT_CONFIRMED");
  });

  it("registra recusa do Graph sem repetir a escrita", async () => {
    const { fetcher, calls } = fakeGraph({ patchStatus: 400 });
    const confirm = confirmationPhrase("7", "Responsavel_Decisao", "12", '"v1,1"');
    const evidence = await execute(env, { itemId: "7", personLookupId: "12", confirm, evidenceDir: tempDir(), fetcher });
    expect(evidence.checks).toMatchObject({ patchStatus: 400, graphErrorCode: "invalidRequest", personPersisted: false });
    expect(calls.filter(call => call.method === "PATCH")).toHaveLength(1);
  });

  it("compareSnapshots ignora colunas mantidas pelo SharePoint e não expõe valores", () => {
    const result = compareSnapshots({ A: "x", Modified: "1" }, { A: "x", Modified: "2", P: "9" }, ["P"]);
    expect(result).toMatchObject({ changed: ["Modified", "P"], unexpected: [], systemManaged: ["Modified"] });
    expect(JSON.stringify(result)).not.toContain('"x"');
  });
});
