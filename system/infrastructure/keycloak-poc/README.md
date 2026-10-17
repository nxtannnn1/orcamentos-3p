# PoC local: Keycloak + Spring

Somente Fase 2. Sem Next.js, SharePoint ou banco de negócio.

## Arquitetura

Keycloak oficial 26.8.1 em localhost:18080, PostgreSQL 18.6 dedicado sem porta publicada,
rede interna e volume exclusivos. Realm `3p-poc`, cliente público `3p-poc-cli`,
audience `3p-poc-api`. Spring em 127.0.0.1:18081; callback Python em 127.0.0.1:18082.
Versão Keycloak consultada em https://www.keycloak.org/downloads.

PostgreSQL participa somente da rede interna `poc`. Keycloak também participa
da bridge exclusiva `poc_access`, necessária para a publicação em loopback.
No Docker Engine 29.7.2, uma conexão exclusivamente interna aceitou PortBindings,
mas deixou NetworkSettings.Ports vazio e localhost:18080 inacessível. A bridge
adicional corrigiu esse comportamento sem expor PostgreSQL ou remover volumes.

A cadeia Spring cobre somente `/api/poc/keycloak/**` e permite somente GET `/me`.
Está desativada no serviço normal, salvo `app.poc.keycloak.enabled=true`.
Nimbus/Spring valida assinatura RS256, issuer, audience, expiração e nbf quando presente.
Exige exp e sub; tolerância temporal zero. A resposta contém apenas issuer, subject,
username e roles. Roles são informativas nesta fase.

O launcher separado não faz component scan do sistema, não lê application.properties
e não inicializa datasource, Flyway, Graph ou cliente Microsoft. O main padrão Maven
continua sendo o serviço original. A configuração original não precisa ser editada.

## Pré-requisitos e início

Docker Desktop Linux Engine ativo, Compose, Java 21, Python 3, navegador e portas livres
18080/18081/18082. Internet inicial para imagens e dependências.
Comandos PowerShell a partir da raiz do repositório:

```powershell
Set-Location system/infrastructure/keycloak-poc
Copy-Item .env.example .env
# Preencha duas senhas locais fortes e distintas no .env.
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs --tail 50 keycloak
Invoke-RestMethod http://localhost:18080/realms/3p-poc/.well-known/openid-configuration
```

O realm é importado na primeira inicialização. A importação não sobrescreve realm existente.
Não há senhas nem contas corporativas no JSON. `.env` e `backups/` são ignorados pelo Git.

## Usuário fictício

Abra http://localhost:18080/admin com as credenciais bootstrap do .env.
Selecione `3p-poc`, Users, Add user: `poc-ficticio`, nome fictício, Enabled.
Não use e-mail corporativo. Em Credentials defina senha local exclusiva; para a
demonstração, Temporary off. Em Role mapping atribua `Consulta`.
O cliente exige PKCE S256, tem audience explícita e Password Grant desativado.

## Spring isolado e login

Em outro terminal, a partir da raiz:

```powershell
Set-Location system/services/auth-service
.\mvnw.cmd spring-boot:run '-Dstart-class=br.com.trespenergia.poc.KeycloakPocApplication'
```

Não substitui processos existentes. CTRL+C encerra esta execução.
Na pasta `system/infrastructure/keycloak-poc`, execute:

```powershell
python login-test.py
```

O helper abre login nativo, verifica state e troca código com PKCE. Entre como
`poc-ficticio`. O access token fica somente em memória; o helper chama Spring e
exibe HTTP 200 e os quatro campos seguros. Não imprime tokens ou senhas.
É ferramenta local de diagnóstico, não cria sessão nem valida ID token;
o Spring valida o access token. Não reutilizar como cliente de autenticação do portal.

```powershell
curl.exe -i http://127.0.0.1:18081/api/poc/keycloak/me
curl.exe -i -H 'Authorization: Bearer invalido' http://127.0.0.1:18081/api/poc/keycloak/me
```

Ambas chamadas devem retornar 401. Access tokens duram 120 segundos.
Não cole tokens no histórico ou em logs. Para executar no serviço completo local,
configure `app.poc.keycloak.enabled`, `issuer`, `jwk-set-uri` e `audience` sob o mesmo
prefixo; isso exige a configuração normal do serviço e não é necessário aqui.

## Testes

Na pasta auth-service:

```powershell
.\mvnw.cmd test '-Dspring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration'
```

A exclusão vale somente neste comando e evita conexão ao PostgreSQL de negócio.
Sem ela, testes de contexto existentes tentam localhost:5432/Flyway.
Os novos testes usam RSA real e JWKS HTTP local, sem mock do decoder ou bypass `jwt()`.
Cobrem assinatura, expiração, nbf futuro, issuer, audience, sessão Microsoft,
redirect OAuth Microsoft, chave n8n e impedimento de acesso cruzado.
Não comprovam login real Microsoft nem disponibilidade de Graph.

## Encerramento e volume

```powershell
docker compose stop
docker compose start
# Remove containers/rede e preserva volume:
docker compose down
# Somente para apagar definitivamente os dados fictícios desta PoC:
docker compose down --volumes
```

Não use limpeza global Docker. O volume é `sistema-3p-keycloak-poc_keycloak_poc_db`.

## Backup e restauração

Pare Keycloak e mantenha PostgreSQL ativo. Dump contém material sensível: proteja-o.
Realm JSON não substitui backup. Evite redirecionar binários pelo PowerShell.

```powershell
New-Item -ItemType Directory -Force backups
docker compose stop keycloak
docker compose exec -T postgres pg_dump -U keycloak_poc -d keycloak_poc -Fc -f /tmp/poc.dump
docker compose cp postgres:/tmp/poc.dump ./backups/poc.dump
docker compose start keycloak
```

Restaure SOMENTE no banco dedicado desta PoC, após backup do estado atual.
O comando substitui objetos desse banco:

```powershell
docker compose stop keycloak
docker compose cp ./backups/poc.dump postgres:/tmp/poc.dump
docker compose exec -T postgres pg_restore -U keycloak_poc -d keycloak_poc --clean --if-exists --no-owner /tmp/poc.dump
docker compose start keycloak
```

Teste recuperação em ambiente descartável antes de depender do backup.

## Limitações e aceite

HTTP, start-dev e bootstrap administrativo são exclusivos de loopback. Não publicar
na rede externa. Produção exigiria HTTPS, hostname/proxy, segredos, MFA, atualização
e recuperação, fora desta fase. Não habilitar a PoC em produção.
Docker Engine estava indisponível na Fase 2; a Fase 2.1 retomou a validação com
o Engine disponível. Evidências e resultados atuais estão no relatório da Fase 2.1.
Não avançar automaticamente para Next.js.

### Problema preexistente encontrado

Uma chamada MockMvc autenticada por OIDC a `/api/auth/me` retornou HTTP 500:
o parâmetro `OidcUser` do AuthController existente não possui resolução explícita
por `@AuthenticationPrincipal`. O teste unitário existente chama o controller
diretamente e não detecta esse problema HTTP. O controller não foi alterado nesta
PoC. O teste de regressão novo comprova redirecionamento OAuth Microsoft e
reconhecimento da autenticação na política de acesso; não afirma que `/me` funciona.
Esse problema permanece fora do escopo da Fase 2.1. A validação Keycloak não atesta
o funcionamento desse endpoint ou de um login Microsoft real, nem libera produção.

### Validação real da Fase 2.1 — 16/10/2026

Docker Engine 29.7.2 disponível; PostgreSQL dedicado healthy; Keycloak 26.8.1
inicializado, discovery 200 e readiness 200/UP. Login nativo automatizado em navegador
Edge headless com o helper original e Authorization Code + PKCE S256: token real
aceito pelo Spring, HTTP 200 e somente os quatro campos previstos.

Sem token, token malformado, assinatura alterada, audience incorreta, outro realm
e token real após expiração natural: HTTP 401. Fora da PoC: HTTP 403.
59 testes Maven passaram novamente (0 falhas/erros/ignorados), com datasource/Flyway
excluídos apenas no comando. Não houve acesso ao banco de negócio.

Fixtures negativas criadas somente neste Keycloak local: cliente
`3p-poc-wrong-audience` no realm principal e realm `3p-poc-wrong-issuer`, com
usuário fictício. O token do segundo realm tem chave diferente; os testes Java
isolam a validação de issuer usando assinatura confiável. O helper versionado não
foi alterado: o harness de validação variou cliente/destino em memória nos negativos.
Provisionamento das fixtures utilizou admin-cli local; o login do usuário utilizou
Authorization Code + PKCE, com Password Grant desativado nos clientes de teste.

Parecer: GO técnico para iniciar a próxima fase mediante autorização separada.
Não representa liberação de produção nem validação de Graph/Microsoft externos.
Nenhuma correção de `/api/auth/me` foi feita. Os cinco containers preexistentes
mantiveram identidade, saúde e horário de início. O launcher Spring de teste foi
encerrado; Keycloak/PostgreSQL da PoC permanecem ativos para inspeção. Nenhum volume
foi removido, e as credenciais locais permanecem somente no .env ignorado pelo Git.
