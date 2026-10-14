# APIs do BFF

Esta pasta é o backend dedicado ao frontend. Route Handlers lembram controllers REST Spring, mas exportam funções `GET`, `POST` ou `PATCH`.

- `auth/*`: login, callback e logout.
- `orcamentos`: fila; `orcamentos/[id]/itens`: itens.
- `materiais`: catálogo/pesquisa.
- `itens/[id]/decisao`: escrita validada.
- `*.test.ts`: endpoints, acesso e fluxo integrado simulado.

```ts
const user = await requireSession(false); // autentica
await limitUserRequests(user, false);      // limita
return Response.json(await repository.listBudgets());
```

As rotas chamam `src/server`, nunca recebem credencial Graph do cliente. Investigue na Network e em `route-error.ts`. Ao manter, preserve sessão/perfil, origem de escrita, limites, validação runtime, `no-store` e códigos. Conheça HTTP/JSON, async/await e segurança web.

Leia [Fluxos](../../../docs/FLUXOS-DO-SISTEMA.md), [Debug](../../../docs/GUIA-DE-DEBUG.md) e [Testes](../../../docs/GUIA-DE-TESTES.md).
