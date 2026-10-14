# Seleção da fonte de dados

Esta pasta decide entre mock e SharePoint e normaliza erros de rota. É semelhante a configuration/factory e exception mapper Java.

- `configuration.ts`: valida `DATA_SOURCE`, credenciais/IDs e mapa de campos.
- `operator-repository-factory.ts`: cria/reutiliza implementation.
- `route-error.ts`: converte erros em HTTP seguro.
- testes: padrão mock e falha fechada.

```ts
if (source === "mock") return sharedMockRepository;
return new SharePointOperatorRepository(graph, config.repository);
```

APIs chamam factory; SharePoint usa configuração validada. Investigue 502/503 e seleção errada aqui. Para manter, conheça factories, variáveis de ambiente, validação runtime e tratamento de exceções. Nunca implemente fallback silencioso para dados fictícios.

Leia [Arquitetura](../../../docs/ARQUITETURA.md) e [Debug](../../../docs/GUIA-DE-DEBUG.md).
