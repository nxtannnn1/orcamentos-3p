# Integração SharePoint e Graph

Esta pasta adapta listas SharePoint aos modelos internos e persiste decisões. Em Java, transport é cliente HTTP, mapper é conversor DTO e repository é serviço de persistência.

- `graph-read-transport.ts`: token, GET/PATCH, destinos, timeout e permissão.
- `sharepoint-operator-repository.ts`: paginação, consultas, regras, auditoria e escrita.
- `sharepoint-mapper.ts`: campos externos → modelos.
- `sharepoint-types.ts`: contratos Graph/mapa.
- `discover-columns.ts`: preparação de GET para descoberta futura; não está ativa no fluxo normal.
- testes: mapping, limites, ETag, permissões e erros.

```ts
await graph.patch(`${path}/fields`, fields, context.version); // If-Match
```

Factory cria repository; APIs o chamam; Graph acessa listas. Investigue token, endpoint, mapa, paginação, permissão e ETag separadamente. Para manter, conheça Graph, OAuth client credentials, SharePoint lookup, paginação, concorrência e auditoria. Não toque na sugestão nem amplie permissões.

O adaptador de escrita existe e é coberto por testes com rede simulada; isso não comprova PATCH no tenant real. A operação real exige Redis, nomes/tipos confirmados para `reviewedByOid`, `reviewedAt` e `decisionId`, concessões mínimas nas listas e login autorizado com MFA validada.

`verifyWritePermission()` consulta `GET .../permissions` pela base Graph `v1.0`. A referência localizada para listar permissões de lista está publicada como beta. Registre como hipótese de incompatibilidade até uma chamada somente leitura autorizada confirmar `GRAPH_WRITE_PERMISSION_UNVERIFIED`; não troque endpoint nem permissão apenas por inferência.

Leia [Arquitetura](../../../docs/ARQUITETURA.md), [Fluxos](../../../docs/FLUXOS-DO-SISTEMA.md) e [Segurança](../../../docs/SEGURANCA-OPERACIONAL.md).
