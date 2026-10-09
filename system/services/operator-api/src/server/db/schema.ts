import { pgTable, pgEnum, integer, varchar, text, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
// Modelo de LEITURA parcial do schema existente; não é fonte para gerar migrações.
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
});
export const statusRegistro = pgEnum("status_registro", ["ATIVO", "INATIVO"]);
export const statusAssociacao = pgEnum("status_associacao", ["EXATO", "SEMASSOCIACAO"]);
export const fornecedor = pgTable("fornecedor", {
  id: integer("id").primaryKey(), razaoSocial: varchar("razao_social").notNull(),
  nomeFantasia: varchar("nome_fantasia"), status: statusRegistro("status").notNull(),
  ...timestamps(),
});
export const orcamento = pgTable("orcamento", {
  id: integer("id").primaryKey(), numeroOrcamento: varchar("numero_orcamento"),
  fornecedorOrigemId: integer("fornecedor_origem_id"),
  dataOrcamento: timestamp("data_orcamento", { withTimezone: true, mode: "string" }),
  subtotal: numeric("subtotal", { precision: 18, scale: 2 }),
  frete: numeric("frete", { precision: 18, scale: 2 }),
  desconto: numeric("desconto", { precision: 18, scale: 2 }),
  tributos: numeric("tributos", { precision: 18, scale: 2 }),
  valorTotal: numeric("valor_total", { precision: 18, scale: 2 }),
  status: varchar("status"), ...timestamps(),
});
export const itemOrcamento = pgTable("item_orcamento", {
  id: integer("id").primaryKey(), orcamentoId: integer("orcamento_id").notNull(),
  numeroItem: integer("numero_item"), codigoItem: varchar("codigo_item"),
  descricaoOriginal: text("descricao_original").notNull(),
  quantidade: numeric("quantidade", { precision: 18, scale: 4 }),
  unidade: varchar("unidade"),
  precoUnitario: numeric("preco_unitario", { precision: 18, scale: 4 }),
  precoTotal: numeric("preco_total", { precision: 18, scale: 4 }),
  materialOficialId: integer("material_oficial_id"),
  statusAssociacao: statusAssociacao("status_associacao").notNull(),
  matchAutomatico: boolean("match_automatico").notNull(),
  revisaoHumanaObrigatoria: boolean("revisao_humana_obrigatoria").notNull(),
  ...timestamps(),
});
export const materialOficial = pgTable("material_oficial", {
  id: integer("id").primaryKey(), nome: varchar("nome").notNull(),
  nomeNormalizado: varchar("nome_normalizado").notNull(),
  categoria: varchar("categoria"), especificacaoTecnica: text("especificacao_tecnica"),
  status: statusRegistro("status").notNull(), ...timestamps(),
});
