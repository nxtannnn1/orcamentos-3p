# Fase M.3 — proposta de reabertura e reconciliação

Data: 20/10/2026. Branch `infra-lab`, referência `5decc25`.
Status: contrato executável isolado e simulação; sem endpoint, adaptador de escrita ou persistência real de reabertura.

## Modelo versionado

`src/server/reopening-proposal/contract.ts` é a definição TypeScript e a validação runtime da proposta v1. Não é um contrato remoto já homologado. Campos desconhecidos e versões diferentes são rejeitados. Leitores de futuras versões deverão ser explícitos; nenhuma atualização poderá reescrever eventos anteriores.

| Evento | Conteúdo |
|---|---|
| `REOPEN_INTENT` | `schemaVersion: 1`, `eventId` UUID, `at` UTC, `status: INTENDED`, `actor`, justificativa de 10–2.000 caracteres, `previousDecisionId`, política de Pessoa, `before` completo e `after` pretendido |
| `REOPEN_DISPATCH` | versão, UUID próprio, UUID da intenção, instante, fingerprint da intenção e `ATTEMPT_STARTED`; proposta tipada, produzida apenas pelo simulador |
| `REOPEN_RECONCILIATION` | versão, UUID próprio, UUID da operação, instante, revisor, fingerprint, evidência de envio, observação remota e resultado calculado |

A intenção contém escopo tenant/site/lista/orçamento/item. O ator contém tenant, OID e lookup numérico local da Pessoa, representado como string decimal validada. Nome e e-mail não substituem lookup. A resolução deve ser atestada pelo backend para o mesmo site, tenant e OID da sessão.

`before` preserva ETag, status, estado do orçamento, `Enviado_Historico`, associação atual de material, valores completos de extração, decisão anterior (UUID, instante, identidade, status, observação integral e material) e evidências integrais da correção (`operationId`, `originalJson`, `recordJson`). Os JSONs de correção são conferidos pelos validadores existentes. Campos de extração nulos continuam representáveis em itens rejeitados.

`after` preserva esses dados, muda o status corrente para `EM_REVISAO`, limpa somente a associação corrente de material e vincula o UUID de reabertura. A decisão anterior mantém sua própria identidade e associação histórica. O ETag posterior só aparece em observação remota comprovada.

O campo lógico `reopeningId` é uma proposta de marcador, NÃO um nome interno confirmado ou coluna criada. Sua persistência e descoberta por UUID dependem de contrato remoto aprovado. Não reutilizar `decisionId` para apagar a decisão anterior. O fingerprint SHA-256 auxilia comparação/idempotência; não substitui conteúdo, autenticidade nem armazenamento imutável.

## Autorização e transição

O contrato recebe atestações internas de sessão e Pessoa; não autentica um cookie nem consulta o Entra. Não pode ser ligado diretamente a JSON do navegador. A futura integração deve usar os serviços existentes de sessão e resolução de identidade, além da autorização de acesso ao orçamento/item.

A política exige perfil expressamente configurado, sessão corporativa válida e não expirada, tenant/OID/site coerentes e lookup válido. Os nomes de perfis nas fixtures são sintéticos; não concedem permissões reais nem promovem automaticamente Operador/Comprador.

Somente `APROVADO`/`REJEITADO`, orçamento `PENDENTE`/`EM_REVISAO` e histórico exatamente `NAO` são admitidos pelo modelo. Estados desconhecidos/ausentes bloqueiam. A enumeração de orçamento aberto deve ser confirmada no contrato funcional antes de integração. ETag exato, justificativa e ausência de operação pendente são obrigatórios. Alteração informal de status não implementa reabertura.

### Responsavel_Decisao

Alternativas a aprovar:

1. **Recomendada:** preservar o responsável pela última decisão; registrar o autor da reabertura no evento separado. A interface deverá identificar explicitamente “responsável pela decisão anterior”.
2. Limpar o campo: exige confirmar nulabilidade e preservar integralmente a identidade no ledger antes da mudança; reduz a informação disponível na lista.
3. Substituir pelo autor da reabertura: muda o significado do campo e pode atribuir falsamente a decisão anterior; não recomendado.

O modelo testa a primeira alternativa como proposta. Nenhum mapeamento remoto foi alterado na M.3. `Responsavel_Decisao`, `reviewedByPerson`, `reviewedByOid`, `reviewedAt` e `decisionId` mantêm os contratos locais anteriores; homologação dos nomes internos continua obrigatória.

## Persistência e consistência propostas

Os registros atuais de decisão no Redis não preservam todo o conteúdo anterior: hashes de observação não permitem recuperar o texto. Os campos atuais do item também não são um histórico de eventos. Não é seguro declarar esse requisito atendido reutilizando apenas essas estruturas.

Propõe-se ledger separado com intenções e evidências append-only, índices por UUID e escopo e reserva ativa por item. Uma transação/CAS deve reservar UUID, item e intenção de forma durável antes de qualquer envio. Mesmo UUID e mesmo conteúdo retornam a operação existente após reautorização; mesmo UUID e conteúdo diferente geram conflito. O índice e o ledger precisam ser consistentes também após restauração.

Registrar tentativa durável antes de enviar. Usar If-Match com ETag, lock/CAS e proteção contra trabalhador obsoleto. Não liberar operação incerta por simples TTL do lock; a pendência durável deve impedir nova escrita. Confirmar a releitura e persistir a evidência antes de informar conclusão. Falha da auditoria impede retorno de sucesso, mesmo quando a mudança remota pode ter ocorrido.

O simulador modela atomicidade com Maps e arrays privados. Ele NÃO prova atomicidade Redis, durabilidade, fencing, sobrevivência a reinício, transações distribuídas ou execução concorrente em processos reais. Implementação futura exigirá scripts/transações aprovados e testes de falhas reais. Não alterar silenciosamente scripts existentes, incluindo a allowlist do gateway e o CAS de correções.

Redis isoladamente não assegura imutabilidade contra administradores. Definir armazenamento durável, ACLs de append/leitura, backup consistente e arquivo imutável externo ou controles equivalentes conforme a exigência de auditoria. Assinaturas/encadeamento de hashes podem detectar adulterações, mas não substituem cópias integrais. Não houve criação de estrutura, migração ou provisionamento.

Eventos legados incompletos devem ser identificados como tais; não fabricar conteúdo a partir de hashes. A falta de snapshot anterior suficiente bloqueia reabertura até definição de um procedimento autorizado.

## Reconciliação administrativa

1. Identificar pendências pelo UUID no ledger, com acesso administrativo distinto de reabertura.
2. Recuperar intenção integral, tentativas e outcomes anteriores; validar versão, escopo e integridade.
3. Confirmar sessão, papel, tenant/OID e Pessoa do administrador. Não aceitar outcome ou identidade fornecidos pelo navegador.
4. Quando autorizado, consultar o item exato e conferir o marcador UUID; eventual busca deve permanecer restrita ao tenant/site/lista/orçamento autorizados.
5. Comparar item, orçamento, status, identidade histórica, material, valores, correção, marcador e ETag com a intenção. Preservar horários de observação e evidências confiáveis do transporte.
6. Acrescentar nova evidência com UUID próprio. Nunca editar a intenção ou substituir outcomes anteriores.

| Resultado | Evidência mínima no modelo |
|---|---|
| `CONFIRMED` | Estado pretendido integral e UUID coincidem, ETag mudou e não há prova contraditória de não envio/rejeição |
| `NOT_PERSISTED` | Estado anterior integral ainda coincide E há prova confiável de não envio ou rejeição |
| `DIVERGENT` | Dados diferem ou evidências se contradizem |
| `INCONCLUSIVE` | Leitura indisponível/malformada, item ausente, ETag não avançou ou timeout com estado anterior |

HTTP 404 ou estado anterior isolado não provam ausência de escrita. `NOT_SENT`/`REJECTED` são evidências internas do protocolo, nunca escolhas do cliente. A implementação durável deverá preservar resultados de transporte; o mapa em memória do simulador não é evidência recuperável após reinício.

Timeout nunca gera novo PATCH automático. A reconciliação apenas observa. Se evidências faltarem, manter bloqueio e encaminhar investigação administrativa: registros de transporte, versões remotas, integridade do ledger e restauração de backup. Eventual intervenção deve ter autorização específica, justificativa, revisão independente e novo evento; não existe comando “forçar confirmado”. Restaurar backup não autoriza reenviar operações.

## Confidencialidade, acesso e retenção

Preservar apenas conteúdo necessário à auditoria. Não guardar tokens, cookies, credenciais, nome/e-mail redundantes ou respostas arbitrárias do Graph. O modelo rejeita chaves secretas conhecidas nos JSONs de correção e descarta observações malformadas; isso não é um detector universal de segredos em texto livre. A integração deverá controlar a origem dos dados e impedir captura de cabeçalhos e payloads de autenticação.

Snapshots e justificativas podem conter dados comerciais/pessoais: criptografia em trânsito e repouso, acesso por escopo, segregação entre operador/reconciliador/auditor, registro de consultas administrativas e proibição de conteúdo integral em logs comuns. Definir retenção, bloqueio de descarte por investigação, eliminação autorizada e tratamento dos backups com os responsáveis antes da persistência real. Não foi inventado um prazo de retenção.

## Condições para próxima fase

Aprovar significado de Pessoa após reabertura, perfis e autorização por recurso, contrato do marcador UUID, ledger e garantias de durabilidade, retenção/recuperação e tratamento de legados. Só então implementar adaptadores, validar concorrência e recuperação em ambiente controlado, conferir schema SharePoint e solicitar autorização específica para escrita. Os testes atuais são de contrato e simulação, não homologação ponta a ponta.
