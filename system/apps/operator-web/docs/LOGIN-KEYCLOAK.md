# Login alternativo Keycloak — Fase 3

Keycloak fica desativado por padrão. Login Microsoft, Graph técnico e dados de negócio
continuam independentes. Esta fase não associa funcionários ao campo Pessoa SharePoint.

## Arquitetura e identidade

`/api/auth/keycloak/login` -> discovery -> login nativo Keycloak -> Authorization Code
+ PKCE S256 -> callback -> ID token validado por openid-client 6.8.8 -> sessão JWE existente.
A biblioteca verifica state, nonce, issuer, audience (client ID), expiração e assinatura
RS256 com JWKS. `enableNonRepudiationChecks` está explícito; a assinatura não depende
somente da conexão TLS. HTTP é permitido apenas em development/test e loopback.
Nenhum Password Grant é usado pelo portal.

Uma sessão de aplicação e uma transação de login por navegador: os nomes de cookies
existentes são preservados. A audiência JWE e o namespace do registro incluem o
provedor para Keycloak; Microsoft mantém os valores anteriores. O último fluxo de
login iniciado substitui a transação pendente. O callback é consumido uma única vez.
Login válido revoga a sessão anterior antes de substituí-la; callback Keycloak inválido
não apaga a sessão Microsoft existente. O callback fixa redirect_uri na configuração,
aceitando a URL pública configurada ou Host exatamente correspondente quando Next
constrói Request.url com seu hostname interno. Não confia em x-forwarded-host livre.

Identidade Keycloak: `(issuer, subject)`, com comparação exata e sensível a maiúsculas.
E-mail e username não são chaves. Para compatibilidade interna com os contratos do
portal, oid contém JSON `[issuer, subject]` e tenantId contém issuer: NÃO são OID/tenant
Microsoft e nunca são usados para resolver Pessoa nesta fase. Sessões legadas Microsoft
continuam aceitas sem alteração do formato, audiência, namespace ou política MFA Entra.

O cookie contém somente identidade, papéis, validade e identificadores locais de sessão.
Access, refresh e ID tokens são descartados no servidor após validar o login. Não há
tokens em localStorage nem token de provedor no JWE. Cookie HttpOnly, SameSite=Lax,
Secure em HTTPS, sem Domain e com prefixo __Host- em HTTPS. Duração máxima de 15 minutos,
limitada também ao vencimento do ID token. Sem renovação silenciosa: sessão expirada
retorna 401 em API e /login nas páginas. O usuário pode autenticar novamente.

## Papéis e limites da fase

Somente estas client roles EXATAS em `resource_access[KEYCLOAK_CLIENT_ID].roles` do
ID token dão permissões de negócio:

| Client role | Papel do portal | Revisão em mock |
|---|---|---|
| Operador | Operador | Permitida |
| Comprador | Comprador | Permitida |
| Consulta | Consulta | Somente leitura |

Realm roles, roles de outro client, admin, default-roles e nomes em outra capitalização
não concedem acesso. Usuário sem role autorizada é rejeitado. Configure o mapper de
client roles para ID token; sua presença apenas no access token não é suficiente.

Para usuários Keycloak, decisões e correções em `sharepoint` e `operator-api` são
bloqueadas no guard do servidor; a página de revisão também oculta a capacidade de
escrita. Leituras seguem os adapters existentes, sem novas permissões Graph. Até o
vínculo individual da Fase 4, não é seguro tratar um sub Keycloak como Pessoa Microsoft.
O comportamento dos usuários Microsoft e dos adapters existentes é preservado.

## Configuração

```dotenv
KEYCLOAK_ENABLED=false
KEYCLOAK_ISSUER=
KEYCLOAK_CLIENT_ID=
KEYCLOAK_CLIENT_SECRET=
AUTH_APP_ORIGIN=
AUTH_SESSION_SECRET=
```

Habilite apenas no ambiente de homologação autorizado. Nenhuma variável deve usar
NEXT_PUBLIC_. Reutilize AUTH_SESSION_SECRET existente; não a troque para habilitar o
novo provedor, pois isso invalidaria sessões Microsoft. Não configure localhost como
valor de produção. Em produção, tanto portal como issuer exigem HTTPS e hosts externos.
O segredo do client é confidencial e permanece somente no servidor.

No Keycloak, crie um client próprio do portal, OIDC, Client authentication on,
Standard flow on, PKCE S256 obrigatório, Implicit flow off, Direct access grants off,
Service accounts off. Cadastre exatamente:

- Redirect URI: `<origem-do-portal>/api/auth/keycloak/callback`.
- Post logout redirect URI: `<origem-do-portal>/login`.
- Client roles: Operador, Comprador, Consulta; atribua somente as necessárias.
- Mapper User Client Role: client ID do portal, claim
  `resource_access.<client-id-do-portal>.roles`, String, multivalued, Add to ID token on.

Um exemplo de client sem segredos fica em `docs/keycloak-client.example.json`.
Substitua os placeholders no ambiente de destino e gere o segredo pelo console nativo.
Não reutilize o client público da PoC Spring, cuja audience serve a outra finalidade.
O realm de produção deve impor sua política de MFA e ciclo de vida de contas; esta
integração não traduz claims de MFA Microsoft para Keycloak.

## Homologação local, sem tocar serviços existentes

Use Keycloak local da Fase 2.1 e um client confidencial de teste separado. Na validação
real foi usado client 3p-operator-web, callback em http://127.0.0.1:13300 e usuário
poc-ficticio, com client role Consulta e dados mock. As credenciais foram geradas
somente localmente, fora dos arquivos versionados.

Inicie uma instância de desenvolvimento separada, com variáveis somente no processo:
KEYCLOAK_ENABLED=true, issuer local, segredo do client fictício, AUTH_DISABLED=false,
DATA_SOURCE=mock, AUTH_APP_ORIGIN=http://127.0.0.1:13300. Não use credenciais de produção.

```powershell
npm run dev -- --port 13300
```

Abra /login e selecione Entrar com Keycloak. O botão Microsoft continua disponível
quando o registro Entra está configurado. O portal não depende de credenciais Entra
para autenticar via Keycloak. Não mude DATA_SOURCE de uma instância existente apenas
para esse teste; use um processo separado. Não reinicie containers existentes.

## Logout e revogação

O botão Keycloak faz POST à própria aplicação, com verificação exata de Origin e
rejeição de sec-fetch-site cross-site. A sessão é revogada no servidor e o cookie é
apagado antes de navegar ao logout nativo descoberto. O envio via fetch evita forms
externos e preserva a CSP form-action self e os controles existentes. Não flexibiliza
Origin para aceitar null. Sem id_token_hint: Keycloak pode pedir confirmação nativa;
o usuário é redirecionado a /login após confirmar. Nenhum token é colocado na URL.
Se discovery/provedor estiver indisponível após revogação local, retorna para /login;
a indisponibilidade não reativa a sessão local.

Revogação de todas as sessões do funcionário: serviço administrativo confiável pode
usar revokeUserSessions com config Keycloak e identidade keycloakIdentity(issuer, sub).
Para Redis REST HTTPS compartilhado de homologação/produção há uma ferramenta nova:

```powershell
npm run security:revoke-keycloak-user -- '<subject-exato-do-Keycloak>'
```

Ela lê o .env.local do ambiente de destino e incrementa a versão do usuário no mesmo
namespace do registro. O script Microsoft anterior permanece intacto. Desabilitar
uma conta no Keycloak não remove automaticamente o JWE do portal: revogue também
as sessões locais no desligamento ou aguarde o prazo máximo de sessão. Backchannel
logout e refresh não fazem parte desta fase. Redis é obrigatório em produção; memória
continua restrita a development/test. O cache local agora é compartilhado no processo
para sobreviver a instâncias de módulo diferentes de páginas/rotas e HMR do Next.
Não dá persistência entre processos ou reinícios. O contrato Redis existente não mudou.

## Testes e operação

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Os testes novos usam discovery/token/JWKS HTTP locais e JWT RSA assinados reais com
openid-client, sem mockar suas validações criptográficas. Cobrem callbacks, nonce,
state, issuer, audience, assinatura, expiração, papéis, sessões, revogação, isolamento
de provedores, compatibilidade Microsoft e bloqueio de escrita real antes do vínculo.
A suíte existente continua sem alterações. Testes live dependentes de sistemas externos
podem permanecer ignorados; o relatório da execução distingue esses casos.

Não registrar URLs de callback, códigos, JWTs ou segredos em logs/reverse proxies.
Next dev foi configurado para omitir URLs de callback dos dois provedores. Os erros
retornados ao navegador são genéricos; diagnósticos locais imprimem só etapa/categoria.

Reversão: mantenha KEYCLOAK_ENABLED=false e remova a configuração do client desse
ambiente. Não há migrações, alteração de dados ou dependência de auth-service nova.
Nenhuma implantação, commit/push ou integração SharePoint deve ocorrer automaticamente.

## Resultado da homologação da Fase 3

Na execução final, 457 testes passaram e 2 testes live preexistentes foram ignorados
(SharePoint real e Operator API/PostgreSQL real). Typecheck, lint e build passaram.
Os 33 testes novos incluem 32 casos OIDC/sessão e um de persistência do registro local
entre instâncias de módulo em desenvolvimento, com rejeição de memória em produção.

O navegador real, em processo isolado na porta 13300 e dados mock, confirmou login
nativo com usuário fictício Consulta, API 200 após login, API 401 após logout e ao
reapresentar o cookie revogado. Cookie HttpOnly/SameSite=Lax e nenhum item em
localStorage. A expiração natural do cookie também foi verificada após 121 segundos,
com API 401 e redirecionamento da página a /login. HTTPS/Secure e configuração de
produção foram verificados em testes, não em uma implantação HTTPS real.

GO técnico para iniciar a Fase 4 mediante nova autorização. Escritas reais por
Keycloak permanecem bloqueadas; nada foi implantado ou migrado. Não houve login
Microsoft corporativo real nesta homologação: seus testes de regressão passaram e
o redirecionamento ao provedor foi verificado com registro fictício, sem trocar códigos
ou credenciais reais com o Entra. Redis de produção e integrações externas não foram
homologados novamente nesta fase.
