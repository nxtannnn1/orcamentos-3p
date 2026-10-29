# Historico_Precos

Histórico de preços e rastreabilidade das decisões aprovadas.

## Fonte e cobertura

[Schema atual](schema.json): 111 colunas retornadas pelo Microsoft Graph em 2026-10-29T17:11:02.297Z, com paginação concluída para esta lista. Fonte privada preservada em exports-local/2026-10-29T17-10-58-966Z. Nenhuma nova consulta corporativa foi feita nesta organização.

Identificadores de colunas foram removidos; IDs de Lookup foram substituídos por referências lógicas confirmadas ou placeholders explícitos. Descrição, flags, opções por tipo, Choices e defaults retornados foram preservados. Ausência de propriedade significa desconhecido, não false/vazio. O JSON mantém nomes de propriedades Graph para não inventar TypeAsString ou FromBaseType REST.

## Campos de consulta e integração

Tabela derivada do schema: colunas visíveis e editáveis. Ela identifica candidatas à consulta pelas integrações, não certifica que cada workflow usa todas elas. Demais campos de sistema/ocultos/somente leitura estão no JSON.

| Nome interno | Exibição | Tipo/faceta Graph | Required | Indexed | Unique | MaxLength |
|---|---|---|---|---|---|---|
| "Title" | "Título" | "text" | false | false | false | 255 |
| "Material_Oficial" | "Material_Oficial" | "lookup" | false | false | false | "não informado" |
| "Fornecedor" | "Fornecedor" | "text" | false | false | false | 255 |
| "Data_Orcamento" | "Data_Orcamento" | "dateTime" | false | false | false | "não informado" |
| "Codigo_Orcamento" | "Codigo_Orcamento" | "text" | false | false | false | 255 |
| "Numero_Item" | "Numero_Item" | "number" | false | false | false | "não informado" |
| "Aprovador" | "Aprovador" | "personOrGroup" | false | false | false | "não informado" |
| "Preco_Unitario" | "Preco_Unitario" | "currency" | false | false | false | "não informado" |
| "Preco_Total" | "Preco_Total" | "currency" | false | false | false | "não informado" |
| "Descricao_Original" | "Descricao_Original" | "text" | false | false | false | "não informado" |
| "Quantidade" | "Quantidade" | "number" | false | false | false | "não informado" |
| "Data_Aprovacao" | "Data_Aprovacao" | "dateTime" | false | false | false | "não informado" |
| "Chave_Historico" | "Chave_Historico" | "text" | false | true | true | 255 |
| "Unidade" | "Unidade" | "text" | false | false | false | 255 |
| "DriveFileId" | "DriveFileId" | "text" | false | false | false | 255 |
| "Codigo_Material_Snapshot" | "Codigo_Material_Snapshot" | "text" | false | false | false | 255 |
| "Codigo_Neoenergia_Snapshot" | "Codigo_Neoenergia_Snapshot" | "text" | false | false | false | 255 |
| "Codigo_Orcamento_Snapshot" | "Codigo_Orcamento_Snapshot" | "text" | false | false | false | 255 |
| "Orcamento_Origem" | "Orcamento_Origem" | "lookup" | false | false | false | "não informado" |
| "Item_Origem" | "Item_Origem" | "lookup" | false | false | false | "não informado" |
| "ID_Item_Importado" | "ID_Item_Importado" | "number" | false | true | true | "não informado" |
| "Revisado_Por_Oid" | "Revisado_Por_Oid" | "text" | false | false | false | 255 |
| "Decisao_Id" | "Decisao_Id" | "text" | false | false | false | 255 |
| "Correcao_Operacao_Id" | "Correcao_Operacao_Id" | "text" | false | false | false | 255 |
| "Extracao_Original_Hash" | "Extracao_Original_Hash" | "text" | false | false | false | 255 |
| "AprovadoPor" | "AprovadoPor" | "text" | false | false | false | 255 |
| "EmailAprovador" | "EmailAprovador" | "text" | false | false | false | 255 |
| "ContentType" | "Tipo de Conteúdo" | "não informado" | false | false | false | "não informado" |
| "Attachments" | "Anexos" | "não informado" | false | false | false | "não informado" |

## Choices, Lookups e restrições

- **Material_Oficial**: {"allowMultipleValues":false,"allowUnlimitedLength":false,"columnName":"Title","listId":"list:Materiais_Oficiais"}
- **Orcamento_Origem**: {"allowMultipleValues":false,"allowUnlimitedLength":false,"columnName":"Codigo_Orcamento","listId":"list:Orcamentos"}
- **Item_Origem**: {"allowMultipleValues":false,"allowUnlimitedLength":false,"columnName":"Codigo_Item","listId":"list:Itens_Importados"}

As propriedades choice.displayAs e allowTextEntry são preservadas literalmente; a multiplicidade Choice/MultiChoice não é inferida. Lookup.allowMultipleValues informa a multiplicidade quando retornada. Destinos UNRESOLVED_LIST_PLACEHOLDER permanecem pendentes. Defaults e opções de Number/Currency/DateTime/Pessoa ou Grupo estão no JSON, sem valores de registros.

Chave_Historico exige unicidade na referência atual, divergindo do legado. Campos de decisão e rastreabilidade adicionais estão no schema; seus valores não foram extraídos.

## Atualização

Preservar o original privado e o snapshot anterior. Após autorização de autenticação/consulta, obter metadados pelo mecanismo existente auditado, validar paginação, identidade e completude. Comparar todas as propriedades antes de atualizar schema.json; remover IDs de infraestrutura e resolver Lookups somente por correspondência comprovada. Revisar todos os literais, inclusive descrições/defaults. Atualizar esta tabela a partir do mesmo JSON, sem editar definições manualmente.

Da raiz do repositório: `node system/infrastructure/microsoft-lists/scripts/validate.mjs` e `node --test --test-isolation=none system/infrastructure/microsoft-lists/scripts/policy.test.mjs`. Revisar diff e guarda de caminhos. Não executar fluxos nem publicar mudanças automaticamente.

Os arquivos legados originais continuam em seus caminhos anteriores; não misturar propriedades antigas com metadados atuais sem evidência. [Índice central](../../README.md).
