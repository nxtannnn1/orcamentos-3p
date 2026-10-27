# Ponte de materiais — revisão local (2026-10-27)

## Resultado e limites

Branch inicial `infra-lab`, árvore limpa antes das alterações. Nenhum commit, publicação,
migração, acesso corporativo ou alteração de configuração sensível nesta execução.
O export foi convertido em uma **ponte de avaliação e proposta sem escrita**. Não é uma
ponte operacional de cadastro/associação homologada. A criação, atualização de códigos
e gravação de lookup foram retiradas dos caminhos executáveis, pois os contratos de
aprovação e lookup não estão integralmente disponíveis no projeto. Não há novo sistema
de aprovação: a saída deve ser revisada pelo processo humano já existente.

## A. Diagnóstico comprovado no export anterior

| Área | Evidência e causa |
|---|---|
| Normalização | `removerDecimaisZero` convertia `1.000` em `1`; remoção de pontuação descartava sinais de tolerância e referências. |
| Entrada | PREP lia códigos e especificações minúsculos; importadores produzem `Codigo_Nordeste`, `Especificacao_Tecnica`, `Fonte` etc. |
| Aprovação | POST fixava `ATIVO`, `MATERIAL`, `Revisao_Obrigatoria: false`. |
| Identidade | GET expandia somente três códigos. RESOLVE comparava códigos, sem descrição, especificação ou estado humano. |
| Consulta | `$top=2` sem inspeção de `@odata.nextLink`; IF dependia de `$json.value.length`. Não se comprovou que erro HTTP sempre virava ausência: o HTTP Request original normalmente interrompe erros. Faltava validação explícita do contrato. |
| Concorrência | PATCH de códigos e lookup sem ETag, sem releitura da origem, sem proteção de associação existente. |
| Classificação | Famílias reconhecidas (disjuntores, isoladores, eletrodutos etc.) eram mapeadas para `OUTROS`. |
| Teste manual | Set manual continha `XXXX`, inválido como JSON. |
| Schema | Snapshot oficial informa tipos e unicidade, mas não valores de Choice; apenas `Codigo_Neoenergia` é único/indexado. Não há snapshot do lookup do catálogo. |
| Chamadores | Nenhum Execute Workflow nos importadores Rede R01/R02 e Subestações inspecionados; preparação não produz ID persistido da origem. |

Os arquivos locais não comprovam o conteúdo publicado no n8n.

## B. Correções e arquivos

- `material-bridge.mjs`: política pura, sem rede; aliases com conflitos explícitos;
  preservação integral em `entrada_original`; códigos com zeros; normalização separada;
  classificação interna sugerida (não valores de Choice autorizados); decisão e proposta de lookup.
- `build-material-bridge.mjs`: gerador determinístico do export, sem dependências externas.
- `material-bridge.test.mjs`: fixtures sintéticas inline e regressões sobre funções e código embutido.
- `workflow-ponte-catalogo-materiais-oficiais-r01.json`: trigger/PREP/IF preservados em função;
  GET expande campos técnicos; RESOLVE classifica resultado; novo GET da origem e PREP
  da proposta; saída uniforme. POST, PATCHs, restauração parcial e teste manual inválido
  substituídos pelo caminho sem escrita. Export inativo, sem IDs de instância ou credenciais.

Não editar JS diretamente no export: alterar a política/gerador e regenerar.

## Contratos e decisões

Entrada aceita registro plano legado, registro preparado pelo importador ou listItem Graph
`{id, fields}`. `catalogo_item_id` deve identificar o item efetivamente persistido;
não inferir ID pelo índice da planilha. Aliases vazios não vencem valores preenchidos.
Fornecedor, CNPJ, datas, referências, descrição completa e campos desconhecidos ficam
intactos em `entrada_original`; não compõem aprovação comercial nem identidade técnica.
`Fonte` é preservada sem inferir Coelba.

Todos os resultados têm `escrita_permitida: false` e revisão humana obrigatória.
`material_oficial_id` só é preenchido para uma proposta com identidade confirmada:
um registro, pelo menos um código igual, nenhum código conflitante, descrição e
especificação compatíveis, status `ATIVO`, tipo `MATERIAL`, revisão explicitamente falsa.
Esses literais já existiam no export e são apenas guardas de leitura; não confirmam
os choices reais. Campos humanos nunca são enviados em payload de atualização.

Chave/nome localizam candidatos, mas não comprovam equivalência. Chave antiga com
código e técnica confirmados pode gerar proposta sem migrar a chave. Nome igual sem
código comum, códigos conflitantes, várias linhas, especificações divergentes ou
dados insuficientes exigem revisão. Códigos novos adicionais não são gravados.
Um material com múltiplos códigos pode ser reconhecido pelo código comum, sem juntar
registros distintos. Fornecedores distintos não criam materiais distintos.

A normalização preserva separadores, classes, sinais, referências e unidades.
`1.000 daN` permanece `1.000 DAN`, nunca `1 DAN`. `0,6/1 kV` mantém a vírgula;
equivalência entre unidades, separadores e abreviações não demonstrada não é presumida.
Descrição completa diferente da curta, atributos adicionais sem correspondência e
subfamília divergente levam à revisão conservadora.

## Consultas e integridade

Filtro OData escapa apóstrofos; parâmetros são enviados pelo HTTP Request. Busca inclui
códigos, nome e chave recebida. Expansão `fields` permite verificar técnica e estado.
Resposta deve conter status 200 e `body.value` válido. Qualquer erro, página incompleta,
ID inválido ou múltiplas linhas bloqueia a proposta. `$top=2` é um limite de decisão:
não se tenta escolher o primeiro registro nem consumir páginas incompletas como lista completa.

Erros HTTP 400/401/403/404/409/412/429/5xx retornam revisão. `neverError` permite
inspecionar status; não há retry automático desses status. Falhas de transporte têm
até três tentativas, com intervalo de 2 segundos e timeout de 30 segundos por tentativa;
após isso a execução para. Nova leitura após 429 deve respeitar Retry-After na homologação.
Não existe POST nem retry de escrita. Repetição não produz registros porque não há escrita;
isso **não demonstra idempotência de um futuro caminho de criação concorrente**.

Proposta de lookup requer ID positivo seguro, releitura da origem, ETag, mesmos códigos,
descrição, especificação e fonte, campo lookup presente e vazio. Lookup existente distinto
é preservado; igual resulta em `JA_ASSOCIADO`. A proposta inclui `if_match`, mas não é
executada: tipo/destino do lookup ainda precisa ser validado. ETag da origem não protege
mudança concorrente do material oficial; futura escrita exige revalidar os dois registros.

## C. Testes e reprodução

Resultado final: **69 executados, 69 aprovados, 0 reprovados** (55 da ponte e 14 de
integridade existente). Validador geral: **0 erros, 22 avisos** de campos/contratos não
encontrados nos schemas locais. `git diff --check` sem erros de whitespace; Git apenas
informa conversão futura LF/CRLF conforme configuração existente.

```powershell
node scripts/n8n/build-material-bridge.mjs --write
node --test scripts/n8n/material-bridge.test.mjs scripts/n8n/workflow-integrity.test.mjs
node scripts/n8n/validate-workflows.mjs
git diff --check
```

Cobertura: casos A–H; aliases vazios/conflitantes; três códigos e ausência de Nordeste;
descrição completa; códigos com zeros/apóstrofos; chaves antigas; estado humano;
IDs inválidos; páginas incompletas; 10 status HTTP; números/unidades/classes;
lookup já associado/divergente; ETag ausente; origem alterada; JS embutido e pairedItem;
contratos executados diretamente dos nós de preparação Rede R01/R02 e Subestações.
O runner inicialmente falhou em spawn por restrição do sandbox, sem executar testes;
a execução autorizada fora do sandbox foi usada para a evidência final.
Não houve execução do motor n8n: testes de funções/export não substituem essa etapa.

## D. Compatibilidade

Rede R01/R02: aceita saída do nó `12 - Rede - Preparar`, incluindo campos técnicos extras.
Esses importadores ainda precisam de chamada explícita pós-persistência que junte
campos originais e ID retornado/reconciliado. Não foram alterados nem executados.
Subestações: aceita contrato canônico produzido pelo preparador, sem assumir Rede Coelba.
O importador existente usa `items.slice(1500)` e contém nomes de colunas com problemas de
codificação; a ponte não recupera dados já perdidos na extração. Isso exige revisão separada.

Consumidores de `Materiais_Oficiais` não recebem alteração de schema nem registros.
Nomes normalizados antigos não foram migrados. O workflow `workflow-normalizar-associar-materiais-v0.json`
possui normalização numérica semelhante e heurísticas próprias; permanece fora desta correção
da ponte. Pode produzir sugestões inconsistentes, exigindo revisão separada antes da
homologação integrada. Homologação de fornecedores continua separada da equivalência técnica.

## E/F. Pendências e riscos residuais

- Confirmar choices de família/status/tipo/origem, destino e cardinalidade do lookup.
- Validar consultas em lista de homologação: filtros OR em colunas não indexadas podem
  falhar ou atingir limites. Falhas permanecem bloqueadas; não há fallback de criação.
  O Graph restringe filtragem de campos indexados a um por vez: considerar consultas
  independentes por campo, consolidação/deduplicação e índices após verificar schema real.
- Matching conservador aumenta revisão manual; não resolve equivalências por conversão
  de unidades ou sinônimos nem procura descrições antigas semanticamente equivalentes.
- Não há cadastro de candidato no SharePoint por falta de estado de pendência confirmado.
  Saída da execução não substitui uma fila durável de aprovação.
- Sem garantia de atomicidade entre duas listas; futura escrita precisa de controle de
  concorrência e recuperação após resposta perdida, além de aprovação humana.
- Sem confirmação da versão n8n, credenciais, permissões, published workflows ou volume real.

## G. Próximos passos de homologação

1. Revisar esta mudança e confirmar schemas sanitizados e regra humana de cadastro.
2. Importar uma cópia inativa em n8n isolado com mock Graph; manter produção intacta.
3. Executar fixtures, dois itens por lote, pairedItem, todos os erros HTTP, timeout e paginação;
   confirmar que nenhuma rota de escrita existe e que a saída chega ao chamador correto.
4. Validar filtros/índices e contratos dos importadores em ambiente de homologação autorizado.
5. Revisar equivalências e famílias com responsável técnico e corrigir consumidor legado.
6. Só após autorização específica, implementar/homologar escrita condicional do lookup e
   cadastro pendente conforme schema confirmado; testar concorrência, 412 e resposta perdida.
7. Comparar export aprovado com publicado antes de qualquer implantação separadamente autorizada.

Referências públicas consultadas (sem acesso ao tenant):
[Graph list items](https://learn.microsoft.com/en-us/graph/api/listitem-list?view=graph-rest-1.0),
[Graph update/If-Match](https://learn.microsoft.com/en-us/graph/api/listitem-update?view=graph-rest-1.0),
[n8n HTTP Request](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/).
