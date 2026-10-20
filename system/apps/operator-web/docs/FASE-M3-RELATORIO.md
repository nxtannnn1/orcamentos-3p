# Fase M.3 — relatório de entrega local

20/10/2026 — checkout autorizado `Documents/meuSistema/orcamentos-3p`, branch `infra-lab`, HEAD `5decc25`.

## A. Resumo executivo

Implementados contratos executáveis isolados, validação de intenção/evidência e simulador exclusivamente de testes para reabertura e reconciliação administrativa. Preservadas as alterações locais anteriores de edição, aprovação, rejeição, identidade e auditoria. Nenhuma rota funcional de reabertura foi adicionada.

Especificados ledger append-only, durabilidade, recuperação, confidencialidade, retenção, controle de acesso e integração futura. A persistência real permanece bloqueada por decisões de contrato e infraestrutura de auditoria, não por falha dos testes locais.

## B. Arquivos desta entrega

Todos os oito arquivos abaixo são novos e permanecem sem commit:

| Arquivo relativo ao Operator Web | Finalidade |
|---|---|
| `src/server/reopening-proposal/contract.ts` | Schema v1, validação estrita, autorização por atestação interna, transição e classificação de reconciliação |
| `src/server/reopening-proposal/contract.test.ts` | Testes do schema, identidade, permissão, transição e conteúdo integral |
| `src/server/reopening-proposal/reconciliation.test.ts` | Simulações de concorrência, repetição, falhas e recuperação por UUID |
| `src/server/reopening-proposal/__test-support__/fixtures.ts` | Identidades, decisões e snapshots sintéticos |
| `src/server/reopening-proposal/__test-support__/simulator.ts` | Modelo em memória de reserva, tentativa e evidências; sem rede |
| `docs/FASE-M3-ARQUITETURA.md` | Contrato e proposta de persistência, segurança e operação |
| `docs/FASE-M3-DEPENDENCIAS.md` | Investigação do audit/outdated e remediação priorizada |
| `docs/FASE-M3-RELATORIO.md` | Evidências e limites desta entrega |

A M.3 não modificou os arquivos funcionais previamente alterados. O `git status` continua exibindo essas alterações das rodadas anteriores, inclusive README, `.env.example`, serviços, componentes e testes. Não atribuir todo o diff em relação a `5decc25` à M.3.

## C. Arquitetura

Consultar [proposta técnica](FASE-M3-ARQUITETURA.md). O modelo preserva conteúdo integral da decisão e correção anteriores e separa autor da decisão de autor da reabertura. A recomendação é manter `Responsavel_Decisao` como responsável pela decisão anterior, com autoria da reabertura no ledger separado; depende de aprovação funcional.

O contrato não é consumido pelas rotas/factories existentes. A pesquisa por imports fora do diretório da proposta não encontrou referências. O build não apresentou endpoint de reabertura.

Intenções e evidências têm UUIDs e versões; resultados de reconciliação são calculados, sem setter para forçar confirmação. Uma nova observação acrescenta evidência e preserva outcomes antigos. Timeout não permite reenviar no simulador. A atomicidade do modelo não comprova lock/CAS/durabilidade em Redis real.

## D. Validação e testes

| Comando | Resultado | Saída |
|---|---|---|
| `npm test -- src/server/reopening-proposal` | 76 testes / 2 arquivos aprovados | 0 |
| `npm test` | 845 aprovados, 24 ignorados; 53 arquivos aprovados, 4 ignorados | 0 |
| `npm run typecheck` | Aprovado | 0 |
| `npm run lint` | Aprovado | 0 |
| `npm run build` | Aprovado, Next.js 16.3.8 | 0 |
| `git diff --check` | Sem erros de whitespace; avisos de conversão LF/CRLF em arquivos anteriores | 0 |

Comparação com referência: 769 → 845 testes aprovados (+76), 51 → 53 arquivos aprovados (+2), 24 opt-in continuam ignorados. Sem regressão observada na suíte executada.

Cenários novos: schema inválido/desconhecido, justificativa ausente e limites, aprovado/rejeitado elegíveis, perfil negado, sessão inválida/expirada, tenant/OID/site/Pessoa divergentes, histórico ausente/desconhecido/enviado, orçamento fechado, ETag antigo, concorrência simulada, duplo clique, UUID igual com conteúdo igual/diferente, PATCH simulado negado, timeout antes/depois da persistência possível, releitura falha/divergente, Redis simulado indisponível antes/depois da tentativa, reconciliação administrativa autorizada/negada, outcomes inconclusivos e preservação integral de eventos anteriores.

Nenhuma falha permaneceu nas validações finais. Os testes de sucesso de reabertura são de contratos e simulações, NÃO homologação integrada. Não foram executados testes reais de Redis, Graph ou SharePoint nem opt-in de escrita.

`pretest` reaplicou a mitigação local já existente de braces em node_modules. As versões das dependências não foram alteradas. SHA-256 de package.json e package-lock.json permaneceram iguais aos registrados no início da M.3:

- package.json: `CEE78357557A050E7F44C923683229A9744F46E44E75AFFF3C0CB7978801709C`
- package-lock.json: `7AB96FE5081C4E90B6BB6194CDC1E68C844568342B3944AAD183AE63EB2791C8`

## E. Vulnerabilidades

Consultar [relatório de dependências](FASE-M3-DEPENDENCIAS.md). Audit: cinco classificações altas propagadas na cadeia de desenvolvimento eslint-config-next → plugin Next → fast-glob → micromatch → braces. Há mitigação local preexistente, mas não correção upstream publicada na consulta. O downgrade major sugerido pelo audit não foi aplicado. Nenhuma atualização automática foi feita.

## F. Pendências e requisitos para homologação

- Aprovar significado de `Responsavel_Decisao` após reabertura e confirmar nomes internos reais.
- Definir papéis explícitos de reabertura/reconciliação e autorização por orçamento/item.
- Aprovar persistência do marcador UUID, schema do ledger, garantias de atomicidade e durabilidade, controle de acesso, retenção e recuperação.
- Definir tratamento de decisões legadas sem conteúdo integral recuperável.
- Implementar adaptadores somente em próxima fase autorizada; testar falhas de processo, Redis, fencing/CAS, backup/restauração e concorrência real.
- Conferir contratos remotos e obter autorização específica antes de qualquer escrita em homologação.
- Manter o risco de dependências registrado e executar remediação em tarefa separada.

## G. Status

| Gate | Resultado |
|---|---|
| GO técnico local da M.3 | **SIM**, limitado a contratos, testes e especificação |
| GO para implementação da persistência real | **CONDICIONADO**, decisões e contrato de armazenamento pendentes |
| GO para homologação integrada | **NÃO**, dependências acima e autorização de escrita pendentes |
| GO para produção | **NÃO** |

Recomendação: próxima fase deve aprovar o ledger e o contrato remoto, depois implementar os adaptadores com testes de recuperação e autorização por recurso. Não promover o simulador a serviço produtivo.

Não houve commit, push, deploy, migração, alteração de lista/coluna/permissão ou escrita real SharePoint nesta fase. O checkout IdeaProjects não foi acessado.
