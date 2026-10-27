<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Governança local

Leia também [as instruções principais do repositório](../../../AGENTS.md). Preserve o bloco gerado pelo Next.js acima.
A Operator API é um serviço de **consulta somente leitura** ao PostgreSQL: não adicionar rotas de escrita,
migrações ou privilégios de gravação sem arquitetura e autorização próprias. `src/server/db/schema.ts` é uma
projeção de leitura, não fonte de migrações. Detalhes em [README.md](README.md).
