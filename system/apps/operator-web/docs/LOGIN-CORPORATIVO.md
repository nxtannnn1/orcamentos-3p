# Entrada corporativa única — implementação local e homologação pendente

Atualização de contrato da interface: fora do modo corporativo, o HEAD atual
prioriza apenas Keycloak quando configurado; Microsoft aparece quando Keycloak
não está configurado. A rota Microsoft direta permanece disponível para recuperação
e para o [ensaio Entra → Pessoa](HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md).
Essa preferência visual não homologa origem corporativa nem ativa o modo corporativo.

## Estado desta entrega

Modo desligado por padrão. Foram alterados somente arquivos locais do portal.
Nenhum registro Entra, provider, browser flow, mapper, usuário, role, container,
banco ou infraestrutura foi modificado. Não houve login humano pela IA, commit,
push ou deploy nesta atividade. O login Microsoft relatado pelo responsável não
constitui homologação completa do broker, MFA, acesso restrito ou logout federado.

O modo não deve ser declarado seguro/concluído antes de aprovar e testar as
políticas externas abaixo. O processo local existente não foi reiniciado nem
recebeu as novas variáveis. O contrato de escrita real da Fase 4 não foi modificado.

## Diagnóstico da interface e das rotas

| Local | Comportamento |
|---|---|
| `/login` | Usa LoginActions: um botão corporativo quando o modo está habilitado; fora dele, preferência única por Keycloak configurado e Microsoft como alternativa quando Keycloak não está configurado. |
| `/` | Exige requirePageSession; renderiza fila, sem botões independentes de login. |
| Cabeçalho | Marca remete a `/login` se anônimo. Autenticado exibe identidade e Sair, escolhido pelo authMode da sessão, não pelo modo da interface. |
| Layout/proxy | Cabeçalho compartilhado; proxy define CSP, não autoriza usuário. Guards de página e API continuam responsáveis pelo acesso. |
| `/api/auth/keycloak/login` | OIDC/PKCE existente, com kc_idp_hint fixado pelo servidor no modo corporativo. |
| Callback Keycloak | Mantém state, nonce, assinatura, issuer, audience e expiração. Vincula a política à transação e valida origem corporativa antes de emitir JWE. |
| `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout` | Implementação Microsoft original preservada, inclusive MFA, para compatibilidade/recuperação. Não aparecem como opção duplicada na UI corporativa. |
| Keycloak logout | Revoga sessão local primeiro; depois devolve endpoint SSO descoberto, sem guardar token do provedor. |

Leitura administrativa do Keycloak local: realm 3p-poc, provider oidc habilitado,
issuer/authorize/token/JWKS específicos do tenant configurado, validateSignature
e useJwksUrl habilitados. O realm usa browser flow `browser`, autorregistro está
desabilitado. O cliente 3p-operator-web possui mapper de client roles no ID token,
mas nenhum mapper de identity_provider foi encontrado no cliente ou nos scopes
padrão atribuídos. Esses dados foram obtidos por GET, sem expor credenciais.
O cliente não tem override de browser flow e não foram encontrados papéis de
negócio do client dentro da role padrão do realm. Não foram encontrados parâmetros
explícitos de filtro de claim de membros/convidados no provider inspecionado.

O fluxo padrão não comprova exclusividade Microsoft para o cliente. Não foram
verificadas políticas administrativas Entra de atribuição, membros/convidados,
MFA ou a semântica completa do first-broker-login. Ausência de um campo de config
não foi interpretada como aprovação de uma política padrão.

## Configuração local preparada

```dotenv
AUTH_CORPORATE_LOGIN_ENABLED=false
KEYCLOAK_CORPORATE_IDP_ALIAS=
```

Após autorização e homologação externa, o alias pode ser `oidc`, conforme o
provider inspecionado. Não há alias padrão implícito. O modo exige KEYCLOAK_ENABLED=true
e a configuração Keycloak existente completa. Não alterar AUTH_SESSION_SECRET.
Não habilitar AUTH_DISABLED ou qualquer bypass local junto do modo corporativo.

Com o modo habilitado, `/login` apresenta somente **Entrar com conta corporativa**,
apontando a `/api/auth/keycloak/login`. O servidor fixa `kc_idp_hint` no alias
configurado; não lê alias de query enviada pelo navegador. Configuração incompleta
mostra apenas a opção corporativa indisponível, sem fallback visual duplicado.
Valores não reconhecidos da flag falham de forma restritiva.

`kc_idp_hint` orienta navegação, NÃO comprova autenticação nem impede um usuário
de editar uma URL de autorização. Por isso o modo exige a claim `identity_provider`
no ID token validado, exatamente igual ao alias aprovado. A sessão JWE recebe
apenas identityProvider como marca local; nenhum token é copiado. Sessões Keycloak
antigas sem essa marca não são promovidas a corporativas: precisam de novo login.
Ativação/desativação ou troca de alias durante um fluxo pendente exige reiniciá-lo.

O marcador não transforma issuer/subject Keycloak em tenantId/OID Microsoft.
Os aliases existentes continuam intactos e não autorizam escrita SharePoint.
Papéis autorizados continuam sendo client roles explícitas do portal; email,
email_verified, username ou domínio não concedem acesso. Usuário com broker correto
e sem client role continua recebendo ROLE_REQUIRED.

## Proposta externa — AGUARDANDO AUTORIZAÇÃO, NÃO APLICADA

1. Criar/selecionar browser flow específico para 3p-operator-web que encaminhe
   obrigatoriamente ao provider Microsoft aprovado. Aplicar override somente nesse
   cliente; preservar administração master, recuperação e a PoC CLI nativa.
2. Acrescentar mapper **User Session Note** ao ID token desse cliente, copiando a
   nota server-owned `identity_provider` para a claim `identity_provider`. Não usar
   hardcoded claim, atributo editável de usuário ou valor de email. Exemplo de
   objeto para revisão (não importado pela IA):

```json
{
  "name": "corporate-login-source",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-usersessionmodel-note-mapper",
  "config": {
    "user.session.note": "identity_provider",
    "claim.name": "identity_provider",
    "jsonType.label": "String",
    "id.token.claim": "true",
    "access.token.claim": "false",
    "userinfo.token.claim": "false"
  }
}
```

3. Confirmar issuer/JWKS do tenant corporativo, assinaturas e contas permitidas.
   Tenant específico sozinho pode admitir convidados do diretório. Para a política
   de somente contas corporativas internas, avaliar `acct=0` verificado no token
   upstream ou fonte administrativa equivalente; ausência não significa membro.
   Solicitar essa claim ou mudar política Entra exige autorização separada.
4. Manter cadastro/roles sob controle administrativo, sem role de negócio padrão.
   Verificar first-broker-login: não vincular contas preexistentes apenas por email.
5. Validar MFA efetivo e eventual reautenticação upstream. O portal não remove
   nenhuma exigência MFA da implementação Microsoft legada, mas não declara
   equivalência entre ela e políticas do broker ainda não homologadas.
6. Testar usuário local de teste, convidado, conta de outro tenant, usuário sem
   role e tentativa de alterar/remover o hint. Todos devem ser recusados conforme
   política, mesmo com UI de botão único. Testar também sessões SSO preexistentes
   ao trocar client flow/política; não confiar apenas em nova navegação.

Ainda que um token assinado contenha identity_provider, isso não comprova que o
mapper/flow externo foi configurado corretamente: a origem e as políticas precisam
de revisão e testes negativos reais. O portal não consulta o Admin API a cada login
nem guarda credenciais administrativas. Hoje falta a marca; habilitar o modo antes
de aplicar a proposta faz o callback recusar também os logins Microsoft do broker.

## Logout: contrato atual e comportamento de duas abas

1. Sair faz POST same-origin, com validação Origin, para o logout do provedor da sessão.
2. Keycloak logout verifica a sessão e remove seu sid do registro autoritativo.
3. O portal limpa cookies de sessão/transação e só então direciona ao end-session
   do Keycloak. A UI não envia nem armazena access/ID/refresh token.
4. As abas do mesmo navegador compartilham cookies. Uma aba já renderizada pode
   continuar mostrando conteúdo antigo; ao atualizar ou chamar uma API, o guard
   rejeita a sessão removida, inclusive se o cookie antigo for reapresentado.
5. Cancelar/abandonar a confirmação Keycloak não desfaz revogação local. Isso
   explica exatamente o comportamento relatado, sem implicar bug de sincronização.

Três camadas são distintas: sessão do portal, SSO Keycloak e SSO Microsoft.
A primeira é revogada antes da confirmação. As duas últimas dependem da conclusão
dos respectivos fluxos/configurações. O provider local tem logoutUrl Microsoft,
mas sua presença não comprova execução/sucesso. Não foi feita chamada real a ele.
O portal descarta ID token e não envia id_token_hint; a confirmação nativa pode
ser necessária. Não alterar isso nesta atividade. Nova entrada pode aproveitar SSO
upstream ainda ativo; não prometer senha/MFA a cada clique ou sign-out Microsoft
global. Outras sessões/dispositivos são independentes; revogar uma sessão não é
revogar automaticamente todas as sessões do usuário.

## Recuperação administrativa sem relaxar autenticação

- Preservar uma sessão administrativa Keycloak separada no realm master, com
  credenciais locais protegidas; não incluí-la no flow do cliente do portal.
- A rota Microsoft direta `/api/auth/login` continua disponível como endereço
  técnico, com a configuração/MFA originais, quando esse fluxo estiver operacional.
  Não supor que ele funciona se o tenant não atende ao auth context exigido.
- Se for necessário rollback da interface, administrador desabilita
  AUTH_CORPORATE_LOGIN_ENABLED no processo autorizado e reinicia somente o portal.
  Não troca segredo JWE, não desabilita MFA, não usa AUTH_DISABLED, não concede
  roles default e não transforma recovery em botão público ou parâmetro de bypass.
- A desativação restaura o comportamento legado do Keycloak, inclusive contas
  locais de laboratório: é uma mudança operacional consciente, não modo corporativo.
- Se não houver caminho legado funcional, a recuperação é pelo administrador do
  ambiente/Keycloak; nunca criar senha própria no portal ou aceitar só domínio.

## Homologação e fontes

Ver LOGIN-CORPORATIVO-TESTES-MANUAIS.md. Todos os resultados devem ser informados
pelo responsável; a IA não executa login nem aprova testes em seu nome.

Referências: [Keycloak — broker e notas de sessão](https://www.keycloak.org/docs/26.7.0/server_admin/index.html#_identity_broker)
e [Microsoft — claim acct e membros/convidados](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference).
Proposta externa e homologação pendentes: **NO-GO para declarar modo corporativo seguro ou produção**.
