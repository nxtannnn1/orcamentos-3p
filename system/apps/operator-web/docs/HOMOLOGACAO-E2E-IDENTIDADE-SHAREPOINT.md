# Ensaio E2E Entra → Pessoa SharePoint — 18/10/2026

**Critério humano ainda não atendido. NO-GO para declarar identidade E2E homologada,
para escrita real ou para produção.** A instrumentação de leitura está pronta e os
testes automatizados passaram; a associação única com a Pessoa continua pendente.

## Estado mais recente — PERSON_NOT_FOUND em investigação

O responsável confirmou login Microsoft funcional, DATA_SOURCE=sharepoint, leituras
Graph de orçamentos/materiais/itens funcionando e probe true retornando PERSON_NOT_FOUND.
Isso supera o bloqueio histórico de login/fonte mock, mas não homologa a associação.
Foi preparada instrumentação temporária agregada, testada com mocks, para analisar
site/permissões/paginação e comparar apenas contagens de OID e siteUser. Não houve
nova execução humana pela IA, alteração de ambiente ou acesso a cookies da sessão.
[Campos do evento, resultados e próximo ensaio](DIAGNOSTICO-PROBE-IDENTIDADE.md).

## Estado anterior — diagnóstico do login Microsoft (histórico)

O responsável preparou as configurações Entra e iniciou outro processo. A inspeção
posterior encontrou PID 21144, origem `http://localhost:13300`, autenticação normal,
bypasses false, Keycloak false, probe true e **DATA_SOURCE=mock**. As configurações
de login e o segredo de sessão correspondem ao arquivo local, sem expor valores.
O probe não está apto a consultar SharePoint nessa fonte: retorna
`PROBE_SHAREPOINT_REQUIRED` somente após existir sessão Entra válida.

Foram corrigidos o nonce ausente na troca do código pelo MSAL 7 e o início local
em Host diferente do callback. [Causas demonstradas, testes e pendências humanas](DIAGNOSTICO-LOGIN-MICROSOFT.md).
O diagnóstico abaixo registra o processo anterior, já substituído pelo responsável;
suas ausências de configuração não descrevem mais o processo atual. A IA não
interrompeu processos nem alterou `.env.local`. A homologação humana continua pendente.

## Diagnóstico inicial e preservação — histórico

Branch `infra-lab`, HEAD `c6748407e31363fd70dbde0f8a6b61fd5e9e7e01`, sem novo commit.
Foram lidos AGENTS.md e CLAUDE.md da raiz e do portal. As instruções de governança
estavam válidas e foram preservadas, incluindo revisão documental na mesma entrega.
Todas as alterações locais anteriores, arquivos não rastreados, backup de build e
processos foram preservados. O processo Next existente **não foi interrompido nem
reiniciado** e não teve ambiente ou segredo alterado por esta atividade.

O processo observado da porta 13300 é o PID 19408. Ele contém:

- `DATA_SOURCE=sharepoint`, `AUTH_DISABLED=true`, `ALLOW_LOCAL_SHAREPOINT_BYPASS=true`;
- `KEYCLOAK_ENABLED=false`, modo corporativo false e resolvedor disabled;
- nenhuma das três variáveis `ENTRA_LOGIN_TENANT_ID`, `ENTRA_LOGIN_CLIENT_ID`,
  `ENTRA_LOGIN_CLIENT_SECRET`;
- segredo de sessão existente presente e correspondente ao arquivo local;
- probe de leitura não ativado, correções humanas não ativadas e Redis ausente.

O bypass retorna Consulta local antes de verificar uma sessão Microsoft. Além disso,
a configuração Microsoft ausente impede validar uma sessão Entra pelo fluxo atual.
Logo, **não há sessão Entra utilizável neste processo para o ensaio**, mesmo que o
responsável tenha autenticado anteriormente. Não foram lidos, solicitados ou copiados
cookies, tokens ou senhas humanos para concluir isso. O arquivo `.env.local` também
não possui as três configurações de login e não foi alterado.

## Instrumento de homologação preparado

`src/server/sharepoint/entra-person-readonly-probe.ts` é server-only e não possui
rota HTTP. A chamada é interna a `requirePageSession()`, **depois** de `getSession()`
validar o JWE e seu registro ativo. Sessão ausente, expirada ou revogada redireciona
para login antes de qualquer consulta do instrumento.

A flag `ENTRA_PERSON_READONLY_PROBE` é false por padrão. Quando solicitada, a execução
exige development, origem HTTP de loopback, `AUTH_DISABLED=false`, bypasses e demo
desativados, fonte SharePoint e sessão `authMode=entra`. Identidade Keycloak, bypass
ou ausência de identidade nunca são reinterpretados como Microsoft.

O instrumento extrai apenas tenantId e OID da sessão validada. Site e lista vêm de
`readSharePointServerConfig`; não há parâmetros do navegador para alterá-los.
Ele instancia `GraphListPersonResolver` com capacidade apenas GET, usa o guard
`resolveDecisionPerson` e exige associação única consistente. O token técnico Graph
é obtido pelo transporte existente com OAuth POST permitido; consultas SharePoint
são apenas GET. Nenhuma mutação, criação de vínculo, concessão ou escrita é efetuada.

Não é necessário habilitar `SHAREPOINT_PERSON_RESOLVER` na factory para executar
esse probe: a seleção permanece disabled, assim como as correções humanas. O
resultado do probe não altera sessão, papéis, grants ou autorização e não é usado
como pré-requisito satisfeito para escrita. Também não libera o bloqueio Keycloak.

O único evento produzido é:

```text
operator-web.entra-person-probe
{ probeId: <UUID do ensaio>, status: <categoria>, readOnly: true, diagnostics: <contadores temporários> }
```

O UUID é aleatório por execução, não derivado da identidade. Não se registram OID,
tenant, siteUser ID, nome, email, cookie, token, mensagens privadas da fonte ou
conteúdo de permissões. Nada desse diagnóstico é retornado ao navegador. O usuário
continua vendo a página normal; erros do ensaio são registrados como categorias e
não concedem acesso nem transformam erro em identidade válida.

## Evidências reais e testes — entrega anterior

O probe técnico anterior foi repetido usando o resolvedor atual e Graph real:
OAuth HTTP 200 e três GETs Graph HTTP 200; uma associação única do próprio objeto
de permissão foi confirmada. Sem PATCH/POST/DELETE no SharePoint, sem usuário criado
e sem mudança de permissão. **Esse ator veio da fonte, não de sessão humana.** Não
foi usado para marcar o critério E2E como aprovado.

| Cenário | Evidência atual |
| --- | --- |
| Sessão Entra ativa → par único | Passou com fixture de JWE e registro reais do código + Graph simulado; humano real pendente |
| Sessão ausente/expirada/revogada | Guard redireciona antes de Graph, testado |
| Usuário sem associação | Recusa `PERSON_NOT_FOUND`, testada |
| Associação ambígua | Recusa `PERSON_AMBIGUOUS`, testada |
| Tenant/OID/site divergentes | Recusa pelos guards e resolvedor, testada |
| Permissão insuficiente/falha de rede | `PERSON_RESOLUTION_UNAVAILABLE`, sem detalhes privados, testada |
| Acesso por grupo/herança sem par explícito | `PERSON_NOT_FOUND`, testado com fixtures; funcionário real nesse cenário ainda pendente |
| Ausência de escrita | Testes verificam que métodos de escrita não são chamados; probe técnico real contém apenas GET Graph |
| Logs sem identificadores/tokens | Asserções verificam ausência dos valores privados nos eventos |
| Human E2E | **Bloqueado por configuração e interação humana; não executado** |

Resultados: **611 testes, 609 aprovados, zero falhas e dois live ignorados**. A seleção
focada inicial passou 98/98 antes de acrescentar o teste adicional de 503, também
incluído na suíte completa final. Typecheck e lint passaram. Não somar esses números,
pois as suítes se sobrepõem. Não houve build/deploy nem interferência na pasta de
build em uso por um build de produção.

Comandos no diretório `system/apps/operator-web`:

```powershell
npm test -- src/server/sharepoint/entra-person-readonly-probe.test.ts src/server/auth/entra-person-probe-session.test.ts src/components/login-actions.test.tsx src/server/auth/keycloak.test.ts src/server/sharepoint/graph-list-person-resolver.test.ts --reporter=json --outputFile=<arquivo-local>
npm test -- --reporter=json --outputFile=<arquivo-local>
npm run typecheck
npm run lint -- --ignore-pattern '.next-backup-20261018-113117/**'
```

A exclusão de lint cobre apenas o backup de build preexistente, preservado. As
regras ESLint não foram alteradas. O probe técnico externo ao repositório foi
executado por `node work/identity-resolver-live.cjs` no workspace da atividade;
suas evidências contêm somente status e booleanos, sem identificadores pessoais.

## Situação das duas falhas preexistentes

**Interface:** o HEAD c674840 já priorizava uma única opção Keycloak fora do modo
corporativo quando Keycloak está configurado. Isso atende à preferência por não
duplicar provedores, preservando Microsoft direto tecnicamente em `/api/auth/login`
e visualmente quando Keycloak não está configurado. O teste que exigia duas opções
estava desatualizado. Foi substituído por casos que verificam a preferência única,
a alternativa Microsoft, ausência de configuração e distinção do botão corporativo.
Não houve alteração na implementação da interface para esse ajuste nem remoção
das rotas Microsoft. A preferência visual não homologa o broker como corporativo.

**Keycloak:** `keycloakConfig()` já rejeita provedor desativado com
`KEYCLOAK_DISABLED`/404, mas a rota de início convertia qualquer erro em 503.
Foi corrigida somente essa classificação: desativado → 404; habilitado mas
incompleto/indisponível → 503. O corpo continua genérico e no-store. O teste de
404 foi preservado e um caso adicional comprova 503 com configuração incompleta,
sem emitir transação ou fazer troca de token. Não foram relaxados PKCE, state,
nonce, assinatura, expiração, issuer, audience, MFA ou papéis.

## Ação exata necessária do operador

**O processo atual permite retestar login, mas usa mock.** O ensaio SharePoint
exige preparar um processo com `DATA_SOURCE=sharepoint`, sem bypass, mantendo os
segredos existentes. A troca deve ser feita pelo responsável; não abrir uma segunda
instância na porta ocupada. Nenhuma senha/token/cookie/secret/código MFA deve ser enviado à IA.

1. Localizar a configuração existente e aprovada de **login Microsoft direto**, com
   `ENTRA_LOGIN_TENANT_ID`, `ENTRA_LOGIN_CLIENT_ID` e `ENTRA_LOGIN_CLIENT_SECRET`.
   Prepará-la no ambiente seguro de execução local, sem imprimir os valores ou
   incluí-los em histórico, evidências ou conversa. Não presumir que a credencial
   técnica Graph ou o client secret Keycloak sejam intercambiáveis com ela.
2. Conferir no registro existente a URL Web de retorno
   `http://localhost:13300/api/auth/callback`. A URL `/broker/oidc/endpoint` é do outro
   fluxo e não a substitui. Se esse retorno ou as claims/papéis exigidos não estiverem
   disponíveis, registrar dependência externa e solicitar autorização separada;
   não alterar Entra, criar segredo ou conceder role para forçar sucesso.
3. Manter o `AUTH_SESSION_SECRET` existente, sem regenerar. O arquivo local foi
   conferido como correspondente ao processo atual. Preservar configuração e
   exigência MFA existentes. O código continua exigindo tenant, OID, conta-membro,
   role autorizada e validações originais; sucesso técnico Graph não substitui isso.
4. Autorizar/agendar a troca do processo local e encerrar a instância atual pelo
   seu terminal, quando apropriado. **A IA não executou essa interrupção.** Não abrir
   outra cópia na porta ocupada. Exportar variáveis em outro terminal não modifica
   um processo já iniciado; elas serão aplicadas somente ao novo processo.
5. No diretório do portal, com as configurações de login já disponíveis e sem
   modificar arquivos de segredos, preparar o processo de ensaio:

```powershell
$env:DATA_SOURCE='sharepoint'
$env:AUTH_DISABLED='false'
$env:ALLOW_LOCAL_SHAREPOINT_BYPASS='false'
$env:ALLOW_LOCAL_OPERATOR_API_BYPASS='false'
$env:OPERATOR_WEB_DEMO='false'
$env:KEYCLOAK_ENABLED='false'
$env:AUTH_CORPORATE_LOGIN_ENABLED='false'
$env:SHAREPOINT_PERSON_RESOLVER='disabled'
$env:SHAREPOINT_HUMAN_CORRECTIONS_ENABLED='false'
$env:ENTRA_PERSON_READONLY_PROBE='true'
npm run dev:homologation
```

6. Abrir pessoalmente `http://localhost:13300/api/auth/login`, autenticar com a conta
   corporativa aprovada e concluir o MFA exigido. Não é preciso papel de escrita:
   Consulta autorizado pode realizar o ensaio de identidade. A IA não fará esse login.
7. Após o retorno à fila, conferir no terminal o evento `operator-web.entra-person-probe`.
   **VERIFIED** significa associação única da sessão validada nessa execução. Anotar
   apenas status, probeId e horário. Se necessário, atualizar uma página protegida
   para repetir a leitura, enquanto a sessão permanecer válida.
8. `PERSON_NOT_FOUND` exige verificar a cobertura da fonte; acesso por grupo/herança
   pode ser legítimo, mas insuficiente para resolver a Pessoa. Não criar associação
   por email nem mudar permissões para fabricar um par. Ambiguidade ou divergência
   interrompe essa homologação e exige análise da fonte.
9. Encerrado o ensaio, retirar a flag do probe ou defini-la como false no próximo
   processo. Não reativar bypass como solução e não habilitar escrita. Preservar os
   segredos. O instrumento não criou nada no SharePoint para desfazer.

Resultados manuais: **NÃO EXECUTADOS**. O responsável pode informar somente status,
probeId e horário; nunca o cookie, token, senha, secret ou código de login/MFA.

## Arquivos desta etapa

Código/configuração: `.env.example` (probe false),
`src/server/sharepoint/entra-person-readonly-probe.ts` e seu teste,
`src/server/auth/session.ts` (chamada interna após o guard),
`src/server/auth/entra-person-probe-session.test.ts`,
`src/app/api/auth/keycloak/login/route.ts`, `src/server/auth/keycloak.test.ts` e
`src/components/login-actions.test.tsx`.

Documentação: READMEs da raiz e do portal, `docs/ARQUITETURA.md`,
`docs/SEGURANCA-OPERACIONAL.md`, `docs/RESOLUCAO-IDENTIDADE-SHAREPOINT.md` (registro
histórico com referência ao estado novo), `docs/LOGIN-CORPORATIVO.md`,
`docs/LOGIN-CORPORATIVO-TESTES-MANUAIS.md`, READMEs locais de auth/SharePoint e este
relatório. AGENTS.md/CLAUDE.md foram revisados e mantidos, sem duplicar regras válidas.

## Pendências e parecer

- Sessão humana Entra e associação do seu OID à Pessoa: pendentes.
- Cobertura de usuário real com acesso por grupo/herança: pendente.
- Configuração Microsoft presente e callback local corrigido; claims, atribuição de
  perfil e login humano real ainda precisam de homologação. Fonte atual mock deve
  ser substituída pelo responsável para o ensaio SharePoint. Alterações externas
  continuam sem autorização.
- Redis autoritativo, schema/auditoria, concessões individuais e homologação de escrita:
  pendentes e fora desta execução.
- Escrita Keycloak: continua explicitamente bloqueada pela Fase 4.

O próximo passo é exclusivamente o ensaio humano de leitura acima. Não há GO de
conclusão E2E enquanto o evento VERIFIED não vier de uma sessão Entra humana real
no ambiente adequado. Mesmo depois dele, escrita e produção exigem autorização e
homologações separadas. Nenhum deploy, commit ou push foi executado.
