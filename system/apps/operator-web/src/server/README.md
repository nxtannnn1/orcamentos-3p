# Código server-side

Esta camada guarda operações que não podem ir ao navegador: secrets, cookies, Redis e Graph. `server-only` ajuda a impedir importação cliente.

- [`auth`](auth/README.md): identidade/sessão.
- [`data-source`](data-source/README.md): configuração/factory/erros.
- [`security`](security/README.md): store, revogação e limites.
- [`sharepoint`](sharepoint/README.md): Graph, mapeamento e persistência.

Rotas API chamam esta camada; ela devolve modelos internos ou erros seguros. Investigue logs do Next e o subdiretório responsável. Para manter, conheça Node server-side, async/await, segurança, HTTP e configuração por ambiente. Nunca logue token, secret, cookie ou conteúdo sensível.

Leia [Arquitetura](../../docs/ARQUITETURA.md), [Segurança](../../docs/SEGURANCA-OPERACIONAL.md) e [Debug](../../docs/GUIA-DE-DEBUG.md).
