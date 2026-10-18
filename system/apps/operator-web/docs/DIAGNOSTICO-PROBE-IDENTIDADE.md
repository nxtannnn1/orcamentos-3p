# Diagnóstico temporário Entra → Pessoa SharePoint

## Estado e escopo — 18/10/2026

O responsável confirmou login Microsoft, DATA_SOURCE=sharepoint, leituras Graph
funcionais e `ENTRA_PERSON_READONLY_PROBE=true` com `PERSON_NOT_FOUND`. Isso não
comprova associação única de identidade. A fonte `/permissions` é parcial: não se
presume que contenha todo funcionário que pode acessar o site/lista.

**Implementado:** resumo temporário agregado no evento interno do probe.
**Testado com mocks:** consultas, contagens, falhas, paginação, sigilo e ausência de
escrita. **Validado em ambiente real nesta atividade:** ainda não há amostra nova
dos contadores; o log local tem eventos do probe, mas nenhum resumo instrumentado
identificável na inspeção. Login/leituras/PERSON_NOT_FOUND são o contexto confirmado
pelo responsável. **Homologado/produção:** não. A causa específica dessa ausência
depende do próximo evento real, não foi inferida de testes.

Branch infra-lab e HEAD c6748407e31363fd70dbde0f8a6b61fd5e9e7e01 preservados, assim
como todas as alterações locais anteriores. AGENTS.md e CLAUDE.md da raiz e do
portal foram revistos e mantidos. Não se modificaram ambiente, permissões, sessão,
listas, colunas, dados ou processos. `.next` e o backup preexistente foram preservados.

## Contrato preservado

O ator vem exclusivamente da sessão Entra já validada pelo guard. A comparação
continua sendo tenant/OID, site exato e par V2 `user.id` + `siteUser.id` **no mesmo
objeto de identidade**. Lookup positivo, inteiro seguro e tenant opcional consistente
continuam obrigatórios. Não há fallback por email/nome, união entre registros,
provisionamento ou concessão de acesso. A mesma associação é deduplicada; duas
Pessoas distintas continuam ambíguas.

O probe continua local, sem endpoint ou dados no navegador, exige autenticação
normal sem bypass, development/loopback e fonte SharePoint. Recebe somente a
capacidade GET do transporte. O OAuth técnico continua usando POST para obter token;
não existe POST/PATCH/DELETE SharePoint pelo probe. Não foram adicionadas consultas.
O diagnóstico é um observer opcional do resolver, conectado **somente pelo probe**;
não gera logs automaticamente nos demais usos da factory.

## Evento e campos temporários

O evento existente `operator-web.entra-person-probe` mantém `probeId` aleatório,
`status` e `readOnly: true`, acrescentando `diagnostics` quando o resolver começou
a consultar. Não há OID, tenant ID, nome, email, lookup ID, site/list ID, URL,
skiptoken, cookie, token, segredo, corpo de resposta ou mensagem de erro externa.
Se um pré-requisito barrar o probe antes do resolver, diagnostics fica ausente.

| Campo em diagnostics | Significado |
| --- | --- |
| siteQueryCompleted | GET do site retornou JSON; não significa que o site foi confirmado |
| siteVerified | Metadados confirmaram o site exato configurado |
| permissionsPagesRequested | Tentativas de consulta de página pelo transporte |
| permissionsPagesCompleted | Páginas que retornaram JSON; podem ainda falhar na validação estrutural |
| permissionRecordsAnalyzed | Registros examinados, inclusive o registro que motivou eventual interrupção |
| actorUserMatches | Ocorrências de user.id iguais ao OID da sessão; repetições contam |
| actorMatchesWithValidSiteUserId | Ocorrências anteriores com siteUser.id positivo/inteiro seguro no mesmo objeto |
| uniqueCandidates | Lookup IDs distintos após validar também tenant; não são publicados os valores |
| nextLinksSeen | Links de continuação encontrados, inclusive link recusado |
| scanCompleted | Todas as páginas foram processadas sem falha, dentro dos limites |
| failureStage | site, permissions, pagination ou identity; null quando a consulta terminou |
| failureKind | Categoria fixa de falha; null quando a consulta terminou |
| graphOperation | oauth ou get em falha tipada do transporte; null nos demais casos |
| httpStatus | Status HTTP da falha, se disponível; null para rede e falhas locais |

`actorMatchesWithValidSiteUserId` mede apenas a validade numérica do ID: **não**
atesta tenant nem concede identidade. Um par com tenant divergente pode incrementar
esse contador, mas é recusado e não vira candidato. Contagens em execução interrompida
são parciais; nunca usar candidatos parciais após falha. O resumo é imutável e local
a cada execução; falha no observer não altera os resultados do resolver.

## Distinção de falhas

- HTTP 401/403/404/429/5xx e rede continuam `PERSON_RESOLUTION_UNAVAILABLE`, com etapa,
  operação e status quando conhecido. Um 404 não significa usuário ausente.
- JSON inválido, envelope inesperado, registros/identidades V2 de tipo inválido
  também são indisponibilidade (`INVALID_RESPONSE`), nunca lista vazia.
- Links fora do recurso, ciclos, links malformados, limite de 20 páginas ou de
  10.000 permissões continuam indisponibilidade (`PAGINATION_REJECTED`).
- OID correspondente com siteUser ausente/inválido ou tenant divergente permanece
  `PERSON_IDENTITY_MISMATCH`. Não se tenta completar com outro objeto/registro.
- Apenas consulta válida e completa com zero candidatos chega a PERSON_NOT_FOUND.
  Dois candidatos continuam PERSON_AMBIGUOUS pelo guard existente; nesse caso a
  consulta pode ter scanCompleted=true e failureKind=null, pois falhou a unicidade.

`GraphReadError` transmite apenas operação/categoria/status. O resolver converte
isso para o erro de domínio existente após capturar esses metadados; não propaga
mensagens do provedor. Os logs preexistentes do transporte agora limitam os códigos
OAuth/Graph/AADSTS a valores fixos conhecidos; códigos arbitrários não são copiados.
Métodos e políticas de escrita existentes não foram alterados.

## Como interpretar o próximo evento

| Resultado observado | Conclusão permitida e próximo passo |
| --- | --- |
| scanCompleted=true, registros > 0, actorUserMatches=0, uniqueCandidates=0 | O OID do ator não aparece nas identidades user.id V2 analisadas. Não comprova que a conta não existe ou que não tem acesso; a fonte pode conter apenas aplicações, grupos ou outros usuários. Rever cobertura do contrato, sem criar permissões para fabricar um par. |
| scanCompleted=true, registros=0 | A consulta retornou conjunto vazio válido. Não há par nessa fonte. |
| actorUserMatches > 0, contador de siteUser=0, status IDENTITY_MISMATCH | O ator aparece, mas o mesmo objeto não fornece lookup válido; não combinar com outro registro. |
| contador de siteUser > 0, uniqueCandidates=0, status IDENTITY_MISMATCH | O formato numérico existia, mas a validação de identidade/tenant recusou o par. |
| scanCompleted=false, failureKind=HTTP, httpStatus=403 | A leitura foi negada na etapa indicada; isso não é ausência de Pessoa. Não ampliar permissões automaticamente. |
| scanCompleted=false, NETWORK/INVALID_RESPONSE/PAGINATION_REJECTED | A consulta não permite conclusão sobre ausência. Investigar a categoria preservando o bloqueio. |
| scanCompleted=true, uniqueCandidates=1, status VERIFIED | Resolução única nessa execução; não libera escrita nem conclui toda a homologação. |

Não é possível concluir "acesso por grupo" apenas de actorUserMatches=0: isso é
uma hipótese de cobertura, não uma identificação feita pelos contadores.

## Próxima execução pelo responsável

1. Manter a configuração atual; nenhuma nova variável é necessária. Na sessão
   Microsoft existente, atualizar uma página protegida que usa requirePageSession.
   Se expirada, entrar pessoalmente novamente. A IA não faz o login nem copia cookies.
2. No terminal da instância correta, localizar o evento novo com campo diagnostics.
   A porta observada era 13300, PID 11260 em loopback; nenhum processo foi encerrado.
   Se o servidor de desenvolvimento não incorporar a mudança, usar seu procedimento
   normal de reinício, preservando o ambiente; não apagar `.next`.
3. Compartilhar somente o evento sanitizado com contagens/status, probeId e horário.
   Não compartilhar resposta Graph, URL de callback ou detalhes da conta.
4. Interpretar com a tabela acima. Se a fonte não contém a associação, o próximo
   trabalho é revisar o contrato da fonte verificadora; não há autorização aqui
   para outro endpoint, fallback por email ou mudança de permissões.

## Remoção após o diagnóstico

A instrumentação é temporária. Após registrar a causa e a evidência mínima:

1. Remover no probe o armazenamento local de diagnostics, o observer passado como
   terceiro argumento de GraphListPersonResolver e a propriedade diagnostics do
   evento/tipo Dependencies. O evento original status/probeId/readOnly pode permanecer.
2. Remover do resolver o parâmetro observer, o tipo PersonResolutionDiagnostics,
   contadores, callback finally e estado usado apenas por diagnóstico. Manter os
   mesmos guards, critérios e limites de consulta; não transformar throws em []
   durante essa limpeza. Adaptar os testes de contadores, preservando os de segurança.
3. Manter GraphReadError e a sanitização do transporte, validação estrutural e
   distinção entre falha de consulta e ausência real: são controles de erro, não
   logs temporários. Reexecutar os testes focados, typecheck e lint.
4. Atualizar READMEs/segurança/este registro na mesma entrega de remoção. Para encerrar
   todo o ensaio, o responsável pode posteriormente retirar a flag do processo,
   conforme o procedimento autorizado; **nenhuma flag foi alterada agora**.

## Arquivos desta entrega

Código/testes no portal:

- src/server/sharepoint/graph-list-person-resolver.ts e .test.ts;
- src/server/sharepoint/entra-person-readonly-probe.ts e .test.ts;
- src/server/sharepoint/graph-read-transport.ts e .test.ts;
- src/server/sharepoint/graph-read-error.ts (novo).

Documentação: README.md da raiz, README.md do portal,
src/server/sharepoint/README.md, docs/SEGURANCA-OPERACIONAL.md,
docs/HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md e este documento.

## Testes executados e limitações

**94/94 testes focados aprovados. Suíte completa: 658 testes, 656 aprovados,
zero falhas e dois live ignorados. Typecheck e lint aprovados.** Não somar suítes
que se sobrepõem. A instrumentação real para a sessão do responsável aguarda o
evento novo; a IA não fez login, consulta com seu cookie ou mutação Graph.

Os testes verificam contagem singular/plural e deduplicação, ausência real, paginação,
falha posterior a candidato parcial, HTTP 401/403/404/429/5xx, OAuth, rede, JSON inválido,
envelope/identidade malformados, OID sem lookup, tenant divergente, sigilo do log,
falha do logger, bloqueio antes de sessão e ausência de escrita. O teste integrado
usa o transporte real do código com fetch simulado e só registra POST OAuth + GETs.
Regressões de leitura, escrita bloqueada, seleção da factory e autenticação passaram.

Comandos executados no diretório do portal:

```powershell
npm test -- src/server/sharepoint/graph-list-person-resolver.test.ts src/server/sharepoint/entra-person-readonly-probe.test.ts src/server/sharepoint/graph-read-transport.test.ts src/server/sharepoint/graph-write-transport.test.ts src/server/auth/entra-person-probe-session.test.ts src/server/data-source/person-resolver-selection.test.ts --reporter=json --outputFile=C:/Users/natan/Documents/Codex/2026-10-16/files-pasted-by-the-user-implementa/work/person-probe-diagnostics-focused.json
npm test -- --reporter=json --outputFile=C:/Users/natan/Documents/Codex/2026-10-16/files-pasted-by-the-user-implementa/work/person-probe-diagnostics-all.json
npm run typecheck
npm run lint -- --ignore-pattern '.next-backup-20261018-113117/**'
```

O backup gerado preexistente foi apenas excluído da análise lint, sem mudar regras
ou apagar arquivos. Sem commit, push, deploy, migração ou alteração de configuração
externa. Escrita e correções humanas permanecem desabilitadas; homologação não concluída.

## Resultado posterior — probe real instrumentado (18/10/2026)

A execução real posterior ao diagnóstico inicial apresentou:

- status: PERSON_NOT_FOUND
- readOnly: true
- siteQueryCompleted: true
- siteVerified: true
- permissionsPagesRequested: 1
- permissionsPagesCompleted: 1
- permissionRecordsAnalyzed: 8
- actorUserMatches: 0
- actorMatchesWithValidSiteUserId: 0
- uniqueCandidates: 0
- nextLinksSeen: 0
- scanCompleted: true
- failureStage: null
- failureKind: null
- graphOperation: null
- httpStatus: null

Conclusão: a consulta foi concluída sem falhas, mas nenhuma identidade
user.id V2 examinada correspondeu ao OID da sessão Entra.

Isso confirma ausência de vínculo na fonte consultada, não ausência
do usuário no SharePoint nem acesso necessariamente herdado por grupo.

Pendente: identificar fonte autorizada que comprove a associação entre
tenantId, OID, siteId e lookupId. Não autorizado fallback por email/nome,
provisionamento, ampliação de permissões ou escrita humana.

Estado: diagnóstico de cobertura da fonte atual concluído.
Resolução de identidade e homologação de escrita continuam pendentes.
