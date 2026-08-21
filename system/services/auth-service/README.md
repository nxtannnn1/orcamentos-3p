# Orçamentos Auth Service

Backend server-to-server do Sistema de Orçamentos 3P. O fluxo principal é:

```text
n8n → Spring Boot → Microsoft Graph/SharePoint
```

O serviço mantém credenciais e tokens somente em runtime. O login interativo OAuth 2.0/OpenID Connect existente é preservado em um fluxo separado.

## Requisitos

- JDK 21
- Maven Wrapper incluído
- Aplicação técnica no Microsoft Entra ID com permissões de aplicação mínimas para ler o site e a lista
- Aplicação interativa no Entra ID, caso o fluxo de login delegado seja utilizado

## Variáveis de ambiente

Fluxo interativo:

- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `APP_CORS_ALLOWED_ORIGINS`

Fluxo técnico e n8n:

- `MICROSOFT_SERVICE_CLIENT_ID`
- `MICROSOFT_SERVICE_CLIENT_SECRET`
- `N8N_API_KEY`
- `SHAREPOINT_SITE_ID`
- `SHAREPOINT_MATERIALS_LIST_ID`

Os secrets e a API key devem ser injetados por cofre ou variáveis protegidas. O serviço não possui endpoint que retorne access token, refresh token, client secret ou API key.

## Endpoints e autenticação

Autenticação interativa de usuário:

- `GET /oauth2/authorization/microsoft`: inicia o login OIDC.
- `GET /api/auth/me`: retorna dados mínimos da sessão.
- `POST /api/auth/logout`: encerra a sessão e exige CSRF.
- `GET /api/integrations/microsoft-graph/me`: usa o token delegado do usuário. É mantido apenas para o fluxo interativo.

Autenticação interna do n8n e autenticação técnica Graph:

- `GET /api/health/graph`: exige `X-API-Key`; obtém internamente um token `client_credentials` e valida acesso ao site configurado, sem usar `/me`.
- `GET /api/materials/{id}`: exige `X-API-Key`; obtém internamente um token `client_credentials` e lê o item na lista configurada como `Materiais_Oficiais`.

O registro técnico usa o scope `https://graph.microsoft.com/.default`. Uma sessão interativa não substitui a API key nesses endpoints.

Endpoint público operacional:

- `GET /actuator/health`: health check local sem detalhes sensíveis.

## Execução com JDK 21

```powershell
$env:JAVA_HOME='C:\Users\NATAN\Documents\Temurin'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\mvnw.cmd spring-boot:run
```

## Build e testes

```powershell
.\mvnw.cmd clean verify
```

Este serviço não modifica n8n, SharePoint, Lists, Power Apps ou Power Automate e não executa matching de materiais.
