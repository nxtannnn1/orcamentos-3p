# Dados simulados

Mocks permitem estudar/testar sem serviços externos. `mock-data.ts` contém um orçamento, 56 itens e dez materiais fictícios; `mock-operator-repository.ts` implementa contrato, pesquisa, grava em memória e simula versão/conflito; seu teste verifica escala/progresso/independência.

```ts
item.version = `"${Number(item.version.slice(1, -1)) + 1}"`;
```

Factory seleciona esse repository com `DATA_SOURCE=mock`. Investigue aqui diferenças exclusivas do ambiente demo. Para manter, conheça arrays, cloning, filtros, interfaces e testes. Preserve dados fictícios e comportamento equivalente ao contrato; sucesso aqui não valida Graph/SharePoint, e reinício perde decisões.

Leia [Testes](../../docs/GUIA-DE-TESTES.md) e [Arquitetura](../../docs/ARQUITETURA.md).

## Bolsa de Materiais: cenário adicional fictício

`mock-bolsa-scenario.ts` mantém seis cotações de quatro fornecedores fictícios, separadas
do orçamento de 56 itens da conferência. A Bolsa deriva ofertas apenas dos itens com
`approvedMaterial` e `reviewStatus: "APROVADO"`; sugestões automáticas, inclusive as
deliberadamente erradas, não são equivalências. Nada é enviado a Graph/SharePoint.

| Material oficial | Cobertura dos quatro fornecedores | Quantidade-alvo | Menor total | Diferença potencial |
| --- | --- | ---: | ---: | ---: |
| MAT-QD-12 | Completa (4) | 4 UN | R$ 528,00 | R$ 72,00 |
| MAT-EL-050 | Parcial (2) | 30 M | R$ 510,00 | R$ 42,00 |
| MAT-CX-400 | Oferta única (1) | 8 UN | R$ 432,00 | Não calculada |
| MAT-HST-24 | Sem equivalência aprovada (0) | 6 UN | Não calculado | Não calculada |
| MAT-CON-35 | Parcial (2) | 25 UN | R$ 105,00 | R$ 7,50 |
| MAT-TER-16 | Completa (4) | 100 UN | R$ 180,00 | R$ 40,00 |
| MAT-ID-025 | Sem oferta no mock (0) | 40 UN | Não calculado | Não calculada |

Para esses sete materiais, o consolidado cobre cinco: mínimo de R$ 1.755,00,
máximo de R$ 1.916,50 e diferença potencial de R$ 161,50, sempre na mesma
cobertura. A diferença entre uma pré-seleção parcial e o mínimo consolidado
permanece indisponível. Informe as quantidades-alvo na interface para reproduzir
os valores; ofertas são consultadas por material. Valores não incluem frete,
tributos adicionais nem descontos.

O item fictício de eletroduto da Íris preserva 1.200 CM a R$ 0,17/CM no orçamento.
Somente a oferta de comparação é convertida para M a R$ 17,00/M (12 M = R$ 204,00).
Não há conversão implícita ou genérica para dados reais.
