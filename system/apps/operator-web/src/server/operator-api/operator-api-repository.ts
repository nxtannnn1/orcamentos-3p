import "server-only";
import type { OperatorRepository } from "../../repositories/operator-repository";
import type { Budget, BudgetItem, OfficialMaterial } from "../../types/operator";
import { DecisionError } from "../../domain/decision-error";
import { DataSourceConfigurationError } from "../data-source/configuration";

type Row = Record<string, unknown>;
export interface OperatorApiConfig { baseUrl: string; token: string; }
export function readOperatorApiConfig(env: Record<string, string | undefined> = process.env): OperatorApiConfig {
  try {
    const url = new URL(env.OPERATOR_API_BASE_URL ?? "");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
        !(url.protocol === "https:" || (url.protocol === "http:" && local && env.NODE_ENV !== "production"))) throw new Error();
    const token = env.OPERATOR_API_TOKEN ?? "";
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error();
    return { baseUrl: url.origin, token };
  } catch { throw new DataSourceConfigurationError("Configuração da Operator API inválida."); }
}
function invalid(): never { throw new DecisionError("Resposta da API inválida ou dados incompletos.", 502, "OPERATOR_API_INVALID_RESPONSE"); }
function row(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Row;
}
function id(value: unknown): string {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) invalid();
  return String(value);
}
function text(value: unknown, nullable = false): string {
  if (value === null && nullable) return "";
  if (typeof value !== "string") invalid();
  return value;
}
function decimal(value: unknown): number {
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value)) invalid();
  const number = Number(value);
  // Conversão exclusiva para exibição legada, nunca para cálculo financeiro.
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER / 10000) invalid();
  return number;
}
export class OperatorApiRepository implements OperatorRepository {
  constructor(private readonly config: OperatorApiConfig, private readonly transport: typeof fetch = fetch) {}
  private async read(path: string): Promise<unknown> {
    try {
      const response = await this.transport(this.config.baseUrl + path, {
        headers: { Authorization: "Bearer " + this.config.token, Accept: "application/json" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new DecisionError("A Operator API está indisponível para consulta.", 502, "OPERATOR_API_UNAVAILABLE");
      const reader = response.body?.getReader();
      if (!reader) invalid();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 2_000_000) { await reader.cancel(); invalid(); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      if (error instanceof DecisionError) throw error;
      throw new DecisionError("Não foi possível consultar a Operator API.", 502, "OPERATOR_API_UNAVAILABLE");
    }
  }
  private async list(path: string): Promise<Row[]> {
    const result: Row[] = [];
    let after = "";
    let previous = 0;
    for (let page = 0; page < 20; page++) {
      const body = row(await this.read(path + (path.includes("?") ? "&" : "?") + "limit=100" + (after ? "&after=" + after : "")));
      const pagination = row(body.pagination);
      if (!Array.isArray(body.data) || body.data.length > 100 || pagination.limit !== 100) invalid();
      for (const entry of body.data) {
        const item = row(entry);
        const current = Number(id(item.id));
        if (current <= previous) invalid();
        previous = current; result.push(item);
      }
      if (pagination.nextAfter === null) return result;
      if (typeof pagination.nextAfter !== "string" || pagination.nextAfter !== String(previous) || !body.data.length) invalid();
      after = pagination.nextAfter;
    }
    throw new DecisionError("Consulta excede o limite de leitura. Refine a pesquisa.", 503, "OPERATOR_API_LIST_LIMIT");
  }
  private material(value: Row): OfficialMaterial {
    return { id: id(value.id), code: "PG-" + id(value.id), name: text(value.nome),
      family: text(value.categoria, true), unit: "" };
  }
  private async budget(value: Row): Promise<Budget> {
    const budgetId = id(value.id);
    if (typeof value.itemCount !== "number" || !Number.isSafeInteger(value.itemCount) || value.itemCount < 0) invalid();
    return { id: budgetId, code: "PG-" + budgetId, number: text(value.numeroOrcamento, true),
      supplier: text(value.fornecedor, true) || null, date: text(value.dataOrcamento, true),
      // Revisão humana ainda não existe no schema PostgreSQL; não inferir conclusão.
      status: "EM_REVISAO", itemCount: value.itemCount, reviewedCount: 0, readOnly: true, reviewAvailable: false };
  }
  async listBudgets() {
    const result: Budget[] = [];
    for (const value of await this.list("/api/v1/orcamentos")) result.push(await this.budget(value));
    return result;
  }
  async getBudget(value: string) {
    if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) return null;
    return (await this.listBudgets()).find(budget => budget.id === value) ?? null;
  }
  async listOfficialMaterials(query = "") {
    if (query.length > 100) throw new DecisionError("Pesquisa muito longa.");
    return (await this.list("/api/v1/materiais" + (query ? "?q=" + encodeURIComponent(query) : ""))).map(value => this.material(value));
  }
  async listItemsByBudget(value: string): Promise<BudgetItem[]> {
    if (!/^[1-9]\d{0,9}$/.test(value) || Number(value) > 2147483647) throw new DecisionError("ID de orçamento inválido.");
    const materials = new Map((await this.listOfficialMaterials()).map(material => [material.id, material]));
    return (await this.list("/api/v1/orcamentos/" + value + "/itens")).map(item => {
      if (id(item.orcamentoId) !== value) invalid();
      const materialId = item.materialOficialId === null ? null : id(item.materialOficialId);
      return { id: id(item.id), budgetId: value, itemNumber: Number(id(item.numeroItem)),
        originalDescription: text(item.descricaoOriginal), quantity: decimal(item.quantidade),
        unit: text(item.unidade, true), unitPrice: decimal(item.precoUnitario), totalPrice: decimal(item.precoTotal),
        suggestedMaterial: materialId ? materials.get(materialId) ?? null : null,
        approvedMaterial: null, observation: "", reviewStatus: "PENDENTE" as const, reviewAvailable: false };
    }).sort((a, b) => a.itemNumber - b.itemNumber);
  }
  async saveItemDecision(): Promise<BudgetItem> {
    throw new DecisionError("A integração PostgreSQL está somente em consulta.", 403, "READ_ONLY_DATA_SOURCE");
  }
}
