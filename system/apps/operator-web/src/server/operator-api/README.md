# Cliente da Operator API

Esta pasta adapta a Operator API somente leitura ao contrato `OperatorRepository`. Em Java, `OperatorApiRepository` se aproxima de um cliente REST com validação rígida de DTOs.

- `readOperatorApiConfig`: aceita HTTPS ou HTTP loopback fora de produção e valida o token server-side.
- `read`: envia Bearer, recusa redirect, limita resposta a 2 MB e aplica timeout de oito segundos.
- `list`: percorre até 20 páginas de 100 registros e rejeita cursor repetido ou inválido.
- mappers: convertem orçamento, item e material PostgreSQL para os tipos da interface.
- `saveItemDecision`: sempre retorna `403 READ_ONLY_DATA_SOURCE`.

O navegador não acessa este cliente nem recebe `OPERATOR_API_TOKEN`. A sessão e o perfil da pessoa são validados pelo BFF antes da chamada; o Bearer identifica o Operator Web perante a API. `readOnly` e `reviewAvailable` informam a capacidade à UI, mas a recusa server-side continua sendo o controle decisivo.

Investigue separadamente configuração, sessão, BFF, token entre serviços, paginação, resposta e banco. Não implemente fallback silencioso nem transforme associação PostgreSQL em aprovação humana.

Leia [Integração Operator API](../../../docs/INTEGRACAO-OPERATOR-API.md), [Arquitetura](../../../docs/ARQUITETURA.md) e [Debug](../../../docs/GUIA-DE-DEBUG.md).
