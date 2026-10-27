# Banco de Dados — Sistema de Orçamentos 3P

Documentação inicial da arquitetura do banco de dados do Sistema de Orçamentos 3P.

## Arquivos

- [`visao-geral.md`](visao-geral.md) — explica o objetivo, arquitetura e papel do Prisma.
- [`der.md`](der.md) — apresenta o modelo entidade-relacionamento.
- `prisma/schema.prisma` — primeira tradução do DER para Prisma.

## Fontes de schema e quem as usa

| Arquivo | Natureza | Uso |
| --- | --- | --- |
| `schema.sql` | Desenho PostgreSQL inicial (tabelas `fornecedor`, `orcamento`, `item_orcamento`, `material_oficial` e enums) | Referência de modelagem; não comprovado como mecanismo de instalação |
| `../services/auth-service/src/main/resources/db/migration/V1__initial_schema.sql` | Dump PostgreSQL usado como migração Flyway do `auth-service` (experimental, fora do MVP) | Pertence ao serviço experimental |
| `../services/operator-api/src/server/db/schema.ts` | Projeção parcial de **leitura** das tabelas existentes | Usado pela Operator API; não gera migrações |
| `prisma/schema.prisma` e `prisma/migrations/` | Laboratório com `provider = "sqlite"` | Somente estudo local; as duas migrações `*_init` têm conteúdo idêntico |
| `prisma/check.sql` | Consulta auxiliar do laboratório | Somente estudo local |

A Operator API lê o banco PostgreSQL existente por meio da projeção em `schema.ts`, com role somente leitura.
Não há, no repositório, comprovação de qual script instalou esse banco; a análise está no
[plano de persistência D1](../services/operator-api/docs/PLANO-PERSISTENCIA-D1.md).

## Situação atual

O SharePoint e o n8n continuam sendo o ambiente operacional.

O banco ainda está em fase de desenho e laboratório.

Nenhuma migração operacional deve ser feita apenas porque este schema existe.

## Próximo passo

Validar o `schema.prisma` localmente com SQLite e dados fictícios antes de conectar qualquer workflow real.
