\# Lista SharePoint — Orcamentos



\## Identificação



\- \*\*Nome:\*\* Orcamentos

\- \*\*Sistema:\*\* Sistema 3P

\- \*\*Plataforma:\*\* Microsoft Lists / SharePoint

\- \*\*Site:\*\* example-site

\- \*\*Finalidade:\*\* armazenar os registros principais dos orçamentos processados pelo sistema.



\## Arquivos relacionados



\- `orcamentos.raw.json` — exportação bruta da estrutura da lista.

\- `orcamentos.schema.json` — definição limpa e relevante para o sistema.



\## Campos funcionais



| Campo | Tipo | Finalidade |

|---|---|---|

| Title | Texto | Identificação/título do orçamento |

| Fornecedor | Texto | Nome do fornecedor |

| Data\_Orcamento | Data/Hora | Data do orçamento |

| Valor\_Total | Moeda | Valor total |

| Codigo\_Orcamento | Texto | Código interno do orçamento |

| DriveFileId | Texto | Identificador do arquivo de origem |

| Numero\_Orcamento | Texto | Número informado no documento |

| Numero\_Orcamento\_Normalizado | Texto | Número normalizado para comparação |

| Razao\_Social | Texto | Razão social do fornecedor |

| CNPJ\_Fornecedor | Texto | CNPJ do fornecedor |

| Chave\_Fornecedor | Texto | Chave para identificação/deduplicação |

| Quantidade\_Itens | Número | Quantidade de itens |

| Fornecedor\_Identificado | Sim/Não | Indica se o fornecedor foi identificado |

| Validacao\_Orcamento | Opção | Resultado da validação |

| Status\_Processamento | Opção | Estado do processamento |

| Status\_Revisao | Opção | Estado da revisão humana |

| Data\_Importacao | Data/Hora | Data de entrada no sistema |

| Nome\_Arquivo | Texto | Nome do arquivo original |

| Observacao | Múltiplas linhas | Observações do processamento |

| Link\_Arquivo | Texto | Link para o arquivo |

| Reprocessar\_IA | Opção | Controle de reprocessamento pela IA |



\## Valores controlados



\### Validacao\_Orcamento



\- `DIVERGENCIA\_VALOR`

\- `OK`

\- `POSSIVEL\_DUPLICIDADE`

\- `DADOS\_INCOMPLETOS`



\### Status\_Processamento



\- `DUPLICADO`

\- `PROCESSADO`

\- `PENDENTE\_FORNECEDOR`

\- `ERRO\_PROCESSAMENTO`



\### Status\_Revisao



\- `PENDENTE`

\- `APROVADO`

\- `EM\_REVISAO`

\- `REJEITADO`

\- `CORRIGIR`



\### Reprocessar\_IA



\- `SIM`

\- `NAO`



\## Índices e unicidade



\- `Codigo\_Orcamento`: indexado e único.

\- `DriveFileId`: indexado e único.



Esses campos ajudam a evitar duplicidade e permitem localizar registros de forma eficiente.



\## Campos internos do SharePoint



A exportação RAW contém também campos técnicos gerenciados pelo SharePoint, como:



\- `ContentTypeId`

\- `ID`

\- `Modified`

\- `Created`

\- `Author`

\- `Editor`

\- `\_UIVersion`

\- `owshiddenversion`

\- `WorkflowVersion`



Esses campos fazem parte da infraestrutura do SharePoint e não são considerados campos funcionais do Sistema 3P.



\## Observações



Esta documentação representa a estrutura da lista no momento da exportação.



Alterações futuras na estrutura devem atualizar:



1\. o arquivo RAW;

2\. o schema;

3\. esta documentação;

4\. os fluxos/automações dependentes, quando aplicável.

