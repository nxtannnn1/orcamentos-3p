# Aprovador em campos de texto — 23/10/2026

Base: `infra-lab` em `cfb951f`, com alterações locais não commitadas. Caminhos relativos a `system/apps/operator-web`.
Documento sanitizado: não contém tenant, site, IDs de lista, OID, e-mail real nem token.

**Decisão:** a autoria de aprovações, rejeições e correções deixa de depender da coluna Pessoa `Responsavel_Decisao`.
O portal passa a gravar o nome e o e-mail da sessão Microsoft já autenticada em duas colunas de texto simples.
A fonte de identidade OID → Pessoa (bloqueio 1 do relatório E2E de 22/10) deixa de ser necessária. O próprio
`/permissions` não enxergava usuários que recebem acesso por grupo.

## 1. De onde vem a identidade

| Dado | Origem | Validação |
| --- | --- | --- |
| Nome | Claim `name` do ID token Microsoft, validado no callback (assinatura, emissor, audiência, tenant, nonce, `acct=0` e papéis) | Não vazio, até 255 caracteres e sem caracteres de controle |
| E-mail | Claim `email`. Na ausência dele, `preferred_username` (UPN). Os escopos `openid profile email` já eram pedidos | Sintaxe de caixa postal, até 254 caracteres, convertido para minúsculas |
| OID / tenant | Inalterados (`oid`, `tid`) | O tenant precisa ser igual ao `MICROSOFT_TENANT_ID` da escrita |

Os dados ficam no cookie de sessão cifrado (JWE `dir`/A256GCM, chave só no servidor). As rotas `PATCH /api/itens/{id}/decisao`
e `/correcao` montam o `actor` **somente** a partir da sessão. O corpo da requisição continua com lista fechada de chaves,
então `AprovadoPor`, `EmailAprovador`, `name`, `email` ou `actor` enviados pelo cliente resultam em HTTP 400.

Sessão sem nome ou e-mail válidos: a escrita é recusada com HTTP 401 `APPROVER_IDENTITY_UNAVAILABLE` e a mensagem
"Saia e entre novamente com sua conta Microsoft da 3P. Nenhuma decisão foi gravada." Nenhuma auditoria ou PATCH é enviado.
A interface já desabilita as decisões e mostra o motivo. Sessões abertas antes desta mudança não têm `email` e expiram em até 15 minutos.

O fluxo de login Microsoft não foi alterado: o mesmo token, as mesmas validações e os mesmos escopos. A única mudança é
que um campo a mais é copiado para a sessão.

## 2. Colunas no SharePoint (lista `Itens_Importados`)

Conferido por GET de metadados (somente leitura) em 23/10/2026:

| Campo do prompt | Coluna usada | Tipo | Situação |
| --- | --- | --- | --- |
| Aprovado por | `AprovadoPor` | Texto, uma linha | **Criar** |
| E-mail do aprovador | `EmailAprovador` | Texto, uma linha | **Criar** |
| Data da aprovação | `Data_Decisao` (existente) | Data e hora | Reutilizada; não criar `DataAprovacao` |
| Status | `Status_Revisao` (existente) | Escolha (`APROVADO`/`REJEITADO`/…) | Reutilizada; não criar `StatusAprovacao` |
| (legado) | `Responsavel_Decisao` | Pessoa | **Manter**: deixa de ser escrita e continua lida para registros antigos |
| (mantidos) | `Revisado_Por_Oid`, `Decisao_Id` | Texto | Continuam gravados |

Criar as duas colunas com **nome interno exatamente** `AprovadoPor` e `EmailAprovador`. Se forem criadas pela interface com
outro nome de exibição, confirme o nome interno. Não as marque como obrigatórias (o n8n cria itens sem elas).

Em seguida, acrescente ao objeto `items` de `SHAREPOINT_FIELD_MAP_JSON`, mantendo os demais campos:

```json
"approverName": "AprovadoPor", "approverEmail": "EmailAprovador"
```

`reviewedByPerson` pode permanecer no mapa: ele só é lido, para exibir registros antigos. Sem `approverName`/`approverEmail` no mapa,
ou sem as colunas de texto de uma linha no SharePoint, a escrita falha fechada com `AUDIT_NOT_CONFIGURED` antes de qualquer
auditoria ou PATCH. `SHAREPOINT_PERSON_RESOLVER` deixou de ter efeito.

## 3. Gravação e confirmação

PATCH único com `If-Match` contendo `Status_Revisao`, `Material_AprovadoLookupId`, `Observacao_Item`, `Revisado_Por_Oid`,
`AprovadoPor`, `EmailAprovador`, `Data_Decisao` e `Decisao_Id`. Não envia `Responsavel_DecisaoLookupId`.

O sucesso só é devolvido depois de uma releitura que confere todos esses campos, incluindo nome e e-mail exatos. Divergência
ou ausência resulta em `DECISION_UNCONFIRMED` (503) e a interface mostra o erro e pede releitura. A mensagem de sucesso vem
do item relido e mostra "Registrado por Nome (e-mail)". A auditoria Redis registra `approverName`/`approverEmail` no lugar de `personLookupId`.

Correções de item: o JSON `Correcao_Humana_JSON` passa a ter `approver: { name, email }`. Registros antigos com `personLookupId`
continuam válidos na leitura. Nenhuma coluna nova é necessária para correções.

## 4. Interface

O bloco "Última decisão registrada" mostra Status, Responsável (nome e e-mail), Data (formato pt-BR), Identificador e OID.
Registros anteriores sem os campos de texto mostram "Registro anterior — Pessoa no site: <lookup>".

## 5. Power Automate (candidato de homologação)

`scripts/prepare-homologation.mjs` → `docs/homologacao/flow.definition.candidate.json` e `lists.templates.json`:

- a condição `Validar_valores` exige `AprovadoPor` e `EmailAprovador` não vazios, no lugar de `Responsavel_Decisao/Claims`;
- o snapshot para `Historico_Precos` copia `AprovadoPor` e `EmailAprovador` no lugar de `Aprovador/Claims`;
- os modelos de lista mantêm as colunas Pessoa legadas e acrescentam as de texto.

**Ação no SharePoint/Power Automate real:** se o fluxo de histórico estiver publicado, criar `AprovadoPor` e `EmailAprovador`
(texto) também em `Historico_Precos` e trocar o mapeamento `Aprovador/Claims` pelos dois campos, antes de liberar as decisões.
Caso contrário, o fluxo antigo bloqueará itens aprovados por falta de `Responsavel_Decisao`.

A regeneração do candidato também trouxe para o JSON as etapas `Correcao_validada`/`Extracao_validada`, que já existiam
no gerador, mas não estavam no artefato commitado.

## 6. O que não mudou

- Autorização: papéis Operador/Comprador, bloqueio Keycloak fora do mock, origem, rate limit, ETag, Redis obrigatório,
  `assertDecidable`, orçamento aberto e validação de material.
- `GraphListPersonResolver`, `person-resolver.ts`, o probe de identidade e `scripts/approver-write-rehearsal.mjs` permanecem no
  código e nos testes, sem uso no caminho de escrita. Podem ser removidos depois que a transição for confirmada.
- `.env.local` não foi alterado. Não houve nenhuma escrita em SharePoint, commit ou push.

## 7. Integração com o SharePoint real — verificação de 23/10/2026 (somente leitura)

| Verificação | Resultado |
| --- | --- |
| `AprovadoPor` / `EmailAprovador` em Itens_Importados | Existem com esses nomes internos: texto de uma linha, até 255 caracteres, editáveis, não obrigatórias e não ocultas |
| `Data_Decisao` / `Status_Revisao` | Existentes, reutilizadas (DateTime / Choice com APROVADO e REJEITADO) |
| `.env.local` → `SHAREPOINT_FIELD_MAP_JSON.items` | Já continha `approverName: AprovadoPor` e `approverEmail: EmailAprovador`. Demais chaves preservadas; arquivo sem alteração |
| Validação do código do portal contra o schema real | `verifyDecisionColumns` aprovou o schema real somente com GETs; `Responsavel_Decisao` não está entre as colunas exigidas |
| `Historico_Precos` | Tem apenas `Aprovador` (Pessoa); não tem colunas de texto do aprovador. A lista não está ligada aos workflows principais e o fluxo Power Automate do repositório é só candidato |
| Testes / typecheck / lint / build | 1.469 aprovados, 24 ignorados / OK / OK / `next build` OK |

Ainda impedem o teste real pela interface: `DATA_SOURCE` ausente no `.env.local` (fonte mock), Redis (`SECURITY_REDIS_REST_URL`/`TOKEN`) ausente,
`SHAREPOINT_HUMAN_CORRECTIONS_ENABLED` ausente, nenhum item sintético `HOMOLOG-3P-` disponível e autorização explícita para a escrita.
