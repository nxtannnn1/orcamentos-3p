# Operator API — Sistema 3P

Serviço Next.js dedicado ao acesso PostgreSQL. Versão inicial 0.1.0: consultas autenticadas, sem gravações.

O Operator Web continua em `system/apps/operator-web` e agora possui adaptador de consulta à API. SharePoint e n8n não foram modificados. O auth-service Java não participa deste serviço.

## Situação em 09/10/2026

Implementados: consultas paginadas de orçamentos, detalhe, itens, materiais e fornecedores; autenticação entre serviços; defesa contra consultas ilimitadas; transação somente leitura; recusa de role PostgreSQL com privilégios de escrita/administração; testes e auditoria de dependências.

A role operator_api_reader criada pelo usuário e a autenticação do frontend foram configuradas localmente. A integração real foi validada por consultas somente leitura. Não usar a role administrativa orcamentos: ela é recusada.

A aplicação já compila e executa sem credenciais. Nesse estado, liveness funciona e rotas protegidas retornam 503 por configuração ausente. Isso é um bloqueio deliberado, não uma conexão automática ao banco.

## Estudo e contrato

- [Guia detalhado](docs/GUIA-DE-ESTUDO.md): arquitetura, leitura do código, segurança, configuração, testes e próximos passos.
- [OpenAPI](docs/openapi.json): contrato das rotas, autenticação e respostas.
- `src/server/db/schema.ts` é uma projeção parcial de leitura do schema atual. **Não usar para gerar migrações.**

## Versões

Node 24 LTS (ambiente verificado: 24.16.0), Next.js 16.3.8, React/React DOM 19.2.8, Drizzle 0.45.4, pg 8.23.1, TypeScript 5.9.3 e Vitest 4.1.11. Dependências diretas exatas; transitivas fixadas em package-lock.json.

Escolha: linha Next.js 16.3 já usada no projeto, com o último patch disponível dessa linha no registro consultado. Não foram usados canary, beta ou RC. React é dependência do framework mesmo em um projeto somente API.

**Pendência de segurança:** o Next.js anunciou para 14/10/2026 uma correção de duas vulnerabilidades Critical e uma High em dependências upstream. As versões afetadas e os detalhes ainda não estavam publicados na inspeção. Antes de publicar externamente, consultar o aviso, aplicar a versão corrigida e repetir os checks. Auditoria sem achados não significa ausência de vulnerabilidades.

Fontes:
- https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026
- https://nextjs.org/docs/app/getting-started/route-handlers
- https://orm.drizzle.team/docs/get-started/postgresql-existing
- https://nodejs.org/en/about/previous-releases

## Executar em PowerShell

```powershell
Set-Location 'C:\Users\natan\OneDrive\Documentos\Projetos\3P - Sistema\system\services\operator-api'
$env:NEXT_TELEMETRY_DISABLED = '1'
npm ci --ignore-scripts
npm run dev
```

Serviço: http://127.0.0.1:3001. Não há interface na raiz. Verifique `GET /api/health`. O script vincula apenas loopback e usa porta diferente do frontend.

Para dados reais, seguir a configuração no guia. Não há bypass de autenticação nem de privilégios de banco.

## Verificações

```powershell
npm run check
npm run audit:all
npm run audit:production
```

`check` gera os tipos de rota, verifica TypeScript, executa testes e compila. Não consulta nem migra o banco. Não há comando de migrate, push ou seed.

## Fora desta entrega

Gravação de decisões, importação do n8n, migrações, criação de usuários PostgreSQL, integração do Operator Web, alteração das Lists, publicação, commit e push.
