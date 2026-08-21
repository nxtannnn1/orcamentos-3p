# Microsoft Lists / SharePoint — Sistema 3P

Esta pasta contém a documentação e os snapshots de schema das listas utilizadas pelo Sistema de Orçamentos 3P.

## Estrutura

Cada lista ou biblioteca possui uma pasta própria contendo:

- `README.md` — identificação rápida e finalidade do componente;
- `<Lista>.schema.json` — snapshot do schema real no SharePoint, quando disponível.

## Componentes

| Componente | Tipo | Finalidade |
|---|---|---|
| Arquivos_Processados | List | Controle dos arquivos processados pelas automações |
| Orcamentos | List | Cabeçalho e dados gerais dos orçamentos |
| Itens_Importados | List | Itens extraídos dos orçamentos |
| Materiais_Oficiais | List | Cadastro mestre de materiais |
| Fornecedores | List | Cadastro mestre de fornecedores |
| Materiais_Fornecedores_Homologados | List | Relação entre materiais e fornecedores homologados |
| Historico_Precos | List | Histórico de preços dos materiais |
| Tributos_Itens_Orcamentos | List | Tributos associados aos itens dos orçamentos |
| Arquivos_Orcamentos | Document Library | Armazenamento dos arquivos de orçamento |

## Versionamento

Os arquivos `*.schema.json` representam o schema real existente no SharePoint.

Eles são gerados por Power Automate e versionados neste repositório Git.

Não criar arquivos `v1`, `v2`, `v3`.

As alterações devem ocorrer sobre o mesmo arquivo para que o histórico seja mantido pelo Git.

Exemplo:

`system/infrastructure/microsoft-lists/orcamentos/Orcamentos.schema.json`

## Regra de manutenção

Quando houver alteração estrutural em uma lista:

1. alterar a estrutura no ambiente autorizado;
2. executar o fluxo de exportação dos schemas;
3. atualizar o respectivo `*.schema.json`;
4. revisar a documentação funcional, quando necessário;
5. verificar o `git diff`;
6. realizar o commit.

## Importante

O schema JSON é a referência técnica do estado real da lista.

Os arquivos Markdown documentam a finalidade e as regras funcionais do Sistema 3P.

Alterações no schema podem impactar:

- n8n;
- Power Automate;
- Power Apps;
- integrações;
- consultas e relatórios.
