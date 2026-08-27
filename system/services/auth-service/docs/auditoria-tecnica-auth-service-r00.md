# Auditoria Técnica — Auth Service do Sistema de Orçamentos 3P

Data da auditoria: 25/08/2026  
Escopo: revisão somente leitura do serviço Java `auth-service`.

## A. Resumo executivo

O `auth-service` é atualmente um protótipo funcional de gateway seguro entre o n8n, Microsoft Entra ID, Microsoft Graph e SharePoint. Ele mantém dois fluxos independentes:

```text
n8n → X-API-Key → Spring Boot → client_credentials
    → Microsoft Graph → SharePoint / Materiais_Oficiais
```

```text
Usuário → login Microsoft/OIDC → sessão Spring Boot
        → identidade do usuário / Graph /me
```

O núcleo técnico já consegue proteger chamadas do n8n, obter um token de aplicação sem expô-lo e consultar um item da lista configurada como `Materiais_Oficiais`.

O serviço não é uma API completa do Sistema 3P. Ele não processa PDFs, não faz matching, não grava orçamentos, itens ou histórico e não substitui n8n ou Power Apps. Seu uso no MVP deve ser opcional e condicionado a uma necessidade concreta de segurança ou integração.

### Estado físico e Git

No checkout atual `v0`, o diretório do serviço aparece inteiro como não rastreado e não contém mais os fontes `.java`, `pom.xml`, `README.md`, `.env.example` ou `application.properties` originais. Restaram `HELP.md`, `.idea`, diretórios vazios e artefatos compilados em `target`.

O fonte correspondente está preservado no commit WIP `9cfe108` da linha `v0-java`. O comportamento foi reconstruído confrontando:

- bytecode em `target/classes`;
- POM empacotado no JAR;
- configuração compilada;
- relatórios Surefire;
- fonte preservado no commit `9cfe108`.

O build atual precede as alterações posteriores em `pom.xml` e a criação de `record.java`.

## B. Arquitetura atual

```text
                          ┌─────────────────────────────┐
Usuário ─ authorization ─►│ registro OAuth "microsoft" │
                          │ authorization_code + OIDC   │
                          └──────────────┬──────────────┘
                                         │ sessão/JSESSIONID
                                         ▼
                           /api/auth/me
                           /api/integrations/
                              microsoft-graph/me


n8n ─ X-API-Key ─► N8nApiKeyFilter
                         │
                         ├─ comparação em tempo constante
                         ├─ cria ROLE_N8N
                         ▼
                  TechnicalGraphController
                         ▼
                  TechnicalGraphService
                         ▼
                  TechnicalAccessTokenProvider
                         │
                         │ registro "microsoft-service"
                         │ client_credentials
                         ▼
                  OAuth2AuthorizedClientManager
                         ▼
                  Microsoft Entra ID
                         │ access token .default
                         ▼
                  MicrosoftGraphClient
                         ▼
                  Microsoft Graph
                         ▼
                  Site SharePoint /
                  lista Materiais_Oficiais
```

| Componente | Papel | Classificação |
|---|---|---|
| `SecurityConfig` | Rotas, OIDC, sessão, CORS, CSRF e autorização | JÁ ÚTIL |
| `N8nApiKeyFilter` | Autenticação técnica do n8n | JÁ ÚTIL |
| `OAuth2ClientConfig` | Manager de `client_credentials` | JÁ ÚTIL |
| `TechnicalAccessTokenProvider` | Obtém e reutiliza token técnico | JÁ ÚTIL |
| `TechnicalGraphService` | Orquestra acesso técnico ao Graph | JÁ ÚTIL |
| `TechnicalGraphController` | Health técnico e consulta de material | JÁ ÚTIL |
| `MicrosoftGraphClient` | Cliente HTTP do Graph | JÁ ÚTIL |
| `MicrosoftGraphController` | Graph `/me` delegado | EXPERIMENTAL |
| `AuthController` | Identidade mínima da sessão OIDC | EXPERIMENTAL |
| `MicrosoftGraphProperties` | Base URL, site e lista | JÁ ÚTIL |
| `InternalApiProperties` | Carrega a API key do n8n | JÁ ÚTIL |
| `SecurityProperties` | Allowlist de CORS | ÚTIL NO FUTURO |
| Records de resposta | DTOs mínimos | JÁ ÚTIL |
| `record.java` | Record vazio e sem referências | REDUNDANTE |
| `HELP.md` | Documento genérico do Initializr | REDUNDANTE |
| `.idea` | Estado local da IDE | NÃO CONFIRMADO |
| `target` | Build local | REDUNDANTE no repositório |

## C. Endpoints e responsabilidades

| Método e endpoint | Público-alvo | Proteção | Responsabilidade |
|---|---|---|---|
| `GET /oauth2/authorization/microsoft` | Usuário | Início do OAuth2 Login | Redireciona ao login Microsoft |
| `GET /login/oauth2/code/microsoft` | Microsoft/Spring | Callback OAuth2 | Troca o código e cria sessão |
| `GET /api/auth/me` | Usuário | Sessão autenticada | Identidade OIDC mínima |
| `POST /api/auth/logout` | Usuário | Sessão + CSRF | Invalida sessão e `JSESSIONID` |
| `GET /api/integrations/microsoft-graph/me` | Usuário | Sessão OAuth2 | Consulta Graph `/me` com token delegado |
| `GET /api/health/graph` | n8n | `X-API-Key` + `ROLE_N8N` | Obtém token técnico e valida o site |
| `GET /api/materials/{id}` | n8n | `X-API-Key` + `ROLE_N8N` | Lê item da lista de materiais |
| `GET /actuator/health` | Infraestrutura | Público | Health local sem detalhes |
| `GET /actuator/info` | Infraestrutura | Público | Informações do Actuator |
| Qualquer outro | — | `denyAll` | Negado por padrão |

Não existe endpoint que retorne access token, refresh token, client secret ou `N8N_API_KEY`.

## D. Fluxos de autenticação

### Usuário interativo

```text
Usuário
  → GET /oauth2/authorization/microsoft
  → Microsoft Entra ID /authorize
  → login e consentimento
  → callback /login/oauth2/code/microsoft
  → authorization_code
  → sessão Spring/JSESSIONID
  → /api/auth/me
```

Configuração:

- grant `authorization_code`;
- scopes `openid`, `profile`, `email`, `User.Read`;
- provider Microsoft específico do tenant;
- UserInfo `https://graph.microsoft.com/oidc/userinfo`;
- principal pelo claim `sub`;
- redirect URI `{baseUrl}/login/oauth2/code/{registrationId}`.

`AuthController` devolve somente `subject`, `name`, `username` e authorities iniciadas por `ROLE_`.

O endpoint delegado chama:

```http
GET /me?$select=id,displayName,mail,userPrincipalName
```

### Fluxo técnico

```text
TechnicalGraphService
  → TechnicalAccessTokenProvider
  → OAuth2AuthorizedClientManager
  → registrationId "microsoft-service"
  → client_credentials
  → scope https://graph.microsoft.com/.default
  → token de aplicação
```

O principal lógico usado pelo manager é `orcamentos-auth-service`.

### Independência dos fluxos

Os fluxos são realmente independentes:

- o usuário usa o registro `microsoft` e `authorization_code`;
- o backend usa `microsoft-service` e `client_credentials`;
- sessão OIDC não substitui a API key;
- API key não autentica os endpoints de usuário;
- endpoint técnico nunca usa token delegado;
- endpoint interativo nunca usa o client secret técnico.

## E. Integração com Microsoft Graph

Base padrão:

```text
https://graph.microsoft.com/v1.0
```

### Chamadas existentes

Perfil interativo:

```http
GET /me?$select=id,displayName,mail,userPrincipalName
Authorization: Bearer <token delegado>
```

Health técnico:

```http
GET /sites/{SHAREPOINT_SITE_ID}?$select=id
Authorization: Bearer <token de aplicação>
```

Material técnico:

```http
GET /sites/{siteId}/lists/{materialsListId}/items/{id}?$expand=fields
Authorization: Bearer <token de aplicação>
```

Recursos confirmados:

- site indicado por `SHAREPOINT_SITE_ID`;
- lista indicada por `SHAREPOINT_MATERIALS_LIST_ID`;
- documentação identifica essa lista como `Materiais_Oficiais`;
- leitura de item por ID;
- leitura do ID do site para health.

Não há código para `Orcamentos`, `Itens_Importados`, `Historico_Precos`, PDFs, drives ou escrita no SharePoint.

## F. Variáveis de ambiente e segurança

| Variável | Uso | Sensível |
|---|---|---:|
| `MICROSOFT_TENANT_ID` | Tenant Entra ID | Moderado |
| `MICROSOFT_CLIENT_ID` | App interativo | Moderado |
| `MICROSOFT_CLIENT_SECRET` | Secret interativo | Sim |
| `MICROSOFT_SERVICE_CLIENT_ID` | App técnico | Moderado |
| `MICROSOFT_SERVICE_CLIENT_SECRET` | Secret técnico | Sim |
| `N8N_API_KEY` | Autenticação do n8n | Sim |
| `SHAREPOINT_SITE_ID` | Site Graph | Não secreto |
| `SHAREPOINT_MATERIALS_LIST_ID` | Lista Graph | Não secreto |
| `APP_CORS_ALLOWED_ORIGINS` | Origins permitidas | Não |
| `SESSION_COOKIE_SECURE` | Cookie HTTPS; padrão `true` | Não |
| `MICROSOFT_GRAPH_BASE_URL` | Override do Graph | Não |

### Proteções existentes

- autenticação técnica separada;
- API key obrigatória em runtime;
- inicialização falha se a chave estiver vazia;
- comparação com `MessageDigest.isEqual`;
- tokens e secrets não retornam ao cliente;
- `denyAll` para rotas não declaradas;
- somente GET nas rotas técnicas atuais;
- CSRF com cookie token;
- logout invalida sessão;
- cookie `HttpOnly`, `Secure=true` por padrão e SameSite `Lax`;
- CORS com allowlist;
- `401` para APIs em vez de redirecionamento HTML;
- Actuator sem detalhes de health;
- `Cache-Control: no-store` em falha de API key;
- limpeza do `SecurityContext` em `finally`;
- health técnico não usa `/me`.

### Riscos ainda existentes

1. API key estática e única, sem rotação ou expiração.
2. Ausência de rate limiting.
3. `InternalApiProperties.toString()` pode incluir a API key se o objeto for logado.
4. `$expand=fields` devolve todas as colunas do item.
5. Falta tratamento próprio para 404, 403, 429 e 5xx do Graph.
6. Não há timeout ou retry explícito.
7. Propriedades obrigatórias não usam Bean Validation.
8. Login interativo não valida grupo, app role ou tenant claim de autorização.
9. `forward-headers-strategy=framework` depende de proxy confiável.
10. Permissões efetivas do app Entra não estão documentadas no código.

## G. Testes existentes

Existem 8 testes em 4 classes. O último build registrado teve:

```text
Tests: 8
Failures: 0
Errors: 0
Skipped: 0
```

### Cobertura

`OrcamentosAuthServiceApplicationTests` — 4 testes:

- contexto Spring carrega;
- registro técnico usa `client_credentials`;
- scope é Graph `.default`;
- endpoint técnico rejeita falta de API key;
- endpoint técnico aceita API key sem sessão.

`AuthControllerTests` — 1 teste:

- retorna campos mínimos;
- remove authority não iniciada por `ROLE_`.

`MicrosoftGraphControllerTests` — 1 teste:

- entrega token delegado somente ao cliente server-side;
- não retorna o token.

`TechnicalGraphServiceTests` — 2 testes:

- health valida o site e não chama `/me`;
- consulta usa token, site e lista técnicos.

### Lacunas

- login OIDC e callback reais;
- logout, CSRF, CORS e cookies;
- API key incorreta;
- limpeza do contexto de segurança;
- sessão humana tentando endpoint técnico;
- endpoint `/api/materials/{id}` e IDs inválidos;
- erros e throttling do Graph;
- timeouts;
- aquisição real e renovação do token;
- desserialização Graph real;
- validação de configuração;
- ausência de secrets em logs;
- integração controlada com SharePoint.

### Build

- JDK 21;
- Spring Boot 4.1.0;
- versão `0.0.1-SNAPSHOT`;
- último build compilado e testes passaram;
- build não foi reexecutado nesta auditoria;
- `target` não valida as alterações posteriores do POM e `record.java`.

### Dependências possivelmente desnecessárias

- `spring-boot-starter-validation`;
- `spring-boot-starter-validation-test`;
- `spring-boot-starter-actuator-test`;
- partes de `spring-boot-starter-security-test`;
- partes de `spring-boot-starter-security-oauth2-client-test`.

O uso deve ser confirmado antes de remover dependências.

## H. Código morto e arquivos temporários

### `record.java`

```java
public record record() {
}
```

É redundante:

- nome fora da convenção Java;
- nenhum campo;
- nenhuma referência;
- não aparece no build compilado;
- foi adicionado depois do último build.

### Alteração do `pom.xml`

O commit WIP adicionou `maven-compiler-plugin` com `--enable-preview`.

Essa configuração parece experimental e desnecessária porque:

- Java 21 já está definido em `java.version`;
- records não são preview em Java 21;
- não há recurso preview no serviço;
- o JAR compilado usa o POM anterior, sem esse plugin.

### Outros artefatos

- `target`: build local;
- `.idea/workspace.xml`: estado local da IDE;
- `HELP.md`: documentação genérica;
- diretórios `src` vazios no checkout atual.

## I. Riscos técnicos

### Altos

- checkout atual não é reproduzível;
- fonte e POM estão ausentes fisicamente;
- API key estática sem rotação;
- retorno indiscriminado de campos Graph;
- falta de timeout e throttling;
- build compilado não corresponde ao último WIP.

### Médios

- autorização interativa sem grupos/app roles;
- risco de logging de properties sensíveis;
- erros Graph sem contrato estável;
- health externo a cada chamada;
- ausência de auditoria e correlation IDs;
- client secret em vez de certificado ou Managed Identity.

### Baixos

- DTO de material sem tipagem;
- health como string;
- ausência de OpenAPI;
- metadados vazios no POM.

## J. O que o serviço resolve hoje

- separa o segredo do Graph do n8n;
- não entrega access token ao n8n;
- centraliza `client_credentials`;
- autentica n8n por API key;
- comprova acesso ao site;
- lê um material específico;
- mantém login humano separado;
- oferece identidade mínima da sessão;
- impede que sessão humana substitua a API key técnica.

## K. O que ele ainda não resolve

- autenticação do Power Apps;
- autorização por grupos empresariais;
- escrita em Lists;
- operações com orçamentos, itens e histórico;
- matching ou ingestão de PDFs;
- busca de catálogo;
- idempotência;
- auditoria de alterações;
- rotação de credenciais;
- rate limiting;
- resiliência Graph;
- implantação e gestão de secrets;
- integração real comprovada com n8n.

## L. Papel recomendado no MVP

O serviço não deve ser obrigatório no MVP.

Ele deve entrar somente se houver necessidade concreta de:

- retirar credenciais Graph do n8n;
- impor uma fronteira de segurança;
- centralizar integração que o n8n não consiga manter com segurança;
- oferecer login Microsoft a uma interface web própria.

Não deve receber matching, regras de aprovação, lógica do Power Apps ou indicadores.

## M. Papel recomendado no futuro

```text
n8n / aplicações internas
    → autenticação técnica
    → API Java
    → políticas e validações
    → Microsoft Graph / APIs externas
```

Responsabilidades futuras plausíveis:

- autenticação técnica robusta;
- certificado ou Managed Identity;
- contratos de API estáveis;
- filtragem de campos;
- validação referencial;
- idempotência;
- auditoria;
- rate limiting;
- retries e tratamento de throttling;
- autorização por grupos ou app roles.

## N. Próximas 5 ações

1. Regularizar a fonte de verdade e manter fonte, POM, README e testes reproduzíveis na branch apropriada.
2. Remover futuramente `record.java` e `--enable-preview`, salvo requisito real.
3. Confirmar se o n8n realmente consumirá `/api/materials/{id}` no MVP.
4. Antes de produção, adicionar DTO com allowlist, timeouts, erros Graph, rate limiting e rotação da API key.
5. Ampliar testes de segurança e integração com Entra ID, Graph e SharePoint.

---

Auditoria concluída sem alteração de código-fonte ou do Git.
