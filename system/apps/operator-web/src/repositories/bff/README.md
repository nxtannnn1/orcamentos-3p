# Cliente do BFF

`bff-operator-repository.ts` implementa `OperatorRepository` no navegador usando `fetch`. É semelhante a um cliente REST Java: serializa decisão, chama endpoints e traduz falhas em `Error`.

```ts
fetch(`/api/itens/${id}/decisao`, {
  method: "PATCH",
  headers: { "If-Match": context.version },
});
```

Recebe chamadas do domínio e conversa com `src/app/api`; nunca acessa Graph nem contém secrets. Investigue URL, método, header, JSON e mensagem da resposta. Para manter, conheça HTTP, `fetch`, encoding, JSON e contrato repository. Preserve `If-Match` e não confie em dados do cliente no servidor.

Leia [Fluxos](../../../docs/FLUXOS-DO-SISTEMA.md) e [Debug](../../../docs/GUIA-DE-DEBUG.md).
