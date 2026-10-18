# Resolução Entra → Pessoa SharePoint — 18/10/2026

Registro da entrega inicial do resolvedor. A preparação E2E posterior resolveu as
duas falhas de autenticação citadas neste documento e adicionou um instrumento
interno de ensaio. A validação com sessão humana continua pendente. Consulte o
[estado atual e roteiro](HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md); os números abaixo
preservam as evidências históricas da implementação inicial.

## Parecer e escopo

**GO técnico condicionado para uma próxima homologação isolada somente de leitura**,
depois de obter uma sessão Microsoft Entra validada e retirar o bypass desse ensaio.
**NO-GO para escrita real e produção.** Não houve ativação do resolvedor, escrita,
provisionamento, migração, deploy, commit ou push nesta entrega.

Base inspecionada: branch `infra-lab`, HEAD
`c6748407e31363fd70dbde0f8a6b61fd5e9e7e01`. Esse HEAD já contém alterações de
autenticação posteriores às atividades anteriores; não foi substituído por snapshot.
Foram preservados package.json modificado, script `start-dev-local.mjs`, backup de
build e os dois arquivos não rastreados da raiz. Não foram lidos/removidos os arquivos
estranhos da raiz nem apagado o backup.

## Auditoria inicial e causa do bloqueio

O contrato `SharePointPersonResolver.findCandidates(actor, siteId)` já existia.
`resolveDecisionPerson()` já exigia exatamente um resultado compatível com tenant,
OID, site e lookup numérico positivo seguro. O repositório e `ItemCorrectionService`
já recebiam o resolvedor por injeção. As implementações utilizáveis eram apenas
sintéticas, em testes; a factory compunha `unavailablePersonResolver`.

Por isso, credencial Graph com write não eliminava `PERSON_RESOLUTION_NOT_CONFIGURED`.
Também não eliminava Redis, schema, ETag, autoria, papéis e os bloqueios da Fase 4.
Identidade técnica Graph e identidade do funcionário são contratos diferentes.

Foram inspecionados os módulos Microsoft, sessão, factory, transporte, repositório,
serviço de correção, referências do resolvedor, núcleo de identidade corporativa,
ARQUITETURA, SEGURANCA-OPERACIONAL e PERSISTENCIA-DECISAO-ETAPA-C.
O núcleo corporativo existente não fornece hoje um adaptador operacional que comprove
um usuário local ao site; não foi ampliado ou substituído.

## Fonte verificável encontrada

O GET Graph v1.0 de permissões da lista configurada retornou um objeto V2 contendo
**no mesmo conjunto de identidade** `user.id` em formato GUID e `siteUser.id`
numérico. O resolvedor compara `user.id` com o OID recebido do servidor e usa somente
o lookup daquele mesmo objeto. Não cruza registros, nomes, emails, AuthorLookupId,
EditorLookupId, atributos editáveis ou IDs enviados pelo navegador.

O namespace de tenant vem da configuração do transporte técnico existente, que
obtém o token no tenant esperado. O ator deve pertencer a esse tenant e o GET de
metadados deve confirmar o ID exato do site configurado. Se o objeto de identidade
trouxer tenantId explícito, ele também deve coincidir. A resposta observada não
trazia esse tenantId opcional; não foi inferido a partir de domínio/email.
Injetar um transporte de outro tenant viola o contrato do adaptador: a factory
constrói o cliente técnico usando a mesma configuração validada.

Essa fonte é **parcial**, não um diretório completo. Um usuário autorizado por grupo,
herança ou outra política pode não ter par explícito na lista. Nesse caso a resolução
retorna zero candidatos e o guard recusa com `PERSON_NOT_FOUND`. Não se cria uma
permissão direta nem se provisiona usuário para fazer o teste passar.

Os papéis da permissão Graph não são papéis do portal e não concedem acesso individual.
Exatamente a mesma associação repetida é deduplicada; dois lookup IDs distintos para
o mesmo OID continuam ambíguos. Consulta nova em cada resolução, sem cache de vínculos.

## Implementação e configuração

`GraphListPersonResolver` implementa a interface existente em módulo próprio e recebe
somente um `GraphReadTransport` e configuração fixa tenant/site/lista. Faz GET de
metadados e de permissões, com paginação limitada a 20 páginas/10.000 permissões.
Rejeita ciclos, destino fora do Graph v1.0 ou da lista exata, respostas malformadas,
identidade divergente, lookup inválido e falhas de rede/permissão. Não possui chamadas
de escrita. Exceções do transporte não são propagadas com detalhes pessoais.

A factory injeta esse adaptador somente quando a seleção for explicitamente
`graph-list-permissions`. Ausência, vazio ou `disabled` preservam o resolvedor
indisponível. Outro valor causa erro de configuração. A seleção também participa
do fingerprint de reuso do repositório, evitando um adaptador antigo após mudança.
O mesmo resolvedor é transmitido ao serviço de correção pela injeção já existente.

```dotenv
# Estado padrão, mantido nesta entrega:
SHAREPOINT_PERSON_RESOLVER=disabled
# Seleção preparada para avaliação separada: graph-list-permissions
```

Reutiliza `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`,
`SHAREPOINT_SITE_ID` e `SHAREPOINT_ITENS_IMPORTADOS_LIST_ID`. As demais variáveis de
leitura continuam sendo validadas pela factory. Não foram criadas credenciais nem
solicitadas permissões adicionais; `.env.local` não foi modificado.
`SHAREPOINT_HUMAN_CORRECTIONS_ENABLED` não foi habilitado.
`assertCorporateWriteRuntime()` e o fluxo Keycloak não foram alterados nesta etapa.

## Evidência real, sanitizada

Dois probes técnicos separados, somente de leitura, utilizaram as credenciais
existentes sem imprimi-las. O POST executado foi exclusivamente no endpoint OAuth
Entra para obter token técnico; **nenhum POST/PATCH/DELETE foi enviado ao SharePoint**.

| Verificação | Resultado observado |
| --- | --- |
| Token técnico Entra | HTTP 200; tenant correspondente; role `Lists.SelectedOperations.Selected` |
| Metadados do site configurado | HTTP 200; ID correspondente e URL do site `v0.natan` confirmada |
| Permissões da lista de itens | HTTP 200; concessão `write` para a aplicação configurada |
| Forma de identidade no primeiro item | GET 200; não ofereceu um par user/siteUser completo para usar como fonte |
| Pares V2 em permissões | Um objeto com user GUID e siteUser numérico; sem registrar seus IDs |
| Novo resolvedor + guard existentes | Um vínculo único resolvido; OID/lookup coincidem com o mesmo par da fonte; tenant/site coincidem com a configuração |
| Sessão humana do portal nesse probe | Não utilizada; falta homologar essa integração |
| Escrita SharePoint | Zero chamadas |

Foi resolvido um ator selecionado do próprio objeto de permissão no probe, não uma
conta humana autenticada no portal. Isso comprova o caminho de leitura e consistência
da fonte, não que o responsável já possa escrever nem que todos os usuários sejam
resolvíveis. Não houve uso de token humano ou credencial do responsável pela IA.

O GET de permissões agora está documentado em v1.0 e funcionou neste tenant, com a
role Selected já existente. A tabela genérica da documentação cita permissões
mais amplas; isso não motivou pedido de ampliação. A observação não garante que a
mesma configuração seja suficiente em outro tenant/recurso.

## Runtime preservado

A instância local observada atende `127.0.0.1:13300`, PID 19408, Next dev. Ela não
foi reiniciada por esta etapa. Seu estado observado é:

- DATA_SOURCE=sharepoint; KEYCLOAK_ENABLED=false; AUTH_CORPORATE_LOGIN_ENABLED=false.
- AUTH_DISABLED=true e ALLOW_LOCAL_SHAREPOINT_BYPASS=true, configuração preexistente.
- Resolvedor disabled, correções humanas desabilitadas e Redis compartilhado ausente.

Esse bypass preexistente entrega Consulta e bloqueia escrita. Foi preservado, não
configurado ou ativado por esta execução. **Não serve para homologar identidade
Microsoft humana.** O probe Graph separado não modifica o ambiente do Next.

## Testes e comandos efetivamente executados

No diretório `system/apps/operator-web`:

```powershell
npm test -- src/server/sharepoint/graph-list-person-resolver.test.ts src/server/sharepoint/person-resolver.test.ts src/server/sharepoint/complete-decision.test.ts src/server/data-source/person-resolver-selection.test.ts --reporter=json --outputFile=<arquivo-local>
npm test -- --reporter=json --outputFile=<arquivo-local>
npm run typecheck
npm run lint -- --ignore-pattern '.next-backup-20261018-113117/**'
```

Resultados: **72/72 testes focados aprovados**; suíte completa **588 testes, 584
aprovados, 2 falhas preexistentes e 2 live ignorados**; typecheck e lint acima passaram.
Cobertura focada: unicidade, ausência, ambiguidade, tenant/OID/site divergentes,
lookup inválido, identidade ausente, falha Graph, acesso insuficiente, paginação
fora do recurso e garantia de ausência de escrita. Testes da factory confirmam
default indisponível e injeção somente após seleção explícita.

As falhas preexistentes são:

1. `public login choices ... preserves both legacy choices when corporate mode is off`
   espera dois links, mas o componente do HEAD atual apresenta um.
2. `Keycloak OIDC ... is disabled by default and production cannot use loopback or HTTP issuers`
   espera HTTP 404 e recebe 503.

Foram reproduzidas as mesmas duas falhas em uma cópia isolada do HEAD c674840,
executando somente esses dois arquivos de teste (57 testes, duas falhas). Não
houve checkout/reversão dos arquivos em uso nem correção fora do escopo. Portanto,
a suíte global não está verde e isso permanece uma pendência de autenticação.

O primeiro `npm run lint` sem exclusão foi interrompido enquanto percorria o backup
de build preexistente. O comando final excluiu apenas esse artefato gerado; o
backup foi preservado e nenhuma regra ESLint foi alterada. Não houve build nesta
etapa para não interferir na pasta .next/processo em uso; typecheck não equivale
a build ou homologação de deploy.

Helpers locais, fora do repositório: `identity-read-audit.cjs` e
`identity-resolver-live.cjs`. Foram executados com Node, com saídas JSON sanitizadas.
O teste de baseline foi executado por `vitest.mjs` na cópia extraída de `git archive`.

## Arquivos desta entrega

Código/configuração:

- `src/server/sharepoint/graph-list-person-resolver.ts`: adaptador somente leitura.
- `src/server/sharepoint/graph-list-person-resolver.test.ts`: cenários da fonte.
- `src/server/sharepoint/person-resolver.ts`: validação defensiva de ator/configuração ausentes.
- `src/server/data-source/operator-repository-factory.ts`: seleção opcional e injeção.
- `src/server/data-source/person-resolver-selection.test.ts`: default e seleção explícita.
- `.env.example`: catálogo do seletor, com default disabled e sem segredos.

Documentação:

- README da raiz e README do portal: estado, evidências e pendências.
- AGENTS.md/CLAUDE.md da raiz e do portal: governança e manutenção documental.
- `docs/ARQUITETURA.md`, `docs/PERSISTENCIA-DECISAO-ETAPA-C.md` e
  `docs/SEGURANCA-OPERACIONAL.md`: fonte opcional e atualização da hipótese v1.0/beta.
- READMEs de `src/server/sharepoint` e `src/server/data-source`: integração e limites.
- Este relatório: resultados, riscos e roteiro.

Foram lidos os arquivos de agentes dos ancestrais existentes e dos dois módulos
que os possuem (portal e Operator API). Não havia instrução de agente na raiz nem
nos ancestrais examinados. O bloco Next gerado foi preservado. As regras locais da
Operator API não foram alteradas. A raiz passa a ser referência principal para
agentes compatíveis; CLAUDE é complementar, sem pressupor leitura automática universal.

## Roteiro de homologação — pendente de execução pelo responsável

1. Conferir branch, ambiente e site de desenvolvimento configurado. Manter o
   resolvedor disabled, correções humanas desabilitadas e escrita real bloqueada.
2. Preparar uma sessão Entra autenticada e validada pelo fluxo existente, com tenant,
   OID, papel e MFA conforme a política aprovada. O bypass atual não atende a isso.
   Não alterar Entra, permissões ou credenciais para contornar falhas.
3. Em ensaio servidor isolado, somente leitura, enviar ao resolvedor o tenant/OID
   obtidos dessa sessão validada e o site fixado no servidor. Não usar OID informado
   pelo navegador nem capturar/compartilhar tokens.
4. Confirmar associação única do mesmo objeto V2. Registrar apenas resultado,
   ausência/ambiguidade e identificador técnico de evidência; não publicar IDs
   pessoais, loginName ou a resposta completa de permissões.
5. Testar um usuário sem par explícito e um caso divergente com fixtures: devem ser
   recusados, sem fallback para email, conta técnica ou criação de usuário.
6. Antes de uma seleção futura na aplicação, revisar a cobertura dos usuários e a
   fonte com o administrador. Não alterar permissões para fabricar correspondência.
7. Escrita é outra homologação: exige Redis autoritativo, schema e mapeamentos reais,
   concessões individuais, autoria/Pessoa, ETag, auditoria, reconciliação e autorização
   separada. Keycloak continua com bloqueio explícito da Fase 4.

Nenhum desses testes manuais foi declarado aprovado pela IA. Para reverter apenas
a seleção futura do adaptador, manter/voltar `SHAREPOINT_PERSON_RESOLVER=disabled`;
isso não exige mexer em listas, usuários ou permissões. Nesta entrega nada foi
ativado, portanto não há operação externa de rollback.

## Referências primárias consultadas

- [Graph list permissions v1.0](https://learn.microsoft.com/en-us/graph/api/list-list-permissions?view=graph-rest-1.0): GET e permissões.
- [Graph sharePointIdentitySet](https://learn.microsoft.com/en-us/graph/api/resources/sharepointidentityset?view=graph-rest-1.0): propriedades user/siteUser.
- [Graph sharePointIdentity](https://learn.microsoft.com/en-us/graph/api/resources/sharepointidentity?view=graph-rest-1.0): IDs SharePoint e identidade.
- [Graph permission](https://learn.microsoft.com/en-us/graph/api/resources/permission?view=graph-rest-1.0): facets V2 retornadas pelo serviço.
- [Graph user GET](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0): permissões application/delegated distintas; não foi solicitada leitura ampla do diretório.
