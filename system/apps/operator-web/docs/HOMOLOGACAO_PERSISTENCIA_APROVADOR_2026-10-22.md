# Homologação da persistência do Aprovador — 22/10/2026

Base: `infra-lab` em `cfb951f`. Caminhos relativos a `system/apps/operator-web`.
Documento sanitizado: nenhum tenant, client, site, lista, item, lookup de Pessoa, OID, ETag ou token.

**Parecer:** o schema real foi confirmado por leitura Graph. A ferramenta de ensaio está pronta, testada e validada contra a lista real em modo somente leitura. **A escrita NÃO foi executada.** Não existe item sintético autorizado e falta a autorização explícita do responsável. Portanto, a persistência do Aprovador **ainda não está comprovada**.

## 1. Schema real encontrado (Graph, somente leitura)

Comando: `node --env-file=.env.local scripts/approver-write-rehearsal.mjs inspect`. Lista: a de `SHAREPOINT_ITENS_IMPORTADOS_LIST_ID`, no site de `SHAREPOINT_SITE_ID`, as mesmas usadas pelo portal.

| Pergunta | Resposta confirmada |
| --- | --- |
| Campo Aprovador desta lista | `Responsavel_Decisao` (nome interno = nome exibido). Não existe coluna `Aprovador` em Itens_Importados. `Historico_Precos.Aprovador` é outra coluna, de outra lista, e não participa deste ensaio |
| Tipo real | `personOrGroup`, `chooseFromType=peopleOnly`, `allowMultipleSelection=false`, `displayAs=nameWithPresence` |
| Person/User ou Lookup? | Pessoa (User). Única coluna Pessoa gravável da lista, além de Author/Editor |
| Identificador esperado pelo Graph | `Responsavel_DecisaoLookupId` = ID do usuário na *User Information List* **deste site** (inteiro, enviado como string, igual ao formato do portal). Não é OID, e-mail nem nome |
| Obrigatório / restrições | Não obrigatório, não indexado, sem unicidade. Única coluna obrigatória da lista: `Enviado_Historico` (Choice `SIM`/`NAO`) |
| Campos da decisão | `Revisado_Por_Oid` (texto), `Data_Decisao` (dateTime), `Decisao_Id` (texto), `Status_Revisao` (Choice `PENDENTE`, `APROVADO`, `EM_REVISAO`, `REJEITADO`, `CORRIGIR`), `Material_Aprovado` (lookup único → `Material`), `Observacao_Item` (texto) |
| Marcador de item sintético | `Codigo_Item` é texto **indexado e único**; adequado para o prefixo `HOMOLOG-3P-` |
| ETag / atualização | O item expõe `eTag`. A atualização é `PATCH /sites/{site}/lists/{lista}/items/{id}/fields` com `If-Match: <eTag>` (o mesmo formato de `graph-read-transport.ts`) |
| Permissões efetivas | Role da aplicação: somente `Lists.SelectedOperations.Selected`. A concessão `write` da aplicação está presente em Itens_Importados (todas as páginas de `/permissions`), mas **não foi exercida** |
| Leitura da User Information List | **HTTP 404** para a aplicação: ela não consegue verificar sozinha se um lookup é uma Pessoa do site |
| Itens sintéticos existentes | **Nenhum** item com `Codigo_Item` iniciado por `HOMOLOG-3P-` |

O código do portal está coerente com esse schema. `decision-schema.ts` exige exatamente `personOrGroup` + `peopleOnly` + seleção única, e o PATCH grava `${reviewedByPerson}LookupId` como string. Não foi encontrado defeito de payload, serialização ou nome interno, e nenhuma correção de código de produção foi feita.

## 2. Ferramenta criada

`scripts/approver-write-rehearsal.mjs` (CLI Node e mais nada: nenhuma rota, import do portal ou Redis). Testes em `scripts/approver-write-rehearsal.test.ts` (13 cenários com fetch simulado).

| Comando | Efeito |
| --- | --- |
| `inspect` | Somente GET: roles, concessão write, metadados das colunas da decisão e candidatos sintéticos |
| `plan --item <id> --person-lookup <n>` | Somente GET. Lê colunas e item, captura o ETag, aplica as travas, monta o payload e imprime uma prévia sanitizada e a **frase de confirmação** |
| `execute … --confirm "<frase>" [--person-attested]` | Refaz o `plan` com leitura nova. Só grava se não houver bloqueios e se a frase coincidir com a do ETag atual. Executa **um** PATCH sem retry e depois um GET de releitura, e grava a evidência |

Travas de `plan`/`execute`:
- `Codigo_Item` deve iniciar com `HOMOLOG-3P-`, `Status_Revisao` deve ser `PENDENTE` e `Enviado_Historico` deve ser `NAO`.
- A coluna precisa ser Pessoa única `peopleOnly` gravável, e o valor alvo precisa ser diferente do atual.
- A concessão write da aplicação precisa estar presente.
- A frase de confirmação inclui o item, a coluna, o lookup e o hash do ETag. Qualquer alteração no item invalida a frase.
- Se a Pessoa não puder ser verificada no site (situação atual: 404), a ferramenta exige `--person-attested` após verificação humana.
- O marcador `work/homologacao-aprovador/attempt-item-<id>.json` é criado com `wx` **antes** do PATCH, o que impede uma segunda tentativa no mesmo item.
- O PATCH envia **apenas** `Responsavel_DecisaoLookupId`. Não altera `Status_Revisao`, material, observação, OID, data nem ID de decisão. O ensaio não fabrica uma aprovação.
- O sucesso só é declarado com PATCH 2xx, releitura 200, ETag novo, lookup relido igual ao enviado, status inalterado e nenhum outro campo alterado (as colunas mantidas pelo SharePoint, como `Modified`, `Editor` e `_UIVersionString`, são separadas). Um HTTP 200 isolado resulta em `NOT_CONFIRMED`.
- A evidência fica em `work/` (ignorada pelo Git). Contém nomes de campos e hashes de valores, nunca token, segredo, ETag bruto ou valores dos campos.

## 3. Payload sanitizado e operação planejada

```http
PATCH https://graph.microsoft.com/v1.0/sites/{SITE}/lists/{ITENS_IMPORTADOS}/items/{ITEM_SINTETICO}/fields
If-Match: {ETAG_LIDO_NO_PLAN}
Content-Type: application/json

{ "Responsavel_DecisaoLookupId": "{LOOKUP_DA_PESSOA_NO_SITE}" }
```

Seguido de `GET …/items/{ITEM_SINTETICO}?$expand=fields` e comparação campo a campo.

## 4. Evidências de leitura desta execução

| Verificação | Resultado |
| --- | --- |
| Token técnico e roles | OK; `Lists.SelectedOperations.Selected` |
| Colunas da decisão | 9/9 encontradas; tipos na §1 |
| `plan` real em item existente (não sintético) | Item lido, 34 campos, ETag capturado, payload com uma única chave. **Bloqueado** com `NOT_MARKED_SYNTHETIC` e `STATUS_NOT_PENDENTE`, como esperado. Nenhum PATCH |
| Verificação da Pessoa pelo app | `UNVERIFIED_HTTP_404` |

## 5. Quadro de comprovação

| Verificação | Resultado |
| --- | --- |
| Schema Aprovador confirmado | ✅ `Responsavel_Decisao`, Pessoa única `peopleOnly` |
| Identificador da Pessoa validado | ❌ Pendente: o app não lê a User Information List (404); exige atestação humana |
| Permissão de escrita confirmada | ⚠️ Concessão `write` presente; não exercida |
| PATCH autorizado | ❌ Não: falta item sintético e autorização |
| Resposta Graph | — (não executado) |
| GET após gravação | — |
| Aprovador persistido | — **não comprovado** |
| Outros campos preservados | — |

## 6. Problemas encontrados

1. **Não há item sintético.** Criá-lo é uma escrita e deve ser feito por quem tem autorização, fora desta ferramenta.
2. **A aplicação não verifica a Pessoa.** A User Information List não está entre as listas concedidas (404). É coerente com o bloqueio de identidade já documentado e não muda nada no código.
3. Graph com credencial de aplicação registra `Editor` = aplicação. A autoria humana fica **apenas** em `Responsavel_Decisao`; o ensaio não altera status e não simula aprovação.
4. Não foi confirmado se o SharePoint rejeita um lookup de usuário inexistente. O ensaio não tenta isso, porque a ferramenta grava somente um lookup atestado.

## 7. O que falta para executar (ações do responsável)

1. **Criar manualmente um item sintético** em Itens_Importados: `Codigo_Item = HOMOLOG-3P-<data>`, `Status_Revisao = PENDENTE`, `Enviado_Historico = NAO`, `Responsavel_Decisao` vazio, sem material aprovado, descrição "HOMOLOG 3P — NÃO USAR". Associe-o a um orçamento sintético ou deixe sem orçamento, e garanta que o n8n não o reprocesse.
2. **Obter o lookup da Pessoa autorizada** por uma fonte humana e verificável. A própria pessoa, logada no navegador, abre `https://<tenant>.sharepoint.com/sites/<site>/_api/web/currentuser?$select=Id` e informa o `Id`. É a mesma pessoa que constará como responsável. Não usar a conta técnica e não deduzir o ID por e-mail ou nome no código.
3. **Autorizar por escrito**: lista Itens_Importados, item `<id>`, campo `Responsavel_Decisao`, valor `<lookup>`.
4. Executar, da pasta `system/apps/operator-web`:
   ```powershell
   node --env-file=.env.local scripts/approver-write-rehearsal.mjs inspect
   node --env-file=.env.local scripts/approver-write-rehearsal.mjs plan --item <id> --person-lookup <n>
   node --env-file=.env.local scripts/approver-write-rehearsal.mjs execute --item <id> --person-lookup <n> --confirm "<frase do plan>" --person-attested
   ```
   Executar `plan` e `execute` em sequência imediata: qualquer mudança no item altera o ETag e invalida a frase.
5. Para reverter, é preciso **nova autorização** para um PATCH que esvazie o campo com o ETag novo, ou que o administrador exclua o item sintético. O histórico de versões e o arquivo de evidência não devem ser apagados.

## 8. Próxima ação para integrar ao fluxo corporativo

Um resultado `PERSISTED_AND_VERIFIED` prova apenas que o Graph grava e devolve `Responsavel_Decisao` com o lookup informado. A aprovação real continua dependendo de:
- uma fonte OID → Pessoa homologada (bloqueio 1 do relatório E2E; `SHAREPOINT_PERSON_RESOLVER` continua desligado);
- Redis durável para auditoria;
- MFA/HTTPS;
- o ensaio completo do §11 do relatório E2E pela interface, com os 7 campos.

A ferramenta não deve ser reaproveitada como rota nem como caminho de aprovação.

## 9. Testes desta execução

| Comando | Resultado |
| --- | --- |
| `npm.cmd test` | **1.457 aprovados, 24 ignorados** (+13 da ferramenta) |
| `npm.cmd run typecheck` / `lint` | exit 0 / exit 0 |
| `approver-write-rehearsal.mjs inspect` (real) | exit 0, somente leitura |
| `plan` real em item não sintético | Bloqueado pelas travas; nenhuma escrita |

Sem commit, push, POST, PATCH ou DELETE em recursos SharePoint.
