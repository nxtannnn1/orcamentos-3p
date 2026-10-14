# Estrutura de pastas

```text
operator-web/
├── docs/
├── scripts/
├── src/
│   ├── app/api/{auth,itens,materiais,orcamentos}/
│   ├── components/
│   ├── domain/
│   ├── mocks/
│   ├── repositories/bff/
│   ├── server/{auth,data-source,security,sharepoint}/
│   └── types/
├── next.config.ts
├── open-next.config.ts
├── package.json
├── tsconfig.json
└── wrangler.jsonc
```

Foram omitidos dependências, builds e caches. Cada camada possui um README local; este documento explica o mapa global.

## Diretórios principais

### `src/app`

É o App Router do Next.js. `page.tsx` cria uma página, `layout.tsx` envolve páginas e `route.ts` implementa API. `[id]`/`[budgetId]` são segmentos dinâmicos, semelhantes a `@PathVariable` no Spring. Investigue aqui URLs, redirects, parâmetros e status HTTP. Preserve a fronteira servidor/navegador e não exponha secrets. Veja [`src/app/README.md`](../src/app/README.md).

### `src/components`

Componentes React são funções que recebem *props* e retornam JSX. Props lembram parâmetros Java; `useState` mantém estado que causa nova renderização. `validation-workspace.tsx` coordena revisão; os demais dividem fila, lista, busca, status e cabeçalho. Investigue aqui eventos e estado visual. Veja [`src/components/README.md`](../src/components/README.md).

### `src/domain`

Concentra regras independentes do JSX/Graph. `ReviewController` impede decisão simultânea e só atualiza após sucesso; `ReviewSession` modela seleção; `DecisionError` carrega status/código. Em Java, seria uma camada de serviços. Veja [`src/domain/README.md`](../src/domain/README.md).

### `src/repositories`

O padrão Repository esconde persistência atrás de contrato. `OperatorRepository` equivale a interface Java; BFF, mock e SharePoint são implementações/adaptadores. Investigue aqui URLs, serialização e contrato. Veja [`src/repositories/README.md`](../src/repositories/README.md).

### `src/server`

Código exclusivo do servidor: secrets, cookies, Redis e Graph. `auth` cuida de identidade; `security`, sessões/limites/store; `data-source`, configuração/factory; `sharepoint`, transporte/mapeamento/persistência. Veja [`src/server/README.md`](../src/server/README.md).

### `src/mocks`

Dados controlados: um orçamento, 56 itens e dez materiais. O repository grava em memória e simula ETag/conflito. Não comprova integração real. Veja [`src/mocks/README.md`](../src/mocks/README.md).

### `src/types`

Interfaces/uniões TypeScript documentam formatos e detectam incompatibilidades em compilação, mas não validam JSON externo em runtime. Veja [`src/types/README.md`](../src/types/README.md).

### `scripts`

`patch-braces.cjs` aplica mitigação temporária; seu teste cobre regressão. `revoke-user-sessions.mjs` é operação administrativa. Leia [Segurança operacional](SEGURANCA-OPERACIONAL.md) antes de executar.

## Configurações

| Arquivo | Responsabilidade | Cuidado |
| --- | --- | --- |
| `package.json` | Dependências e scripts oficiais. | `pretest`/`postinstall` têm efeitos. |
| `package-lock.json` | Versões resolvidas. | Não editar manualmente. |
| `tsconfig.json` | TypeScript estrito, JSX e alias `@/*`. | Tipos não substituem validação runtime. |
| `next.config.ts` | Cabeçalhos de segurança/cache. | Impacto global. |
| `eslint.config.mjs` | Regras ESLint/Next. | Não silencie a causa sem justificativa. |
| `wrangler.jsonc` | Worker/assets; hoje define mock. | Não representa produção completa. |
| `open-next.config.ts` | Adaptador Cloudflare. | Validar com scripts `cf:*`. |
| `.env.example` | Nomes/placeholders. | Nunca documentar valores reais. |
