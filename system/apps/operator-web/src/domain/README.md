# Domínio de revisão

Esta camada concentra comportamento independente do React e da fonte de dados. Em Java, aproxima-se de services e objetos de domínio.

- `review-controller.ts`: carrega, seleciona, navega, salva, bloqueia concorrência local e atualiza só após sucesso.
- `review-session.ts`: estado puro de itens/índice.
- `decision-error.ts`: erro com status/código.
- `price-comparison.ts`: valida associação por `approvedMaterial.id`, compatibilidade de unidade e preço, ordena ofertas, marca empates e calcula custos/indicadores monetários em centavos.
- testes: regras, falha e concorrência.

A comparação não usa semelhança textual e não decide pelo operador. A pré-seleção permanece em estado React, fora deste domínio persistente, e revalida a elegibilidade antes de totalizar.

Indicadores totais exigem quantidade positiva. Extremos exigem oferta válida; diferenças por material exigem ao menos duas ofertas. O percentual usa o maior total como denominador e não é calculado para zero. O consolidado fixa uma cobertura comum para mínimo/máximo e só confronta escolha versus mínimo com cobertura completa. Todos são potenciais, sem frete, tributos adicionais ou descontos ausentes dos dados.

```ts
constructor(private repository: OperatorRepository) {} // dependência por contrato
```

UI chama controller; controller chama interface repository; infraestrutura fica fora. Investigue aqui avanço, seleção, preservação após falha e decisão duplicada. Para manter, conheça classes, imutabilidade, Promise, injeção de dependência e testes. Regra que protege dados também precisa existir no servidor.

Leia [Arquitetura](../../docs/ARQUITETURA.md), [Fluxos](../../docs/FLUXOS-DO-SISTEMA.md) e [Testes](../../docs/GUIA-DE-TESTES.md).
