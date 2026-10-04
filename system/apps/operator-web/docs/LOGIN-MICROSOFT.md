# Login corporativo 3P — ativação pelo administrador

## Estado da implementação

`/login` é pública. Fila, validação e todas as rotas de dados exigem sessão, inclusive em `DATA_SOURCE=mock`, exceto pelo bypass restrito de desenvolvimento local descrito abaixo. Não existe login por senha local. Sem configuração válida, o acesso permanece bloqueado e o BFF não consulta o Graph.

### Bypass de desenvolvimento local

Com AUTH_DISABLED=true, o bypass mock exige NODE_ENV=development, DATA_SOURCE=mock e AUTH_APP_ORIGIN HTTP em loopback. Para ler SharePoint real sem login, a exceção adicional ALLOW_LOCAL_SHAREPOINT_BYPASS=true exige DATA_SOURCE=sharepoint e origem local estrita, sem caminho, credenciais, query ou fragmento. Retorna somente o perfil Consulta; escrita é bloqueada explicitamente antes do repositório. Nenhum bypass funciona em produção. Não expor o servidor de desenvolvimento na rede: a origem configurada local não substitui a restrição de escuta do servidor.

O login usa MSAL Node, Authorization Code + PKCE, state e nonce. O servidor valida assinatura RS256 com as chaves públicas do Entra, issuer, audience, expiração, nonce, tenant, condição de membro, perfil e contexto de autenticação. A sessão é criptografada (JWE), em cookie HttpOnly/SameSite=Lax/Secure em HTTPS. Dura no máximo 15 minutos e nunca além da validade do ID token. Não há renovação automática. Tokens Microsoft e o segredo do cliente não são enviados ao JavaScript do navegador.

## 1. Registrar o aplicativo de login

No Microsoft Entra da 3P, criar um registro para `Sistema 3P — Login` com **Contas somente neste diretório organizacional (single tenant)**. Manter separado do registro usado pelo BFF para Graph/SharePoint. Não habilitar contas pessoais, multitenant ou concessão implícita.

Adicionar plataforma **Web** e os endereços de retorno exatos:

- Desenvolvimento: `http://localhost:3000/api/auth/callback`.
- Produção: `https://DOMINIO-DO-SISTEMA/api/auth/callback`.

Substituir DOMINIO-DO-SISTEMA pelo domínio definitivo. Se usar outra porta local, cadastrar o endereço correspondente e atualizar AUTH_APP_ORIGIN. Registrar também o retorno pós-logout `/login` conforme a configuração de redirecionamento exigida pelo Entra. Não configurar `/api/auth/logout` como front-channel logout: essa rota aceita somente POST do próprio portal.

Criar a credencial do registro e armazená-la no ambiente seguro do servidor. Não colocar o valor em issue, chat, repositório ou variável pública. Este login solicita apenas identidade (`openid profile email`); não requer conceder permissão de escrita Graph ao aplicativo de login.

## 2. Autorizar somente a equipe

Criar App Roles com Allowed member types = Users/Groups e valores exatos:

| Valor | Acesso implementado |
| --- | --- |
| Operador | Ler dados e aprovar/rejeitar materiais |
| Comprador | Ler dados e aprovar/rejeitar materiais; base para as futuras cestas |
| Consulta | Somente leitura |

Na Aplicação Empresarial, ativar **Assignment required? = Yes** e atribuir os funcionários autorizados aos perfis. Usuário sem um desses perfis é negado também pelo código. Atribuição por grupo pode depender de licenciamento; atribuição individual é suficiente para o piloto.

Em Token configuration/Optional claims, adicionar **acct** ao **ID token**. O código exige `acct=0` (membro) e bloqueia `acct=1` (convidado) ou ausência do claim. Não basta filtrar o sufixo do e-mail. Não converter convidados em membros para contornar essa regra.

## 3. Vincular o contexto à política MFA

Esta implementação utiliza um **contexto de autenticação configurável**. O administrador deve escolher/publicar um contexto disponível (por exemplo c1, somente se for o contexto escolhido no tenant) e criar uma política de Acesso Condicional que o proteja, exigindo MFA/força de autenticação multifator para os usuários autorizados. O recurso requer Entra ID P1 ou licença que o inclua. Não habilitar políticas globais automaticamente: o administrador deve validar o impacto e os procedimentos de recuperação da organização.

Configurar o ID escolhido em `ENTRA_MFA_AUTH_CONTEXT_ID`. O login solicita esse contexto em `id_token.acrs` e recusa o acesso quando o ID token não contém o contexto solicitado. Se necessário, adicionar `acrs` aos claims opcionais do ID token.

**A presença de acrs, isoladamente, não prova MFA:** a Microsoft pode emitir o contexto quando nenhuma política está associada. O administrador precisa vincular uma política MFA efetiva, validar as exclusões e conferir os logs de entrada/Acesso Condicional. Uma política em modo somente relatório não comprova imposição de MFA. Não declarar MFA ativa antes desse teste no tenant. O sistema não verifica nem altera políticas administrativas via Graph.

O contexto é usado aqui como condição obrigatória de acesso. Não é necessário exigir uma segunda política redundante apontada diretamente ao aplicativo para o mesmo requisito. Não usar `prompt=login`, tela de OTP própria ou presença de um domínio de e-mail como substitutos de MFA.

## 4. Configurar o servidor

Preencher fora do Git:

| Variável | Conteúdo |
| --- | --- |
| ENTRA_LOGIN_TENANT_ID | ID GUID do diretório da 3P |
| ENTRA_LOGIN_CLIENT_ID | ID GUID do registro de login |
| ENTRA_LOGIN_CLIENT_SECRET | Credencial server-side do registro de login |
| AUTH_APP_ORIGIN | Origem exata do portal; HTTPS em produção, sem caminho |
| AUTH_SESSION_SECRET | Segredo aleatório exclusivo, pelo menos 32 caracteres; usar 32 bytes aleatórios ou mais |
| ENTRA_MFA_AUTH_CONTEXT_ID | Contexto realmente vinculado à política MFA |

As variáveis MICROSOFT_* e SHAREPOINT_* da integração existente permanecem separadas. `.env.example` contém somente nomes e placeholders. `.env.local` continua ignorado pelo Git. Em Cloudflare, cadastrar os secrets pelo mecanismo de secrets do ambiente; esta tarefa não publica nem altera o ambiente remoto.

## 5. Teste de aceite com o administrador

1. Abrir `/` sem sessão: redireciona para `/login`; chamadas diretas ao BFF retornam 401.
2. Entrar com funcionário atribuído como Operador e cumprir a política MFA. Conferir aplicação, contexto e MFA nos logs de entrada do Entra.
3. Conferir nome e perfil no cabeçalho. A decisão continua sujeita à permissão write da aplicação Graph; autenticação do operador não libera write no SharePoint.
4. Testar Consulta: lê dados, botões de decisão desabilitados, PATCH direto retorna 403.
5. Testar conta pessoal, outro tenant, convidado e funcionário sem perfil: todos devem ser bloqueados.
6. Testar MFA cancelada ou contexto ausente: não criar sessão.
7. Testar Sair, expiração e nova entrada. Logout invalida o registro da sessão no servidor. Remoções de perfil ou bloqueios no Entra devem incluir a revogação por usuário no portal; sem esse passo, podem levar até 15 minutos para refletir. Consulte SEGURANCA-OPERACIONAL.md para o comando administrativo e a configuração do Redis. Não há sincronização automática com o Entra/CAE. Para revogação global de emergência, trocar AUTH_SESSION_SECRET pelo procedimento operacional aprovado.
8. Validar no ambiente de hospedagem final. O build Next local não substitui um teste do adaptador Cloudflare e das credenciais em produção.

## Fontes Microsoft

- [Single tenant](https://learn.microsoft.com/en-us/entra/identity-platform/single-and-multi-tenant-apps)
- [Optional claims: acct e acrs](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference)
- [App roles](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps)
- [Authentication context e licenciamento](https://learn.microsoft.com/en-us/entra/identity-platform/developer-guide-conditional-access-authentication-context)

## Registro compartilhado de sessões

Produção exige SECURITY_REDIS_REST_URL e SECURITY_REDIS_REST_TOKEN. Sem Redis compartilhado, o login falha fechado. Desenvolvimento/testes podem usar memória; escrita real SharePoint exige auditoria durável. Consulte [Segurança operacional](SEGURANCA-OPERACIONAL.md).

### Authentication Context no desenvolvimento

A integração preserva a configuração remota: em NODE_ENV=development com origem HTTP em loopback, o contexto MFA pode estar ausente. Assinatura, tenant, condição de membro e perfis continuam obrigatórios no login Entra. Em produção, o contexto válido e a política MFA efetiva continuam obrigatórios. A ausência de contexto local não comprova MFA.
