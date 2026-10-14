# Dados simulados

Mocks permitem estudar/testar sem serviços externos. `mock-data.ts` contém um orçamento, 56 itens e dez materiais fictícios; `mock-operator-repository.ts` implementa contrato, pesquisa, grava em memória e simula versão/conflito; seu teste verifica escala/progresso/independência.

```ts
item.version = `"${Number(item.version.slice(1, -1)) + 1}"`;
```

Factory seleciona esse repository com `DATA_SOURCE=mock`. Investigue aqui diferenças exclusivas do ambiente demo. Para manter, conheça arrays, cloning, filtros, interfaces e testes. Preserve dados fictícios e comportamento equivalente ao contrato; sucesso aqui não valida Graph/SharePoint, e reinício perde decisões.

Leia [Testes](../../docs/GUIA-DE-TESTES.md) e [Arquitetura](../../docs/ARQUITETURA.md).
