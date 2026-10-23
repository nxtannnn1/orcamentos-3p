# Integração SharePoint e Graph

Esta pasta adapta listas SharePoint aos modelos internos e persiste decisões. Em Java, transport é cliente HTTP, mapper é conversor DTO e repository é serviço de persistência.

- `graph-read-transport.ts`: token, GET/PATCH, destinos, timeout e permissão.
- `graph-read-error.ts`: metadados fixos de falha OAuth/GET (operação, categoria, status HTTP), sem URL, corpo ou erro subjacente.
- `sharepoint-operator-repository.ts`: paginação, consultas, regras, auditoria e escrita.
- `sharepoint-mapper.ts`: campos externos → modelos.
- `sharepoint-types.ts`: contratos Graph/mapa.
- `person-resolver.ts`: contrato e validação da identidade individual; indisponível por padrão.
- `graph-list-person-resolver.ts`: fonte opcional somente de leitura, baseada em pares Graph V2 da lista; não usa email e não concede papéis ou escrita.
- `entra-person-readonly-probe.ts`: instrumento interno local desativado por padrão; recebe sessão Entra já validada pelo guard e registra status/UUID e **contadores temporários agregados** de consulta/paginação/correspondência. Sem identidade nos logs, endpoint ou escrita. [Diagnóstico e remoção](../../../docs/DIAGNOSTICO-PROBE-IDENTIDADE.md).
- `discover-columns.ts`: preparação de GET para descoberta futura; não está ativa no fluxo normal.
- testes: mapping, limites, ETag, permissões e erros.

```ts
await graph.patch(`${path}/fields`, fields, context.version); // If-Match
```

Factory cria repository; APIs o chamam; Graph acessa listas. Investigue token, endpoint, mapa, paginação, permissão e ETag separadamente. Para manter, conheça Graph, OAuth client credentials, SharePoint lookup, paginação, concorrência e auditoria. Não toque na sugestão nem amplie permissões.

O adaptador de escrita existe e é coberto por testes com rede simulada; isso não comprova PATCH no tenant real. A operação real exige Redis, nomes/tipos confirmados para `reviewedByOid`, `reviewedAt` e `decisionId`, concessões mínimas nas listas e login autorizado com MFA validada.

`verifyWritePermission()` consulta `GET .../permissions` pela base Graph `v1.0`.
Esse GET respondeu 200 na auditoria somente leitura de 18/10/2026 e está documentado
em v1.0. O resolvedor opcional também foi validado com um par real, mas permanece
desativado (`SHAREPOINT_PERSON_RESOLVER=disabled`). Desde 23/10/2026 ele não participa da escrita: `decision-approver.ts` valida nome/e-mail da sessão e o PATCH grava as colunas de texto `approverName`/`approverEmail`. Ver [evidências, limitações e testes](../../../docs/RESOLUCAO-IDENTIDADE-SHAREPOINT.md).

Leia [Arquitetura](../../../docs/ARQUITETURA.md), [Fluxos](../../../docs/FLUXOS-DO-SISTEMA.md) e [Segurança](../../../docs/SEGURANCA-OPERACIONAL.md).
