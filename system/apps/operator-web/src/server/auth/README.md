# Autenticação e sessão

Esta pasta autentica pessoas pelo Entra ID ou pelo Keycloak opcional e autoriza perfis. Em Java, reúne configuração de segurança, cliente OAuth e serviço de sessão.

- `configuration.ts`: valida ambiente, roles e `canReview`.
- `microsoft.ts`: MSAL, assinatura/claims do ID token; fluxo preservado.
- `microsoft-diagnostics.ts`: categorias fixas por etapa do callback, sem mensagens do SDK ou dados da identidade. A troca MSAL recebe o nonce da transação; o início local canonicaliza Host antes de emitir cookie. [Diagnóstico e testes](../../../docs/DIAGNOSTICO-LOGIN-MICROSOFT.md).
- `keycloak.ts`: openid-client, discovery/JWKS, PKCE, nonce e client roles restritas.
- `keycloak-session.ts`: identidade exata issuer/subject, leitura e revogação da sessão alternativa.
- `session.ts`: cookie JWE, registro, leitura, revogação e guards.
- testes: fluxo, criptografia, perfis, MFA e bypasses locais.

```ts
export const canReview = user =>
  user.roles.some(role => role === "Operador" || role === "Comprador");
```

Rotas auth criam sessão; páginas/APIs chamam guards; security mantém registro. O bypass Operator API exige development, HTTP loopback, `DATA_SOURCE=operator-api` e `AUTH_DISABLED=true`; entrega somente `Consulta` e falha em produção. Investigue código de erro, redirect, cookie e store sem revelar token. Para manter, conheça OAuth/OIDC, PKCE, JWT/JWE, cookies e autorização. Bypass só pode permanecer local e restrito.

Keycloak fica desativado por padrão. Escritas em fontes reais por identidades Keycloak permanecem bloqueadas até a associação individual da Fase 4; revisão em mock usa os papéis existentes.

`requirePageSession()` dispõe de um probe interno opcional e local de identidade
Entra → Pessoa: `ENTRA_PERSON_READONLY_PROBE=false` por padrão. Ele só executa após
JWE/registro ativos e exige sessão Entra sem bypass. Não cria endpoint, não recebe
OID do navegador, não retorna identidade e não autoriza escrita. [Procedimento e
estado humano pendente](../../../docs/HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md).

Leia [Login Keycloak](../../../docs/LOGIN-KEYCLOAK.md), [Login Microsoft](../../../docs/LOGIN-MICROSOFT.md) e [Segurança](../../../docs/SEGURANCA-OPERACIONAL.md).
