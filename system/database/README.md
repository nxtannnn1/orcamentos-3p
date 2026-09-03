# Banco de Dados — Sistema de Orçamentos 3P

Documentação inicial da arquitetura do banco de dados do Sistema de Orçamentos 3P.

## Arquivos

- `VISAO-GERAL.md` — explica o objetivo, arquitetura e papel do Prisma.
- `DER.md` — apresenta o modelo entidade-relacionamento.
- `prisma/schema.prisma` — primeira tradução do DER para Prisma.

## Situação atual

O SharePoint e o n8n continuam sendo o ambiente operacional.

O banco ainda está em fase de desenho e laboratório.

Nenhuma migração operacional deve ser feita apenas porque este schema existe.

## Próximo passo

Validar o `schema.prisma` localmente com SQLite e dados fictícios antes de conectar qualquer workflow real.
