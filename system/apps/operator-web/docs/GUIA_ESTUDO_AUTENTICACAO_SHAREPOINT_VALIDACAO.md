# Guia de estudo — autenticação, SharePoint e validação

Referência: correções de 22/10/2026 sobre infra-lab/3a04bc2. Caminhos de código relativos a system/apps/operator-web. Consulte o [relatório de evidências](RELATORIO_CORRECOES_P0_2026-10-22.md). Todos os exemplos são sanitizados.

## 1. Arquitetura

O operador usa componentes React. BffOperatorRepository chama as rotas Next.js em src/app/api. O backend valida sessão, autorização, origem, payload e versão; src/server/data-source/operator-repository-factory.ts seleciona a fonte. SharePoint usa Microsoft Graph com credencial técnica server-side, nunca entregue ao navegador.

Fluxo: n8n → Orcamentos/Itens_Importados → Graph → BFF → tela → decisão humana → BFF → Graph/Redis → releitura → tela.

n8n importa e normaliza, preservando os campos humanos e usando ETag. Redis mantém sessões, limites, intenções, resultados e bloqueios de correção. É infraestrutura já prevista pelo projeto. Materiais_Oficiais é o catálogo; Historico_Precos permanece evolução separada, não alimentada pela comparação do portal.

A fonte mock mantém estado em memória. operator-api é somente leitura. Não existe fallback automático de Graph para mock. auth-service, PostgreSQL e Keycloak não foram incorporados ao MVP. M.3/M.4 são contratos/simuladores isolados, não persistência produtiva.

## 2. Autenticação e identificação

São quatro perguntas distintas: quem fez login; se a sessão ainda é válida; o que o perfil permite; qual Pessoa local do SharePoint corresponde à identidade corporativa.

src/server/auth/microsoft.ts valida assinatura RS256, issuer, audience, expiração, tenant, nonce, oid, conta corporativa, roles e contexto MFA quando configurado. Trecho real de claimsToUser:

~~~ts
const roles = appRoles.filter(
  (role) => Array.isArray(claims.roles) && claims.roles.includes(role),
);
if (!roles.length) throw new AuthError("ROLE_REQUIRED", 403);
~~~

OID identifica o objeto do usuário no tenant. Nome serve à apresentação, não à associação estável. A sessão em src/server/auth/session.ts usa JWE, registro ativo e limite de 15 minutos. Cookies são HttpOnly, SameSite=lax e Secure conforme origem. Logout/revogação invalidam o registro; não depure imprimindo cookies ou tokens.

Consulta lê a fila. Operador e Comprador podem revisar conforme os guards. Botão desabilitado não substitui autorização no servidor.

src/server/sharepoint/person-resolver.ts exige um único vínculo tenant/OID/site/lookup. GraphListPersonResolver aceita somente user.id e siteUser.id do mesmo objeto V2. Permissão técnica de aplicação não concede perfil humano.

O probe histórico concluiu a consulta sem encontrar o OID da sessão nessa fonte parcial. PERSON_NOT_FOUND não comprova inexistência da pessoa no site nem invalida por si só o login. Resposta malformada agora produz PERSON_RESOLUTION_UNAVAILABLE; somente array vazio representa ausência de candidato.

## 3. Graph e seus IDs

| Identificador | Significado |
| --- | --- |
| Tenant ID | Diretório corporativo |
| Client/Application ID | Registro da aplicação de login ou acesso técnico |
| OID | Objeto do operador no tenant |
| Site ID | Recurso SharePoint; composto por host e GUIDs no resolvedor |
| List ID | Lista dentro do site |
| Item ID | Registro dentro da lista; não é Codigo_Item |
| Pessoa lookupId | ID local da pessoa no site; não é OID |
| ETag | Versão do recurso |
| UUID de operação | Identidade da correção/decisão e suas evidências |

src/server/sharepoint/graph-read-transport.ts obtém token por client_credentials com scope https://graph.microsoft.com/.default. Ele representa a aplicação, não o funcionário.

O backend consulta /sites/{site}/lists/{lista}/items/{item}?$expand=fields e /columns. Nome de exibição não substitui nome interno. Os mapeamentos são lidos por src/server/data-source/configuration.ts.

Trecho sanitizado para comparar com o mapa existente, sem sobrescrever o restante:

~~~json
{
  "items": {
    "reviewedByPerson": "Responsavel_Decisao",
    "reviewedByOid": "Revisado_Por_Oid",
    "reviewedAt": "Data_Decisao",
    "decisionId": "Decisao_Id"
  }
}
~~~

Os quatro mapeamentos já estavam configurados localmente; o preflight confirmou os campos comparados. Alterar JSON não cria colunas.

Lists.SelectedOperations.Selected exige consentimento e concessão no recurso. O transporte verifica write na lista, recusa permissões amplas de escrita e agora percorre páginas com limites e destino restrito. Uma concessão parcial não libera PATCH se a continuação for inválida.

## 4. Persistência e concorrência

PATCH de campos leva JSON e If-Match com ETag lido. O transporte envia literalmente este campo de header:

~~~ts
"If-Match": etag,
~~~

decision-schema.ts verifica metadados de autoria/decisão; correction-state.ts verifica colunas de correção e evidência original. O backend valida material, fornecedor, estado e payload independentemente da interface.

Se dois operadores leem v1, a segunda gravação que encontrar versão diferente deve falhar. Não use wildcard para contornar conflito.

HTTP 200 não basta: sharepoint-operator-repository.ts relê e compara identidade, UUID, data, material, observação, status, orçamento e nova versão; a auditoria precisa confirmar o resultado. Normalização de vazios/datas depende de metadados verificados.

GraphWriteError diferencia not_sent, rejected e unknown. Falha de preparação não enviou; recusa HTTP explícita não aplicou; timeout/5xx pode esconder gravação. Não repetir PATCH automaticamente.

Trecho real de ItemCorrectionService:

~~~ts
const denied = writeDefinitelyNotApplied(error);
~~~

Depois disso, o serviço registra outcome durável antes de liberar lock. release usa CAS para remover apenas o lock do próprio UUID. Falha do ledger mantém bloqueio. A reconciliação de recusa retorna CORRECTION_NOT_APPLIED, sem novo PATCH nem sucesso artificial. Uma nova operação exige releitura e novo UUID.

Redis e SharePoint não formam transação distribuída. ETag, UUID, auditoria e releitura não prometem exactly-once nem imutabilidade contra administradores.

## 5. Conferência e aprovação

src/components/human-correction-editor.tsx mostra original e valores conferidos. Edição admite descrição, quantidade, unidade, preços, fornecedor, material e observação. src/domain/item-correction.ts valida novamente no servidor; justificativa e reconhecimento de diferença de total evitam recalcular valores comerciais silenciosamente.

Salvar correção deixa EM_REVISAO, preserva o original e limpa o material aprovado corrente. Escolher material na correção não aprova. Aprovação/rejeição são ações separadas; rejeição exige justificativa conforme src/domain/rejection-justification.ts.

Itens concluídos, enviados ao histórico ou com estado desconhecido são bloqueados. A decisão agora também exige estado bruto conhecido do orçamento, sem usar fallback visual de mapBudget como autorização.

PATCH /api/itens/{id}/decisao recebe action, approvedMaterialId e observation; autoria vem da sessão. PATCH /api/itens/{id}/correcao usa UUID e versão; POST nessa rota reconcilia pelo UUID.

A UI preserva UUID em sessionStorage antes de enviar e só chama onSaved após confirmação. CORRECTION_NOT_APPLIED remove a pendência comprovadamente não aplicada e mantém mensagem de erro/releitura. Incerteza conserva o UUID.

As flags continuam desativadas: resolvedor disabled e correções não habilitadas. Redis está ausente. decision-availability.ts e os guards mantêm o bloqueio; ativar flags não supre identidade ou infraestrutura.

## 6. Testes

No diretório do portal:

~~~powershell
npm.cmd test -- src/server/sharepoint/p0-regression.test.ts
npm.cmd test -- src/server/sharepoint
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
~~~

pretest aplica a mitigação existente de braces. Não retire a proteção para passar testes. A suíte local simula rede e ledger.

Na raiz:

~~~powershell
node scripts/n8n/validate-workflows.mjs
node --test scripts/n8n/workflow-integrity.test.mjs
~~~

Evidência desta atividade: 1.409 testes aprovados/24 ignorados no portal, 14 aprovados no n8n, TypeScript/lint/build Next aprovados. Não some testes focados aos totais da suíte. O validador n8n teve 22 avisos de contratos de catálogo.

Com configuração protegida e acesso de leitura autorizado:

~~~powershell
node --env-file=.env.local scripts/sharepoint-preflight.mjs --live --discover-history
~~~

Esse utilitário faz OAuth e GETs de metadados/permissões, sem gravar registros. Não comprova sessão humana ou persistência. Não compartilhe .env.local ou respostas brutas com dados pessoais. Os opt-in exigem infraestrutura preparada; os 24 ignorados não são testes aprovados.

## 7. Troubleshooting

| Sintoma | Investigação e ação segura |
| --- | --- |
| PERSON_NOT_FOUND | Conferir fonte e probe agregado; comprovar tenant/OID/site/lookup administrativamente, sem fallback por email/nome |
| PERSON_RESOLUTION_UNAVAILABLE | Verificar rede, OAuth, envelope e paginação; não tratar como pessoa ausente |
| 400 de entrada | Corrigir payload/validação; não enviar autoria pelo browser |
| 400 Graph | GRAPH_WRITE_INVALID_PAYLOAD: comparar nomes internos, tipos e lookups |
| 401 BFF | Verificar sessão, cookie, origem e registro ativo; refazer login normalmente |
| 401 Graph | GRAPH_WRITE_AUTHENTICATION_FAILED retorna 503: verificar credencial técnica com TI |
| 403 | Distinguir perfil, tenant, origem e concessão Graph pelo código; não ampliar permissões por suposição |
| 404 | Conferir recurso e configuração; não transformar automaticamente em criação |
| 409/412 | Recarregar versão e estado; UUID divergente também conflita; nunca usar wildcard |
| 429 | Respeitar Retry-After; não repetir PATCH em loop |
| Falha de sessão | Verificar JWE, expiração e Redis sem imprimir cookie |
| CORRECTION_UNCONFIRMED | Preservar UUID e reconciliar; a escrita pode ter ocorrido |
| CORRECTION_NOT_APPLIED | Há evidência terminal; reler antes de iniciar nova operação |
| DECISION_UNCONFIRMED | Reconciliar auditoria/UUID e estado remoto; não presumir ausência de gravação |

Para suporte, registre código, status, instante e UUID quando necessário em canal autorizado. Não copie secret, token, cookie, identidade pessoal ou corpo remoto arbitrário.

## 8. Exercícios progressivos com respostas

### 1. Seguir a leitura

Localize operator-repository-factory.ts e explique DATA_SOURCE=operator-api.

**Resposta:** seleciona OperatorApiRepository explicitamente; consulta é permitida, decisões são bloqueadas. Não há fallback para mock.

### 2. Separar IDs

Um usuário possui OID sintético 22222222-2222-4222-8222-222222222222 e lookup 7. Qual valor vai para Responsavel_DecisaoLookupId?

**Resposta:** string decimal "7", somente após comprovar o vínculo no backend. OID vai no campo textual próprio; não ocupa lookup.

### 3. Reproduzir resposta inválida

Execute p0-regression.test.ts e observe null, undefined e objeto sem array.

**Resposta:** retornam 503 PERSON_RESOLUTION_UNAVAILABLE. Array vazio significa ausência. A distinção evita diagnosticar usuário inexistente quando o serviço respondeu incorretamente.

### 4. Testar paginação

Mantenha primeira página vazia e concessão na segunda; depois mude nextLink para outro site.

**Resposta:** o primeiro caso permite um único PATCH após duas leituras; o segundo bloqueia antes de PATCH. O destino é parte da validação de segurança.

### 5. Comparar 429 e timeout

Por que 429 pode liberar lock e 5xx não?

**Resposta:** 429 é recusa explícita, que precisa ser registrada antes do CAS. Timeout/5xx não provam ausência de efeito. Nenhum caso justifica retry automático de escrita.

### 6. Interromper auditoria

Leia o teste “falha ao auditar recusa não libera lock”.

**Resposta:** se SET do outcome falha, falta prova durável para liberar. CAS só ocorre depois dessa prova; liberar antes perderia rastreabilidade.

### 7. Evitar sobrescrita

Dois operadores leem o mesmo ETag; o primeiro grava.

**Resposta:** o segundo recebe conflito e deve reler. Testes em decision-flow.test.ts, complete-decision.test.ts e item-correction-service.test.ts cobrem versão e repetição.

### 8. Separar apresentação e autorização

Compare mapBudget e o guard de saveItemDecision. UNKNOWN pode significar orçamento aberto?

**Resposta:** não. O mapper tem fallback visual; a escrita exige valor bruto reconhecido. A regressão bloqueia estado ausente, vazio, desconhecido ou fechado antes de intenção/PATCH.

### 9. Planejar homologação

O que falta depois de testes locais e build aprovados?

**Resposta:** vínculo de sessão humana, perfil/MFA, Redis autoritativo, item isolado autorizado, PATCH e releitura/auditoria coerentes e n8n publicado validado. Metadados e build não comprovam essas operações.

Faça os exercícios somente com fixtures sintéticas em uma branch de estudo. Não provoque falhas em dados produtivos. O procedimento administrativo está no relatório.

## 9. Confirmações da homologação de 22/10/2026

Detalhes em [RELATORIO_HOMOLOGACAO_E2E_2026-10-22.md](RELATORIO_HOMOLOGACAO_E2E_2026-10-22.md).

- **Por que a fonte atual não encontra a Pessoa:** `/lists/{lista}/permissions` devolve concessões explícitas no recurso. Quem acessa pelos grupos do site aparece como grupo, não como `user.id`. Zero correspondências é o resultado esperado para esses usuários; não prova ausência. A escolha de outra fonte é decisão de governança.
- **MFA:** com `ENTRA_MFA_AUTH_CONTEXT_ID` vazia, a aplicação não exige `acrs`. Qualquer MFA vem de política do tenant, que precisa ser confirmada pela TI.
- **Redis:** sessão e rate limit têm TTL; intenção, desfecho, evidência e lock de correção não têm. Por isso o Redis precisa de AOF e `noeviction`. Sem `SECURITY_REDIS_REST_*`, decisões falham com `AUDIT_NOT_CONFIGURED` antes de qualquer PATCH.
- **Docker no Windows 11 Home:** o engine exige WSL2. Sem a Plataforma de Máquina Virtual, o log registra `No virtualization available`, e os testes opt-in de Redis não rodam.
- **Leitura real de 22/10:** o token técnico tem só `Lists.SelectedOperations.Selected`; as quatro listas estão legíveis e as colunas comparadas, compatíveis; a concessão de escrita em itens está presente e não foi exercida.

**Exercício 10.** Um usuário do grupo Membros do site faz login com perfil Operador e recebe PERSON_NOT_FOUND. O login está errado?

**Resposta:** não. Autenticação e perfil passaram. A fonte de Pessoa só enxerga concessões explícitas na lista. Corrigir significa escolher uma fonte autorizada de vínculo, nunca procurar a pessoa por email ou nome.



## 10. Evolução local sem Docker — 22/10/2026

Ver [relatório da evolução](RELATORIO_EVOLUCAO_MVP_SEM_DOCKER_2026-10-22.md), com inventário de arquivos e limites.

- **Contrato de identidade não é autorização de fonte:** src/server/sharepoint/explicit-person-resolver.ts recebe PersonBindingSource, valida tenant/OID/site/Pessoa e evidência com validade. Rejeita duplicidade, revogação, expiração e colisão de Pessoa. Continua fora da factory/configuração; não é uma alternativa já homologada. A TI ainda deve aprovar origem, responsabilidade, acesso e manutenção. Nenhum email ou nome resolve OID.
- **Indisponível não é zero:** src/components/price-comparison-state.ts conserva subtotal inválido e não publica total quando uma quantidade selecionada é inválida. A seleção é preservada para o operador corrigir a quantidade. src/domain/price-comparison.ts soma centavos com BigInt e só retorna valores inteiros seguros.
- **Simulação não é persistência:** src/components/decision-messages.ts e validation-workspace.tsx distinguem confirmação/sucesso mock da escrita real. price-comparison-workspace.tsx identifica valores fictícios, cobertura do total, histórico separado, carregamento e nova tentativa de leitura.
- **Erro de contrato não é catálogo vazio:** sharepoint-price-comparison-repository.ts recusa envelope/linhas/paginação malformados. Os testes correspondentes verificam também pendente → snapshot aprovado → unidade incompatível; essa mutação é somente fixture, sem PATCH real.

Exercício 11: selecione uma oferta e apague a quantidade. O total deve virar indisponível, não R$ 0,00; corrigir a quantidade deve recuperar o total e conservar a oferta.

Exercício 12: forneça dois vínculos com o mesmo tenant/OID/site, um ativo e outro revogado. O adaptador deve retornar PERSON_AMBIGUOUS, exigindo reconciliação administrativa, em vez de escolher o ativo silenciosamente.

Exercício 13: aprove um item em modo mock. A confirmação deve dizer que nenhum registro real será alterado e o retorno deve indicar simulação em memória. Isso não remove os guards de auditoria da fonte SharePoint.

Resultado desta rodada: 1.437 testes aprovados e 24 ignorados no portal; 14 aprovados no n8n; TypeScript, lint e build aprovados. O validador n8n mantém 22 avisos. Não houve homologação visual de navegador nem integração corporativa real; Redis, identidade autorizada, escrita e histórico seguem pendentes.
