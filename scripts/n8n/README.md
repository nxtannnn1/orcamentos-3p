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
- isolamento dos campos de decisão humana e auditoria nos PATCHs automáticos do workflow de itens e tributos.

Também aplica as checagens estruturais de `workflow-policy.mjs` (formato do workflow, nodes sem nome ou tipo, ids duplicados, arestas malformadas) e falha se a pasta não contiver workflows.

Execução a partir da raiz:

    node scripts/n8n/validate-workflows.mjs

Os testes unitários da regra de isolamento podem ser executados com:

    node --test scripts/n8n/workflow-integrity.test.mjs

### `check-policy.mjs` e `workflow-policy.mjs`

Política de segurança offline. Avalia todos os arquivos rastreados ou novos (não ignorados) obtidos por `git ls-files`, sem rede nem credenciais:

- caminhos permitidos em `system/automation/n8n` e `scripts/n8n` (rejeita backups, exports soltos, `.env` e nomes fora do padrão);
- exports n8n em qualquer outro caminho do repositório;
- IDs de credenciais, `meta.instanceId`, `webhookId`, IDs de ambiente (GUIDs fora de ids de node), drive IDs e resource locators fixos;
- hosts do tenant (`*.sharepoint.com`, `*.onmicrosoft.com`), endpoints fora da lista permitida, e-mails reais, tokens e campos ou cabeçalhos secretos com valor literal;
- `active: true`, dados de execução (`pinData`, `staticData`), TLS desativado, webhook sem autenticação, nodes de comando e referências `$node[...]`/`$items(...)` para nodes inexistentes.

Placeholders (`*_PLACEHOLDER`, `EXAMPLE_*`), expressões n8n e domínios reservados (`example.com`) são aceitos. Os diagnósticos mostram arquivo, regra, caminho e impressão digital, nunca o valor.

`policy-baseline.json` registra a dívida legada existente em `035f63a` por impressão digital. Um achado novo, inclusive o mesmo valor copiado para outro arquivo, falha; uma entrada sem achado correspondente também falha, para que o baseline só diminua. Ao sanear um workflow legado, remova as entradas correspondentes. `--baseline-candidate` imprime o baseline calculado apenas para revisão humana: não o use para aceitar achados novos.

    node scripts/n8n/check-policy.mjs
    node --test scripts/n8n/workflow-policy.test.mjs

### CI

`.github/workflows/n8n-validation.yml` executa a política, `node --test scripts/n8n/*.test.mjs` e `validate-workflows.mjs` em push e pull request para `infra-lab`, com `contents: read`, sem secrets e sem acesso ao n8n publicado.

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
