# Login e datasource — correção local, 17/10/2026

## Causas verificadas

O processo Next da porta 13300 foi iniciado com `DATA_SOURCE=mock` no ambiente do processo. O `.env.local` do aplicativo contém `DATA_SOURCE=sharepoint`, mas variáveis já presentes no processo têm prioridade. Não era fallback do SharePoint nem cache de build. O helper antigo `manual-login-start.py` fixava mock. Não reutilizar esse helper para homologação SharePoint.

O login estava no modo legado porque `AUTH_CORPORATE_LOGIN_ENABLED` e `KEYCLOAK_CORPORATE_IDP_ALIAS` não estavam definidos no processo nem no `.env.local`. O processo foi reiniciado com a flag explicitamente false, conforme o bloqueio de segurança ainda vigente. As opções legadas permanecem até homologar a origem corporativa; não foi feita uma troca visual que ocultasse esse bloqueio.

O flow local do client `3p-operator-web` e o mapper User Session Note estão configurados para o provider `oidc`. A emissão real de `identity_provider=oidc` após autenticação Microsoft ainda não foi observada. Membros/convidados, vinculação e MFA continuam pendentes. Não ativar a flag para resolver apenas a duplicidade visual. As rotas Microsoft e o código de escrita da Fase 4 não foram modificados nesta correção.

## Seleção e precedência

Next carrega, nesta ordem: ambiente do processo, `.env.development.local`, `.env.local`, `.env.development`, `.env`. Arquivos ficam na raiz de `operator-web`, não em `src`. O processo atual usa desenvolvimento. Reiniciar o processo correto após mudar configurações; uma aba com estado React antigo também precisa de atualização completa.

`DATA_SOURCE` é server-side, sem versão `NEXT_PUBLIC_`. Valores: `mock`, `sharepoint`, `operator-api`, normalizados por trim/lowercase. O contrato legado da factory mantém mock para variável ausente/vazia; o novo iniciador de homologação exige seleção explícita válida, inclusive recusando vazio. Valor não reconhecido retorna erro de configuração. Seleção SharePoint incompleta/falha nunca aciona mock.

| Recursos | mock | sharepoint | operator-api |
|---|---|---|---|
| Orçamentos, itens e materiais | MockOperatorRepository | SharePointOperatorRepository via Graph técnico | OperatorApiRepository somente leitura |
| Comparação de preços | MockPriceComparisonRepository | SharePointPriceComparisonRepository | Indisponível, HTTP 404 |
| `/demo` | Exige também modo demo explícito e development | Não habilitado por esta fonte | Não habilitado por esta fonte |

As páginas usam o BFF; a fila consulta `/api/orcamentos`, o detalhe consulta itens e materiais, e a comparação consulta `/api/comparacao-precos`. Não existe variável independente para materiais. `OPERATOR_API_BASE_URL` e `OPERATOR_API_TOKEN` só configuram operator-api. `OPERATOR_WEB_DEMO`, `AUTH_DISABLED`, `ALLOW_LOCAL_SHAREPOINT_BYPASS` e `ALLOW_LOCAL_OPERATOR_API_BYPASS` não selecionam a fonte; controlam modos locais distintos e permanecem desativados neste processo.

SharePoint usa `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`, `SHAREPOINT_ORCAMENTOS_LIST_ID`, `SHAREPOINT_ITENS_IMPORTADOS_LIST_ID`, `SHAREPOINT_MATERIAIS_OFICIAIS_LIST_ID` e `SHAREPOINT_FIELD_MAP_JSON`. `SHAREPOINT_HUMAN_CORRECTIONS_ENABLED` controla correções, não seleciona dados; não foi habilitado por esta atividade.

## Correções aplicadas

Arquivos desta atividade, relativos a `system/apps/operator-web` (os 15 arquivos da atividade anterior foram preservados byte a byte):

- `package.json` e `scripts/start-homologation.mjs`.
- `src/server/data-source/read-response.ts`, `read-response.test.ts` e `operator-repository-factory.ts`.
- `src/app/api/orcamentos/route.ts`, `src/app/api/orcamentos/[id]/itens/route.ts`, `src/app/api/materiais/route.ts` e `src/app/api/comparacao-precos/route.ts`.
- `src/app/api/price-comparison-sharepoint.test.ts`.
- `src/repositories/bff/bff-operator-repository.ts` e `bff-price-comparison-repository.ts`.
- `src/components/budget-queue.tsx`.
- `docs/DIAGNOSTICO-LOGIN-DATASOURCE.md`.

- `scripts/start-homologation.mjs`, comando `npm run dev:homologation`: carrega arquivos locais com `@next/env`, exige fonte explícita, usa somente loopback/porta 13300, rejeita bypasses e não gera credenciais. Enquanto a homologação de segurança estiver pendente, recusa modo corporativo ativo. A precedência normal de variáveis do terminal continua valendo; o log de início mostra a fonte efetivamente carregada.
- GETs do BFF registram fonte selecionada, rótulo do adaptador, recurso, status, resultado e UUID de correlação. Sem IDs de itens, consultas, conteúdo, cookies ou credenciais. A resposta fornece somente `X-Correlation-Id`, sem detalhes de autenticação ou configuração interna. Erros mantêm mensagens seguras.
- Fetches dos clientes BFF usam `cache: no-store`, além de GETs dinâmicos e respostas sem cache que já existiam. A factory continua selecionando a fonte a cada chamada. O reuso do adaptador SharePoint agora considera um fingerprint interno da configuração: mudança de mapa/IDs/credenciais não reutiliza o adaptador antigo. O fingerprint nunca é registrado.
- Erro na fila ganha `role=alert`; não é apresentado como lista mock.

## Estado observado

O processo isolado foi reiniciado e relido: `DATA_SOURCE=sharepoint`, `AUTH_CORPORATE_LOGIN_ENABLED=false`, `AUTH_DISABLED=false`, bypasses false e origem `http://127.0.0.1:13300`. Segredo de sessão e client secret Keycloak existentes foram preservados em memória; `.env.local` não foi editado. Containers de negócio não foram reiniciados.

Uma consulta real pelo mesmo adaptador de leitura, usando a configuração do `.env.local`, obteve HTTP 200 no token técnico Entra e em cinco GETs Graph: 2 orçamentos, 5 materiais e 3 itens do primeiro orçamento. Isso comprova leitura das listas configuradas; o conteúdo dessas listas pode ser de homologação. Não são dados gerados pelo mock do portal. Nenhuma escrita Graph foi executada.

Essa consulta foi um probe técnico isolado, não um GET autenticado com a conta humana no portal. No processo Next, `/login` respondeu 200 e `/api/orcamentos` anônimo respondeu 401/no-store. A navegação autenticada continua dependente do teste manual.

Suíte completa: 562 testes, 560 aprovados, 2 live ignorados, zero falhas. Após acrescentar um teste de recarga do mapa, a suíte específica passou 10/10, incluindo esse novo cenário. Typecheck, lint e Next build passaram; o arquivo de teste acrescentado também passou lint. Não somar a suíte específica à completa: existe sobreposição.

## Operação e homologação manual

O ambiente já está disponível em `http://127.0.0.1:13300/login`; não iniciar outra cópia. O `.env.local` não contém o segredo JWE usado pela PoC, e seu client secret não é igual ao do processo isolado. Por isso `npm run dev:homologation` isoladamente não substitui a preparação dessas credenciais. Não copiar valores para este documento nem gerar novos.

No workspace da atividade existe `work/start-operator-homologation.py`: reutiliza o arquivo privado `work/phase3-runtime.json`, sem exibir seus valores, e deixa datasource/Graph serem carregados dos arquivos do aplicativo. Recusa porta ocupada. Usar somente neste laboratório, se o processo tiver sido encerrado. Os arquivos privados ficam fora do repositório e não devem ser publicados.

1. Atualizar completamente o navegador; se o reinício invalidou o registro de sessão em memória, autenticar novamente pessoalmente pelo Keycloak, que encaminha ao broker Microsoft. Não compartilhar cookies ou tokens.
2. Conferir fila, itens e materiais com as listas de homologação: a leitura técnica encontrou 2 orçamentos, 5 materiais e 3 itens do primeiro orçamento. Quantidades podem mudar se o responsável alimentar as listas depois. Registrar os resultados sem dados pessoais.
3. Em Network, conferir GETs, `Cache-Control: no-store` e `X-Correlation-Id`. Se houver erro, fornecer somente o identificador e a mensagem segura para consultar o log servidor `operator-web.data-read`.
4. Testar MOCK e configuração inválida somente em processo isolado com configuração temporária; reiniciar e atualizar a página a cada troca. MOCK deve usar apenas fixtures, SharePoint deve usar apenas listas. Não usar indisponibilidade de produção como teste de falha; esse cenário já foi simulado nos testes automatizados, sem fallback.
5. Não clicar em operações reais de gravação. A leitura SharePoint e autenticação via Keycloak não concedem vínculo corporativo nem autorização de escrita.
6. Para homologar botão único, antes comprovar claim real, elegibilidade, vinculação e MFA. A UI com flag true/configuração válida está coberta por testes, mas não foi ativada no processo. Após liberar esses pré-requisitos, executar o roteiro corporativo anterior: conta sem role, conta local, convidado/outro tenant, sessões, duas abas e logout SSO.
7. Microsoft direto permanece implementado em `/api/auth/login`. No processo atual, suas variáveis `ENTRA_LOGIN_*` estão ausentes e o controle legado aparece desabilitado; isso não foi contornado. Graph técnico, Microsoft via broker e login Microsoft direto usam configurações diferentes. Não declarar esse login direto homologado pelo sucesso do Graph ou do broker.

Nenhum teste humano foi aprovado pela IA. Sem GO para modo corporativo ou produção. A leitura técnica SharePoint foi comprovada; a experiência autenticada no navegador ainda deve ser homologada pelo responsável. Sem commit, push, deploy, migrações ou alteração de Entra, SharePoint, n8n e Spring.
