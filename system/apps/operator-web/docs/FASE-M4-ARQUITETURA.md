# Fase M.4 — contratos de persistência

20/10/2026 — proposta local, sem armazenamento provisionado ou escrita remota.
Complementa a [M.3](FASE-M3-ARQUITETURA.md), preservada como registro histórico.

## Contratos executáveis e limites

`src/server/persistence-proposal/ledger.ts` define `Intent`, `Snapshot`, `Event`, validadores estritos e projeção de estado. `permissions.ts` contém guards isolados. `__test-support__/memory-ledger.ts` modela CAS, append e idempotência de um item. Não há import desses módulos pelas rotas/factories funcionais.

A intenção v1 contém UUID de operação, tipo `APPROVE`, `REJECT` ou `REOPEN`, instante UTC, tenant/OID/Pessoa, justificativa, decisão anterior, snapshot anterior integral e snapshot pretendido. Aprovação admite observação vazia conforme contrato anterior; rejeição e reabertura exigem 10–2.000 caracteres. Snapshot sem decisão representa a primeira decisão, sem inventar uma identidade anterior. O conteúdo da extração, material e evidências integrais da correção permanecem preservados.

Cada evento possui versão, UUID próprio, UUID da operação, sequência por operação, UUID do evento anterior, escopo tenant/site/lista/orçamento/item, instante e ator. Tipos:

- `INTENT`: intenção e snapshots integrais.
- `DISPATCH`: tentativa prestes a ser enviada, registrada antes do envio.
- `OBSERVATION`: evidência inicial de transporte/releitura.
- `RECONCILIATION`: nova evidência administrativa, sem substituir outcomes anteriores.

Observações registram `NOT_SENT`, `REJECTED`, `UNKNOWN` ou `ACKNOWLEDGED` e snapshot remoto validado, ou ausência de leitura utilizável. Não aceitam `outcome` livre. ETag pretendido é apenas a versão base preservada para comparação, não uma versão posterior inventada. ETag posterior existe somente no snapshot observado.

O validador recusa campos/versões desconhecidos. A projeção valida continuidade, unicidade de eventos, escopo, cronologia, vínculo de operação e autoria. A aprovação/rejeição proposta aceita itens em revisão ou pendentes; precondições completas de catálogo, fornecedor e segurança continuam responsabilidade dos serviços existentes, não substituídas pelo ledger.

## Atomicidade, ordem e idempotência

Contrato exigido do futuro adaptador:

1. Validar schema, sessão, autorização e estado remoto; ler cabeça autoritativa do item.
2. Em transação, reservar item/operação e inserir intenção com unicidade de UUID. Sem commit durável, não enviar.
3. Persistir tentativa antes de PATCH; enviar no máximo uma vez por operação, com If-Match e proteção contra trabalhador obsoleto.
4. Registrar observação/reconciliação em transação com avanço CAS da cabeça e projeção de bloqueio. Liberar o item somente depois do commit da evidência terminal.
5. Após perda de resposta do ledger, consultar UUID e conteúdo antes de repetir append. Repetição idêntica recupera o registro; mesmo UUID com conteúdo diferente é conflito.

Sequência é por operação; cabeça CAS do item serializa operações. Relógio não define ordem causal: a sequência e o vínculo anterior definem. Datas UTC devem ser não decrescentes na operação; relógios divergentes bloqueiam para análise. O futuro armazenamento deve impor unicidade de UUID de evento e operação, ordenação por agregado e consistência de índices.

O modelo de um item rejeita evidência atrasada de operação anterior depois de iniciar outra. O adaptador real deverá tratar esse caso por transação administrativa que bloqueie o item atual e acrescente evidência à operação original, sem reordenar ou sobrescrever registros. Esse protocolo multistream permanece especificado, não implementado.

Lock Redis sozinho não resolve atomicidade entre SharePoint e ledger. TTL vencido não libera operação incerta. Persistir a pendência autoritativa e conferir fencing/cabeça antes de envio; ETag protege a versão remota. Não há transação distribuída Graph/Redis/ledger nem promessa de exactly-once.

## Durabilidade e imutabilidade

Recomendação: ledger transacional durável com journal/WAL e confirmação de commit conforme política aprovada, conta da aplicação restrita a append/leitura e arquivo externo com retenção imutável. Redis continua autoritativo para sessão/limites/locks existentes; não se torna o único histórico.

| Alternativa | Avaliação |
|---|---|
| Apenas Redis em memória | Inadequado: perda no reinício e ausência de proteção contra exclusão administrativa |
| Redis com persistência/replicação | Melhora recuperação, mas depende de política de flush/failover e não garante imutabilidade contra administrador |
| Banco transacional durável + arquivo imutável | Recomendada: atomicidade de índices/reservas, recuperação e preservação externa; exige desenho e operação adicionais |
| Apenas objetos imutáveis | Preserva conteúdo, mas reserva/CAS/índices e ordenação exigem coordenador transacional adicional |

Definir armazenamento concreto, quórum/ACK, RPO/RTO, backups, restauração e reconciliação após failover antes de implementar. O recibo de commit deve vincular UUID, escopo, sequência e digest do conteúdo; apenas o adaptador confiável poderá atestar sua durabilidade. Nenhum booleano vindo de browser é prova.

No código isolado, `project(records, auditAvailable)` recebe uma atestação interna simulada. `true` não verifica disco, replicação ou arquivo imutável. `MemoryLedger` não é implementação produtiva e não prova durabilidade real. Hashes servem à integridade, não substituem snapshots integrais, assinatura confiável ou cópia imutável.

Proteção contra operadores comuns: ACL de append/leitura e proibição de update/delete. Proteção contra administradores: segregação de funções, arquivo imutável, alertas de lacunas e controles de chaves. A migração/criação dessa estrutura está fora desta fase.

## Marcador remoto

| Alternativa | Segurança/rastreabilidade | Compatibilidade e custo |
|---|---|---|
| Reutilizar `Decisao_Id` para reabertura | Apaga referência da última decisão e cria ambiguidade de autoria | Rejeitada sem novo contrato explicitamente aprovado |
| Dedicar marcador de última reabertura | Preserva decisão; reabertura identifica-se por UUID próprio | Recomendada para esta evolução; exige coluna/contrato aprovado |
| Campo genérico do último evento | Uniformiza consultas, mas toda escrita deve atualizar esse marcador | Maior alteração dos fluxos de decisão/correção já validados |
| Apenas associação no ledger e ETag | Não prova por UUID qual intenção gerou o estado remoto após resposta perdida | Insuficiente como prova única |

Recomenda-se marcador específico de reabertura, mantendo `Decisao_Id` para aprovação/rejeição. Nome físico NÃO definido nem coluna criada. O lógico `reopeningId` nos contratos é candidato. Cada operação guarda referência à decisão anterior no ledger. Uma decisão posterior pode preservar o UUID da última reabertura como referência histórica; ele não representa “última operação”.

Reconciliar por tipo: UUID da decisão para aprovação/rejeição; UUID de reabertura para reabertura. Sempre comparar conjunto completo de identidade/status/material/item/orçamento/ETag e evidências, não apenas encontrar o UUID. Se outra operação posterior tiver substituído campos, consultar histórico durável e versões remotas autorizadas; não inferir sucesso do estado corrente isolado.

## Autoria e interface

A direção funcional da M.4 é preservar a última decisão válida na reabertura:

| Campo | Aprovar/rejeitar | Reabrir |
|---|---|---|
| `Responsavel_Decisao` | Pessoa resolvida do decisor | Preservar Pessoa da decisão anterior |
| `Revisado_Por_Oid` | OID validado do decisor | Preservar |
| `Data_Decisao` | Data UTC da decisão | Preservar |
| `Decisao_Id` | UUID da nova decisão | Preservar |
| `Status_Revisao` | APROVADO/REJEITADO | EM_REVISAO |
| Material aprovado corrente | Selecionado/vazio | Vazio |

Operador/data/justificativa da reabertura ficam no novo evento. O snapshot histórico mantém material e autoria da decisão anterior. A decisão seguinte registra o novo decisor, sem modificar eventos antigos.

Compatibilidade: o candidato local já mapeia `reviewedByPerson` para Responsavel_Decisao, `reviewedByOid` para Revisado_Por_Oid, `reviewedAt` para Data_Decisao e `decisionId` para Decisao_Id. Documentos anteriores registram Pessoa/data verificadas, mas OID/UUID candidatos não provisionados; M.4 não confirma metadados ao vivo nem aplica configuração. `decision-schema.ts` continuará exigindo tipos e nomes reais válidos antes de escrita.

UI futura deve separar “Estado atual”, “Responsável pela última decisão”, “Reaberto por / em / motivo” e histórico cronológico. Uma reabertura não deve exibir seu operador como aprovador. Operação incerta mostra pendência e bloqueio; histórico parcial legado é explicitamente identificado. Nenhuma UI produtiva foi alterada nesta fase.

## Reconciliação e liberação

| Estado projetado | Bloqueio | Evidência/ação |
|---|---|---|
| INTENDED | Sim | Intenção durável; nenhuma conclusão |
| UNPROVEN | Sim | Tentativa registrada; persistência não comprovada |
| RECONCILIATION_REQUIRED | Sim | Timeout, ausência/falha de leitura ou ETag não avançou |
| DIVERGENT | Sim | Identidade, UUID, item, material ou conteúdo não coincide |
| CONFIRMED | Não, após commit durável | Releitura completa coincide e ETag mudou |
| RECONCILED | Não, após commit durável | Nova evidência administrativa comprova o mesmo conjunto |
| NOT_PERSISTED | Não, após commit durável | Estado anterior coincide E transporte comprova não envio/rejeição |
| DURABLE_AUDIT_FAILURE | Sim | Indisponibilidade ou commit não comprovado |

404 e estado antigo depois de timeout não provam ausência de persistência. Reconciliador lê evidências e acrescenta observações; não altera outcomes à mão. Nova operação exige evidência terminal durável, estado remoto atualizado e revalidação da autorização. Timeout não admite retry automático com UUID novo. Falha de auditoria após escrita exige recuperar ledger/UUID antes de qualquer liberação.

## Dados e retenção

Guardar conteúdo necessário integralmente, criptografado em trânsito/repouso, com acesso por tenant/site/lista e política corporativa. O código recusa chaves secretas conhecidas em JSONs de correção; isso não detecta todo segredo em texto livre. Não copiar respostas Graph arbitrárias, tokens ou cabeçalhos para auditoria.

Definir com responsáveis prazo de retenção, legal hold, acesso de auditor, descarte autorizado e destino de backups. Não aplicar TTL automático ao ledger. Evidências sanitizadas para relatórios públicos; conteúdo completo somente no repositório protegido. Testar restauração com comparação de cabeças, lacunas, UUIDs e pendências, sem retransmitir PATCH.
