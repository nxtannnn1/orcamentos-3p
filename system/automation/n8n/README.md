# Camada n8n

## Mapa funcional atual

`arquivo PDF -> orquestrador -> leitura/IA -> Orcamentos -> Itens_Importados -> normalizacao/associacao -> Tributos_Itens_Orcamentos`

- `workflow-orquestrador-v0.json`: recebe o PDF por webhook, normaliza metadados do SharePoint e chama o workflow de orcamentos. Aceita `x-drive-file-id` como identidade fisica preferencial e mantem os identificadores legados como fallback.
- `workflow-orcamentos-v0.json`: possui um ramo acionado pelo orquestrador (consulta da pasta, filtro, download, extracao, IA e UPSERT) e um ramo manual mais recente para UPSERT de payloads preparados. Persiste em `Orcamentos` e prepara a chamada de itens/tributos.
- `workflow-itens-tributos-v0.json`: valida o orcamento pai, cria itens novos e so atualiza itens existentes quando a leitura do SharePoint comprova elegibilidade. Persiste tributos e chama a associacao de materiais no ramo mais recente. As duas rotas de itens aplicam a mesma politica.
- `workflow-normalizar-associar-materiais-v0.json`: normaliza a descricao e sugere um unico material oficial ativo por `Nome_Normalizado`. Colisoes nao sao promovidas a associacao. O bloco antigo de criacao automatica de candidatos permanece desabilitado.
- `workflow-carga-catalogo-neoenergia-r01.json`: converte a planilha/catalogo Neoenergia e faz carga por `Codigo_Neoenergia`. `Codigo_SAP_NE`, `Codigo_SAP_EKT` e `Codigo_SAP_NDB` sao campos do arquivo de entrada; no SharePoint tornam-se `Codigo_Neoenergia`, `Codigo_Elektro` e `Codigo_Brasilia`.
- `workflow-auditoria-normalizacao-materiais-oficiais-read-only.json`: consulta somente leitura para auditar a normalizacao do catalogo oficial.

## Listas e relacoes

- `Arquivos_Processados`: identidade por `DriveFileId`, nome, status, data e erro.
- `Orcamentos`: cabecalho do documento; `DriveFileId` e a chave fisica preferencial.
- `Itens_Importados`: itens do orcamento. `Codigo_Item` e unico. `Material_Sugerido` e texto; `Material_Aprovado` e lookup e pertence ao processo humano.
- `Tributos_Itens_Orcamentos`: tributos por item, com `Codigo_Tributo_Item` como chave logica.
- `Materiais_Oficiais`: catalogo unico, incluindo `Nome_Normalizado` e `Codigo_Neoenergia`.
- `Materiais_Fornecedores_Homologados`: tabela de relacao entre material e fornecedor. E a estrutura correta para `1 material -> N fornecedores`; nao se deve duplicar `Materiais_Oficiais`.
- `Fornecedores` e `Historico_Precos`: suportam homologacao e evolucao futura de comparacao/historico, mas ainda nao estao ligados aos workflows principais.

## Regras de integridade aplicadas

- POST de item inicia `Status_Revisao=PENDENTE` e `Enviado_Historico=NAO`. `Codigo_Item` unico no SharePoint e pre-requisito para evitar dois POSTs concorrentes; conflito de criacao interrompe o fluxo, sem retry cego.
- Antes de PATCH, o lookup por `Codigo_Item` exige resposta completa, correspondencia exata unica, ID, ETag, `Status_Revisao=PENDENTE`, `Enviado_Historico=NAO` e coluna `Correcao_Operacao_Id` presente e vazia. Evidencia nao vazia em `Correcao_Humana_JSON` ou `Extracao_Original_JSON` tambem bloqueia. Ausencia de estado/ETag/coluna, estado desconhecido ou colisao interrompem o fluxo; nao viram POST.
- O PATCH automatico usa `If-Match` com o ETag lido. Conflitos HTTP 409/412, falha de rede ou resposta Graph incompleta interrompem o fluxo, sem prosseguir como sucesso e sem retry automatico. Em caso de resposta perdida apos escrita, uma nova execucao deve reler o item; se todos os campos ja coincidem, segue sem novo PATCH.
- PATCH automatico nao altera `Status_Revisao`, `Enviado_Historico`, `Material_Aprovado`, `Observacao_Item` nem campos de auditoria. A guarda deve permanecer no workflow, nao so na interface do operador.
- `Observacao_Item` de entrada e gravada na criacao e preservada em reprocessamentos.
- Campos opcionais vazios nao entram em PATCH.
- Lookups de item, tributo e material consultam mais de um resultado e bloqueiam colisao, em vez de escolher silenciosamente o primeiro.
- Tributos novos possuem caminho POST no ramo ativo; PATCH nao reinicia `Status_Revisao`.
- Associacao retorna `EXATO` para correspondencia unica ativa, `SUGERIDO` para candidato tecnico unico, `AMBIGUO` para empate elegivel e `SEM_CANDIDATO` quando nenhum candidato compativel existe.

## Validacao local

Executar a partir da raiz:

```powershell
node scripts/n8n/validate-workflows.mjs
```

O validador verifica JSON, nomes duplicados, conexoes, referencias `$('<node>')`, sintaxe dos Code nodes, indicios de secrets em bodies e a paridade da politica de protecao com `scripts/n8n/item-write-policy.mjs`. Executar tambem `node --test scripts/n8n/workflow-integrity.test.mjs` para casos de estado, ETag, reexecucao, colisao e resposta incompleta.

## Pendencias externas

- Confirmar no n8n real os IDs dos subworkflows. O orquestrador ainda referencia um workflow pelo nome historico `Automacao de Orcamentos - Testando conexao ao SharePoint`.
- Confirmar os valores exatos das colunas Choice (`Status_Revisao`, `Enviado_Historico`, `Status_Processamento` e `Status`), pois snapshots de schema nao incluem todas as opcoes.
- Confirmar que o GET real de `Itens_Importados` devolve ETag e `Correcao_Operacao_Id` explicitamente nos itens ainda nao corrigidos. Se o Graph omitir a coluna vazia, o PATCH automatico fica bloqueado por seguranca; nao retirar a guarda para contornar isso. Confirmar que `Codigo_Item` permanece unico. A metadata consultada em 2026-10-16 indica `Data_Decisao` como data e hora, sem alteracao por este workflow.
- Confirmar se o emissor do webhook envia `x-drive-file-id`; enquanto nao enviar, o fallback legado permanece ativo.
- Completar no SharePoint a modelagem semantica das colunas genericas `field_1...field_15` de fornecedores/homologacao antes de automatizar cotacao e historico.
- Decidir onde persistir auditoria detalhada de associacao (`EXATO`, `SUGERIDO`, `APROVADO`, `REJEITADO` e motivo). O schema atual de `Itens_Importados` so oferece `Status_Revisao`, `Material_Sugerido` e `Material_Aprovado`.
- Comparar o JSON versionado com o workflow publicado antes de importar: nodes, conexoes, credenciais e configuracao de erros podem divergir. Fazer copia/exportacao recuperavel, importar em instancia de laboratorio, testar com mocks e depois homologar em ambiente autorizado os casos de POST, PATCH elegivel, 409/412, correcao humana e resposta perdida. Somente apos aprovacao publicar; nenhuma escrita Graph ou publicacao n8n foi feita nesta alteracao.
