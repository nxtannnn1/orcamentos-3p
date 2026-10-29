# Catalogo_Neoenergiav2

Catálogo de referência Neoenergia para associação ao cadastro mestre.

## Fonte e cobertura

[Schema atual](schema.json): 102 colunas retornadas pelo Microsoft Graph em 2026-10-29T17:11:02.426Z, com paginação concluída para esta lista. Fonte privada preservada em exports-local/2026-10-29T17-10-58-966Z. Nenhuma nova consulta corporativa foi feita nesta organização.

Identificadores de colunas foram removidos; IDs de Lookup foram substituídos por referências lógicas confirmadas ou placeholders explícitos. Descrição, flags, opções por tipo, Choices e defaults retornados foram preservados. Ausência de propriedade significa desconhecido, não false/vazio. O JSON mantém nomes de propriedades Graph para não inventar TypeAsString ou FromBaseType REST.

## Campos de consulta e integração

Tabela derivada do schema: colunas visíveis e editáveis. Ela identifica candidatas à consulta pelas integrações, não certifica que cada workflow usa todas elas. Demais campos de sistema/ocultos/somente leitura estão no JSON.

| Nome interno | Exibição | Tipo/faceta Graph | Required | Indexed | Unique | MaxLength |
|---|---|---|---|---|---|---|
| "Title" | "Título" | "text" | false | false | false | 255 |
| "Codigo_Nordeste" | "Codigo_Nordeste" | "text" | false | false | false | 255 |
| "Codigo_Elektro" | "Codigo_Elektro" | "text" | false | false | false | 255 |
| "Codigo_Brasilia" | "Codigo_Brasilia" | "text" | false | false | false | 255 |
| "Familia" | "Familia" | "text" | false | false | false | 255 |
| "SubFamilia" | "SubFamilia" | "text" | false | false | false | 255 |
| "Descricao" | "Descricao" | "text" | false | false | false | 255 |
| "Especificacao_Tecnica" | "Especificacao_Tecnica" | "text" | false | false | false | 255 |
| "Fornecedor" | "Fornecedor" | "text" | false | false | false | 255 |
| "Status_Homologacao" | "Status_Homologacao" | "text" | false | false | false | 255 |
| "Observacao" | "Observacao" | "text" | false | false | false | "não informado" |
| "Nome_Normalizado" | "Nome_Normalizado" | "text" | false | false | false | 255 |
| "Fonte" | "Fonte" | "text" | false | false | false | 255 |
| "Numero_Patrimonio_Nordeste" | "Numero_Patrimonio_Nordeste" | "text" | false | false | false | 255 |
| "Numero_Patrimonio_Elektro" | "Numero_Patrimonio_Elektro" | "text" | false | false | false | 255 |
| "Numero_Patrimonio_Brasilia" | "Numero_Patrimonio_Brasilia" | "text" | false | false | false | 255 |
| "Chave_Importacao" | "Chave_Importacao" | "text" | false | true | true | 255 |
| "Material_Oficial" | "Material_Oficial" | "lookup" | false | false | false | "não informado" |
| "ContentType" | "Tipo de Conteúdo" | "não informado" | false | false | false | "não informado" |
| "Attachments" | "Anexos" | "não informado" | false | false | false | "não informado" |

## Choices, Lookups e restrições

- **Material_Oficial**: {"allowMultipleValues":false,"allowUnlimitedLength":false,"columnName":"ID","listId":"list:Materiais_Oficiais"}

As propriedades choice.displayAs e allowTextEntry são preservadas literalmente; a multiplicidade Choice/MultiChoice não é inferida. Lookup.allowMultipleValues informa a multiplicidade quando retornada. Destinos UNRESOLVED_LIST_PLACEHOLDER permanecem pendentes. Defaults e opções de Number/Currency/DateTime/Pessoa ou Grupo estão no JSON, sem valores de registros.

Campos prioritários da associação: Fonte, Familia, SubFamilia, Chave_Importacao, códigos regionais e Material_Oficial. Familia/Fonte/Status_Homologacao são texto. Chave_Importacao tem maxLength 255, indexed e enforceUniqueValues true. Material_Oficial aponta a Materiais_Oficiais.ID. Respeitar SubFamilia no catálogo e Subfamilia no mestre.

## Atualização

Preservar o original privado e o snapshot anterior. Após autorização de autenticação/consulta, obter metadados pelo mecanismo existente auditado, validar paginação, identidade e completude. Comparar todas as propriedades antes de atualizar schema.json; remover IDs de infraestrutura e resolver Lookups somente por correspondência comprovada. Revisar todos os literais, inclusive descrições/defaults. Atualizar esta tabela a partir do mesmo JSON, sem editar definições manualmente.

Da raiz do repositório: `node system/infrastructure/microsoft-lists/scripts/validate.mjs` e `node --test --test-isolation=none system/infrastructure/microsoft-lists/scripts/policy.test.mjs`. Revisar diff e guarda de caminhos. Não executar fluxos nem publicar mudanças automaticamente.

Os arquivos legados originais continuam em seus caminhos anteriores; não misturar propriedades antigas com metadados atuais sem evidência. [Índice central](../../README.md).
