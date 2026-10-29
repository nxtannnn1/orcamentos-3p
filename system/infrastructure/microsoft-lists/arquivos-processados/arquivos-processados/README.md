# Arquivos_Processados

Controle técnico do processamento dos arquivos de origem.

## Fonte e cobertura

[Schema atual](schema.json): 91 colunas retornadas pelo Microsoft Graph em 2026-10-29T17:11:01.096Z, com paginação concluída para esta lista. Fonte privada preservada em exports-local/2026-10-29T17-10-58-966Z. Nenhuma nova consulta corporativa foi feita nesta organização.

Identificadores de colunas foram removidos; IDs de Lookup foram substituídos por referências lógicas confirmadas ou placeholders explícitos. Descrição, flags, opções por tipo, Choices e defaults retornados foram preservados. Ausência de propriedade significa desconhecido, não false/vazio. O JSON mantém nomes de propriedades Graph para não inventar TypeAsString ou FromBaseType REST.

## Campos de consulta e integração

Tabela derivada do schema: colunas visíveis e editáveis. Ela identifica candidatas à consulta pelas integrações, não certifica que cada workflow usa todas elas. Demais campos de sistema/ocultos/somente leitura estão no JSON.

| Nome interno | Exibição | Tipo/faceta Graph | Required | Indexed | Unique | MaxLength |
|---|---|---|---|---|---|---|
| "Title" | "Título" | "text" | false | false | false | 255 |
| "Nome_Arquivo" | "Nome_Arquivo" | "text" | false | false | false | 255 |
| "Status_Processamento" | "Status_Processamento" | "choice" | false | false | false | "não informado" |
| "Codigo_Orcamento" | "Codigo_Orcamento" | "text" | false | false | false | 255 |
| "Data_Processamento" | "Data_Processamento" | "dateTime" | false | false | false | "não informado" |
| "Erro" | "Erro" | "text" | false | false | false | "não informado" |
| "DriveFileId" | "DriveFileId" | "text" | false | true | true | 255 |
| "ContentType" | "Tipo de Conteúdo" | "não informado" | false | false | false | "não informado" |
| "Attachments" | "Anexos" | "não informado" | false | false | false | "não informado" |

## Choices, Lookups e restrições

- **Status_Processamento**: {"allowTextEntry":false,"choices":["DUPLICADO","PROCESSADO","PENDENTE_FORNECEDOR","ERRO_PROCESSAMENTO"],"displayAs":"dropDownMenu"}

As propriedades choice.displayAs e allowTextEntry são preservadas literalmente; a multiplicidade Choice/MultiChoice não é inferida. Lookup.allowMultipleValues informa a multiplicidade quando retornada. Destinos UNRESOLVED_LIST_PLACEHOLDER permanecem pendentes. Defaults e opções de Number/Currency/DateTime/Pessoa ou Grupo estão no JSON, sem valores de registros.

## Atualização

Preservar o original privado e o snapshot anterior. Após autorização de autenticação/consulta, obter metadados pelo mecanismo existente auditado, validar paginação, identidade e completude. Comparar todas as propriedades antes de atualizar schema.json; remover IDs de infraestrutura e resolver Lookups somente por correspondência comprovada. Revisar todos os literais, inclusive descrições/defaults. Atualizar esta tabela a partir do mesmo JSON, sem editar definições manualmente.

Da raiz do repositório: `node system/infrastructure/microsoft-lists/scripts/validate.mjs` e `node --test --test-isolation=none system/infrastructure/microsoft-lists/scripts/policy.test.mjs`. Revisar diff e guarda de caminhos. Não executar fluxos nem publicar mudanças automaticamente.

Os arquivos legados originais continuam em seus caminhos anteriores; não misturar propriedades antigas com metadados atuais sem evidência. [Índice central](../../README.md).
