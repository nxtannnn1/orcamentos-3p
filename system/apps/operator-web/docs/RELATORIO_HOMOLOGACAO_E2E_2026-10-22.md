# Relatório de homologação E2E — identidade, Redis e escrita controlada — 22/10/2026

Continuação de [RELATORIO_CORRECOES_P0_2026-10-22.md](RELATORIO_CORRECOES_P0_2026-10-22.md).
Caminhos de código relativos a `system/apps/operator-web`. Exemplos e evidências sanitizados:
nenhum tenant, client, site, list, item, OID, lookup, token ou cookie aparece neste documento.

**Parecer:** nenhuma das quatro frentes pôde ser homologada nesta execução. As consultas reais
somente de leitura confirmaram o estado Graph; os bloqueios restantes são externos ao código
(sessão humana, fonte de identidade, virtualização/Redis, autorização de escrita). Nenhuma
alteração de código foi feita, porque a inspeção não encontrou defeito local que a justificasse.
Sem commit, push, POST/PATCH/DELETE no SharePoint ou mudança de permissões.

## 1. Estado inicial encontrado

| Item | Constatação |
| --- | --- |
| Checkout / branch | `Documents/meuSistema/orcamentos-3p`, `infra-lab`, HEAD `3a04bc2` |
| Alterações do Codex | 9 modificados + 4 novos (13), não commitados — preservados intactos |
| Backup prévio | Patch e cópia dos novos fora do repositório: `Documents/meuSistema/backups/codex-p0-2026-10-22/` |
| `.env.local` (somente nomes/flags) | `DATA_SOURCE=mock`; `ENTRA_PERSON_READONLY_PROBE=true`; `SHAREPOINT_PERSON_RESOLVER` ausente (⇒ `disabled`); `SHAREPOINT_HUMAN_CORRECTIONS_ENABLED` ausente; `SECURITY_REDIS_REST_*` ausentes; `ENTRA_MFA_AUTH_CONTEXT_ID` vazia; origem `http://localhost`; bypasses `false` |
| Suíte inicial | 1.409 aprovados / 24 opt-in ignorados — reproduz o relatório do Codex |
| Docker nesta máquina | Docker Desktop 4.75 instalado; engine não inicia (ver §4) |

Observação: `DATA_SOURCE=mock` difere do estado de 18/10 (probe com `sharepoint`). O ensaio de
identidade exige `sharepoint`; a troca é do responsável, não foi feita aqui.

## 2. Documentos analisados

Relatório P0 e guia de estudo de 22/10 (integrais); `DIAGNOSTICO-PROBE-IDENTIDADE.md`;
`HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md` (estrutura); `homologacao/ROTEIRO-JKL.md`;
`homologacao/manifest.json`; `system/infrastructure/redis-lab/README.md`; `data-source/README.md`.
Código confrontado: `server/auth/microsoft.ts`, `auth/configuration.ts`,
`sharepoint/graph-list-person-resolver.ts`, `sharepoint/person-resolver.ts`,
`data-source/operator-repository-factory.ts`, `data-source/decision-availability.ts`,
`security/store.ts`, `security/session-registry.ts`, `security/rate-limit.ts`, `security/scripts.ts`,
`sharepoint/item-correction-service.ts`, `sharepoint/sharepoint-operator-repository.ts`,
`scripts/sharepoint-preflight.mjs`, gates dos testes opt-in.

## 3. Diagnóstico de identidade (Fase A)

**O que já funciona (confirmado no código):** `claimsToUser` exige `tid` do tenant, `nonce`,
`oid` não vazio, conta corporativa (`acct=0`) e ao menos um perfil `Operador`, `Comprador` ou
`Consulta`; MFA via claim `acrs` **somente se** `ENTRA_MFA_AUTH_CONTEXT_ID` estiver definida.
O token é validado RS256 com issuer/audience/JWKS do tenant. A sessão dura no máximo 900 s
e é registrada no Redis (`session-registry.ts`). Escrita exige `Operador` ou `Comprador`.

**Por que o vínculo Pessoa falha — causa estrutural:**
`GraphListPersonResolver` lê `GET /sites/{site}/lists/{lista}/permissions` e só aceita
`grantedToV2/grantedToIdentitiesV2` com `user.id` = OID da sessão e `siteUser.id` no mesmo
objeto. Esse endpoint devolve **concessões explícitas no recurso**. Usuários que acessam pelos
grupos do site (Proprietários/Membros/Visitantes) aparecem como grupo, não como `user.id`.
O probe real de 18/10 leu a fonte inteira (8 registros, `scanCompleted=true`) com zero
correspondências: resultado coerente com essa limitação, não com ausência da pessoa.

**Consequência:** ativar `SHAREPOINT_PERSON_RESOLVER=graph-list-permissions` não resolve o caso
comum. Opções, todas dependentes de decisão/autorização — nenhuma foi implementada:

| Opção | Como comprova o vínculo | Dependência | Observação |
| --- | --- | --- | --- |
| A. Concessão explícita por operador na lista | O próprio par V2 passa a existir na fonte atual | TI concede permissão individual na lista | Funciona com o código atual, mas a regra do projeto proíbe conceder acesso só para o resolvedor funcionar; exige decisão formal de governança |
| B. Consulta delegada do próprio usuário ao SharePoint (usuário atual do site) | A sessão do próprio operador obtém seu ID local, sem busca por email/nome | Escopo delegado SharePoint no registro de login + consentimento da TI; novo adaptador | Não verificado nesta execução; pessoa que nunca acessou o site pode não ter ID local (criá-lo é escrita) |
| C. Lista administrativa de vínculos (OID → Pessoa) mantida pela TI | Fonte autoritativa explícita | Criar lista/colunas e processo de manutenção; novo adaptador | Mais rastreável; custo operacional de manutenção |

Fallback por email/nome/UPN continua **proibido**. Recomendação: decidir entre B e C com a TI;
A só se a governança aceitar concessões individuais.

**MFA:** sem `ENTRA_MFA_AUTH_CONTEXT_ID`, a aplicação não exige MFA por conta própria; pode
haver Acesso Condicional no tenant, não verificável sem acesso administrativo.

**Critério de aceite da Fase A — não atingido.** Exige sessão humana real (a IA não faz login)
e uma fonte que contenha o vínculo.

## 4. Diagnóstico Redis (Fase B)

**Cliente:** `security/store.ts`, protocolo REST: `POST /` com corpo JSON `[comando, ...args]`,
`Authorization: Bearer`, HTTPS obrigatório, URL sem credenciais/query/path, timeout 5 s,
`redirect: "error"`, sem retry. Falha ⇒ `SECURITY_STORE_UNAVAILABLE` (503), fechado.
Sem as variáveis, `production` recusa e `development/test` usa memória de processo (não durável).

**Variáveis:** `SECURITY_REDIS_REST_URL`, `SECURITY_REDIS_REST_TOKEN` (ambas ausentes).

**Consumidores e chaves (todas sem TTL, exceto sessão e rate limit):**

| Uso | Operação | TTL |
| --- | --- | --- |
| Sessão | `SET … EX ≤900 NX`; versão do usuário via `INCR` (revogação) | sessão: sim |
| Rate limit | `EVAL` Lua fixo `INCR` + `EXPIRE 120` | sim |
| Decisão | `…:intent` NX antes do PATCH; `…:outcome` NX; `…:reconciled` NX | não (append-only) |
| Correção | `:intent`, evidência original, lock `…:item:<id>:pending` (NX); liberação por CAS Lua exato | não — por desenho |

Locks de correção não expiram: liberar por tempo um lock de resultado incerto permitiria outra
correção sem reconciliação. Portanto o Redis precisa de **persistência AOF** e
**`maxmemory-policy noeviction`**; despejo apagaria locks/evidências silenciosamente. Chaves
de auditoria crescem indefinidamente — política de retenção/arquivamento é pendência.

**Gateway do projeto** (`system/infrastructure/redis-lab/gateway`): allowlist de comandos
(GET, SET NX/EX, DEL/INCR fora dos namespaces duráveis, dois EVAL com bytes exatos), recusa
FLUSH/CONFIG/KEYS/SCAN e scripts arbitrários, token em tempo constante, 503 sem repetir mutação.

**Bloqueio nesta máquina:** o log do Docker Desktop registra
`engine linux/wsl failed to start: checking preconditions: Virtual Machine Platform not enabled —
No virtualization available`. O Windows 11 Home exige WSL2; WSL não está instalado.
Habilitar requer administrador e reinicialização — não executado. O Docker Desktop iniciado
para o diagnóstico foi encerrado. As dependências do gateway não estão instaladas aqui;
o laboratório R1/R2 documentado foi executado em outro computador.

**Critério de aceite da Fase B — parcialmente evidenciado.** Testes locais de contrato e
semântica passaram (§8). Redis real, falha de conexão real, repetição e recuperação após
reinício **não** foram executados nesta máquina.

## 5. Estado das permissões Graph (Fase C — leitura real de hoje)

`node --env-file=.env.local scripts/sharepoint-preflight.mjs --live --discover-history` — saída 0:

| Verificação | Resultado |
| --- | --- |
| Token técnico (client_credentials) | adquirido |
| Roles da aplicação | somente `Lists.SelectedOperations.Selected` (sem permissão ampla) |
| Política de escrita | `OTHER_WRITE_PREREQUISITES_STILL_REQUIRED` (não bloqueada por permissão ampla) |
| Concessão de escrita em Itens_Importados | `WRITE_GRANT_PRESENT_NOT_EXERCISED` |
| Materiais / Orçamentos / Itens / Histórico | `READ_OK`; 4/4, 5/5, **21/21**, 20/20 colunas comparadas compatíveis |
| Login | falta `ENTRA_MFA_AUTH_CONTEXT_ID`; origem não HTTPS; bypass desligado; Redis ausente |
| Resolução de Pessoa | `BLOCKED_NO_AUTHORIZED_IDENTITY_SOURCE` (status estático do utilitário) |

Campos gravados pela decisão (lista explícita em `saveItemDecision`): `Material_AprovadoLookupId`,
`Status_Revisao`, `Observacao_Item`, `Revisado_Por_Oid`, `Responsavel_DecisaoLookupId`,
`Data_Decisao`, `Decisao_Id` — com `If-Match` da versão lida. `Material_Sugerido_Ref` nunca
entra no PATCH. Pré-condições no servidor: item decidível e não enviado ao histórico,
orçamento com status bruto PENDENTE/EM_REVISAO/CORRIGIR, Pessoa resolvida, colunas verificadas,
intenção gravada no Redis **antes** do PATCH, releitura que confere todos os campos.

Permissões da **sessão humana** não participam da escrita: o PATCH usa o token técnico; a
sessão define autor e perfil. Limite do utilitário: a checagem de concessão lê só a primeira
página de `/permissions` (falso negativo possível, nunca falso positivo); o transporte de
produção já percorre todas as páginas.

## 6. Arquivos alterados nesta execução

| Arquivo | Alteração |
| --- | --- |
| `docs/RELATORIO_HOMOLOGACAO_E2E_2026-10-22.md` | Novo — este relatório |
| `docs/GUIA_ESTUDO_AUTENTICACAO_SHAREPOINT_VALIDACAO.md` | Seção 9 acrescentada (confirmações de hoje) |

Nenhum arquivo de código, teste, configuração, `.env*`, lockfile ou workflow alterado.

## 7. Correções implementadas

Nenhuma correção de código. Itens examinados e considerados corretos: validação de claims,
guards de escrita sem Redis (`AUDIT_NOT_CONFIGURED` antes de qualquer PATCH), guard de
correções, CAS, intenção antes do PATCH, releitura pós-gravação, fail-closed do cliente REST.
Não foi encontrado defeito reproduzível que justificasse mudança; alterações especulativas
foram evitadas por escopo.

## 8. Testes executados

| Categoria | Comando | Resultado |
| --- | --- | --- |
| Mocks / unitários | `npm.cmd test` (portal) | **1.409 aprovados, 24 ignorados**; 60 arquivos aprovados, 4 ignorados |
| Mocks / unitários | `node --test system/infrastructure/redis-lab/gateway/gateway.test.mjs` | **37 aprovados, 1 ignorado** (o ignorado exige Redis real) |
| Integridade local | `node --test scripts/n8n/workflow-integrity.test.mjs` | **14/14** |
| Integridade local | `node scripts/n8n/validate-workflows.mjs` | 0 erros, 22 avisos (preexistentes) |
| Estático | `npm.cmd run typecheck` / `lint` / `build` | saída 0 / 0 / 0 (Next 16.3.8) |
| Consulta real somente leitura | `sharepoint-preflight.mjs --live --discover-history` | saída 0; §5 |
| Escrita real autorizada | — | **nenhuma** |
| Não executados (dependência externa) | `redis-lab.integration.test.ts` (`THREEP_REDIS_INTEGRATION=1`), `redis-resilience-http.integration.test.ts` (`THREEP_RESILIENCE=1`), `gateway/run-real-tests.mjs`, `test-operational-persistence.mjs` | exigem Docker/Redis — virtualização indisponível |
| Não executados (dependência externa) | `sharepoint-live-read.test.ts` (`RUN_SHAREPOINT_READ_CHECK`), `operator-api-live.test.ts` | fora do escopo de hoje / PostgreSQL fora do MVP |
| Não executado | probe de identidade com sessão humana | exige login pessoal do responsável |

Os testes de identidade, autorização, paginação Graph, erros, concorrência, idempotência,
correções, aprovação e recuperação estão contidos na suíte de mocks acima; **não** constituem
homologação corporativa.

## 9. Evidências de funcionamento

- Suíte, gateway, n8n, typecheck, lint e build: saídas registradas no §8.
- Preflight real: token técnico com permissão mínima, 50/50 colunas compatíveis, concessão
  de escrita presente e não exercida.
- `git status` após o build: apenas os 13 arquivos do Codex + os 2 documentos desta execução.

## 10. Bloqueios administrativos

| # | Bloqueio | Causa | Componente | Local? | Depende de |
| --- | --- | --- | --- | --- | --- |
| 1 | Vínculo Entra → Pessoa | Fonte `/permissions` só lista concessões explícitas | `GraphListPersonResolver` | Não sem decisão de fonte | Responsável + TI (opção A/B/C, §3) |
| 2 | Sessão humana para o probe | IA não faz login | Probe somente leitura | Não | Responsável |
| 3 | Redis durável | Sem serviço configurado; Docker sem virtualização nesta máquina | `security/store.ts`, correções, decisões, sessões | Parcial (lab) | Responsável (WSL2) ou TI (Redis de homologação) |
| 4 | MFA exigida pela aplicação | `ENTRA_MFA_AUTH_CONTEXT_ID` vazia | Login | Configuração | TI (contexto de autenticação no Entra) |
| 5 | HTTPS da origem | Origem local HTTP | Cookies Secure, callback | Configuração | Ambiente de homologação |
| 6 | Escrita real | Exige item isolado e autorização explícita | PATCH Graph | Não | Responsável |
| 7 | n8n publicado | Não comparado com JSON versionado | Ingestão | Não | Acesso ao n8n |

## 11. Plano de escrita controlada (preparado, NÃO executado)

**Pré-condições obrigatórias:** bloqueios 1, 3 e 6 resolvidos; Redis de homologação com AOF
e `noeviction`; sessão humana com perfil `Operador`; `DATA_SOURCE=sharepoint`;
`SHAREPOINT_PERSON_RESOLVER` apontando para a fonte homologada.

**Alvo — preferência 1:** site e listas de homologação já previstos em `homologacao/manifest.json`
(estado atual `NOT_CREATED_NOT_IMPORTED`). **Preferência 2**, se a TI só permitir as listas atuais:
um orçamento sintético identificado como “HOMOLOG 3P — NÃO USAR” com status `EM_REVISAO` e
**um** item sintético `Status_Revisao=PENDENTE`, `Enviado_Historico=NAO`, criados manualmente
por quem tem autorização, com n8n impedido de reprocessá-lo durante o ensaio. Os IDs reais
ficam apenas em arquivo local de evidências fora do Git.

**Passos:**
1. Ler e guardar localmente: campos do item, ETag, versão do SharePoint, estado do orçamento.
2. Pela interface, com a sessão real, aprovar o item com um material oficial e observação
   “ensaio homologação”. Esperado: PATCH único dos 7 campos do §5 com `If-Match`.
3. Validar por releitura: `Status_Revisao=APROVADO`; `Responsavel_Decisao` = Pessoa esperada;
   `Revisado_Por_Oid` = OID da sessão (conferir sem registrar o valor); `Decisao_Id` = UUID
   da tela; `Data_Decisao` coerente; ETag novo; no Redis, `:intent` e `:outcome=confirmed`.
4. Negativos sem nova gravação: repetir com ETag antigo (409); repetir a mesma decisão;
   orçamento fechado (409 `BUDGET_CLOSED`).
5. Opcional, com nova autorização: correção humana com UUID, CAS e reconciliação.

**Recuperação:** o PATCH sobrescreve `Observacao_Item` e o material aprovado; os valores
originais do passo 1 são a fonte da reversão. Reverter exige um segundo PATCH autorizado com
o ETag novo, ou a exclusão do item sintético pelo administrador. O histórico de versões do
SharePoint e as chaves Redis (append-only) permanecem como evidência — não apagar.

## 12. Pendências do MVP

- [ ] Decidir e homologar a fonte de vínculo Pessoa (§3).
- [ ] Redis de homologação durável; executar testes opt-in e ensaio de persistência.
- [ ] Contexto MFA, origem HTTPS e callback do ambiente de homologação.
- [ ] Escrita controlada (§11), depois E2E n8n → SharePoint → portal → decisão → histórico.
- [ ] Política de retenção das chaves de auditoria no Redis.
- [ ] Remover a instrumentação temporária do probe após concluir a Fase A
      (procedimento em `DIAGNOSTICO-PROBE-IDENTIDADE.md`).
- [ ] Opcional: paginação de `/permissions` no `sharepoint-preflight.mjs`.

## 13. Próximo passo recomendado

Decidir com a TI a fonte de identidade (opção B ou C do §3). É o único bloqueio sem caminho
técnico pronto e condiciona a Fase C. Em paralelo, escolher onde rodar o Redis:
habilitar WSL2 nesta máquina para repetir o laboratório (admin + reinício), ou receber da TI
um endpoint de homologação no protocolo do gateway. Só então solicitar a autorização do §11.


Nota da consolidação: o roteiro acima foi corrigido para exigir Enviado_Historico=NAO, conforme o guard atual. Campo vazio/ausente não autoriza escrita. Não houve novo ensaio corporativo.
