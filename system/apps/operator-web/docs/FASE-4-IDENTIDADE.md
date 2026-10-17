# Fase 4 — implementação local condicionada

## Limites desta entrega

Somente código local, testes isolados e scripts SQL para revisão. Não há driver ou
conexão de banco configurados, fonte verificadora real, endpoint administrativo,
provisionamento, migração executada ou habilitação de escrita Keycloak real.
`canReviewSource` continua recusando fontes reais e `requireSession(true)` inclui
um bloqueio explícito adicional. Não existe flag para contornar esse bloqueio.
Microsoft mantém suas sessões, MFA, namespace, autorizações e resolvedores atuais.
Mock continua sendo mock; não comprova autorização SharePoint nem durabilidade SQL.

## Componentes

`src/server/corporate-identity/contracts.ts`: portas confiáveis de verificação,
administração e transação, vínculo versionado, concessão e auditoria.
`service.ts`: ativar, consultar, revogar, autorizar e registrar resultado.
`postgres-store.ts`: adaptação SQL parametrizada, ainda sem driver/configuração.
`runtime.ts`: bloqueio de escrita real Keycloak durante a homologação pendente.
`service.test.ts`: doubles explícitos e isolados, sem chamadas a serviços reais.

O serviço não envia chamadas Graph. Uma autorização produz intenção auditável,
não um token transferível nem uma autorização reutilizável pelo navegador.
O resultado aceita apenas recibos emitidos pela mesma instância e uma única vez.
Se o processo cair, a intenção continua pendente na persistência; reconciliação
durável de operações externas exige integração específica, ainda bloqueada.

## Contrato da fonte verificadora (obrigatório antes de ativação real)

Entrada: `(issuer, subject)` exatos e proposta de `(tenantId, oid, siteId, lookupId)`.
Issuer/subject nunca são normalizados, convertidos para minúsculas ou substituídos
por email. IDs Microsoft usam UUID canônico em minúsculas. Lookup ID é inteiro
positivo local ao site; não se deriva de OID, email ou nome.

A implementação confiável deve:

1. Verificar que a conta externa existe, está ativa e pertence ao issuer permitido.
2. Verificar que tenant/OID identificam uma conta corporativa existente e ativa.
3. Verificar que site/lookup ID representam essa MESMA conta corporativa naquele
   site, usando fonte administrativa autorizada e evidência independente do navegador.
4. Verificar a associação explícita aprovada entre as duas contas. A existência
   separada das contas não comprova que pertencem ao mesmo funcionário.
5. Retornar `associationVerified=true` somente após comprovar essa associação.
   Retornar exatamente uma prova, com source autorizado, evidenceId opaco (sem
   tokens/dados secretos), identidade, Pessoa e flags de atividade/existência.
6. Informar checkedAt/expiração em segundos UTC: prova até 300 segundos de idade,
   nunca futura, com validade máxima de 24 horas. Política corporativa pode ser menor.
7. Respeitar AbortSignal e limite de cinco segundos; recusar ambiguidade, conta desabilitada, divergência, evidência vencida, timeout
   ou indisponibilidade. Não criar usuários, expandir permissões ou escrever no site.

O adaptador deve autenticar a fonte e validar a integridade da resposta. O nome
`source` sozinho não autentica uma prova. Apenas um adaptador injetado pelo servidor
e aprovado pode implementar a interface. Claims Keycloak personalizados ou JSON do
browser não são essa fonte. O verificador dos testes se chama explicitamente
`isolated-test-verifier` e não é importado no runtime.

Não foi presumido que Graph já fornece a consulta necessária com as concessões
atuais. Alternativas futuras: fonte administrativa corporativa com atestado
verificável ou consultas autorizadas aos diretórios e ao cadastro do site,
com confirmação administrativa explícita da associação. A escolha e o acesso
real precisam de revisão/autorização antes de criar o adaptador de produção.

## Matriz inicial de menor privilégio

O recurso é a tupla EXATA `(siteId, listId, budgetId, itemId)`. Não há curingas.
IDs de orçamento/item devem vir da leitura confiável do repositório, não de claims
corporativos ou de autorização enviados pelo browser.

| Papel | APPROVE | REJECT | CORRECT | RECONCILE |
|---|---|---|---|---|
| Consulta / sem papel de negócio | negar | negar | negar | negar |
| Operador | concessão exata | concessão exata | concessão exata | concessão exata |
| Comprador | concessão exata | concessão exata | concessão exata | concessão exata |

As duas funções de revisão preservam o limite superior já existente. A ação não
é concedida pelo papel: exige concessão individual explícita e não expirada,
vínculo ativo, verificação e sessão compatíveis. Aprovar não concede corrigir ou
reconciliar. Papéis internos Keycloak não participam da matriz. Se uma sessão
contém Consulta junto de Operador, sua função Operador continua sujeita a todos
os requisitos; Consulta sozinho nunca escreve.

A matriz Microsoft existente não é substituída nesta etapa. Permissões técnicas
Graph, schemas, origem/CSRF, limites, estado de negócio, If-Match e auditoria
continuam obrigatórios e independentes.

## Administração e ciclo de vida

Não há endpoint público novo. Uma futura composição administrativa deve resolver
uma credencial opaca por `AdministratorVerifier` e produzir `bindings:manage`
ou `bindings:read`. Operador/Comprador não equivalem a administrador. A credencial
não é persistida, devolvida ou registrada pelo serviço. Nenhuma autoridade real
foi configurada; não existe senha administrativa nova.

`activate`: verifica administrador, valida proposta/concessões, consulta fonte,
confere versão esperada e persiste vínculo + revisão + evento na mesma transação.
Uma proposta sem prova não é ativada. Cadastro pendente e fluxo de aprovação
humana podem ser mantidos fora deste núcleo; não há ativação automática.
`lookup`: exige capacidade administrativa de leitura.
`revoke`: exige capacidade de gestão, motivo e versão esperada; incrementa versão,
remove concessões atuais e mantém história. Reativar exige prova e versão novas.
Trocar a identidade corporativa de um vínculo existente é proibido, inclusive
após revogação; requer procedimento separado de reassociação, ainda não implementado.

O JWE continua provando autenticação. Para uma futura composição real, a versão do
vínculo deve ser capturada pelo servidor SOMENTE ao emitir nova sessão e validada
em cada operação. Não aceitar versão, papel, ator ou Pessoa do corpo da requisição.
Sessões antigas sem versão não podem escrever. Atualizar concessões ou reativar
incrementa versão: a sessão antiga não adquire novos privilégios. O contrato local
testa essa regra; o runtime JWE real não foi conectado a um banco inexistente.

Revogação bloqueia novas autorizações, independentemente de limpar o cookie.
Revogação do registro de sessões é defesa complementar, não substitui consultar
o vínculo. Remoção de papel diretamente no Keycloak ainda segue a janela de
sessão da Fase 3 (até 15 minutos) ou a revogação administrativa de sessões existente.

## Persistência separada e integridade

Scripts de revisão: `identity-persistence/001_identity.up.sql` e `.down.sql`.
Destino: banco dedicado de identidade. Não usar banco de negócio nem o banco
interno Keycloak. Não há URL, segredo, driver ou fallback preconfigurado.

Schema `identity_auth`: bindings atuais, binding_revisions imutáveis,
audit_events append-only e schema_versions. Concessões fazem parte do agregado
versionado; uma revisão guarda integralmente as concessões e provas daquela versão.
Chaves geradas da fotografia JSON evitam duas representações divergentes. FK
de auditoria aponta para a revisão exata. FK diferida impede estado atual sem
revisão. Trigger impede troca de dono/identidade ou salto de versão. Índices
impedem duas identidades ativas do mesmo issuer para a mesma conta Microsoft ou
Pessoa do site. Não há FK para sistemas remotos: essa integridade depende da prova.

O adaptador usa SQL parametrizado, lock transacional por identidade inclusive na
primeira criação, comparação exata com collation C, compare-and-set de versão,
restrições únicas e transação atômica para dados/história/auditoria. O driver
injetado deve usar uma conexão exclusiva por transação e fazer rollback em TODA
falha. Os testes de concorrência usam um double serializado; não comprovam locks
PostgreSQL entre processos. Essa validação está pendente de ambiente autorizado.

Up e down contêm transações e timeouts. Down reverte instalação ainda vazia;
recusa apagar vínculos, revisões ou auditoria existentes. Rollback com dados exige
plano separado de preservação/restauração e autorização. Não há rollback destrutivo
automático, criação de roles ou CASCADE.

DBA deve revisar privilégios separados: web sem DDL/DELETE/TRUNCATE; apenas
SELECT/INSERT/UPDATE em bindings, SELECT/INSERT em revisões, INSERT em auditoria,
USAGE no schema e EXECUTE em `valid_snapshot(jsonb)` quando necessário. Não usar
credencial de owner/migração no portal. Retenção, backup, restauração, TLS e gestão
de credenciais ainda precisam ser definidos para produção.

## Concorrência, falhas e limite de revogação

Criações concorrentes e duas revogações não podem perder atualizações. Falha no
banco, na prova ou na auditoria recusa escrita; não há fallback permissivo.
Eventos registram ator autenticado, identidade corporativa, Pessoa, versão,
ação/recurso e operação. Credenciais, tokens, cookies e provas secretas ficam fora.

PostgreSQL não desfaz uma operação Graph. A fronteira local de autorização é a
intenção confirmada em transação. Um recibo não deve ser enfileirado e usado depois
de revogar. A futura integração de despacho deve coordenar admissão/revogação,
limitar operações em voo e manter reconciliação. Revogação não cancela uma chamada
já enviada; essa limitação deve aparecer ao administrador. Este despacho real não
foi conectado e permanece bloqueado. Não se promete atomicidade entre sistemas.

Falha ao registrar resultado mantém intenção pendente; não repete escrita.
O resolvedor Pessoa legado e os fluxos de reconciliação existentes não foram
substituídos. Ativar o novo núcleo em fonte real exigirá aprovação específica da
composição de banco, fonte, administração, sessão e despacho, além de testes reais.

## Homologação

Ver `FASE-4-TESTES-MANUAIS.md`. A IA não executa o login do responsável nem marca
aceitação em seu nome. Resultados automatizados são registrados no relatório
da entrega, distinguindo doubles isolados de integrações reais não executadas.
Fase 4 sem GO final até aprovação dos testes obrigatórios pelo responsável.

Referência de revisão SQL: [colunas geradas PostgreSQL 18](https://www.postgresql.org/docs/18/ddl-generated-columns.html)
e [comportamento dos triggers](https://www.postgresql.org/docs/18/trigger-definition.html).
Essa consulta documental não substitui executar os scripts em banco isolado autorizado.
