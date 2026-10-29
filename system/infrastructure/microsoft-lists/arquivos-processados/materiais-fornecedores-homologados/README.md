# Materiais_Fornecedores_Homologados

Relação de materiais com fornecedores homologados.

## Fonte e cobertura

[Schema atual](schema.json): 102 colunas retornadas pelo Microsoft Graph em 2026-10-29T17:11:02.159Z, com paginação concluída para esta lista. Fonte privada preservada em exports-local/2026-10-29T17-10-58-966Z. Nenhuma nova consulta corporativa foi feita nesta organização.

Identificadores de colunas foram removidos; IDs de Lookup foram substituídos por referências lógicas confirmadas ou placeholders explícitos. Descrição, flags, opções por tipo, Choices e defaults retornados foram preservados. Ausência de propriedade significa desconhecido, não false/vazio. O JSON mantém nomes de propriedades Graph para não inventar TypeAsString ou FromBaseType REST.

## Campos de consulta e integração

Tabela derivada do schema: colunas visíveis e editáveis. Ela identifica candidatas à consulta pelas integrações, não certifica que cada workflow usa todas elas. Demais campos de sistema/ocultos/somente leitura estão no JSON.

| Nome interno | Exibição | Tipo/faceta Graph | Required | Indexed | Unique | MaxLength |
|---|---|---|---|---|---|---|
| "Title" | "Title" | "text" | false | false | false | 255 |
| "field_1" | "Codigo_Relacao" | "text" | false | true | true | 255 |
| "field_2" | "Codigo_Material_3P" | "text" | false | false | false | 255 |
| "field_3" | "Material_Oficial_ID" | "number" | false | false | false | "não informado" |
| "field_4" | "Codigo_Neoenergia" | "text" | false | false | false | 255 |
| "field_5" | "Fornecedor" | "text" | false | false | false | 255 |
| "field_6" | "CNPJ" | "text" | false | false | false | 255 |
| "field_7" | "Referencia_Fornecedor" | "text" | false | false | false | 255 |
| "field_8" | "Desenho_Fornecedor" | "text" | false | false | false | 255 |
| "field_9" | "Data_Homologacao" | "dateTime" | false | false | false | "não informado" |
| "field_10" | "Data_Vencimento_Homologacao" | "dateTime" | false | false | false | "não informado" |
| "field_11" | "Status_Homologacao" | "choice" | false | false | false | "não informado" |
| "field_12" | "Origem_Catalogo" | "choice" | false | false | false | "não informado" |
| "field_13" | "Modo_Fornecimento" | "text" | false | false | false | 255 |
| "field_14" | "Referencia_Documentacao" | "text" | false | false | false | 255 |
| "field_15" | "Observacao" | "text" | false | false | false | "não informado" |
| "Material_Oficial" | "Material_Oficial" | "lookup" | false | true | false | "não informado" |
| "Fornecedor_Ref" | "Fornecedor_Ref" | "lookup" | false | true | false | "não informado" |
| "ContentType" | "Tipo de Conteúdo" | "não informado" | false | false | false | "não informado" |
| "Attachments" | "Anexos" | "não informado" | false | false | false | "não informado" |

## Choices, Lookups e restrições

- **field_11**: {"allowTextEntry":false,"choices":["ATIVA","VENCIDA","SUSPENSA","PENDENTE_REVISAO"],"displayAs":"dropDownMenu"}
- **field_12**: {"allowTextEntry":false,"choices":["REDE_NEOENERGIA","SUBESTACAO_NEOENERGIA","AMBOS","3P"],"displayAs":"dropDownMenu"}
- **Material_Oficial**: {"allowMultipleValues":false,"allowUnlimitedLength":false,"columnName":"Material","listId":"list:Materiais_Oficiais"}
- **Fornecedor_Ref**: {"allowMultipleValues":false,"allowUnlimitedLength":false,"columnName":"field_1","listId":"list:Fornecedores"}

As propriedades choice.displayAs e allowTextEntry são preservadas literalmente; a multiplicidade Choice/MultiChoice não é inferida. Lookup.allowMultipleValues informa a multiplicidade quando retornada. Destinos UNRESOLVED_LIST_PLACEHOLDER permanecem pendentes. Defaults e opções de Number/Currency/DateTime/Pessoa ou Grupo estão no JSON, sem valores de registros.

## Atualização

Preservar o original privado e o snapshot anterior. Após autorização de autenticação/consulta, obter metadados pelo mecanismo existente auditado, validar paginação, identidade e completude. Comparar todas as propriedades antes de atualizar schema.json; remover IDs de infraestrutura e resolver Lookups somente por correspondência comprovada. Revisar todos os literais, inclusive descrições/defaults. Atualizar esta tabela a partir do mesmo JSON, sem editar definições manualmente.

Da raiz do repositório: `node system/infrastructure/microsoft-lists/scripts/validate.mjs` e `node --test --test-isolation=none system/infrastructure/microsoft-lists/scripts/policy.test.mjs`. Revisar diff e guarda de caminhos. Não executar fluxos nem publicar mudanças automaticamente.

Os arquivos legados originais continuam em seus caminhos anteriores; não misturar propriedades antigas com metadados atuais sem evidência. [Índice central](../../README.md).
