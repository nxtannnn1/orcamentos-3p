# Seleção da fonte de dados

Esta pasta decide entre mock, SharePoint e Operator API e normaliza erros de rota. É semelhante a configuration/factory e exception mapper Java.

- `configuration.ts`: valida `DATA_SOURCE`, credenciais/IDs e mapa de campos.
- `operator-repository-factory.ts`: cria/reutiliza implementation.
- A factory mantém Pessoa SharePoint indisponível por padrão. `SHAREPOINT_PERSON_RESOLVER=graph-list-permissions` seleciona o adaptador Graph V2 por injeção, sem ativar escrita; seletor inválido falha fechado. O fingerprint do reuso inclui essa seleção. Ver [contrato e homologação](../../../docs/RESOLUCAO-IDENTIDADE-SHAREPOINT.md).
- `route-error.ts`: converte erros em HTTP seguro.
- testes: seleção das três fontes, padrão mock e falha fechada.

```ts
if (source === "mock") return sharedMockRepository;
if (source === "operator-api") return new OperatorApiRepository(...);
return new SharePointOperatorRepository(graph, config.repository);
```

APIs chamam a factory; cada fonte valida apenas sua própria configuração. Operator API é consulta server-to-server; SharePoint oferece o fluxo de persistência; mock é memória local. Investigue 502/503 e seleção errada aqui. Para manter, conheça factories, variáveis de ambiente, validação runtime e tratamento de exceções. Nunca implemente fallback silencioso entre fontes.

Leia [Arquitetura](../../../docs/ARQUITETURA.md), [Operator API](../operator-api/README.md) e [Debug](../../../docs/GUIA-DE-DEBUG.md).
