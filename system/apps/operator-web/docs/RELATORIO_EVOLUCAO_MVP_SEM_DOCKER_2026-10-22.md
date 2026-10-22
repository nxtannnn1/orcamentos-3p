# Evolução do MVP sem Docker — 22/10/2026

## 1. Estado inicial e preservação

Repositório: `orcamentos-3p`, branch `infra-lab`.
O Git inicial tinha nove arquivos modificados e cinco novos, incluindo as correções P0 e os três documentos de 22/10. Foram preservados; não houve reset, checkout, commit ou push. O primeiro `git status` dentro do sandbox falhou; a consulta com acesso ao diretório autorizado confirmou a branch e o diff. Não foi necessário modificar configuração Git.

O comparador já tinha seleção por material, quantidades, extremos, percentual e resumo. A conferência já tinha bloqueio de ações concorrentes, preservação de rascunhos durante edição, reconciliação e guardas de auditoria. Não foram reimplementados esses fluxos. As contagens anteriores eram 1.409 testes aprovados e 24 ignorados.

## 2. Documentação e contratos analisados

- `docs/RELATORIO_CORRECOES_P0_2026-10-22.md`.
- `docs/RELATORIO_HOMOLOGACAO_E2E_2026-10-22.md`.
- `docs/GUIA_ESTUDO_AUTENTICACAO_SHAREPOINT_VALIDACAO.md`.
- README raiz, portal, componentes, SharePoint, Microsoft Lists e scripts n8n.
- AGENTS do portal; o AGENTS superior referenciado continua ausente.
- `docs/SEGURANCA-OPERACIONAL.md`, `docs/PERSISTENCIA-DECISAO-ETAPA-C.md` e guia `use-client.md` da versão Next instalada.
- Tipos `operator.ts`, `price-comparison.ts`, `sharepoint-types.ts`, resolvedor Pessoa, contratos e testes de decisão completa, transporte, comparação, controller e integridade dos workflows.
- Snapshots das oito listas Microsoft Lists. Não se localizou um diretório de ADRs; as decisões relevantes estão nos documentos acima.

## 3. Melhorias e defeitos corrigidos

### Interface e comparador

1. Quantidade inválida em uma seleção era convertida em zero na soma, que aparecia como “Total geral estimado”. Agora o subtotal continua inválido e o total fica indisponível, com orientação explícita. Corrigir a quantidade restaura o cálculo sem perder a oferta escolhida.
2. Somas consolidadas podiam ultrapassar `Number.MAX_SAFE_INTEGER` mesmo com parcelas válidas. `sumPriceCents` soma em BigInt e só retorna centavos representáveis com segurança. Diferenças dependentes também ficam indisponíveis quando o total não é representável.
3. O rótulo do resumo agora informa sua cobertura: “Total estimado das ofertas selecionadas”.
4. Carregamento do catálogo e ofertas tem `role=status`; falha na consulta de ofertas permite tentar novamente mantendo seleção e quantidade.
5. Avisos distinguem preços cotados, estimativas e histórico. O comparador não consulta nem escreve `Historico_Precos`; data do orçamento não garante validade comercial. Demonstrações sinalizam valores e diferenças fictícios.
6. Na conferência, a confirmação mock prometia registro com identidade e o sucesso dizia “salva”. Agora ambos explicam simulação em memória, perda possível ao reiniciar e ausência de persistência real. A mensagem de sucesso continua posterior à resposta do repositório.

Equivalência continua exigindo ID oficial aprovado e unidade compatível. Normalização de caixa/espaços de unidade não converte CX em UN; descrição semelhante não prova equivalência. Quantidade desejada multiplica o preço unitário para estimativa: não substitui quantidade/total da proposta original. Frete, impostos adicionais, condições comerciais, validade e faixas por volume não entram no cálculo. Não foi criada uma economia realizada nem uma integração histórica fictícia.

### Identidade OID → Pessoa

Novo `ExplicitPersonResolver`, server-only, implementa a interface existente com fonte injetada `PersonBindingSource`. **Não está ligado à factory, às variáveis de ambiente ou ao probe.** Nenhuma origem corporativa foi escolhida ou ativada.

Contrato proposto: `tenantId`, `oid` (GUIDs), `siteId` (escopo exato), `lookupId` (decimal positivo seguro), `status` (`active`/`revoked`), `evidenceId` (referência administrativa), `verifiedAt` e `expiresAt` (UTC ISO canônico com milissegundos). A chave lógica é tenant/OID/site; lookup identifica Pessoa apenas no site. Nome e email não são chaves nem fallback.

A fonte deverá devolver snapshot completo e autoritativo. O adaptador limita a 10.000 registros, valida todos os registros, rejeita duplicatas mesmo quando uma está revogada, colisão de Pessoa entre identidades ativas, evidência futura/expirada e respostas inválidas. Falhas externas são sanitizadas. Não mantém cache nem provisiona usuário. Os metadados de evidência não são devolvidos como Pessoa ao restante da aplicação.

Os snapshots versionados não contêm uma estrutura completa tenant/OID/site/Pessoa. `Historico_Precos.Aprovador` é User; é autoria de uma ocorrência, não diretório corporativo. Os campos de autoria em itens, confirmados pelo relatório de leitura real anterior e ausentes do snapshot antigo, também não demonstram um cadastro autoritativo. Não reaproveitar histórico de decisões como prova de vínculo. Uma lista administrada ou outra fonte autorizada pode implementar a interface sem criar serviço novo, mas a TI precisa definir origem, responsável, acesso mínimo, unicidade, revogação, prazo de validade e manutenção. O schema local não comprova ausência de outras estruturas no tenant.

### SharePoint e contratos

O adaptador de comparação agora recusa envelope nulo, item sem `fields`, linha nula e paginação de tipo inválido com erro 502 antes de continuar consultas. Não reduz corrupção a lista vazia nem entrega fallback mock.

Operações permanecem: leitura GET no comparador; PATCH de decisão/correção com ETag e auditoria no portal; POST da rota de correção é reconciliação, não criação Graph; POST/PATCH de ingestão pertencem aos workflows existentes. Nenhuma nova operação de escrita foi adicionada.

Nos snapshots, Quantidade é Number, preços são Currency, materiais/orçamento são Lookup, Status_Revisao e Enviado_Historico são Choice; nomes internos e metadados atuais ainda precisam ser comparados no ensaio autorizado. Os testes existentes de decisão completa, PATCH, erros, concorrência e auditoria foram executados na suíte. Os testes n8n executam nós com fixtures para POST novo, PATCH condicional, reexecução e conflito ETag, sem chamadas corporativas.

## 4. Arquivos desta entrega

Base relativa à raiz do repositório: `system/apps/operator-web`.

| Caminho relativo à base | Mudança |
| --- | --- |
| `src/domain/price-comparison.ts` | Soma monetária segura e propagação de indisponibilidade |
| `src/domain/price-comparison.test.ts` | Regressão de overflow |
| `src/components/price-comparison-state.ts` | Total indisponível para subtotal inválido |
| `src/components/price-comparison-state.test.ts` | Quantidade inválida e recuperação preservando seleção |
| `src/components/price-comparison-workspace.tsx` | Alertas, carregamento, retry e distinção de fontes |
| `src/components/price-comparison-workspace.test.tsx` | Novo: renderização dos avisos mock/SharePoint |
| `src/components/validation-workspace.tsx` | Mensagens de decisão por origem |
| `src/components/decision-messages.ts` | Novo: confirmação e sucesso de simulação |
| `src/components/decision-messages.test.ts` | Novo: aprovação/rejeição mock e confirmação real |
| `src/server/sharepoint/explicit-person-resolver.ts` | Novo: adaptador isolado do contrato de vínculo |
| `src/server/sharepoint/explicit-person-resolver.test.ts` | Novo: escopo, validade, revogação, corrupção e colisões |
| `src/server/sharepoint/sharepoint-price-comparison-repository.ts` | Validação de respostas Graph |
| `src/server/sharepoint/sharepoint-price-comparison-repository.test.ts` | Respostas inválidas e fronteira conferência/comparação |
| `docs/GUIA_ESTUDO_AUTENTICACAO_SHAREPOINT_VALIDACAO.md` | Seção adicional, preservando o conteúdo anterior |
| `docs/RELATORIO_EVOLUCAO_MVP_SEM_DOCKER_2026-10-22.md` | Este relatório |

Arquivos P0 restantes não foram modificados nesta rodada. Cópias anteriores dos arquivos editados estão na área de trabalho deste chat, fora do repositório. Nenhuma dependência foi instalada; package/lockfile e configurações corporativas não foram alterados.

## 5. Testes e resultados

Comandos do portal executados com npm.cmd e dependências existentes:

| Comando | Resultado |
| --- | --- |
| npm.cmd test -- quatro arquivos focados de comparação/identidade | 80 aprovados, sem falhas |
| npm.cmd test (final após mensagens mock) | **1.437 aprovados, 24 ignorados**, 63 arquivos aprovados, 4 ignorados |
| npm.cmd run typecheck | Aprovado, saída 0 |
| npm.cmd run lint | Aprovado, saída 0 |
| npm.cmd run build | Aprovado, saída 0; Next 16.3.8, compilação, TypeScript e geração concluídos |
| node --test scripts/n8n/workflow-integrity.test.mjs (raiz) | **14 aprovados**, nenhum ignorado |
| node scripts/n8n/validate-workflows.mjs (raiz) | 0 erros, **22 avisos** preexistentes de campos/contratos de catálogo |
| git diff --check | Saída 0; avisos LF/CRLF, sem erro de whitespace |

A suíte passou de 1.409 para 1.437 testes aprovados (+28). Os 24 opt-in continuam ignorados. Não houve chamadas reais Graph, ensaio Redis, publicação de workflows, instalação, commit, push ou deploy. O pretest manteve a mitigação existente de braces. O build leu a configuração local existente sem modificá-la.

As suítes focadas não são somadas à suíte completa. Testes ignorados não são aprovados. Testes de componente usam renderização estática e testes do estado; não equivalem a interação visual E2E no navegador.

## 6. Fluxo E2E: evidência e limites

| Etapa | Evidência local | Ainda externo |
| --- | --- | --- |
| n8n → SharePoint | 14 testes existentes de POST/PATCH, guarda humana, ETag e repetição; validador estático | Workflow publicado, execução e payloads reais |
| SharePoint → portal | Repositório, BFF e testes de resposta Graph com fixtures | Sessão humana e tenant |
| Conferência → comparação | Novo teste: pendente/sugestão não entra; snapshot aprovado entra; unidade incompatível sai | Aprovação efetivamente persistida e releitura real |
| Aprovação | Suítes de decisão/correção com auditoria, erros e concorrência simulados | Fonte Pessoa homologada e Redis durável |
| Histórico | Guardas de Enviado_Historico existentes exercitadas; ausência de acesso ao histórico na comparação | Gravação histórica e reconciliação de ponta a ponta |

O teste novo altera uma fixture para representar uma releitura confirmada; não simula que aprovou por chamada real. Não há um único E2E completo da automação até histórico homologado. A ordem atual exige material aprovado antes de participar da comparação; uma sugestão ainda pendente não deve ser promovida só para atender à sequência desejada do MVP.

## 7. Pendências e ensaio controlado futuro

Sem Docker, WSL2 ou Redis nesta execução. Redis continua parte da arquitetura. Fonte Pessoa desativada e correções reais bloqueadas; nenhum bypass de auditoria.

1. TI escolhe e homologa fonte de vínculo e manutenção; implementar adaptador de leitura dessa origem e testar revogação antes de considerar ligá-lo à factory.
2. Preparar Redis autoritativo durável, MFA/perfis e HTTPS e executar opt-in. Não usar memória como substituto produtivo.
3. Seguir §11 do relatório E2E de 22/10: autorização explícita, lista/item sintético isolado, metadados atuais e concessões mínimas, captura de ETag/original, PATCH único, releitura de campos/autoria/UUID e auditoria.
4. Testar concorrência/UUID/repetição, recusa, resultado incerto e reconciliação. Uma reversão exige operação autorizada com novo ETag; não apagar evidências.
5. Confirmar workflows publicados e envio histórico sem duplicação. Não ativar histórico apenas para demonstrar economia.
6. Validar visualmente no navegador a conferência e o comparador com dados fictícios. A implementação e os testes locais não substituem esse aceite humano.

Pronto para demonstração local: avisos de simulação, comparação equivalente, seleção por material, quantidades, indicadores e erro explícito de total. Preparado apenas para testes locais: contrato do vínculo corporativo e integrações com fixtures. Homologação corporativa continua pendente para autoria, auditoria durável, escrita e histórico completo.
