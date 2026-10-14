# Guia de testes

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run cf:build
```

`test` roda Vitest e `pretest` aplica a mitigação `braces`; `lint` usa ESLint; `typecheck` executa `next typegen` e `tsc --noEmit`; `build` empacota Next; `cf:build` valida OpenNext/Cloudflare.

Antes de aceitar um build, confira se a versão instalada corresponde a `package.json` e `package-lock.json` com `npm ls next react react-dom --depth=0`. Na retomada documentada, os manifestos apontavam Next `16.3.8`, mas a instalação local executou `16.3.7`; o build passou, porém não reproduziu exatamente o lockfile. Corrigir a instalação é uma ação separada e não faz parte da documentação.

Testes unitários isolam função/classe. Integrações simuladas unem camadas com rede interceptada. Mocks são substitutos controlados, não confirmação do tenant. ESLint/TypeScript são estáticos; build não valida regra/credencial; validação manual/E2E real continua necessária.

| Área | Testes |
| --- | --- |
| Domínio | `review-controller*.test.ts`: seleção, avanço, falha, concorrência. |
| Mock/rotas | `mock-operator-repository.test.ts`, `routes.test.ts`: dados, pesquisa, versão e endpoints. |
| Decisão | `decision-flow.test.ts`: controller → BFF → Graph simulado e validações. |
| Acesso | `auth-access.test.ts`: 401, perfis e bypass leitura. |
| Login | `auth/flow`, `microsoft`, `session`: PKCE, claims, cookies e bypass. |
| Segurança | `security.test.ts`, `proxy.test.ts`: revogação, limites, store e CSP. |
| SharePoint | testes de repository/transports: mapper, paginação, ETag e permissões. |
| Operator API no frontend | `operator-api-repository.test.ts`, `operator-api-local.test.ts`: configuração, Bearer server-side, validação, paginação e bloqueio de escrita. |
| Config/dependência | `configuration.test.ts`, `patch-braces.test.ts`. |

`discover-columns.test.ts` prova apenas preparação de GET para descoberta futura; não uma função automática ativa.

No serviço `system/services/operator-api`, execute `npm run typecheck`, `npm test` e `npm run build`. Ele não define script ESLint; typecheck, testes e build são as verificações aplicáveis atuais. Seus testes cobrem autenticação entre serviços, limites, rotas e transações PostgreSQL somente leitura com banco simulado.

`operator-api-live.test.ts` é opt-in e consulta BFF → Operator API → PostgreSQL real somente quando `RUN_OPERATOR_API_LIVE=1`. Não o execute contra ambiente desconhecido. Um resultado aprovado comprova a leitura daquele banco/configuração, não login Microsoft, produção ou validação visual.

Para achar o teste, busque método/mensagem e depois `*.test.ts` da pasta e testes que importam a rota. Para executar um arquivo:

```powershell
npx vitest run src/domain/review-controller-write.test.ts
```

Leia nome, expected/received e primeiro frame do projeto. Diferencie defeito de implementação, teste, mock e ambiente. Não altere expectativa só para passar; depois rode a suíte completa.

Validação manual mock: login/bypass autorizado, fila, abertura, busca, aprovação, rejeição, navegação, progresso, falha e recarga. SharePoint real exige item de homologação aprovado para teste, Redis, colunas de auditoria confirmadas, concessões mínimas, login/MFA, ETag e releitura. Primeiro valide GETs e a consulta de permissão; só execute PATCH com autorização explícita.

Não há comprovação estática de E2E de navegador nem execução real contra Entra, Redis, SharePoint e Cloudflare; não declare cobertura total. A Operator API foi validada localmente em leitura real, mas não em produção nem visualmente. Teste automatizado aprovado comprova o comportamento exercitado, não que a lista SharePoint real aceitou a decisão.
