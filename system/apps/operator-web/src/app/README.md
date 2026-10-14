# Camada `app`

O App Router transforma pastas em URLs. `page.tsx` renderiza página, `layout.tsx` envolve páginas, `route.ts` cria endpoint e `[budgetId]` recebe parâmetro dinâmico, como `@PathVariable` Java.

Arquivos: `layout.tsx` define fonte/metadados/cabeçalho; `page.tsx` protege e mostra fila; `login/page.tsx` apresenta erros/login; `orcamentos/[budgetId]/page.tsx` protege e inicia revisão; `globals.css` estiliza. APIs estão no [README de API](api/README.md).

Exemplo:

```tsx
const user = await requirePageSession(); // valida no servidor
return <ValidationWorkspace budgetId={budgetId} canWrite={canReview(user)} />;
```

Fluxo: página Server Component → componente React → BFF. Investigue aqui URL, redirect, parâmetro, composição ou CSS. Para manter, conheça App Router, Server/Client Components, JSX e sessão. Não mova secrets para componentes cliente.

Leia [Estrutura](../../docs/ESTRUTURA-DE-PASTAS.md), [Arquitetura](../../docs/ARQUITETURA.md) e [Fluxos](../../docs/FLUXOS-DO-SISTEMA.md).
