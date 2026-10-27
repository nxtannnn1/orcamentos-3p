# Histórico do README do Operator Web (até 23/10/2026)

Registros movidos do [README](../README.md) em 27/10/2026, sem alteração de conteúdo além do ajuste dos links relativos.
Descrevem o estado de cada data e **não** representam o estado vigente; para o estado atual, consulte o
[Status técnico do MVP](../../../../docs/STATUS-TECNICO-MVP.md).

## Consolidação e retomada — 22/10/2026

Estado local consolidado: 1.437 testes aprovados e 24 opt-in ignorados; gateway 37 aprovados/1 ignorado; n8n 14 aprovados; TypeScript, lint e build Next aprovados. Resolvedor explícito isolado, escrita real bloqueada e homologação corporativa pendente. Consulte o [guia de retomada doméstica](RETOMADA_AMBIENTE_DOMESTICO_2026-10-22.md) e o [relatório de evolução](RELATORIO_EVOLUCAO_MVP_SEM_DOCKER_2026-10-22.md). As seções seguintes mantêm os registros históricos de cada rodada.

## Atualização P0 — 22/10/2026

Correções locais de identidade malformada, recusas Graph/paginação, recuperação do lock de correção e bloqueio de orçamento desconhecido foram testadas: 1.409 testes aprovados, 24 opt-in ignorados; TypeScript, lint e build Next aprovados. Metadados das quatro listas e concessão técnica write foram verificados somente por leitura. Os quatro campos de autoria já estão configurados; registros históricos abaixo descrevem o estado de suas respectivas datas.

O resolvedor permanece disabled, correções humanas não estão habilitadas e Redis não está configurado. A fonte parcial de permissões não comprovou o vínculo da sessão humana; ativar flags não resolve essa ausência. Não houve gravação real nem liberação para produção.

Detalhes e procedimento administrativo: [Relatório P0](RELATORIO_CORRECOES_P0_2026-10-22.md). Para manutenção: [Guia de autenticação, SharePoint e validação](GUIA_ESTUDO_AUTENTICACAO_SHAREPOINT_VALIDACAO.md).

Regras funcionais da Fase M: [justificativa de rejeição, candidato de autoria e proposta de reabertura](FASE-M-REGRAS-FUNCIONAIS.md).

Diagnóstico e revisão de persistência em 20/10/2026: [Fase M — evidências e pendências](FASE-M-2026-10-20.md). O schema atual difere do nome Aprovador solicitado; não há liberação de escrita.

Interface operacional do Sistema 3P para revisão humana de materiais importados em orçamentos. Permite consultar fila, abrir orçamento, comparar sugestão com catálogo oficial e registrar aprovação ou rejeição.

O `operator-web` é o frontend com seu BFF (*Backend for Frontend*), não o sistema completo. Entra ID, Graph, SharePoint, Redis, Operator API, PostgreSQL, automações e infraestrutura são dependências externas.

## Funcionalidades e limites

**Implementado em código:** login Microsoft; perfis Consulta/Operador/Comprador; fila e progresso; itens e catálogo; correção humana auditável; escolha humana, aprovação/rejeição/observação; BFF; fontes `mock`, `sharepoint` e `operator-api`; ETag, política de permissão restrita, auditoria; testes de domínio, API, autenticação e segurança. Implementado significa que o fluxo, as validações e os adaptadores existem no repositório; não significa que a escrita foi aceita pelo SharePoint real. O estado e os limites da correção estão em [Etapa M](ETAPA-M.md).

**Provedor alternativo (Fase 3):** Keycloak via OIDC, desativado por padrão. Reutiliza sessão JWE e mantém Microsoft disponível. Login, logout e expiração foram verificados localmente com usuário fictício; escritas reais por Keycloak aguardam o vínculo individual da Fase 4. Veja [Login Keycloak](LOGIN-KEYCLOAK.md).

**Simulado, validado localmente ou pendente:** o mock perde decisões ao reiniciar; testes interceptam Graph e não comprovam o tenant; consultas reais Operator API → PostgreSQL foram validadas localmente em modo somente leitura, não em produção; “Propostas” e “Cesta” aparecem no login, mas não têm fluxo neste módulo; MFA, listas/colunas, Redis, permissões e deploy reais exigem aceite no ambiente.

### Estado da integração real

A escrita no SharePoint está **implementada, mas não validada de ponta a ponta no ambiente real**. No ambiente local examinado, ela permanece bloqueada antes do `PATCH` por dependências que devem ser preparadas e confirmadas:

- Redis REST compartilhado para sessão, limites e auditoria não está configurado;
- na verificação de 22/10/2026, os quatro mapeamentos de autoria (reviewedByPerson, reviewedByOid, reviewedAt e decisionId) já estão configurados localmente, e os campos comparados pelo preflight são compatíveis; a gravação real permanece não homologada;
- a aplicação runtime precisa de `Lists.SelectedOperations.Selected` e concessões mínimas nas três listas; permissões de aplicação amplas são recusadas pela política do código;
- login da pessoa e acesso Graph têm configurações separadas no código, mas o ambiente local examinado aponta ambos para o mesmo Client ID; a separação em registros distintos ainda precisa ser decidida e validada pela TI;
- o contexto e a política MFA efetiva ainda dependem de configuração e comprovação no Entra ID;
- hospedagem, secrets, Redis, listas, concessões e smoke test do deploy continuam dependências de infraestrutura.

Em 18/10/2026, `GET /sites/{site-id}/lists/{list-id}/permissions` em Graph `v1.0` respondeu HTTP 200 no site configurado. O token técnico possui `Lists.SelectedOperations.Selected`, com concessão `write` observada na lista de itens; isso não autoriza o funcionário nem comprova escrita real. A documentação atual também publica esse GET em v1.0. A antiga hipótese de endpoint somente beta não se confirmou neste ambiente.

### Aprovador em campos de texto — 23/10/2026

Decisões e correções passam a registrar o nome e o e-mail da sessão Microsoft nas colunas de texto `AprovadoPor` e `EmailAprovador` (mapa `approverName`/`approverEmail`). Data e status reutilizam `Data_Decisao` e `Status_Revisao`. A coluna Pessoa `Responsavel_Decisao` não é mais escrita e só é lida para registros antigos; `SHAREPOINT_PERSON_RESOLVER` deixou de ter efeito. As colunas ainda precisam ser criadas no SharePoint. Ver [Aprovador em campos de texto](APROVADOR_CAMPOS_TEXTO_2026-10-23.md). As seções abaixo sobre Pessoa são históricas.

### Identidade Entra → Pessoa SharePoint — 18/10/2026

| Estado | Evidência e limite |
| --- | --- |
| Implementado | `GraphListPersonResolver`, com injeção opcional na factory, vinculado ao tenant/site/lista configurados. Usa somente pares V2 `user.id` e `siteUser.id` do mesmo objeto Graph; não usa email ou nome. |
| Testado com mocks | 72 testes focados aprovados: unicidade, ambiguidade, identidade, paginação, falhas e ausência de escrita. |
| Validado em ambiente real | GETs HTTP 200 e resolução única de um par existente na lista configurada, sem registrar IDs pessoais nem executar PATCH/POST/DELETE no SharePoint. Não foi teste com sessão humana autenticada no portal. |
| Ainda não homologado | Integração com sessão Entra real, cobertura dos demais usuários, governança de acesso, Redis, schema/auditoria e escrita. Usuários com acesso apenas por grupo podem não ter par explícito e serão recusados. |
| Liberado para produção | **Não.** Nenhuma escrita real ou ativação do resolvedor foi autorizada nesta entrega. |

`SHAREPOINT_PERSON_RESOLVER=disabled` é o padrão; `graph-list-permissions` é a seleção preparada, **não aplicada** ao ambiente. `.env.local` não foi alterado; `SHAREPOINT_HUMAN_CORRECTIONS_ENABLED` não foi habilitado e o bloqueio Keycloak da Fase 4 permanece. A seleção desse resolvedor não substitui os demais requisitos de escrita.

Validação inicial do resolvedor: 72/72 testes focados e suíte de 588 testes com duas falhas preexistentes, reproduzidas em cópia do HEAD. Esse registro histórico está no [relatório inicial de identidade](RESOLUCAO-IDENTIDADE-SHAREPOINT.md). As duas pendências foram resolvidas na etapa de preparação E2E abaixo; não houve build/deploy.

### Homologação E2E de identidade — preparada, ainda pendente de sessão humana

Foi preparado um instrumento interno, sem endpoint novo, executado pelo guard de página somente após validar a sessão. É restrito a desenvolvimento em loopback, exige sessão `entra`, autenticação normal sem bypass e `DATA_SOURCE=sharepoint`. Usa somente tenant/OID da sessão e site/lista da configuração do servidor. Registra UUID do ensaio, status, marcador de leitura e agora **contadores temporários agregados**; não registra identidade nem concede permissões.

`ENTRA_PERSON_READONLY_PROBE=false` é o padrão. No relato confirmado mais recente do responsável, login Microsoft funciona, `DATA_SOURCE=sharepoint`, leituras de listas funcionam e probe true retorna `PERSON_NOT_FOUND`. A observação anterior de fonte mock é histórica. A nova instrumentação distinguirá consulta completa sem candidato de falha HTTP/rede/resposta/paginação. Nenhuma variável, segredo, permissão ou processo foi alterado nesta atividade.

Estado atual: implementado e testado com fixtures de JWE/registro ativo; login e consultas reais confirmados pelo responsável; **associação humana Entra → Pessoa ainda não homologada**, com PERSON_NOT_FOUND em investigação; produção e escrita bloqueadas. A UI preserva a preferência única por Keycloak fora do modo corporativo, sem chamá-lo de conta corporativa; Microsoft direto permanece disponível. A rota Keycloak retorna 404 quando desativada e 503 quando habilitada, mas indisponível ou incompleta. A correção anterior do nonce MSAL e do host está em [Diagnóstico Microsoft](DIAGNOSTICO-LOGIN-MICROSOFT.md).

Próximo ensaio: atualizar uma página protegida na sessão existente e conferir somente o evento sanitizado `operator-web.entra-person-probe` com `diagnostics`. Não é necessário habilitar o resolvedor na factory nem escrita. Campos, interpretação, testes e remoção da instrumentação estão em [Diagnóstico temporário do probe](DIAGNOSTICO-PROBE-IDENTIDADE.md); o [histórico E2E](HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md) mantém evidências anteriores.

Próxima etapa: homologar o resolvedor somente por leitura com uma sessão Microsoft Entra validada, sem habilitar escrita. Consulte [Arquitetura](ARQUITETURA.md), [Segurança operacional](SEGURANCA-OPERACIONAL.md) e as [instruções para agentes](../../../../AGENTS.md).

