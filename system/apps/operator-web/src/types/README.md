# Tipos do domínio

`operator.ts` é o vocabulário compartilhado: `Budget`, `BudgetItem`, `OfficialMaterial`, `ReviewStatus`, `ItemDecision` e `DecisionContext`. Interfaces lembram POJOs/records Java; uniões discriminadas modelam alternativas válidas.

```ts
type ItemDecision =
  | { action: "APPROVE"; approvedMaterial: OfficialMaterial }
  | { action: "REJECT"; approvedMaterial: null };
```

UI, domínio, repositories e servidor dependem desses formatos. `Budget.readOnly` e `reviewAvailable`/`BudgetItem.reviewAvailable` representam capacidades da fonte Operator API sem fingir revisão humana. Investigue aqui erros de compilação que atravessam camadas. Para manter, conheça interfaces, unions, null, optional e narrowing. Tipos somem em runtime: rotas e adaptadores ainda devem validar JSON. Ao adicionar campo, atualize os três mapeamentos/fontes, UI e testes.

Leia [Guia de estudo](../../docs/GUIA-DE-ESTUDO.md) e [Manutenção](../../docs/GUIA-DE-MANUTENCAO.md).
