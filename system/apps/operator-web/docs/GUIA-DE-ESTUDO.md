# Guia de estudo do `operator-web`

Plano para quem conhece Java e está aprendendo frontend. Priorize leitura e diagnóstico. Use o [Glossário](GLOSSARIO.md).

## 1 — Fundamentos da web

**Objetivo:** entender navegador, servidor, HTTP e JSON. HTML estrutura, CSS apresenta e JavaScript interage. O navegador chama o BFF; apenas o servidor chama Graph.

- Leia: `app/layout.tsx`, `globals.css`, `budget-queue.tsx`, API de orçamentos.
- Exercício seguro: na Network, identifique documento e `GET /api/orcamentos`.
- Revisão: por que Graph não fica no navegador? 401 difere de 403 como?
- Domínio: explique navegador → BFF → fonte e localize HTML/CSS/JSON.

## 2 — TypeScript

**Objetivo:** tipos, interfaces, classes, funções, módulos, Promise e exceções. `interface` lembra contrato/POJO Java; `Promise<T>`, `CompletableFuture<T>`; `async/await` organiza espera. Exceções não são verificadas pelo compilador.

- Leia: `types/operator.ts`, `operator-repository.ts`, `review-controller.ts`, `decision-error.ts`.
- Exercício: desenhe `BudgetItem`; explique por que a rota valida JSON mesmo com tipos.
- Revisão: o que retorna `listBudgets()`? O que `?` significa?
- Domínio: explique a união `ItemDecision` e a injeção do repository.

## 3 — React

**Objetivo:** componentes, JSX, props, `useState`, `useEffect`, eventos e renderização. Props são parâmetros; estado muda e renderiza de novo; efeito sincroniza com algo externo.

- Leia: fila, workspace, lista de itens e autocomplete.
- Exercício: associe cada estado de `ValidationWorkspace` a um elemento visual; siga “Rejeitar”.
- Revisão: por que `"use client"`? Por que `saving` aparece em duas camadas?
- Domínio: preveja loading, erro, vazio e salvando.

## 4 — Next.js

**Objetivo:** App Router, rotas, layouts e fronteira cliente/servidor. `page.tsx` é página; `layout.tsx`, moldura; `route.ts`, endpoint; `[id]` lembra `@PathVariable`.

- Leia: páginas, rotas API e `proxy.ts`.
- Exercício: mapeie URLs aos arquivos e ache verificações de sessão.
- Revisão: por que `requirePageSession` não vai ao cliente? Para que `force-dynamic`?
- Domínio: explique caminho de página versus API.

## 5 — Arquitetura do projeto

**Objetivo:** seguir decisão por `ValidationWorkspace` → `ReviewController` → `OperatorRepository` → `BffOperatorRepository`.

- Leia esses arquivos, `review-session.ts` e testes do controller.
- Exercício: marque onde estado muda e onde falha o preserva.
- Revisão: por que repository entra no construtor? Por que usar resposta server-side?
- Domínio: separar UI, domínio e infraestrutura.

## 6 — Integrações

**Objetivo:** entender login, Graph/SharePoint, Operator API/PostgreSQL e persistência. Pessoa, aplicação Graph e cliente entre serviços exercem papéis separados. ETag evita sobrescrita no SharePoint; Redis sustenta sessão/limite/auditoria; a Operator API permanece somente leitura.

- Ordem comum: auth configuration → rotas auth → Microsoft → session → factory. Depois siga uma ramificação: Graph transport → SharePoint repository → mapper; ou Operator API repository → API `/api/v1` → repository PostgreSQL.
- Exercício: catalogue somente nomes/finalidades de `.env.example`; desenhe o fluxo da pessoa, da aplicação Graph e do token entre Operator Web/Operator API.
- Revisão: permissão da aplicação substitui perfil humano? O que fazer após PATCH incerto?
- Domínio: explicar PKCE/state/nonce, JWE, ETag, permissão restrita e auditoria.

## 7 — Depuração

**Objetivo:** localizar falha da tela à persistência. Console é cliente; Network é HTTP; terminal é servidor; testes reproduzem cenários.

- Leia: `route-error.ts`, testes do fluxo e [Guia de debug](GUIA-DE-DEBUG.md).
- Exercício: localize geradores de 401, 403, 409, 428, 429 e 503.
- Revisão: que evidência separa UI de API? Quando não repetir gravação?
- Domínio: formular hipótese com status, método, arquivo e teste, sem segredo.

Sequência: rode mock; leia tipos/contrato; siga fila; siga aprovação; use testes como exemplos; estude auth/segurança; compare SharePoint e Operator API; só então use integrações reais. Todos os perfis autorizados leem a fila; somente Operador/Comprador decidem, e nenhuma decisão é permitida em `operator-api`. Mock/testes não validam tenant, MFA, Redis, SharePoint, produção PostgreSQL ou Cloudflare reais.
