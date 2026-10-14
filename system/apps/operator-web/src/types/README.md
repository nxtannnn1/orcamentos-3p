# Tipos do domínio

`operator.ts` é o vocabulário compartilhado: `Budget`, `BudgetItem`, `OfficialMaterial`, `ReviewStatus`, `ItemDecision` e `DecisionContext`. Interfaces lembram POJOs/records Java; uniões discriminadas modelam alternativas válidas.

```ts
type ItemDecision =
  | { action: "APPROVE"; approvedMaterial: OfficialMaterial }
  | { action: "REJECT"; approvedMaterial: null };
```

UI, domínio, repositories e servidor dependem desses formatos. Investigue aqui erros de compilação que atravessam camadas. Para manter, conheça interfaces, unions, null, optional e narrowing. Tipos somem em runtime: rotas ainda devem validar JSON. Ao adicionar campo, atualize mapper, mocks, UI e testes.

Leia [Guia de estudo](../../docs/GUIA-DE-ESTUDO.md) e [Manutenção](../../docs/GUIA-DE-MANUTENCAO.md).
