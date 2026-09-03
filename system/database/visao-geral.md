# Visão Geral — Banco de Dados do Sistema de Orçamentos 3P

## Objetivo

O banco de dados do Sistema de Orçamentos 3P deve organizar as informações hoje distribuídas entre SharePoint Lists, n8n, arquivos de fornecedores e catálogos Neoenergia, permitindo evoluir o sistema para um **carrinho de compras otimizado**.

A ideia não é substituir o SharePoint imediatamente. Primeiro, o banco será desenhado e testado em paralelo.

## Papel de cada camada

```text
Usuário / Power Apps
        ↓
       n8n
        ↓
Prisma / aplicação
        ↓
Banco de dados
```

- **Power Apps / interface:** entrada e revisão humana.
- **n8n:** ingestão, automações, normalização, matching e integrações.
- **Prisma:** descreve o modelo do banco e facilita o acesso aos dados.
- **Banco:** guarda as entidades e os relacionamentos de forma estruturada.

## O que o Prisma é

Prisma **não é o banco de dados**.

Ele funciona como uma camada entre a aplicação e o banco.

No arquivo `schema.prisma`, declaramos entidades como:

```prisma
model Fornecedor {
  id          Int    @id @default(autoincrement())
  razaoSocial String
  cnpj        String?
}
```

Isso representa uma tabela lógica chamada `Fornecedor`.

Depois, o Prisma pode gerar migrations e código para consultar e alterar os dados.

## Blocos principais do banco

```text
1. CLIENTES
2. ORÇAMENTOS
3. ITENS
4. MATERIAIS OFICIAIS
5. CATÁLOGO NEOENERGIA
6. FORNECEDORES
7. COTAÇÕES
8. OFERTAS
9. CARRINHO OTIMIZADO
```

## Fluxo principal

```text
Arquivo / Cotação
       ↓
    Orçamento
       ↓
      Itens
       ↓
Normalização / Matching
       ↓
Material Oficial
       ↓
 ┌───────────────┐
 ↓               ↓
Neoenergia     Ofertas
 ↓               ↓
Fornecedores   Comparação
                 ↓
              Carrinho
```

## Matching

O banco deve preservar os estados já validados no n8n.

### Status de associação

- `EXATO`
- `SEMASSOCIACAO`

### Motivos

- `MATCH_EXATO_ATIVO`
- `CANDIDATO_TECNICO_UNICO`
- `CANDIDATOS_AMBIGUOS`
- `SEM_CANDIDATO_COMPATIVEL`

Um item pode existir sem estar associado a um material oficial.

## Catálogo Neoenergia

No MVP, Rede e Subestações entram na mesma estrutura.

A origem será diferenciada pela coluna `fonte`.

Valores iniciais:

```text
NEOENERGIA_REDE
NEOENERGIA_SUBESTACOES
```

Não é necessário criar uma tabela separada para cada planilha.

## Carrinho otimizado

O objetivo é conseguir comparar ofertas do mesmo material entre diversos fornecedores.

Exemplo:

```text
CABO 10 MM2

Fornecedor A → R$ 10,50
Fornecedor B → R$ 9,80
Fornecedor C → R$ 11,20
```

No MVP, o sistema poderá sugerir:

```text
Fornecedor B → R$ 9,80
```

A decisão permanece revisável pelo usuário.

## Regra inicial de otimização

```text
Para cada item:
    identificar o material oficial
    buscar ofertas válidas
    ordenar por preço
    selecionar a menor oferta
    registrar a sugestão
```

Depois poderão ser adicionados:

- frete;
- prazo;
- condição de pagamento;
- quantidade mínima;
- homologação;
- consolidação por fornecedor;
- impostos.

## Estratégia de implantação

### Fase 1 — desenho

- DER;
- schema Prisma;
- documentação;
- dados fictícios.

### Fase 2 — laboratório

- SQLite;
- migrations;
- seeds;
- consultas.

### Fase 3 — espelho

```text
SharePoint → n8n → banco
```

O SharePoint continua operacional e o banco recebe cópia.

### Fase 4 — leitura pelo banco

Consultas de materiais, preços e carrinho passam gradualmente para o banco.

### Fase 5 — migração controlada

Somente quando o modelo estiver validado.

## Estrutura sugerida

```text
system/
└── database/
    ├── README.md
    ├── VISAO-GERAL.md
    ├── DER.md
    └── prisma/
        └── schema.prisma
```

## Princípio central

O banco precisa responder bem a quatro perguntas:

```text
QUAL MATERIAL?
      ↓
QUAIS FORNECEDORES?
      ↓
QUAIS PREÇOS?
      ↓
QUAL A MELHOR COMBINAÇÃO?
```

Esse é o núcleo do MVP do carrinho otimizado.
