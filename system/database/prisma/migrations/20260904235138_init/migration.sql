-- CreateTable
CREATE TABLE "Cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Orcamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numeroOrcamento" TEXT,
    "clienteId" INTEGER,
    "fornecedorOrigemId" INTEGER,
    "dataOrcamento" DATETIME,
    "subtotal" DECIMAL,
    "frete" DECIMAL,
    "desconto" DECIMAL,
    "tributos" DECIMAL,
    "valorTotal" DECIMAL,
    "status" TEXT,
    "arquivoOrigem" TEXT,
    "driveFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Orcamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Orcamento_fornecedorOrigemId_fkey" FOREIGN KEY ("fornecedorOrigemId") REFERENCES "Fornecedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialOficial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "categoria" TEXT,
    "especificacaoTecnica" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ItemOrcamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orcamentoId" INTEGER NOT NULL,
    "numeroItem" INTEGER,
    "codigoItem" TEXT,
    "descricaoOriginal" TEXT NOT NULL,
    "descricaoNormalizada" TEXT,
    "quantidade" DECIMAL,
    "unidade" TEXT,
    "precoUnitario" DECIMAL,
    "precoTotal" DECIMAL,
    "materialOficialId" INTEGER,
    "statusAssociacao" TEXT NOT NULL DEFAULT 'SEMASSOCIACAO',
    "motivoMaterial" TEXT,
    "matchAutomatico" BOOLEAN NOT NULL DEFAULT false,
    "revisaoHumanaObrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItemOrcamento_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemOrcamento_materialOficialId_fkey" FOREIGN KEY ("materialOficialId") REFERENCES "MaterialOficial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialNeoenergia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materialOficialId" INTEGER,
    "codigoNordeste" TEXT,
    "codigoElektro" TEXT,
    "codigoBrasilia" TEXT,
    "descricao" TEXT NOT NULL,
    "descricaoCompleta" TEXT,
    "especificacaoTecnica" TEXT,
    "familia" TEXT,
    "subfamilia" TEXT,
    "fonte" TEXT NOT NULL,
    "chaveImportacao" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaterialNeoenergia_materialOficialId_fkey" FOREIGN KEY ("materialOficialId") REFERENCES "MaterialOficial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaterialFornecedorHomologado" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "materialNeoenergiaId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "referenciaFornecedor" TEXT,
    "desenhoFornecedor" TEXT,
    "dataHomologacao" DATETIME,
    "dataVencimentoHomologacao" DATETIME,
    "documentacao" TEXT,
    "modoFornecimento" TEXT,
    "ca" TEXT,
    "tipoGestaoRecebimento" TEXT,
    "statusHomologacao" TEXT,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaterialFornecedorHomologado_materialNeoenergiaId_fkey" FOREIGN KEY ("materialNeoenergiaId") REFERENCES "MaterialNeoenergia" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MaterialFornecedorHomologado_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cotacao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fornecedorId" INTEGER NOT NULL,
    "numeroCotacao" TEXT,
    "dataCotacao" DATETIME,
    "validade" DATETIME,
    "frete" DECIMAL,
    "desconto" DECIMAL,
    "condicaoPagamento" TEXT,
    "prazoEntrega" TEXT,
    "valorTotal" DECIMAL,
    "arquivoOrigem" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Cotacao_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OfertaItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cotacaoId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "materialOficialId" INTEGER,
    "descricaoFornecedor" TEXT NOT NULL,
    "quantidade" DECIMAL,
    "unidade" TEXT,
    "precoUnitario" DECIMAL,
    "precoTotal" DECIMAL,
    "prazoEntrega" TEXT,
    "valida" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OfertaItem_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OfertaItem_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OfertaItem_materialOficialId_fkey" FOREIGN KEY ("materialOficialId") REFERENCES "MaterialOficial" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Carrinho" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orcamentoId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "valorBase" DECIMAL,
    "valorOtimizado" DECIMAL,
    "economia" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Carrinho_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CarrinhoItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "carrinhoId" INTEGER NOT NULL,
    "itemOrcamentoId" INTEGER NOT NULL,
    "ofertaItemId" INTEGER,
    "fornecedorId" INTEGER,
    "quantidade" DECIMAL,
    "precoUnitario" DECIMAL,
    "precoTotal" DECIMAL,
    "selecionadoAutomaticamente" BOOLEAN NOT NULL DEFAULT false,
    "selecionadoUsuario" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CarrinhoItem_carrinhoId_fkey" FOREIGN KEY ("carrinhoId") REFERENCES "Carrinho" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CarrinhoItem_itemOrcamentoId_fkey" FOREIGN KEY ("itemOrcamentoId") REFERENCES "ItemOrcamento" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CarrinhoItem_ofertaItemId_fkey" FOREIGN KEY ("ofertaItemId") REFERENCES "OfertaItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CarrinhoItem_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Cliente_nome_idx" ON "Cliente"("nome");

-- CreateIndex
CREATE INDEX "Fornecedor_razaoSocial_idx" ON "Fornecedor"("razaoSocial");

-- CreateIndex
CREATE INDEX "Fornecedor_cnpj_idx" ON "Fornecedor"("cnpj");

-- CreateIndex
CREATE INDEX "Orcamento_numeroOrcamento_idx" ON "Orcamento"("numeroOrcamento");

-- CreateIndex
CREATE INDEX "Orcamento_clienteId_idx" ON "Orcamento"("clienteId");

-- CreateIndex
CREATE INDEX "Orcamento_fornecedorOrigemId_idx" ON "Orcamento"("fornecedorOrigemId");

-- CreateIndex
CREATE INDEX "MaterialOficial_nomeNormalizado_idx" ON "MaterialOficial"("nomeNormalizado");

-- CreateIndex
CREATE INDEX "MaterialOficial_categoria_idx" ON "MaterialOficial"("categoria");

-- CreateIndex
CREATE INDEX "ItemOrcamento_orcamentoId_idx" ON "ItemOrcamento"("orcamentoId");

-- CreateIndex
CREATE INDEX "ItemOrcamento_codigoItem_idx" ON "ItemOrcamento"("codigoItem");

-- CreateIndex
CREATE INDEX "ItemOrcamento_materialOficialId_idx" ON "ItemOrcamento"("materialOficialId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialNeoenergia_chaveImportacao_key" ON "MaterialNeoenergia"("chaveImportacao");

-- CreateIndex
CREATE INDEX "MaterialNeoenergia_materialOficialId_idx" ON "MaterialNeoenergia"("materialOficialId");

-- CreateIndex
CREATE INDEX "MaterialNeoenergia_fonte_idx" ON "MaterialNeoenergia"("fonte");

-- CreateIndex
CREATE INDEX "MaterialNeoenergia_codigoNordeste_idx" ON "MaterialNeoenergia"("codigoNordeste");

-- CreateIndex
CREATE INDEX "MaterialFornecedorHomologado_materialNeoenergiaId_idx" ON "MaterialFornecedorHomologado"("materialNeoenergiaId");

-- CreateIndex
CREATE INDEX "MaterialFornecedorHomologado_fornecedorId_idx" ON "MaterialFornecedorHomologado"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialFornecedorHomologado_materialNeoenergiaId_fornecedorId_key" ON "MaterialFornecedorHomologado"("materialNeoenergiaId", "fornecedorId");

-- CreateIndex
CREATE INDEX "Cotacao_fornecedorId_idx" ON "Cotacao"("fornecedorId");

-- CreateIndex
CREATE INDEX "Cotacao_numeroCotacao_idx" ON "Cotacao"("numeroCotacao");

-- CreateIndex
CREATE INDEX "OfertaItem_cotacaoId_idx" ON "OfertaItem"("cotacaoId");

-- CreateIndex
CREATE INDEX "OfertaItem_fornecedorId_idx" ON "OfertaItem"("fornecedorId");

-- CreateIndex
CREATE INDEX "OfertaItem_materialOficialId_idx" ON "OfertaItem"("materialOficialId");

-- CreateIndex
CREATE INDEX "OfertaItem_valida_idx" ON "OfertaItem"("valida");

-- CreateIndex
CREATE INDEX "Carrinho_orcamentoId_idx" ON "Carrinho"("orcamentoId");

-- CreateIndex
CREATE INDEX "CarrinhoItem_carrinhoId_idx" ON "CarrinhoItem"("carrinhoId");

-- CreateIndex
CREATE INDEX "CarrinhoItem_itemOrcamentoId_idx" ON "CarrinhoItem"("itemOrcamentoId");

-- CreateIndex
CREATE INDEX "CarrinhoItem_ofertaItemId_idx" ON "CarrinhoItem"("ofertaItemId");

-- CreateIndex
CREATE INDEX "CarrinhoItem_fornecedorId_idx" ON "CarrinhoItem"("fornecedorId");
