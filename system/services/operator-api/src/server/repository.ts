import "server-only";
import { and, eq, gt, ilike, or, sql } from "drizzle-orm";
import { withRead } from "./db/client";
import { fornecedor, orcamento, itemOrcamento, materialOficial } from "./db/schema";
import { ApiError } from "./errors";
import { literalSearch, page } from "./query";
type Options = { limit: number; after: number; q: string };

export const repository = {
  budgets: (options: Options) => withRead(async db =>
    page(await db.select({
      id: orcamento.id, numeroOrcamento: orcamento.numeroOrcamento,
      fornecedorId: orcamento.fornecedorOrigemId, fornecedor: fornecedor.razaoSocial,
      dataOrcamento: orcamento.dataOrcamento, status: orcamento.status,
      valorTotal: orcamento.valorTotal, updatedAt: orcamento.updatedAt,
      itemCount: sql<number>`(SELECT count(*)::integer FROM public.item_orcamento i WHERE i.orcamento_id = ${orcamento.id})`,
    }).from(orcamento).leftJoin(fornecedor, eq(fornecedor.id, orcamento.fornecedorOrigemId))
      .where(gt(orcamento.id, options.after)).orderBy(orcamento.id).limit(options.limit + 1), options.limit)),
  budget: (id: number) => withRead(async db => {
    const [row] = await db.select({
      id: orcamento.id, numeroOrcamento: orcamento.numeroOrcamento,
      fornecedorId: orcamento.fornecedorOrigemId, fornecedor: fornecedor.razaoSocial,
      dataOrcamento: orcamento.dataOrcamento, status: orcamento.status,
      subtotal: orcamento.subtotal, frete: orcamento.frete, desconto: orcamento.desconto,
      tributos: orcamento.tributos, valorTotal: orcamento.valorTotal,
      createdAt: orcamento.createdAt, updatedAt: orcamento.updatedAt,
    }).from(orcamento).leftJoin(fornecedor, eq(fornecedor.id, orcamento.fornecedorOrigemId))
      .where(eq(orcamento.id, id)).limit(1);
    if (!row) throw new ApiError(404, "NOT_FOUND", "Orçamento não encontrado.");
    return { data: row };
  }),
  items: (budgetId: number, options: Options) => withRead(async db => {
    const [budget] = await db.select({ id: orcamento.id }).from(orcamento)
      .where(eq(orcamento.id, budgetId)).limit(1);
    if (!budget) throw new ApiError(404, "NOT_FOUND", "Orçamento não encontrado.");
    return page(await db.select({
      id: itemOrcamento.id, orcamentoId: itemOrcamento.orcamentoId,
      numeroItem: itemOrcamento.numeroItem, codigoItem: itemOrcamento.codigoItem,
      descricaoOriginal: itemOrcamento.descricaoOriginal, quantidade: itemOrcamento.quantidade,
      unidade: itemOrcamento.unidade, precoUnitario: itemOrcamento.precoUnitario,
      precoTotal: itemOrcamento.precoTotal, materialOficialId: itemOrcamento.materialOficialId,
      statusAssociacao: itemOrcamento.statusAssociacao, matchAutomatico: itemOrcamento.matchAutomatico,
      revisaoHumanaObrigatoria: itemOrcamento.revisaoHumanaObrigatoria,
      updatedAt: itemOrcamento.updatedAt,
    }).from(itemOrcamento).where(and(eq(itemOrcamento.orcamentoId, budgetId), gt(itemOrcamento.id, options.after)))
      .orderBy(itemOrcamento.id).limit(options.limit + 1), options.limit);
  }),
  materials: (options: Options) => withRead(async db => page(await db.select({
    id: materialOficial.id, nome: materialOficial.nome, nomeNormalizado: materialOficial.nomeNormalizado,
    categoria: materialOficial.categoria, especificacaoTecnica: materialOficial.especificacaoTecnica,
    status: materialOficial.status,
  }).from(materialOficial).where(and(gt(materialOficial.id, options.after),
    options.q ? or(ilike(materialOficial.nome, literalSearch(options.q)),
      ilike(materialOficial.nomeNormalizado, literalSearch(options.q))) : undefined))
    .orderBy(materialOficial.id).limit(options.limit + 1), options.limit)),
  suppliers: (options: Options) => withRead(async db => page(await db.select({
    id: fornecedor.id, razaoSocial: fornecedor.razaoSocial, nomeFantasia: fornecedor.nomeFantasia,
    status: fornecedor.status,
  }).from(fornecedor).where(and(gt(fornecedor.id, options.after),
    options.q ? or(ilike(fornecedor.razaoSocial, literalSearch(options.q)),
      ilike(fornecedor.nomeFantasia, literalSearch(options.q))) : undefined))
    .orderBy(fornecedor.id).limit(options.limit + 1), options.limit)),
  ready: () => withRead(async db => {
    await db.execute(sql`SELECT o.id, i.id, m.id, f.id FROM public.orcamento o
      CROSS JOIN public.item_orcamento i CROSS JOIN public.material_oficial m
      CROSS JOIN public.fornecedor f LIMIT 0`);
    return { status: "ready" };
  }),
};
