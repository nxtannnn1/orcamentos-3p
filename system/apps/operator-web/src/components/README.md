# Componentes React

Esta camada renderiza e reage ao usuário. Componente é função que recebe props, equivalente a parâmetros Java, e retorna JSX. `useState` guarda estado; `useEffect` sincroniza com APIs.

- `budget-queue.tsx`: busca/mostra fila.
- `validation-workspace.tsx`: carrega orçamento, guarda formulário e decide.
- `item-list.tsx`, `material-autocomplete.tsx`, `status-badge.tsx`: peças focadas.
- `app-header.tsx`: Server Component com sessão/fonte.

```tsx
const [saving, setSaving] = useState(false);
<button disabled={saving || !canWrite}>Aprovar</button>
```

Componentes chamam domínio/BFF e recebem tipos; não acessam Graph, Operator API ou PostgreSQL. `readOnly` e `reviewAvailable` tornam a capacidade da fonte visível e desabilitam decisões na Operator API. Investigue Console, props, estado, handler e requisição. Para manter, conheça JSX, hooks, eventos, acessibilidade e estados loading/vazio/erro. Botão desabilitado não substitui autorização e recusa server-side.

Leia [Guia de estudo](../../docs/GUIA-DE-ESTUDO.md), [Arquitetura](../../docs/ARQUITETURA.md) e [Debug](../../docs/GUIA-DE-DEBUG.md).
