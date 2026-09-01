# Camada n8n

## Mapa funcional atual

`arquivo PDF -> orquestrador -> leitura/IA -> Orcamentos -> Itens_Importados -> normalizacao/associacao -> Tributos_Itens_Orcamentos`

- `workflow-orquestrador-v0.json`: recebe o PDF por webhook, normaliza metadados do SharePoint e chama o workflow de orcamentos. Aceita `x-drive-file-id` como identidade fisica preferencial e mantem os identificadores legados como fallback.
- `workflow-orcamentos-v0.json`: possui um ramo acionado pelo orquestrador (consulta da pasta, filtro, download, extracao, IA e UPSERT) e um ramo manual mais recente para UPSERT de payloads preparados. Persiste em `Orcamentos` e prepara a chamada de itens/tributos.
- `workflow-itens-tributos-v0.json`: valida o orcamento pai, faz UPSERT de `Itens_Importados` e `Tributos_Itens_Orcamentos` e chama a associacao de materiais no ramo mais recente. O ramo executado como subworkflow e o ramo sufixado foram alinhados nos contratos de persistencia.
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

- POST de item inicia `Status_Revisao` e `Enviado_Historico`; PATCH automatico nao altera esses campos, `Material_Aprovado` ou `Observacao_Item`.
- `Observacao_Item` de entrada e gravada na criacao e preservada em reprocessamentos.
- Campos opcionais vazios nao entram em PATCH.
- Lookups de item, tributo e material consultam mais de um resultado e bloqueiam colisao, em vez de escolher silenciosamente o primeiro.
- Tributos novos possuem caminho POST no ramo ativo; PATCH nao reinicia `Status_Revisao`.
- Associacao automatica so retorna `EXATO` para um unico material com status `ATIVO`; caso contrario retorna `SEM_ASSOCIACAO` com motivo tecnico.

## Validacao local

Executar a partir da raiz:

```powershell
node scripts/n8n/validate-workflows.mjs
```

O validador verifica JSON, nomes duplicados, origens/destinos das conexoes, referencias `$('<node>')`, sintaxe dos Code nodes e indicios de secrets em bodies.

## Pendencias externas

- Confirmar no n8n real os IDs dos subworkflows. O orquestrador ainda referencia um workflow pelo nome historico `Automacao de Orcamentos - Testando conexao ao SharePoint`.
- Confirmar os valores exatos das colunas Choice (`Status_Revisao`, `Enviado_Historico`, `Status_Processamento` e `Status`), pois snapshots de schema nao incluem todas as opcoes.
- Confirmar se o emissor do webhook envia `x-drive-file-id`; enquanto nao enviar, o fallback legado permanece ativo.
- Completar no SharePoint a modelagem semantica das colunas genericas `field_1...field_15` de fornecedores/homologacao antes de automatizar cotacao e historico.
- Decidir onde persistir auditoria detalhada de associacao (`EXATO`, `SUGERIDO`, `APROVADO`, `REJEITADO` e motivo). O schema atual de `Itens_Importados` so oferece `Status_Revisao`, `Material_Sugerido` e `Material_Aprovado`.
- Testar importacao/exportacao em uma instancia n8n de laboratorio e executar com mocks. Nenhuma integracao real foi chamada nesta alteracao.
