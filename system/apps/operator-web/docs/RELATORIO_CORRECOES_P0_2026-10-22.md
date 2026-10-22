# Relatório de correções P0 — 22/10/2026

## A. Resumo executivo

Baseline: branch infra-lab, HEAD 3a04bc2e2255e4b4d2759c6c9d73064c8ddaff2b; d3e9cc0 presente no histórico. O checkout correto é Documents/meuSistema/orcamentos-3p. O Git estava limpo antes da intervenção. O checkout diferente em IdeaProjects, branch impl-imports2, contém alterações preexistentes e foi preservado. Na retomada após interrupção, os oito arquivos modificados e dois novos desta atividade estavam preservados; nenhuma mudança de terceiros foi observada nesse diff.

Foram corrigidos classificação de respostas inválidas de identidade, tratamento de recusas Graph, paginação da verificação de concessões, recuperação segura do lock de correção, tratamento correspondente na interface e aprovação com estado desconhecido do orçamento. Não houve alteração de arquitetura, dependências, secrets, configuração local, permissões, listas ou workflows remotos. Não houve commit ou push.

**Resultado:** 1.409 testes aprovados, 24 opt-in ignorados, TypeScript, lint e build Next.js aprovados; 14 testes n8n aprovados. A consulta real de metadados confirmou os contratos comparados das quatro listas e uma concessão técnica write em itens. Não foi feita gravação de registros no SharePoint nem homologação de sessão humana.

| Pendência | Situação real |
| --- | --- |
| P0.1 — PERSON_NOT_FOUND | Diagnóstico da fonte concluído; correção local de classificação testada. O vínculo da sessão humana continua dependente de fonte autorizada e homologação. Não resolvido integralmente. |
| P0.2 — escrita SharePoint | Correções locais testadas e build aprovado; schema e concessão consultados ao vivo, somente leitura. Persistência real não verificada. |
| P0.3 — conferência/aprovação | Fluxos e proteções exercitados na suíte local, inclusive recuperação de recusa. E2E n8n/SharePoint/sessão/Redis não homologado. |

## B. Diagnóstico técnico e evidências

### Documentação e arquitetura confrontadas

Inspecionados árvore de arquivos rastreados (491 arquivos na baseline), README raiz e do portal, AGENTS do portal, histórico recente e diff do último commit, contratos Microsoft Lists, documentação n8n, autenticação/sessão/API, persistência Etapa C, Etapa M, relatórios/arquiteturas M.3 e M.4, matriz de permissões, resolução de identidade, diagnóstico do probe, configuração/factory, transportes, serviços, testes e CI. O guia de Route Handlers da versão instalada do Next.js também foi consultado.

O AGENTS do portal referencia um AGENTS superior inexistente no checkout examinado. Não foram inventadas regras para esse arquivo ausente. M.3/M.4 contêm contratos e simuladores isolados de reabertura/ledger, não adaptadores produtivos; não foram conectados às rotas. O auth-service, Keycloak e PostgreSQL não foram incorporados ao MVP.

Divergências documentais:
- O README dizia que faltavam campos de autoria. A inspeção sanitizada atual confirmou os quatro mapeamentos presentes.
- Relatórios antigos tratavam colunas de correção como candidatas. O preflight desta execução confirmou compatibilidade dos campos comparados, sem comprovar escrita.
- O README raiz mantém contagens e commits históricos; não são evidência do estado atual. Este relatório registra a baseline e a execução desta atividade.
- Historico_Precos possui contrato e metadados consultáveis, mas não é alimentado pelo fluxo de comparação do portal.
- A antiga falha F-02 estava em it.fails: aprovação da suíte anterior não significava correção do defeito.

### P0.1 — identidade

A sessão Microsoft usa tid/oid, assinatura, issuer, audience, nonce, expiração, conta corporativa, roles e contexto MFA quando configurado. A sessão JWE exige registro ativo; nome é somente apresentação. Autenticação e autorização são diferentes da resolução de Pessoa para autoria da gravação.

GraphListPersonResolver consulta site e permissões da lista e só aceita user.id e siteUser.id no mesmo objeto V2, no escopo esperado. Ele é uma fonte parcial de vínculos, não um diretório completo de usuários. O diagnóstico real já registrado em DIAGNOSTICO-PROBE-IDENTIDADE.md mostra consulta concluída, oito registros examinados e zero correspondências ao OID da sessão. Essa é a causa comprovada do PERSON_NOT_FOUND observado nessa fonte. Não comprova ausência do usuário no site nem que o acesso seja necessariamente por grupo.

Defeito adicional reproduzido localmente: resolveDecisionPerson classificava resposta não-array como ausência/ambiguidade e podia acessar um valor nulo incorretamente. Agora resposta malformada é 503 PERSON_RESOLUTION_UNAVAILABLE; array vazio mantém 409 PERSON_NOT_FOUND com orientação específica; múltiplos candidatos mantêm PERSON_AMBIGUOUS; escopo divergente continua 403. Nenhum erro vira identidade fictícia.

Não existe no repositório uma fonte alternativa homologada que comprove o vínculo dessa sessão. Inventar lookup, usar email/nome ou conceder acesso só para obter um par violaria os requisitos. Assim, o aceite de operador real permanece aberto.

### Por que as flags estão desativadas

- SHAREPOINT_PERSON_RESOLVER=disabled é a seleção local observada e o padrão de .env.example/factory. Os documentos de identidade registram que a ativação foi adiada até comprovar o vínculo humano. A factory seleciona unavailablePersonResolver nesse estado.
- SHAREPOINT_HUMAN_CORRECTIONS_ENABLED não está efetivamente true. configuration.ts habilita apenas com o texto exato true; o guard de ItemCorrectionService exige ainda Redis fora dos testes.
- resolveDecisionAvailability exige ambas as flags e configuração Redis para oferecer decisões SharePoint na UI. A validação real continua no backend.
- Redis não está configurado; ENTRA_MFA_AUTH_CONTEXT_ID está ausente; origem local é HTTP. São constatações do preflight, não prova de ausência global de MFA no tenant.
- Os quatro mapeamentos reviewedByPerson, reviewedByOid, reviewedAt e decisionId estão presentes. Não eram o bloqueio atual comprovado.

As flags não foram alteradas. Seu desligamento é coerente com a falta de homologação e auditoria durável. Ativar apenas a flag do resolvedor não acrescentaria o vínculo ausente à fonte.

### P0.2 — transporte e persistência

O token técnico é obtido por client_credentials com Graph /.default; ele não representa o operador. A política de escrita exige Lists.SelectedOperations.Selected e concessão na lista, recusando permissões amplas de escrita. Não foram solicitadas novas permissões.

Problemas corrigidos:
1. A verificação de concessão lia apenas a primeira página. Agora percorre até 20 páginas/10.000 entradas, valida envelope, limita destino à mesma coleção, recusa ciclos e só permite PATCH após consulta completa.
2. HTTP 400/401/409/429 eram reduzidos a GRAPH_WRITE_FAILED genérico. GraphWriteError distingue not_sent, rejected e unknown sem copiar corpos remotos. 401 técnico não é apresentado como sessão humana inválida.
3. Retry-After numérico de 429 chega ao BFF; ausência/formato inválido usa 60 segundos. Não há retry automático de escrita.
4. Erros antes do envio, na obtenção do token/verificação de concessão, são marcados not_sent. Timeout, 5xx e resposta ilegível após envio continuam incertos.

| HTTP Graph | Resposta BFF / código |
| --- | --- |
| 400 | 502 GRAPH_WRITE_INVALID_PAYLOAD |
| 401 | 503 GRAPH_WRITE_AUTHENTICATION_FAILED |
| 403 | 403 GRAPH_WRITE_FORBIDDEN |
| 404 | 404 ITEM_NOT_FOUND |
| 409 ou 412 | 409 DECISION_CONFLICT |
| 429 | 429 GRAPH_WRITE_THROTTLED, Retry-After |
| 5xx | Resultado incerto; serviço exige releitura/reconciliação |

Esses códigos específicos e CORRECTION_NOT_APPLIED são evolução explícita do contrato de erros. Payloads de decisão/correção e URLs existentes permanecem. Consumidores externos devem reconhecer os códigos novos.

Consulta real nesta atividade: node --env-file=.env.local scripts/sharepoint-preflight.mjs --live --discover-history, saída 0. OAuth técnico adquirido; role restrita observada; listas materials, budgets, items e history READ_OK; todos os campos comparados compatible; WRITE_GRANT_PRESENT_NOT_EXERCISED. Não se deve interpretar o status estático personResolution desse utilitário como novo teste de sessão/Pessoa.

Campos relevantes confirmados pelo preflight: Responsavel_Decisao (Pessoa única), Data_Decisao (data/hora), Revisado_Por_Oid e Decisao_Id (texto), campos de correção JSON e UUID, material/orçamento como lookups, quantidade e preços segundo os contratos. Historico_Precos usa Aprovador; isso não muda o nome da coluna em itens. O preflight compara um conjunto definido, não certifica todas as propriedades possíveis das listas.

### P0.3 — correção e aprovação

A falha F-02 mantinha lock após recusa explícita porque o transporte perdia a natureza da resposta. Agora os serviços usam writeDefinitelyNotApplied. O resultado denied é gravado antes de liberar por CAS, que só remove lock do mesmo UUID. Se auditar falhar, não libera. Se a resposta do CAS falhar, uma nova reconciliação recupera a evidência terminal sem reenviar PATCH. Repetir UUID recusado retorna CORRECTION_NOT_APPLIED; UUID com conteúdo diferente continua conflito.

A interface reconhece os novos erros, remove a pendência local quando o backend comprova que não foi aplicado e não chama onSaved nesse caminho. Falha incerta mantém UUID e reconciliação. Nenhum sucesso é exibido antes de confirmação.

Outro defeito: mapBudget tratava valores desconhecidos como EM_REVISAO para apresentação, e a aprovação usava esse resultado permissivo. A gravação agora exige status bruto PENDENTE/EM_REVISAO/CORRIGIR, alinhado à guarda existente de correção. Estado vazio/desconhecido/fechado bloqueia antes da intenção e do PATCH.

Proteções preservadas: payload validado server-side, autoria da sessão, autorização Operador/Comprador, origem e limites, ETag/If-Match, original e registro de alterações, material oficial, justificativa de rejeição, item não enviado ao histórico e releitura completa após gravação. Repetição de decisão com ETag antigo não produz nova gravação; não há promessa de exactly-once distribuído. Correção usa UUID próprio. n8n preserva campos humanos e exige estado/ETag elegíveis.

## C. Arquivos e impactos

Todos os caminhos abaixo são relativos a system/apps/operator-web.

| Arquivo | Alteração |
| --- | --- |
| src/server/sharepoint/graph-write-error.ts | Novo erro interno com evidência de envio/recusa |
| src/server/sharepoint/p0-regression.test.ts | Novas regressões de identidade, transporte, lock e contrato de UI |
| src/server/sharepoint/graph-read-transport.ts | Paginação de concessões e classificação das recusas |
| src/server/sharepoint/person-resolver.ts | Resposta inválida separada de identidade ausente |
| src/server/sharepoint/item-correction-service.ts | Recusa durável, CAS e recuperação sem novo envio |
| src/server/sharepoint/sharepoint-operator-repository.ts | Recusa explícita e estado bruto do orçamento |
| src/server/sharepoint/realistic-graph-regression.test.ts | F-02 convertido em teste normal; estados inválidos |
| src/server/data-source/route-error.ts | Retry-After sanitizado |
| src/repositories/bff/correction-error.ts | Novos códigos terminais |
| src/components/human-correction-editor.tsx | Limpeza de pendência comprovadamente não aplicada |
| README.md | Estado atualizado e links para esta entrega |
| docs/RELATORIO_CORRECOES_P0_2026-10-22.md | Este relatório |
| docs/GUIA_ESTUDO_AUTENTICACAO_SHAREPOINT_VALIDACAO.md | Guia vinculado à implementação |

Não foram alterados package.json, lockfile, .env.local, schemas remotos ou scripts Lua do gateway. Os arquivos gerados pelo build e a mitigação pretest em node_modules não integram a entrega versionável.

## D. Testes e verificações

Comandos npm executados com npm.cmd do Node instalado, no diretório do portal.

| Comando | Evidência |
| --- | --- |
| npm test -- src/server/sharepoint/person-resolver.test.ts src/server/sharepoint/graph-write-transport.test.ts src/server/sharepoint/realistic-graph-regression.test.ts | Baseline: 47 aprovados, 1 falha esperada; reproduziu F-02 |
| npm test -- src/server/sharepoint | Rodada intermediária: 351 aprovados |
| npm test | Final do código: 1.409 aprovados, 24 opt-in ignorados; 60 arquivos aprovados, 4 ignorados |
| npm run typecheck | Saída 0; geração de tipos e tsc |
| npm run lint | Saída 0; processo concluído e resultado recuperado na retomada |
| npm run build | Saída 0; Next 16.3.8, compilação, TypeScript e geração de páginas concluídos |
| node scripts/n8n/validate-workflows.mjs (raiz) | 0 erros, 22 avisos de contratos/campos de catálogo |
| node --test scripts/n8n/workflow-integrity.test.mjs (raiz) | 14 aprovados |
| node --env-file=.env.local scripts/sharepoint-preflight.mjs --live --discover-history | Leitura real: metadados compatíveis e concessão observada; sem escrita |
| git diff --check | Saída 0; somente avisos informativos LF/CRLF |

O primeiro pretest e a primeira execução Node test n8n foram bloqueados por EPERM do sandbox; executados novamente com autorização e aprovados. Uma inspeção auxiliar node -e falhou por quoting PowerShell; refeita via arquivo temporário, imprimindo somente flags/booleanos. Nenhum desses erros foi contado como teste aprovado. A interrupção anterior não deixou um build comprovado; o build foi concluído na retomada.

Cobertura relevante: respostas de identidade malformadas, ausência/ambiguidade/escopo, autorização e sessão na suíte existente, respostas HTTP listadas, paginação posterior/insegura/cíclica, recusas sem novo PATCH, timeout/5xx bloqueados, auditoria indisponível, CAS recuperável, conteúdo e versão conflitantes, origem preservada, releitura divergente e orçamento desconhecido.

Limites: testes integrados locais usam rede/ledger simulados. Os 24 opt-in não foram executados. Não houve sessão humana, MFA real, Redis real, PATCH real, n8n publicado ou inspeção visual E2E. Build Cloudflare não executado; o build de produção solicitado foi o Next.js. A análise final do diff procura padrões reconhecíveis de secrets; não certifica ausência de todo dado sensível possível.

## E. Pendências e critérios de aceite

- [x] Documentação relevante analisada e confrontada.
- [x] Causa de PERSON_NOT_FOUND na fonte consultada identificada pelo probe registrado.
- [ ] Operador real identificado com vínculo homologado: depende de fonte autorizada; apenas classificação de falhas corrigida/testada.
- [ ] Escrita SharePoint integralmente corrigida e homologada: código testado, metadados reais verificados; falta PATCH autorizado.
- [ ] Fluxo completo de conferência/aprovação homologado: validação local concluída.
- [x] Rastreabilidade existente preservada e recuperação de recusa testada.
- [x] Testes adicionados/ajustados e suíte aplicável executada.
- [x] TypeScript, lint e build Next verificados.
- [x] Sem credenciais reais adicionadas às alterações; fixtures sintéticas.
- [x] Relatório técnico e guia de estudo produzidos.
- [x] Dependências externas identificadas.

Resolvidos localmente: classificação incorreta de identidade malformada; perda de informação de recusa; concessão em página posterior; lock F-02 em recusas comprovadas; pendência da UI após resultado terminal; orçamento desconhecido admitido na decisão.

Dependências externas: vínculo tenant/OID/site/lookup, Redis autoritativo durável, sessão humana/MFA/perfis, item de teste autorizado e comparação dos workflows publicados. A concessão técnica já observada não deve ser ampliada por suposição.

Limitações mantidas: recuperação administrativa de decisões incertas não é um fluxo completo do operador; evidências originais já reservadas podem exigir reconciliação se o item mudar externamente antes de nova correção; falha local anterior ao envio sem evidência terminal continua conservadoramente bloqueada. M.3/M.4 não fornecem ledger produtivo. Os 22 avisos n8n são de contratos de catálogo preexistentes; não se devem mudar colunas sem conferência.

## F. Procedimento verificável para administração e próximos passos

1. Confirmar ambiente de homologação, lista/item sintético e responsáveis; não usar registros produtivos sem autorização específica.
2. Com uma sessão Entra válida, executar o probe somente leitura já existente. Registrar somente status/contadores, nunca cookie, token, OID ou lookup em relatório público.
3. Se faltar o par, obter evidência administrativa da associação tenant/OID/site/lookup por fonte autorizada. Não conceder permissão humana somente para fazer o resolvedor funcionar; não usar email/nome como chave. Se a fonte atual não cobrir os operadores, aprovar contrato/adaptador de identidade antes de ativar.
4. Manter consentimento Graph restrito e verificar concessões nas listas necessárias. A aplicação runtime já mostrou write em itens; leitura nas demais deve permanecer mínima. Nenhuma necessidade de ampliar a permissão foi demonstrada.
5. Provisionar/configurar Redis REST autoritativo com credencial server-side, persistência, retenção, backup e restauração aprovados. Validar sessão/revogação, auditoria e CAS com os testes opt-in aplicáveis.
6. Conferir os quatro campos de autoria com metadados atuais. Os mapeamentos locais já existem; não duplicar colunas. Configurar contexto MFA e verificar política efetiva no Entra, roles e origem HTTPS para o ambiente alvo.
7. Somente após esses pré-requisitos, selecionar graph-list-permissions se a fonte estiver homologada e habilitar correções no ambiente isolado. São condições necessárias, não autorização para escrever.
8. Com autorização explícita de gravação, capturar ETag/original, corrigir, reler, decidir e reler novamente. Conferir Pessoa, OID, UUID, data, material, estado e registros Redis; repetir com versão antiga, concorrência e resposta perdida. Guardar evidências sanitizadas e aceite.
9. Homologar a integração n8n publicada, comparando-a aos JSONs versionados. Historico_Precos/cesta/reabertura ficam como evolução separada.

Próxima ação do MVP: fechar o vínculo de identidade por leitura com sessão humana e preparar Redis; depois realizar um único ensaio de escrita isolado autorizado. Não há liberação para produção nesta entrega.

Referências oficiais consultadas: [Selected permissions](https://learn.microsoft.com/en-us/graph/permissions-selected-overview), [permissões de lista](https://learn.microsoft.com/en-us/graph/api/list-list-permissions?view=graph-rest-1.0), [PATCH e If-Match](https://learn.microsoft.com/en-us/graph/api/listitem-update?view=graph-rest-1.0), [throttling](https://learn.microsoft.com/en-us/graph/throttling). Selected exige consentimento, concessão no recurso e token apropriado; If-Match protege a versão, e 429 exige espera. Esses contratos não substituem homologação do tenant.


### Revisão final da entrega

Git permanece em infra-lab, com 9 arquivos rastreados modificados e 4 novos (13 arquivos da tarefa), sem commit/push. Documentos gravados e README corrigido. git diff --check final: saída 0. Varredura das linhas adicionadas e dos quatro arquivos novos: zero padrões de chave privada, token GitHub e JWT realista. O primeiro scanner foi bloqueado por spawnSync EPERM e a repetição autorizada terminou com saída 0. A verificação é limitada a esses padrões e complementa a revisão do conteúdo; não é certificação de scanner completo. Nenhuma alteração de código ocorreu depois da suíte final e do build aprovados; as últimas alterações foram documentais.
