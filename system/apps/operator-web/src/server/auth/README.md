# Autenticação e sessão

Esta pasta autentica pessoas pelo Entra ID ou pelo Keycloak opcional e autoriza perfis. Em Java, reúne configuração de segurança, cliente OAuth e serviço de sessão.

- `configuration.ts`: valida ambiente, roles e `canReview`.
- `microsoft.ts`: MSAL, assinatura/claims do ID token; fluxo preservado.
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

Leia [Login Keycloak](../../../docs/LOGIN-KEYCLOAK.md), [Login Microsoft](../../../docs/LOGIN-MICROSOFT.md) e [Segurança](../../../docs/SEGURANCA-OPERACIONAL.md).
