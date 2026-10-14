# Repositories

Repository esconde a origem de dados. `operator-repository.ts` é um contrato, como interface Java: lista orçamentos/itens/materiais e salva decisão. `ReadOnlyOperatorRepository` remove escrita do tipo.

Implementações relacionadas: cliente HTTP em [`bff`](bff/README.md), mock em `../mocks` e SharePoint em `../server/sharepoint`.

```ts
interface OperatorRepository {
  listBudgets(): Promise<Budget[]>;
  saveItemDecision(...): Promise<BudgetItem>;
}
```

Componentes/domínio dependem do contrato, permitindo trocar infraestrutura. Investigue aqui quando assinatura/tipo diverge em várias camadas. Para manter, conheça interfaces, generics, Promise, adapter/repository e inversão de dependência. Alterar contrato exige revisar todas as implementações e testes.

Leia [Arquitetura](../../docs/ARQUITETURA.md) e [Manutenção](../../docs/GUIA-DE-MANUTENCAO.md).
