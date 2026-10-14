# Autenticação e sessão

Esta pasta autentica pessoas pelo Entra ID e autoriza perfis. Em Java, reúne configuração de segurança, cliente OAuth e serviço de sessão.

- `configuration.ts`: valida ambiente, roles e `canReview`.
- `microsoft.ts`: MSAL, assinatura/claims do ID token.
- `session.ts`: cookie JWE, registro, leitura, revogação e guards.
- testes: fluxo, criptografia, perfis, MFA e bypass local.

```ts
export const canReview = user =>
  user.roles.some(role => role === "Operador" || role === "Comprador");
```

Rotas auth criam sessão; páginas/APIs chamam guards; security mantém registro. Investigue código de erro, redirect, cookie e store sem revelar token. Para manter, conheça OAuth/OIDC, PKCE, JWT/JWE, cookies e autorização. Bypass só pode permanecer local e restrito.

Leia [Login Microsoft](../../../docs/LOGIN-MICROSOFT.md) e [Segurança](../../../docs/SEGURANCA-OPERACIONAL.md).
