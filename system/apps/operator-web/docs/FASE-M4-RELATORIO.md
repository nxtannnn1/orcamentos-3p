# Fase M.4 — relatório de consolidação

Data: 20/10/2026. Escopo: contratos de persistência e preparação de homologação, sem integração de escrita.

## Estado inicial

Checkout conferido: `C:\Users\NATAN\Documents\meuSistema\orcamentos-3p`, aplicação `system/apps/operator-web`, branch `infra-lab`, HEAD `5decc25`. O status já continha 21 arquivos rastreados alterados e arquivos novos das fases anteriores, sem commit. Essa situação correspondeu à referência autorizada.

Foram lidos os três relatórios M.3, README, AGENTS, segurança operacional, contrato de persistência da decisão, schema de decisão e contratos/testes M.3. Nenhum candidato de campo foi tratado como configuração remota aprovada. O checkout IdeaProjects não foi acessado.

## Entrega executada

Contratos TypeScript isolados para aprovação, rejeição e reabertura, eventos versionados, validadores de intenção/snapshot/eventos, projeção de estados a partir de evidências, guard de permissões e modelo de ledger em memória exclusivo de testes.

A direção funcional solicitada foi consolidada: reabertura preserva Pessoa/OID/data/UUID da última decisão e registra seu próprio ator separadamente. Não alteramos os fluxos produtivos existentes de aprovação/rejeição nem o mapeamento real SharePoint.

## Arquivos criados

| Arquivo relativo à aplicação | Finalidade |
|---|---|
| `src/server/persistence-proposal/ledger.ts` | Tipos v1, validação estrita, snapshots integrais e projeção de confirmação/bloqueio |
| `src/server/persistence-proposal/permissions.ts` | Matriz de ações e guard backend proposto, sem integração com rotas |
| `src/server/persistence-proposal/__test-support__/memory-ledger.ts` | Simulação de append, CAS, repetição e resposta de commit perdida |
| `src/server/persistence-proposal/ledger.test.ts` | 112 testes unitários e simulados |
| `docs/FASE-M4-ARQUITETURA.md` | Ledger, UUID, autoria, integridade, recuperação e armazenamento recomendado |
| `docs/FASE-M4-PERMISSOES.md` | Perfis propostos, matriz e limites de integração |
| `docs/FASE-M4-HOMOLOGACAO.md` | Portões, checklist, matriz operacional e aceite |
| `docs/FASE-M4-DEPENDENCIAS.md` | Diagnóstico atualizado e plano de remediação |
| `docs/FASE-M4-RELATORIO.md` | Este relatório |

Não foram editados arquivos preexistentes do código, documentação ou configuração. Os arquivos alterados das fases anteriores continuam locais e sem commit. Scripts temporários de cópia ficaram fora do repositório.

## Implementado versus especificado

**Implementado localmente:** validação de primeira decisão sem inventar histórico, preservação de correção integral, justificativa obrigatória em rejeição/reabertura, autoria separada, sequência/vínculo/UUID, detecção de divergência de dados, bloqueio sem prova, matriz de permissões e validação de atestações internas.

**Somente simulado:** reserva/CAS de um item, append imutável por API, resposta perdida antes/depois do commit, duplicação e falhas de auditoria. O simulador não possui rede nem comprova persistência após queda de processo.

**Somente especificado:** banco/journal durável e arquivo imutável, recibo de commit verificável, guarda de pendências após failover, multi-stream administrativo, marcador físico de reabertura, UI de histórico, integração de novos perfis, políticas de retenção e recuperação. Nenhum endpoint de reabertura foi criado.

## Recomendações arquiteturais

- Usar ledger transacional durável e preservação externa imutável; Redis não deve ser o único histórico.
- Manter `Decisao_Id` exclusivo da decisão. Aprovar marcador específico de reabertura, sem definir/criar coluna nesta fase.
- Preservar `Responsavel_Decisao`, `Revisado_Por_Oid`, `Data_Decisao` e `Decisao_Id` na reabertura; alterar somente estado atual/material e marcador aprovado.
- Separar permissões de solicitar, executar, auditar e reconciliar; nenhum perfil pode forçar confirmação.
- Liberar item somente após prova terminal durável e revalidação de estado/autorização; timeout nunca autoriza retry com UUID novo.

Detalhes e alternativas estão em [arquitetura](FASE-M4-ARQUITETURA.md) e [permissões](FASE-M4-PERMISSOES.md).

## Evidências de validação

| Validação final | Resultado | Exit |
|---|---|---|
| `npm test` | 957 aprovados, 24 ignorados; 54 arquivos aprovados, 4 ignorados | 0 |
| `npm run typecheck` | Aprovado | 0 |
| `npm run lint` | Aprovado | 0 |
| `npm run build` | Aprovado com Next 16.3.8 | 0 |
| `git diff --check` | Aprovado | 0 |

Referência M.3: 845 → 957 testes (+112), 53 → 54 arquivos aprovados (+1), 24 opt-in continuam ignorados. Não houve regressão observada na suíte.

Na primeira validação incremental, 108 novos testes passaram, mas o typecheck apontou quatro erros de refinamento de tipos no módulo novo. Foram corrigidos sem enfraquecer expectativas. Acrescentaram-se quatro testes de preservação da correção integral, UUID anterior, divergência antes de envio e nova decisão depois de evidência terminal. A regressão final passou.

Os novos testes cobrem matriz completa perfil/ação, sessão e recurso inválidos, schema desconhecido, campos indevidos, autoria/ETag/UUID/data, justificativas, estados incertos, divergência de Pessoa/item/orçamento/material/conteúdo, evidência durável indisponível, ordenação, duplo envio, repetição idêntica/conflitante, CAS concorrente e resposta perdida do ledger.

Testes reais Redis/Graph/SharePoint não foram executados. Opt-in de efeitos remotos continuam ignorados. O build comprova compilação local, não autenticação real ou homologação do armazenamento.

## Dependências e segurança

Audit completo confirmou cinco alertas altos de uma cadeia com um advisory independente de braces. Audit sem devDependencies retornou zero alertas; isso não certifica ausência de risco em ferramentas de CI/build. Cadeia e Node 24.16.0 foram conferidos. Consulta npm ainda mostra braces 3.0.3 e plugin Next 16.4.2 com fast-glob 3.3.1.

Nenhum upgrade, `audit fix`, downgrade ou remoção da mitigação foi realizado. O pretest executou o patch preexistente de braces. O [plano de remediação](FASE-M4-DEPENDENCIAS.md) registra prioridades, critérios de aceite e limites da análise de alcance.

## Pendências e riscos residuais

1. Aprovar tecnologia/contrato do ledger, durabilidade, imutabilidade, retenção, RPO/RTO e restauração.
2. Aprovar marcador remoto; conferir metadados reais de Pessoa/OID/data/UUID e permissões mínimas.
3. Configurar e homologar perfis administrativos em tarefa autorizada; os nomes atuais são candidatos.
4. Validar Pessoa com sessão Microsoft real, MFA e Redis autoritativo. Guards locais recebem atestações internas, não validam cookies ou políticas do tenant.
5. Definir tratamento de histórico legado incompleto e evidências tardias após operações posteriores.
6. Implementar adaptadores e testar concorrência entre processos, failover, backup, retenção e integridade.
7. Autorizar especificamente o item/janela e as escritas da homologação; seguir [plano operacional](FASE-M4-HOMOLOGACAO.md).

Riscos: transação distribuída inexistente entre Graph e ledger, janela de operação incerta, privilégios administrativos sobre armazenamento, dados sensíveis em snapshots integrais e advisory ainda aberto. Os contratos/modelos reduzem ambiguidades, mas não eliminam esses riscos sem implementação e validação reais.

## GO / NO-GO

| Ambiente/ação | Status |
|---|---|
| Técnico local M.4 | **GO**, limitado aos contratos, testes e documentação entregues |
| Provisionamento | **PENDENTE de autorização específica**, nada provisionado |
| Homologação integrada | **PENDENTE / NO-GO atual**, pré-requisitos e autorização de escrita ausentes |
| Produção | **NÃO AUTORIZADO** |

Próxima fase recomendada: aprovação do ledger, marcador e perfis; implementação dos adaptadores em escopo separado; então homologação controlada conforme checklist. Não promover o modelo em memória a armazenamento produtivo.

Não houve escrita real Graph/SharePoint, criação de lista/coluna, migração, alteração de MFA/permissão, serviço/Docker, deploy, push ou commit.
