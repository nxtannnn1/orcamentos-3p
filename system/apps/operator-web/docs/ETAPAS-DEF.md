# Execução consolidada D, E e F

## Estado e limites

Alterações locais, sem publicação, deploy, criação de recursos, alterações no tenant,
correção dos três itens antigos ou commits. O trabalho preexistente foi preservado.
O domínio de comparação, seleção manual e cálculos da pré-seleção foram preservados.
Não há gravação de cesta, pedido, reserva ou economia realizada nesta entrega.

### D — identidade e auditoria

Permanece `unavailablePersonResolver` na factory de produção. A inspeção da Etapa C
confirmou acesso Graph de listas selecionadas, sem permissão application de leitura
do diretório e sem fonte verificada do vínculo tenant/OID/Pessoa do site. Nenhum
acesso novo foi solicitado. Não se converte OID em ID SharePoint, não se usa nome,
e-mail do navegador ou conta de serviço. A abstração e guardas da Etapa C permanecem.
Uma fonte autorizada e verificável desse vínculo ainda precisa ser homologada.

Manter obrigatórios: Pessoa (responsável humano), data UTC (momento da decisão),
OID (identidade estável, vinculada ao tenant configurado) e UUID (reconciliação do
evento). O UUID é gerado pelo servidor; não é uma chave idempotente fornecida pelo
cliente. Repetir o mesmo ETag após sucesso é bloqueado; uma nova decisão válida com
outra versão recebe novo UUID. O envio histórico continua único por item de origem.

Redis exige intenção confirmada antes do PATCH. Agora falha ou resposta diferente
de OK ao registrar o resultado após PATCH gera `AUDIT_OUTCOME_UNCONFIRMED`, nunca
sucesso silencioso nem repetição automática. SharePoint pode já ter persistido.
Releia e reconcilie pelo UUID; Redis e SharePoint não formam uma transação.
Os testes abrangem falhas antes/depois do PATCH, resultado incerto e ETag repetido.

Os nomes propostos `Revisado_Por_Oid` e `Decisao_Id` continuam não provisionados em
produção. `Responsavel_Decisao` e `Data_Decisao` são campos existentes. Provisionar
somente em homologação autorizada, usando o esquema local; nunca apontar OID textual
para Pessoa. Não se alterou `.env.local`, credenciais, conexões ou permissões.

### E — kit local de homologação

O seletor Power Automate foi reinspecionado: apenas um ambiente acessível para criar
fluxos (o padrão), zero outros ambientes. Isso não comprova inexistência de ambientes
fora das permissões da conta. Não há conjunto isolado autorizado comprovado. Nenhum
teste integrado externo foi executado. A biblioteca chamada `teste`, identificada
anteriormente, não tem o esquema necessário.

Artefatos locais em `docs/homologacao/`:

- `lists.templates.json`: templates Graph das quatro listas, sem criação executada.
- `fixtures.synthetic.json`: dados sintéticos pendentes; sem Pessoas/IDs fictícios.
- `operator.homolog.env.example`: configuração separada, secrets vazios, autenticação exigida.
- `flow.definition.candidate.json`: definição WDL candidata, não pacote de importação.
- `manifest.json`: estado pretendido desativado, validação de motor ainda pendente.

`node scripts/prepare-homologation.mjs` apenas regenera os quatro JSON locais.
Não contém chamadas de rede ou provisionamento. O arquivo de ambiente não é alterado
pelo gerador. Não executar esse comando esperando criar recursos no SharePoint.

#### Provisionamento futuro, somente após autorização

1. Criar site dedicado, com sufixo `-homolog`, e registrar a URL autorizada.
2. Criar listas `materials` e `budgets` dos templates, guardar IDs retornados.
3. Substituir os placeholders de lookup e criar `items`; depois criar `history`.
   Os lookups devem apontar exclusivamente para as listas do site de homologação.
   `Title` é campo base e rótulo; não representa um novo código interno 3P.
4. Conferir nomes internos/tipos e unicidade de Codigo_Item, Codigo_Orcamento,
   Chave_Historico e ID_Item_Importado. Não importar IDs ou registros produtivos.
5. Vincular as fixtures aos IDs retornados e inserir os dados sintéticos somente nas
   listas isoladas. Conferir descrição/número/total e preencher referências de orçamento.
   Associar o material pela revisão humana. Não fabricar autoria, data ou UUID.
6. Configurar aplicação/origem e Redis exclusivos. Confirmar permissões mínimas já
   autorizadas; qualquer concessão adicional exige autorização separada.
7. Homologar um resolvedor real de Pessoa e conectá-lo explicitamente à factory.
   Até isso ocorrer a aprovação permanece bloqueada, mesmo nas listas de teste.
8. Criar cópia desativada do fluxo. Antes de ativar, substituir TODOS os sites,
   IDs de lista e referências de conexão. Conferir também ações HTTP e gatilho.
   Nenhum ambiente Power Automate isola dados se as URLs ainda forem produtivas.

#### Definição candidata e validação obrigatória

O JSON foi gerado a partir da auditoria da definição, não salvo no serviço. Antes de
importação/ativação, validar formato do pacote, parâmetros dinâmicos do conector,
nomes internos efetivos, formato de Pessoa/Claims e Choice/Value, ETags retornados,
OData `Item_OrigemId`, `runAfter`/Scopes/Terminate e schema Parse JSON no motor real.
As referências de conexão são placeholders de binding, não conexões criadas.

As colunas OID e UUID no histórico também são propostas do template isolado, não
campos confirmados/provisionados no histórico produtivo. Não importar esse candidato
em produção sem homologar os esquemas correspondentes e obter autorização.

A definição mantém polling de 3 minutos, concorrência 1, relê o item pelo ID, valida
tipos sem conversão permissiva, quantidade/preço positivos, textos após trim,
material/orçamento existentes, unidade equivalente e aprovação humana com OID/UUID.
Snapshot preserva Pessoa, data original, três vínculos e código externo separado;
não lê `Codigo_Material` nem inventa código interno ou horário de aprovação.

Deduplicação usa ID_Item_Importado, Chave_Historico e Item_OrigemId, com até dois
resultados para detectar ambiguidade. Existência não significa completude: todos os
campos do snapshot devem coincidir antes de marcar envio. Registro divergente,
incompleto ou múltiplo exige reconciliação, sem sobrescrita. SIM sem histórico é erro.
Mudanças após SIM são conferidas, sem criar uma segunda versão histórica.

Após criar, relê histórico e confere snapshot. Antes de marcar envio, relê item,
material e orçamento e compara ETags. A atualização usa ETag específico; nenhum `*`.
Isso reduz conflitos, mas não torna as listas transacionais. Criação e confirmação
têm retry automático desativado: timeout exige leitura por identidade antes de nova
tentativa autorizada. Não há monitor/reprocessamento automático criado nesta etapa.

`power-automate-expression-check.mjs` é um avaliador local limitado das funções
emitidas pelo gerador; NÃO é o motor Microsoft. Testes validam condições, esquema
numérico suportado, snapshot, deduplicação, nomes/referências/dependências de ações e
ETags. O manifesto mantém `engineValidated=false` até testes reais autorizados.

### F — comparação SharePoint integrada localmente

`SharePointPriceComparisonRepository` usa somente GET. Para cada consulta, lê as
listas paginadas e resolve material/orçamento por ID. Considera exclusivamente status
exato APROVADO e material aprovado associado. Preserva fornecedor do item, preço,
unidade, código e data; não promove sugestão ou fornecedor do cabeçalho silenciosamente.
Preços não numéricos viram null, não zero ou valor convertido; o domínio existente
marca preço/unidade/fornecedor/orçamento inválidos como inelegíveis. Orçamento órfão
permanece explicitamente inválido, sem dados fabricados. Duplicatas idênticas são
deduplicadas; mesma identidade com valores divergentes gera erro. Falhas Graph são
propagadas; nunca há fallback SharePoint → mock.

A API e a rota `/comparacao-precos` aceitam mock ou SharePoint configurado.
`operator-api` continua fora desse fluxo. Catálogo vazio retorna null na consulta
inicial; material existente sem ofertas retorna comparação vazia. Erros e configuração
inválida são apresentados de forma segura. O modo da interface identifica a fonte.
Consultas por material são feitas sob demanda; os totais abrangem apenas materiais
consultados. Seleção continua manual e temporária; não há gravação de cesta.

O adaptador pagina até 100 páginas/50.000 registros por lista e faz leituras completas
por material consultado. Adequado ao MVP atual, mas não substitui índices/filtros e
estratégia de snapshot para catálogos grandes. Dados podem mudar entre GETs. A política
de validade temporal dos preços continua pendente; preço antigo não é descartado
arbitrariamente. O domínio de comparação foi preservado.

## Aceite e rollback da homologação

- Confirmar zero referências produtivas no fluxo, ambiente local e lookups.
- Aprovar dois itens sintéticos de fornecedores diferentes e mesmo material oficial,
  por humanos autorizados, gerando Pessoa/data/OID/UUID no mesmo PATCH.
- Verificar um histórico por item e nenhuma alteração nos registros produtivos.
- Repetir evento, simular falha de confirmação e histórico incompleto/divergente.
- Confirmar recuperação sem duplicação e sem marcação indevida de SIM.
- Comparar as duas ofertas pelo ID; selecionar manualmente e conferir os cálculos.
- Testar falha Graph, ausência de ofertas, unidade incompatível e preço inválido.
- Desativar a cópia no rollback, tratar execuções pendentes e restaurar somente os
  artefatos/configuração isolados. Não excluir evidências nem alterar produção.

## Arquivos desta execução

Novos arquivos:

- `src/server/sharepoint/sharepoint-price-comparison-repository.ts`
- `src/server/sharepoint/sharepoint-price-comparison-repository.test.ts`
- `src/server/data-source/price-comparison-factory.ts`
- `src/app/api/price-comparison-sharepoint.test.ts`
- `scripts/prepare-homologation.mjs`
- `scripts/power-automate-expression-check.mjs`
- `scripts/prepare-homologation.test.ts`
- `docs/homologacao/lists.templates.json`
- `docs/homologacao/flow.definition.candidate.json`
- `docs/homologacao/fixtures.synthetic.json`
- `docs/homologacao/manifest.json`
- `docs/homologacao/operator.homolog.env.example`
- `docs/ETAPAS-DEF.md`

Arquivos modificados nesta execução (além do trabalho anterior da Etapa C):

- `README.md`
- `src/app/api/comparacao-precos/route.ts`
- `src/app/api/routes.test.ts`
- `src/app/comparacao-precos/page.tsx`
- `src/app/page.tsx`
- `src/components/price-comparison-workspace.tsx`
- `src/repositories/bff/bff-price-comparison-repository.ts`
- `src/server/sharepoint/sharepoint-types.ts`
- `src/server/sharepoint/sharepoint-operator-repository.ts`
- `src/server/sharepoint/complete-decision.test.ts`

## Verificação executada

286 testes passaram em 22 arquivos: SharePoint, auditoria, identidade/autorização,
configuração, API, domínio, seleção/cálculos e artefatos de homologação. TypeScript
sem emissão e ESLint dos arquivos desta execução passaram; diff sem erros de espaço.
O gerador foi executado somente para produzir os JSON locais. Nenhum teste live,
build/deploy, importação de fluxo ou provisionamento externo foi executado.

Pendências para MVP: resolução verificável de Pessoa; colunas/Redis autorizados;
homologação isolada e aprovação de implantação; validação de motor e publicação
autorizada do fluxo; reconciliação separada dos dados antigos; política de validade
de preços; definição futura de persistência/pedido da cesta, caso exigida.
