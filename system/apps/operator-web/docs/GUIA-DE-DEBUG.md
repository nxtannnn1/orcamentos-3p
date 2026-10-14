# Guia de debug

## Método

1. Reproduza e anote URL, ação, horário, perfil, fonte, status e mensagem segura.
2. Classifique: renderização, BFF, autenticação, repository ou serviço externo.
3. Consulte Network/logs antes de editar.
4. Localize endpoint/método com `rg`; leia chamadores e testes.
5. Rode o menor teste relacionado, formule hipótese e altere uma coisa por vez.

Console mostra erros do navegador; Network mostra método/status/resposta; o terminal mostra Server Components e rotas; breakpoints do VS Code pausam execução; stack traces devem ser lidos a partir do primeiro frame do projeto. `lint`, `typecheck`, testes e build complementam a investigação.

| HTTP | Causa provável aqui |
| --- | --- |
| 400 | ID, JSON ou decisão inválida. |
| 401 | Sessão ausente/expirada. |
| 403 | Perfil, origem ou permissão Graph. |
| 404 | Item remoto inexistente. |
| 409 | ETag, orçamento fechado ou fornecedor ausente. |
| 413/415 | Corpo grande/tipo incorreto. |
| 428 | `If-Match` ausente. |
| 429 | Limite; respeite `Retry-After`. |
| 502/503 | Graph, Operator API, Redis, auditoria ou configuração. |

## Sintomas

- **Página não carrega:** confira Console, documento/redirect na Network, terminal, `layout.tsx`, página, `session.ts` e `proxy.ts`; rode typecheck/build.
- **Fila vazia:** veja `GET /api/orcamentos`. `200 []` difere de erro. Confira `DATA_SOURCE`, factory e `listBudgets`; no mock há um orçamento.
- **Materiais vazios:** inspecione `/api/materiais`, mapper, mapa de campos e paginação.
- **Botão não responde:** veja `disabled`: `saving`, `canWrite` e limites de navegação são intencionais. Consulta não escreve.
- **Aprovação falha:** use status/código; confira material, versão, fornecedor, orçamento, Redis e permissão. Não repita 502 sem reler.
- **SharePoint falha:** separe token, GET, concessão e PATCH. 412 é conflito, 403 concessão, 404 destino. Não amplie permissão para contornar erro.
- **Graph 401:** valide configuração no ambiente sem imprimir token. **403:** confira `Lists.SelectedOperations.Selected` e `write`; permissões amplas são bloqueadas. **429:** respeite espera e avalie volume.
- **`GRAPH_WRITE_PERMISSION_UNVERIFIED` 503:** a verificação da concessão falhou e o PATCH não foi enviado. Separe token, acesso à lista e suporte ao `GET .../permissions`. O código usa Graph `v1.0`, mas a referência encontrada para listar permissões de lista está em beta; trate isso como hipótese até reproduzir com uma chamada somente leitura autorizada.
- **`AUDIT_NOT_CONFIGURED` 503:** confira Redis REST e os mapeamentos `reviewedByOid`, `reviewedAt` e `decisionId`; nomes de exemplo na documentação não comprovam colunas físicas.
- **Operator API 502:** diferencie `OPERATOR_API_UNAVAILABLE` de `OPERATOR_API_INVALID_RESPONSE`; confira URL, processo na porta 3001, Bearer, limite/tamanho da página e resposta sem imprimir o token.
- **`READ_ONLY_DATA_SOURCE` 403:** comportamento esperado de `operator-api`; a fonte não implementa decisão. Não habilite escrita removendo o bloqueio da UI ou do repository.
- **Operator API 503:** valide `OPERATOR_API_BASE_URL`, `OPERATOR_API_TOKEN`, configuração da API, role PostgreSQL e TLS. HTTP só é permitido em loopback fora de produção.
- **Conflito:** recarregue, reveja e decida novamente; nunca use `If-Match: *`.
- **Autenticação:** diferencie configuração, conta, role, MFA e expiração; use testes e [Login Microsoft](LOGIN-MICROSOFT.md).
- **Local funciona/deploy falha:** compare runtime, secrets, origem, redirect URI, Redis, fonte, bindings e concessões; rode `cf:build`/preview em ambiente seguro.

Registre somente código HTTP, código da aplicação, operação, horário e identificadores necessários. Nunca registre `Authorization`, cookies, secrets, token, credencial Redis, observações ou dados comerciais desnecessários.
