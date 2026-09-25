# Scripts n8n

Utilitários auxiliares para análise, validação e manutenção de artefatos n8n do Sistema de Orçamentos 3P.

## Scripts disponíveis

### `validate-workflows.mjs`

Realiza validações estáticas nos arquivos JSON existentes em `system/automation/n8n`, incluindo:

- validade do JSON;
- nomes duplicados de nodes;
- conexões para nodes inexistentes;
- referências a nodes inexistentes em expressões;
- sintaxe JavaScript de Code nodes;
- indícios de secrets em corpos JSON;
- comparação indicativa de campos utilizados com os schemas documentados das Microsoft Lists.

O script é atualmente uma ferramenta de execução manual e não integra o pipeline automático de CI.

Execução a partir da raiz:

    node scripts/n8n/validate-workflows.mjs

### `harden-workflows.mjs`

Utilitário de apoio para endurecimento e saneamento de artefatos n8n.

Antes de sua execução, revise seu comportamento e os arquivos que poderão ser afetados.

## Política de versionamento

Os arquivos presentes no repositório devem ser tratados como artefatos históricos, sanitizados ou de referência técnica.

Novos exports operacionais do ambiente n8n não devem ser adicionados automaticamente ao repositório.

Nunca versionar:

- credenciais ou tokens;
- secrets;
- dados pessoais;
- identificadores sensíveis do ambiente;
- informações operacionais que possam expor a infraestrutura Microsoft 365/SharePoint da 3P.

A existência destes utilitários não implica que o ambiente operacional n8n deva ser reproduzido ou mantido integralmente no Git.
