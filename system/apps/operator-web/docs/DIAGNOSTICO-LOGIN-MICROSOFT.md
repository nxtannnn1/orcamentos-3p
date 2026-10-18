# Diagnóstico do login Microsoft — 18/10/2026

## Parecer e limites

**GO somente para repetir o login humano local. NO-GO para declarar identidade
Entra → Pessoa SharePoint homologada, escrita ou produção.** As correções foram
testadas com MSAL real e transporte simulado, JWT de fixture com assinatura real,
JWE e registro de sessões reais do código. Não foi executado login humano pela IA.

Branch `infra-lab`, HEAD `c6748407e31363fd70dbde0f8a6b61fd5e9e7e01`, sem commit/push.
AGENTS.md e CLAUDE.md da raiz e do portal foram revisados; nenhuma instrução
ancestral ou local adicional foi encontrada no escopo. As regras existentes foram
preservadas. A documentação local do Next para cookies foi consultada.

## Causas demonstradas e hipóteses pendentes

1. **Nonce ausente na troca MSAL.** O início envia nonce, mas o callback anterior
   chamava `acquireTokenByCode` sem `nonce`. Na versão instalada `@azure/msal-node`
   7.0.0, `ClientApplication.acquireTokenByCode` inclui o nonce esperado no payload
   de validação. `@azure/msal-common/src/response/ResponseHandler.ts` rejeita
   `nonce_mismatch` quando o ID token contém nonce e o esperado não foi fornecido.
   O teste com o SDK instalado e resposta simulada reproduziu essa rejeição sem
   nonce; com `nonce: pending.nonce`, o callback validou assinatura/claims e criou
   uma sessão ativa. Isso explica um caminho determinístico para `LOGIN_FAILED`
   com resposta OIDC normal. Não se recuperou um erro histórico da tentativa humana
   que permita atribuir todos os retornos anteriores exclusivamente a essa causa.
2. **Host do cookie diferente do callback.** Antes da correção, GET de início em
   `127.0.0.1:13300` emitia cookie nesse host e redirect URI em localhost. Cookies
   host-only não atravessam esses hosts. A verificação HTTP real comprovou isso.
   Agora o início local redireciona ao Host configurado antes de emitir cookie.
   A decisão usa Host porque Next dev pode normalizar `Request.url`. O destino
   vem exclusivamente de AUTH_APP_ORIGIN validado, sem retorno arbitrário.
   Produção e configuração Keycloak não foram alteradas.
3. **Diagnóstico insuficiente.** Exceções SDK/JOSE eram convertidas em LOGIN_FAILED
   sem indicar etapa. Cookie expirado/corrompido agora é classificado LOGIN_EXPIRED,
   com categoria interna específica; state incorreto continua bloqueado. Novos
   eventos indicam etapa e razão fixa, sem incluir objeto de erro, stack, códigos
   OAuth, URL, cookies, nonce, tokens, segredos ou identificadores pessoais.

HTTP 307 é redirecionamento normal. Não há evidência de credencial inválida, falta
de perfil ou MFA na tentativa humana. Essas hipóteses permanecem distinguíveis no
novo diagnóstico e não motivaram alterações externas. Os logs locais disponíveis
não continham a exceção histórica; callback URL permanece excluída dos logs Next.

## Ambiente efetivamente observado

O processo ativo na porta 13300 era PID 21144, escuta 127.0.0.1, diretório do portal:

- NODE_ENV development, AUTH_APP_ORIGIN `http://localhost:13300`;
- DATA_SOURCE **mock**, AUTH_DISABLED false, ambos os bypasses false;
- KEYCLOAK_ENABLED false, AUTH_CORPORATE_LOGIN_ENABLED false;
- ENTRA_PERSON_READONLY_PROBE true, resolvedor disabled, correções humanas false;
- as três ENTRA_LOGIN_* presentes e correspondentes ao `.env.local`;
- AUTH_SESSION_SECRET existente e correspondente; não foi gerado/alterado;
- ENTRA_MFA_AUTH_CONTEXT_ID ausente: configuração local já permitida pelo código,
  **sem comprovação de MFA**. Exigências de produção foram preservadas.

Inspeção sanitizada comparou presença/igualdade sem registrar valores. Não havia
as credenciais de login herdadas pelo processo desta atividade. Só `.env.local` e
`.env.example` foram encontrados no portal. `@next/env` mantém valores herdados
antes dos arquivos; depois considera .env.development.local, .env.local,
.env.development e .env. O launcher carrega o ambiente e sobrescreve apenas a
origem localhost e modo corporativo false no filho, como já ajustado pelo usuário.
A inspeção do processo e a resposta HTTP confirmam os valores efetivos relevantes.

Cookies: `3p-login` no HTTP local, TTL 600 s, HttpOnly, SameSite=Lax, Path=/,
sem Domain e Secure=false; em HTTPS usa `__Host-3p-login` e Secure=true.
Sessão mantém JWE A256GCM e registro de revogação, duração máxima 900 s limitada
pelo ID token. Trocar origem, segredo ou reiniciar o store em memória invalida
transações/sessões anteriores; começar novo login após mudança é necessário.
Há uma transação pendente compartilhada: o último início de login vence.

## Alterações desta atividade

Código e testes relativos ao diretório do portal:

- `src/app/api/auth/login/route.ts`: canonicalização local antes do SDK/cookie.
- `src/app/api/auth/callback/route.ts`: passa nonce ao MSAL, classifica transação
  expirada/inválida e produz diagnóstico restrito por etapa.
- `src/server/auth/microsoft-diagnostics.ts`: somente categorias fixas.
- `src/server/auth/flow.test.ts`: transação expirada/corrompida, state divergente,
  falha da troca, sigilo do log e contrato de nonce.
- `src/server/auth/microsoft-msal-flow.test.ts`: regressão do SDK real com transporte
  simulado, localhost/Host normalizado, sessão ativa e negativas de identidade.

Documentação: README da raiz, README do portal, README de auth,
`docs/LOGIN-MICROSOFT.md`, `docs/HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md` e este
relatório. Alterações anteriores de outros arquivos foram preservadas.

## Verificações

Resultados finais: **101/101 testes focados aprovados; suíte completa com 626 testes,
624 aprovados, zero falhas e dois live ignorados. Typecheck e lint aprovados.**
Não somar as suítes, que se sobrepõem. A suíte focada inclui fluxo, SDK, assinatura,
sessão e probe; a completa preserva as regressões
Keycloak, autorização, APIs e fontes existentes. Os testes live não executados
continuam explicitamente ignorados. Testes automatizados não homologam o tenant.

Comandos efetivamente executados no diretório do portal (relatórios no workspace
local da atividade; sem tokens ou credenciais):

```powershell
npm test -- src/server/auth/flow.test.ts src/server/auth/microsoft-msal-flow.test.ts src/server/auth/microsoft.test.ts src/server/auth/session.test.ts src/server/auth/entra-person-probe-session.test.ts src/server/sharepoint/entra-person-readonly-probe.test.ts --reporter=json --outputFile=C:/Users/natan/Documents/Codex/2026-10-16/files-pasted-by-the-user-implementa/work/entra-login-focused.json
npm test -- --reporter=json --outputFile=C:/Users/natan/Documents/Codex/2026-10-16/files-pasted-by-the-user-implementa/work/entra-login-all.json
npm run typecheck
npm run lint -- --ignore-pattern '.next-backup-20261018-113117/**'
```

A exclusão lint preserva somente o backup gerado preexistente; regras não foram
relaxadas. `git diff --check` global aponta uma linha vazia final preexistente no
launcher alterado pelo responsável, que foi preservada. Isso não é falha dos testes
nem motivou alteração fora do escopo.

Os cenários cobrem: localhost e cookie de transação; callback/state válido; cookie
ausente/expirado/inválido; state divergente; troca falha; token inválido/expirado,
issuer/audience/assinatura incorretos; tenant incorreto; papel ausente; MFA
insuficiente quando configurado; nonce incorreto; sessão criada, validada, expirada
e revogada; retorno à raiz. Fixtures usam identidades fictícias. Nenhum token real
ou credencial real foi utilizado nos testes automatizados.

**HTTP real local, sem login humano nem troca de código:**

| Requisição | Resultado |
| --- | --- |
| Início em 127.0.0.1 | 307 para `http://localhost:13300/api/auth/login`, sem Set-Cookie |
| Início em localhost | 307 para Microsoft, callback localhost correto, PKCE S256, nonce/state presentes, response_mode=query |
| Cookie criado | HttpOnly, SameSite=Lax, Path=/, host-only, Secure=false no HTTP local |
| Callback com state fictício divergente | 307 para `/login?error=LOGIN_EXPIRED`; transação removida |

Não se fez navegação até a tela Microsoft nem autenticação do responsável. O
processo existente não foi interrompido; compilação de desenvolvimento aplicou as
mudanças nas rotas observadas. Não houve build de produção/deploy.

## Diagnóstico seguro para nova tentativa

No terminal do portal, somente em caso de falha:

```text
operator-web.microsoft-login { stage: <categoria>, reason: <categoria fixa> }
```

| Etapa/razão | Verificação seguinte |
| --- | --- |
| transaction / COOKIE_MISSING | Usar localhost desde o início; verificar bloqueio de cookie e tentativas paralelas |
| transaction / COOKIE_EXPIRED | Iniciar novo login, concluir em até 10 minutos |
| transaction / COOKIE_INVALID | Iniciar novo login após mudança de origem/segredo; não regenerar segredo |
| transaction / STATE_MISMATCH | Fechar tentativas antigas e iniciar apenas uma; não relaxar state |
| provider / PROVIDER_REJECTED | Conferir resultado no Entra, sem compartilhar URL ou error_description |
| code_exchange / INVALID_CLIENT | Administrador verificar registro/validade/valor da credencial existente, sem exibi-la |
| code_exchange / INVALID_GRANT | Reiniciar fluxo; administrador verificar código, callback e validade no Entra |
| code_exchange / NONCE_MISMATCH | Não prosseguir; conferir transação/SDK, nunca remover nonce |
| token_validation / TOKEN_INVALID | Verificar JWKS, assinatura, issuer, audience, relógio e expiração |
| token_validation / ACCOUNT_NOT_ALLOWED | Verificar tenant, OID, nonce e claim acct=0 de membro; sem fallback por email |
| token_validation / ROLE_REQUIRED | Administrador conferir atribuição explícita de Consulta/Operador/Comprador |
| token_validation / MFA_REQUIRED | Conferir política e contexto configurados; não remover requisito |
| session / SECURITY_STORE_UNAVAILABLE | Diagnosticar registro; não provisionar infraestrutura automaticamente |

Outras falhas permanecem genéricas EXCHANGE_FAILED, SESSION_FAILED etc. Não
inferir uma credencial inválida de LOGIN_FAILED sozinho. A mensagem pública
permanece genérica; detalhes da identidade não são retornados ao navegador.

## Roteiro humano e próximo passo

1. Abrir **http://localhost:13300/login**. Iniciar um único login Microsoft novo,
   sem reutilizar callback ou aba de uma tentativa anterior. O retorno Web informado
   pelo responsável é `http://localhost:13300/api/auth/callback`; não foi alterado no
   Entra pela atividade. Concluir pessoalmente a autenticação.
2. Conferir retorno à raiz, nome/perfil e navegação; atualizar uma página protegida.
   Se falhar, informar somente horário e stage/reason fixos do evento acima. Não
   compartilhar captura com URL de callback, código, cookie, token ou segredo.
3. Nesse processo mock, um probe pós-login pode retornar PROBE_SHAREPOINT_REQUIRED.
   Isso indica fonte inadequada ao ensaio de Pessoa, não falha de login.
4. Para identidade real, o responsável deve encerrar seu processo quando conveniente
   e iniciar o launcher com DATA_SOURCE=sharepoint, AUTH_DISABLED=false, bypasses false,
   probe true, resolvedor disabled e correções false. Preservar segredos e as outras
   configurações. Seguir [o roteiro de leitura](HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md).
   A IA não alterou esse ambiente nem reiniciou o processo.
5. Repetir login e conferir `operator-web.entra-person-probe`: somente VERIFIED
   com sessão Entra humana, nessa fonte real, satisfaz a parte de associação única.
   Registrar apenas probeId, status e horário. NOT_FOUND/AMBIGUOUS exigem análise
   da fonte, sem associação por nome/email ou mudança automática de permissões.

O probe segue funcional nos testes: JWE/registro validados antes da consulta,
sessão ausente/expirada/revogada bloqueada antes de Graph; capacidade somente GET.
O ensaio técnico Graph anterior não foi repetido nem contado como login humano.
Nenhuma escrita SharePoint, ativação de correções, alteração de permissões Entra,
Keycloak, n8n, infraestrutura, Redis, migração, segredo, commit ou push ocorreu.
Produção depende de homologação humana, controles externos MFA/acesso, registro
compartilhado, auditoria e autorizações separadas ainda pendentes.
