@AGENTS.md

# Complemento para o Claude Code

O Claude Code carrega automaticamente o `CLAUDE.md`, não o `AGENTS.md`; o import acima traz as regras compartilhadas.
Ferramentas que não processam `@imports` devem ler o `AGENTS.md` explicitamente.

## Ambiente Windows

- No PowerShell 5.1 não há `&&`; use `;` ou `if ($?) { ... }`. Use `npm.cmd` se a política bloquear `npm`.
- Scripts PowerShell com acentos precisam de UTF-8 com BOM.
- Muitos arquivos usam CRLF: prefira as ferramentas de edição a substituições por shell.

## Uso de contexto

- Prefira Grep/Glob e leitura de trechos a abrir arquivos inteiros; documentos datados e relatórios de fase
  (principalmente em `system/apps/operator-web/docs/`) são históricos; o estado vigente está no STATUS.
- Use subagentes apenas quando o pedido justificar; uma busca direta costuma bastar.
- Memória persistente só para fatos duráveis que o repositório não registra; estado do projeto vai para o STATUS.

## Navegador e serviços

- Páginas do tenant, n8n e Power Automate abertas no navegador seguem as regras de ambientes corporativos do `AGENTS.md`:
  observar e ler; nenhuma ação de gravação, publicação ou consentimento sem autorização explícita.
