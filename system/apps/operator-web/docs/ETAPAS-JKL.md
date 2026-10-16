# Etapas J, K e L — execução local supervisionada

## Estado confirmado em 16/10/2026

O caminho do MVP é Operator Web → Graph → SharePoint. Operator API/PostgreSQL
permanecem opcionais e não condicionam inicialização ou revisão SharePoint.
Nenhum registro, schema, grant, aplicativo, conexão ou fluxo Microsoft foi alterado.

### J — login e Pessoa

Login existente preservado: MSAL Authorization Code/PKCE, state/nonce,
validação de assinatura, issuer/audience, tenant, membro, perfis e contexto acrs;
sessão JWE de no máximo 15 minutos e revogação server-side em Redis. A identidade
de decisão continua sendo tenantId + oid da sessão, nunca do navegador.

Foi corrigida uma lacuna comprovada: authConfig aceitava origem HTTP loopback
em production se o contexto MFA estivesse preenchido. Agora production exige
HTTPS também em loopback. Desenvolvimento local continua sob suas regras próprias;
nenhum bypass foi ativado nesta execução. Docker impõe todos os bypasses false.

No arquivo local preexistente, os campos ENTRA_LOGIN_* / AUTH_SESSION_SECRET /
ENTRA_MFA_AUTH_CONTEXT_ID e Redis estão ausentes; a origem configurada é HTTP e há
flags de bypass de desenvolvimento. Esse arquivo foi preservado, não carregado
automaticamente no Docker e não representa configuração operacional de login.
Não houve autenticação humana real nem comprovação de política MFA.

O resolvedor de Pessoa permanece indisponível por padrão. Não foi inventado
lookup ID, usado Editor/Modified como humano nem executado ensureUser.
Com as permissões existentes, não há fonte que comprove o vínculo completo.

### K — conferência e persistência

- Fila e itens continuam exigindo sessão e autorização no servidor.
- Conferência destaca descrição, fornecedor do item, quantidade, unidade e preços.
  Valores numéricos ausentes/inválidos são null, sem conversão permissiva ou zero
  inventado; fornecedor não é herdado silenciosamente do orçamento.
- Status só se torna APROVADO/REJEITADO por correspondência exata, sem promover
  NAO_APROVADO, DESAPROVADO ou palavras semelhantes.
- Associação ao catálogo continua explícita. Aprovar/rejeitar pede confirmação.
  Número/descrição, quantidade, preços, fornecedor e observação aparecem no resumo.
- Servidor recusa aprovação com descrição, fornecedor, unidade, quantidade ou
  preços ausentes/inválidos antes de registrar intenção ou enviar PATCH.
- Clique duplicado e releitura durante salvamento são bloqueados. Após erro ou
  resultado incerto, nova decisão exige releitura bem-sucedida, mesmo após navegar.
- Última decisão mostra somente UUID/data/OID/Pessoa que estejam persistidos em
  campos explícitos. Campos ausentes permanecem ausentes. Não é um histórico
  completo e não é reconstruída autoria antiga.
- Os campos extraídos permanecem somente leitura. A API aceita apenas decisão,
  material e observação. Correção de extração requer procedimento autorizado na
  origem ou novo contrato auditável aprovado; não foi ampliado o PATCH silenciosamente.

ETag/If-Match, perfil, origem, limites, validação de schema, resolução de Pessoa,
auditoria Redis e proteções contra permissão Graph ampla permanecem obrigatórios.
Redis/SharePoint não formam uma transação: falha após PATCH exige reconciliação
pelo UUID. A interface não promete que uma falha significa ausência de gravação.

### L — comparação e histórico

Comparação SharePoint usa somente GET, associa IDs oficiais e considera apenas
itens exatamente APROVADO com material associado. Mantém fornecedor do item,
preço, unidade, orçamento e data sem completar dados ausentes. Sem fallback mock.

O teste opt-in de leitura real executa os repositórios existentes com Graph real,
sem sessão humana e sem PATCH. Sua aprovação comprova transporte/leitura; não
homologa aprovação, dados históricos nem existência de duas ofertas elegíveis.
O cenário de duas ofertas é explícito e sintético, em teste separado.

O pacote Power Automate continua NOT_CREATED_NOT_IMPORTED, desiredState=Stopped,
engineValidated=false e productionAuthorized=false. Foi corrigida a omissão de
Preco_Total no snapshot e na validação de entrada. Não há cálculo substituto de
total. Releitura, comparação de snapshot, ETag específico e deduplicação por três
identidades continuam protegendo a confirmação de Enviado_Historico.

O motor/conector Power Automate não foi executado nem publicado. O avaliador
local de expressões não comprova compatibilidade do motor Microsoft.

## Metadados atuais versus pacote candidato

Preflight somente leitura confirmou acesso às quatro listas por metadados;
Historico_Precos foi localizado por nome exato, sem salvar ID nem alterar ambiente.

| Área | Diferença confirmada | Consequência |
|---|---|---|
| Token Graph | Sites.ReadWrite.All e Lists.SelectedOperations.Selected | Escrita bloqueada por GRAPH_PERMISSION_TOO_BROAD |
| Concessão por lista | write não confirmado pelo diagnóstico de permissions | Não presumir write com base na role selecionada |
| Itens_Importados | Revisado_Por_Oid e Decisao_Id ausentes | Bloqueia auditoria e reconciliação de decisão |
| Historico_Precos | Revisado_Por_Oid e Decisao_Id ausentes | Candidato histórico ainda não corresponde integralmente ao schema real |
| Materiais_Oficiais | Familia é Choice; template isolado usa Texto | Revisar template isolado antes de provisionar; fluxo não depende desse campo |
| Orcamentos | Choice Status_Revisao não contém CONCLUIDO do template | Revisar contrato/template isolado; não alterar escolhas reais automaticamente |

As demais colunas verificadas dos templates foram compatíveis nos critérios do
preflight (tipo, Pessoa única, lookup, escolhas exigidas, unicidade quando declarada).
Isso não valida parâmetros do conector, Claims, expressões ou comportamento do fluxo.

## Solicitação concreta à TI — sem concessão automática

1. **Login:** fornecer tenant/client do registro de login existente, segredo por
   canal seguro, origem HTTPS autorizada e callback exato /api/auth/callback.
   Confirmar single tenant, acct=0, atribuição dos perfis e contexto acrs associado
   a política MFA efetiva. Validar usuário autorizado, Consulta, convidado, tenant
   errado, MFA cancelada, expiração e logout nos logs e no portal.
2. **Graph:** revisar o impacto e remover a permissão ampla Sites.ReadWrite.All
   somente mediante autorização. Preservar o modelo Lists.SelectedOperations.Selected
   com concessões mínimas nas listas necessárias. Conferir leitura dos metadados e
   verificação de permissions; write somente na lista de itens autorizada. Não
   conceder Sites.ReadWrite.All como solução para o bloqueio por permissão ampla.
3. **Pessoa:** indicar uma fonte corporativa já existente que comprove, de forma
   única, tenantId + oid → siteId + lookupId de usuário já existente no site.
   Definir acesso aprovado, evidência de vínculo, atualização/revogação e política
   para zero/múltiplos resultados. Não aprovar mapa manual entregue pelo navegador,
   comparação de nome ou e-mail isolado, nem OID usado como lookup ID.
4. Caso a TI escolha consulta app-only a GET /users/{oid}, a documentação dessa
   operação lista User.Read.All como permissão de aplicação mínima. Isso é uma
   alternativa a avaliar, não uma concessão solicitada automaticamente: ainda
   exige acesso ao usuário do site e prova do vínculo. Não implementá-la enquanto
   a autorização e o contrato não existirem. Uma fonte corporativa já aprovada
   pode evitar ampliar o acesso ao diretório.
5. **Schema:** aprovar colunas Texto de OID e UUID em Itens_Importados e no histórico
   isolado; confirmar nomes internos, tipos, Pessoa única e demais relações. Os
   nomes propostos são Revisado_Por_Oid/Decisao_Id. Não preencher decisões antigas
   com autoria fictícia. Corrigir primeiro o template de homologação, sem tocar
   colunas ou registros reais nesta execução.
6. **Auditoria:** fornecer endpoint Redis REST HTTPS autoritativo e token por
   canal seguro, com isolamento, retenção/backups e acesso aprovados. Não usar
   réplica eventual, memória em production nem remover auditoria para testar write.
7. **Homologação:** autorizar previamente site/listas, usuários e conexões isolados
   e cópia desativada do fluxo. Executar o roteiro abaixo somente depois desse aceite.

Referências oficiais: [GET user e permissões](https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0),
[fieldValueSet e lookup](https://learn.microsoft.com/en-us/graph/api/resources/fieldvalueset?view=graph-rest-1.0),
[versões de itens](https://learn.microsoft.com/en-us/graph/api/resources/listitemversion?view=graph-rest-1.0).
Lookup ID de Pessoa pertence ao site e não equivale ao OID Entra. Histórico de
versões é uma opção futura de leitura, sujeita a permissões e disponibilidade;
não foi criado endpoint que prometa histórico completo sem essas verificações.

## Docker e Kubernetes

Compose e overlay Kubernetes principais agora contêm o caminho Web/SharePoint.
A API é perfil opcional. Nenhum PostgreSQL foi iniciado, migrado ou alterado.
Ver system/infrastructure/local/README.md para execução, callback e limites.

Namespace sistema-3p-local preservado; plano/diff e dry-run estrito revisados.
Não foram aplicados workloads nem Secrets reais. A imagem Web não apareceu no
inventário do kubelet; distribuição local da imagem e configurações HTTPS/Entra/
Redis/SharePoint devem ser resolvidas antes do rollout. Pods default preservados.
