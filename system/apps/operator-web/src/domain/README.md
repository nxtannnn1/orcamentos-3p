# Domínio de revisão

Esta camada concentra comportamento independente do React e SharePoint. Em Java, aproxima-se de services e objetos de domínio.

- `review-controller.ts`: carrega, seleciona, navega, salva, bloqueia concorrência local e atualiza só após sucesso.
- `review-session.ts`: estado puro de itens/índice.
- `decision-error.ts`: erro com status/código.
- testes: regras, falha e concorrência.

```ts
constructor(private repository: OperatorRepository) {} // dependência por contrato
```

UI chama controller; controller chama interface repository; infraestrutura fica fora. Investigue aqui avanço, seleção, preservação após falha e decisão duplicada. Para manter, conheça classes, imutabilidade, Promise, injeção de dependência e testes. Regra que protege dados também precisa existir no servidor.

Leia [Arquitetura](../../docs/ARQUITETURA.md), [Fluxos](../../docs/FLUXOS-DO-SISTEMA.md) e [Testes](../../docs/GUIA-DE-TESTES.md).
