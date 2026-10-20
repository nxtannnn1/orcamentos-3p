# Fase M — regras funcionais e preparação de homologação

## Escopo desta continuação

Branch infra-lab, base 5decc25, checkout Documents/meuSistema/orcamentos-3p.
As alterações locais da rodada anterior foram preservadas. Referência de testes:
728 aprovados e 24 opt-in ignorados. Não houve acesso ao checkout IdeaProjects,
PATCH real, criação/alteração de listas, colunas, permissões, migração, alteração
de MFA, commit, push, deploy ou início de serviços.

## Aprovador e mapeamento candidato

Conforme orientação funcional, Responsavel_Decisao é o candidato para representar
o aprovador/responsável da decisão em Itens_Importados. Não existe proposta de
criar a coluna Aprovador. Os metadados obtidos por GET em 20/10 estão no relatório
[anterior](FASE-M-2026-10-20.md); não foi necessário repetir consultas reais.

| Propriedade | Nome interno candidato | Contrato observado |
| --- | --- | --- |
| reviewedByPerson | Responsavel_Decisao | Pessoa única, peopleOnly, editável |
| reviewedByOid | Revisado_Por_Oid | Texto |
| reviewedAt | Data_Decisao | Data/hora |
| decisionId | Decisao_Id | Texto |

O fragmento [phase-m-decision-fields.candidate.json](phase-m-decision-fields.candidate.json)
deve ser mesclado ao objeto items do mapa completo somente na preparação autorizada.
.env.local não foi modificado. A configuração não recebe defaults silenciosos,
e ausência de campos continua bloqueando escrita. Testes conferem esse fragmento
contra a configuração e as fixtures de decisão.

O backend recebe tenant/OID da sessão validada, resolve um único usuário do site
e envia Responsavel_DecisaoLookupId. Não envia nome, email ou OID como Pessoa.
O frontend não escolhe autor, tenant, data ou UUID. Papéis, MFA, schema,
permissões Graph, Redis, ETag e demais bloqueios permanecem obrigatórios.

## Rejeição implementada

- Justificativa obrigatória: de 10 a 2.000 caracteres. Espaços externos são
  removidos; texto só com espaços, controles inválidos, texto curto ou acima
  de 2.000 caracteres no payload são recusados.
- A mesma validação é aplicada no formulário/controller, BFF, rota do backend,
  repositório SharePoint e mock. Falha de validação ocorre antes de qualquer
  consulta/escrita remota ou intenção de auditoria.
- A interface possui campo próprio de justificativa de rejeição. Não exige
  editar ou sobrescrever a observação original de uma correção para rejeitar.
- O contrato HTTP existente é preservado: action REJECT, material null e
  observation contendo a justificativa. Não foi criado campo de autoria do cliente.
- O PATCH de decisão mantém no mesmo item: Status_Revisao=REJEITADO,
  Material_AprovadoLookupId=null, Observacao_Item=justificativa e os quatro
  campos de autoria. A auditoria mantém hash da justificativa e demais dados.
- Na rejeição após correção, a integridade dos campos remotos corrigidos,
  original, registro, lock, intenção e prova durável continua sendo verificada.
  Apenas a justificativa da nova decisão pode diferir da observação da correção.
  Aprovação continua exigindo correspondência da observação e do material.
- O registro JSON e a auditoria da correção anterior não são reescritos.
  Os registros NX das decisões anteriores também são preservados.
- Sucesso exige releitura coerente. Timeout não repete PATCH; releitura
  comprovada permite anexar reconciliação pelo mesmo UUID, sem sobrescrever
  o outcome incerto. Falha/divergência mantém resultado não confirmado.

## Reabertura: proposta, não executada

Não foi implementada uma reabertura efetiva. A condição do pedido para documentar
uma nova estrutura de persistência se aplica: a intenção de decisão atual guarda
somente observationHash e um resumo do estado anterior. O item SharePoint mantém
apenas a última decisão, e o JSON da correção não representa um evento de reabertura.
Esses contratos não preservam integralmente o conteúdo anterior nem permitem
reconstruir justificativas antigas cujo texto já foi substituído.

Adicionar apenas um PATCH de Status_Revisao para EM_REVISAO apagaria a separação
entre estado corrente e eventos, sem prova durável suficiente. Não se criou uma
rota que simula reabertura bem-sucedida, nem um fallback para alterar status.
A interface informa a indisponibilidade. A rota de decisão recusa action REOPEN
e campos status/Status_Revisao; a rota de correção mantém sua lista de campos
permitidos e recusa itens finalizados ou enviados ao histórico.

### Contrato adicional proposto para revisão

1. Evento versionado de reabertura, append-only: UUID, item/orçamento/site/lista,
   ator da sessão, Pessoa resolvida, data, justificativa de 10–2.000 caracteres,
   UUID da decisão anterior e snapshot completo do estado anterior, incluindo
   justificativa, associação de material e evidências da correção.
2. Registrar intenção antes do PATCH e resultados/provas em registros separados,
   com política aprovada de acesso/retenção para os textos e snapshots. A estrutura
   atual evita duplicar texto sensível na auditoria; mudar isso exige revisão.
3. Definir marcador remoto inequívoco para o evento. Decisao_Id atualmente
   representa decisão, não reabertura. Reutilização com tipo de evento ou nova
   coluna precisa de contrato e autorização explícitos; nenhuma coluna foi criada.
4. Exigir permissão de reabertura definida pelo responsável, sessão válida,
   orçamento aberto, estado APROVADO/REJEITADO, Enviado_Historico=NAO exato
   (ausência/valor desconhecido bloqueia), ETag e ausência de operação pendente.
5. Lock/CAS compartilhado entre correção, decisão e reabertura, com reserva de
   UUID, detecção de conteúdo divergente e liberação somente após prova durável.
6. Transição candidata para EM_REVISAO com material aprovado vazio; preservar
   histórico e autoria anterior no evento. Confirmar semanticamente quem passa
   a ocupar Responsavel_Decisao após reabrir antes de implementar.
7. Releitura e reconciliação explícita pelo UUID, sem PATCH repetido após timeout.
   Só liberar nova correção quando original, último evento e estado remoto
   estiverem consistentes.

Nada dessa estrutura foi provisionado ou ativado. A reabertura autorizada com
sucesso e sua recuperação ponta a ponta permanecem cenários pendentes, não testes
supostamente aprovados. Foram testados os bloqueios atuais: usuário Consulta,
operador autenticado tentando REOPEN/status direto e item enviado ao histórico.

## Arquivos desta continuação

| Área | Arquivos | Alteração |
| --- | --- | --- |
| Domínio | src/domain/rejection-justification.ts e .test.ts | Validação compartilhada e limites |
| Controller | src/domain/review-controller.ts, review-session.ts | Validação antes de alterar/enviar estado |
| Interface | src/components/validation-workspace.tsx | Campo separado, mensagem de validade e indisponibilidade de reabertura |
| BFF/API | src/repositories/bff/bff-operator-repository.ts; src/app/api/itens/[id]/decisao/route.ts | Validação independente do navegador |
| Persistência | src/server/sharepoint/sharepoint-operator-repository.ts; item-correction-service.ts | Justificativa obrigatória e separação da observação corrigida |
| Mock | src/mocks/mock-operator-repository.ts | Mesma regra funcional |
| Contrato | docs/phase-m-decision-fields.candidate.json; .env.example | Fragmento candidato, sem configuração real alterada |
| Testes | complete-decision.test.ts; decision-flow.test.ts; auth-access.test.ts; configuration.test.ts | Persistência, identidade, falhas, limites, bloqueios e mapa candidato |
| Fixtures/testes existentes | sharepoint-operator-repository.test.ts; review-recovery.test.ts; mock-operator-repository.test.ts | Justificativas válidas para atingir o guard específico de cada cenário |
| Documentação | Este relatório, README.md e ETAPA-M.md | Estado atual e plano condicionado |

O diff total também contém as alterações da rodada anterior de releitura e
reconciliação; elas não foram descartadas nem atribuídas como trabalho novo.

## Evidências de testes

Novos casos cobrem Pessoa candidata, justificativas nos limites/inválidas,
validação antes de fetch/Graph/auditoria, rejeição de item corrigido preservando
original/registro/ledger, preservação de intenção/outcome anterior, timeout com
mesmo UUID, repetição com ETag antigo, falha de PATCH e divergência de releitura.
Os testes anteriores continuam cobrindo concorrência entre operadores, duplo
clique, identidade divergente, CAS, erro do Redis e reconciliação da correção.

Primeira regressão desta continuação: 764 aprovados, uma falha por fixture antiga
com justificativa de oito caracteres; o teste de concorrência foi ajustado para
usar justificativa válida, sem alterar a expectativa de conflito.

| Verificação | Código de saída | Resultado final |
| --- | --- | --- |
| npm test | 0 | 769 aprovados, 24 opt-in ignorados; 51 arquivos aprovados e quatro ignorados |
| npm run typecheck | 0 | Tipos aprovados |
| npm run lint | 0 | ESLint aprovado |
| npm run build | 0 | Build local aprovado |
| git diff --check | 0 | Sem erros de whitespace |

Comparação com a referência: **+41 testes aprovados**, nenhuma mudança nos
24 opt-in ignorados. Os testes usam Graph/Redis simulados; não foi executado
ensaio real de persistência nem teste de reabertura bem-sucedida.


## Pendências, riscos e condições de homologação

- Homologar o candidato Responsavel_Decisao e o formato de lookup com uma sessão
  Microsoft real, sem bypass; leitura de metadados não comprova persistência.
- Preparar mapa completo aprovado, resolvedor, Redis autoritativo, MFA/perfis,
  concessões mínimas e item isolado. Nada disso foi modificado nesta entrega.
- Revisar e aprovar a proposta de evento de reabertura antes de implementá-la.
  Não é possível reconstruir texto histórico inexistente a partir de hash.
- Quando PATCH e releitura falham, permanece necessária recuperação auditável;
  esta entrega não cria uma tela administrativa genérica de reconciliação de decisões.
- As cinco vulnerabilidades altas reportadas pelo npm ci da rodada anterior
  permanecem uma pendência de dependências. Não houve atualização forçada.
- Autorizar especificamente qualquer escrita de homologação futura; testar
  rejeição válida, inválida, Person/Status divergentes, concorrência e resposta
  perdida; verificar o mesmo UUID, ETag atualizado e evidência no Redis.

GO técnico da alteração local não equivale a GO da reabertura, da homologação
real ou da produção. Nenhuma autorização de escrita/implantação foi presumida.
