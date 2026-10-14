# Controles de segurança

Esta pasta oferece store Redis/memória, registro/revogação de sessões e rate limit. Em Java, lembra serviços de sessão distribuída e interceptadores de limite.

- `store.ts`: comandos Redis REST; memória só development/test.
- `session-registry.ts`: SID, versão do usuário e revogação.
- `rate-limit.ts`: 60 leituras/20 escritas por minuto.
- `security.test.ts`: falha fechada, revogação, NX e limites.

```ts
if (count > (write ? 20 : 60)) throw new DecisionError(..., 429);
```

Auth consulta registros; APIs aplicam limite; SharePoint registra auditoria. Investigue 429 e 503, consistência/endpoint do Redis e ambiente. Para manter, conheça armazenamento distribuído, TTL, hashing e falha fechada. Memória não é produção/auditoria durável.

Leia [Segurança operacional](../../../docs/SEGURANCA-OPERACIONAL.md) e [Debug](../../../docs/GUIA-DE-DEBUG.md).
