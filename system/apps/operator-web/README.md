# 3P Orçamentos IA — `operator-web`

Interface operacional do Sistema 3P para revisão humana de materiais importados em orçamentos. Permite consultar fila, abrir orçamento, comparar sugestão com catálogo oficial e registrar aprovação ou rejeição.

O `operator-web` é o frontend com seu BFF (*Backend for Frontend*), não o sistema completo. Entra ID, Graph, SharePoint, Redis, Operator API, PostgreSQL, automações e infraestrutura são dependências externas.

## Funcionalidades e limites

**Implementado em código:** login Microsoft; perfis Consulta/Operador/Comprador; fila e progresso; itens e catálogo; escolha humana, aprovação/rejeição/observação; BFF; fontes `mock`, `sharepoint` e `operator-api`; ETag, política de permissão restrita, auditoria; testes de domínio, API, autenticação e segurança. Implementado significa que o fluxo, as validações e os adaptadores existem no repositório; não significa que a escrita foi aceita pelo SharePoint real.

**Simulado, validado localmente ou pendente:** o mock perde decisões ao reiniciar; testes interceptam Graph e não comprovam o tenant; consultas reais Operator API → PostgreSQL foram validadas localmente em modo somente leitura, não em produção; “Propostas” e “Cesta” aparecem no login, mas não têm fluxo neste módulo; MFA, listas/colunas, Redis, permissões e deploy reais exigem aceite no ambiente.

### Estado da integração real

A escrita no SharePoint está **implementada, mas não validada de ponta a ponta no ambiente real**. No ambiente local examinado, ela permanece bloqueada antes do `PATCH` por dependências que devem ser preparadas e confirmadas:

- Redis REST compartilhado para sessão, limites e auditoria não está configurado;
- o mapa de campos não informa `reviewedByOid`, `reviewedAt` e `decisionId`, e os nomes/tipos físicos dessas colunas ainda precisam ser confirmados;
- a aplicação runtime precisa de `Lists.SelectedOperations.Selected` e concessões mínimas nas três listas; permissões de aplicação amplas são recusadas pela política do código;
- login da pessoa e acesso Graph têm configurações separadas no código, mas o ambiente local examinado aponta ambos para o mesmo Client ID; a separação em registros distintos ainda precisa ser decidida e validada pela TI;
- o contexto e a política MFA efetiva ainda dependem de configuração e comprovação no Entra ID;
- hospedagem, secrets, Redis, listas, concessões e smoke test do deploy continuam dependências de infraestrutura.

Há ainda uma **hipótese técnica**, não um defeito confirmado: o transporte tenta verificar a concessão com `GET /sites/{site-id}/lists/{list-id}/permissions` sob a base Graph `v1.0`, enquanto a referência localizada para listar permissões da lista está publicada como beta. Somente uma validação de leitura no tenant poderá confirmar se isso bloqueia o fluxo atual. Veja [Arquitetura](docs/ARQUITETURA.md), [Debug](docs/GUIA-DE-DEBUG.md) e [Segurança operacional](docs/SEGURANCA-OPERACIONAL.md).

## Tecnologias

| Tecnologia | Responsabilidade real |
| --- | --- |
| React 19 | Componentes, estado e eventos. |
| Next.js 16 / App Router | Páginas, Server Components, BFF e build. |
| TypeScript 5 | Tipos estáticos estritos. |
| MSAL Node / `jose` | Login, token e sessão JWE. |
| Graph / SharePoint | Fonte real e persistência. |
| Operator API / PostgreSQL | Fonte real de consulta, sem decisões nesta versão. |
| Redis REST | Sessões, revogação, limites e auditoria. |
| Vitest / ESLint | Testes e análise estática. |
| OpenNext / Wrangler | Alvo Cloudflare. |

```text
React → BffOperatorRepository → /api (auth/validação)
                                  → OperatorRepository
                                     ├─ Mock (memória)
                                     ├─ SharePoint → Graph
                                     └─ Operator API → PostgreSQL (somente leitura)
```

## Ambiente local

Pré-requisitos: Node.js compatível com Next.js 16 e npm. Use `.env.example` somente como catálogo de nomes; nunca versionar valores reais.

```powershell
cd system/apps/operator-web
npm install
npm run dev
```

Acesse `http://localhost:3000`. Login é obrigatório, salvo bypass estritamente local descrito em [Login Microsoft](docs/LOGIN-MICROSOFT.md).

## Validação

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

| Script | Função |
| --- | --- |
| `dev` / `start` | Desenvolvimento / execução de build existente. |
| `build` | Build Next. |
| `lint` | ESLint. |
| `typecheck` | `next typegen` + `tsc --noEmit`. |
| `test` | Vitest; `pretest` aplica patch de `braces`. |
| `cf:build` / `cf:preview` / `cf:deploy` | Build, preview e deploy Cloudflare; deploy só no processo autorizado. |
| `cf:typegen` | Tipos Cloudflare. |
| `postinstall` / `pretest` | Mitigação temporária de `braces`. |
| `security:revoke-user` | Revogação administrativa de sessões. |

## Diagnóstico rápido

401 indica sessão; 403, perfil/origem/Graph; 409, conflito/regra; 428, `If-Match`; 429, limite; 502/503, integração/configuração. Capture a resposta na Network e siga o endpoint; não altere arquivos ao acaso. Veja [Guia de debug](docs/GUIA-DE-DEBUG.md).

## Convenções

- Secrets permanecem no servidor e fora do Git.
- UI depende do contrato `OperatorRepository`, não de SharePoint direto.
- Autorização é server-side; botão desabilitado não é controle de segurança.
- Sugestão nunca é aprovação automática.
- Escrita exige versão, autoria e auditoria; após erro incerto, releia.
- IA exige revisão humana, testes e documentação.

Consulte [Segurança operacional](docs/SEGURANCA-OPERACIONAL.md) antes de publicar ou liberar escrita. Produção exige registro compartilhado de sessões; decisões SharePoint exigem ETag, auditoria durável e mapeamento das colunas de autoria/data/ID. Os perfis autorizados acessam toda a fila.

## Integração com PostgreSQL

`DATA_SOURCE=operator-api` habilita consultas à Operator API pelo servidor. Consulte [o guia de integração](docs/INTEGRACAO-OPERATOR-API.md). Aprovação e rejeição permanecem bloqueadas nessa fonte. O modo local opcional possui somente perfil Consulta e falha em produção.

O navegador continua chamando apenas o BFF do Operator Web. O BFF envia um token de serviço à Operator API; esse token identifica o serviço chamador, não a pessoa. A sessão Microsoft e os perfis continuam sendo responsabilidade do Operator Web. Não há fallback automático entre Operator API, SharePoint e mock.

## Índice central

1. [Guia de estudo](docs/GUIA-DE-ESTUDO.md)
2. [Arquitetura](docs/ARQUITETURA.md)
3. [Estrutura de pastas](docs/ESTRUTURA-DE-PASTAS.md)
4. [Fluxos](docs/FLUXOS-DO-SISTEMA.md)
5. [Debug](docs/GUIA-DE-DEBUG.md)
6. [Testes](docs/GUIA-DE-TESTES.md)
7. [Manutenção](docs/GUIA-DE-MANUTENCAO.md)
8. [Versionamento](docs/GUIA-DE-VERSIONAMENTO.md)
9. [Glossário](docs/GLOSSARIO.md)
10. [Login Microsoft](docs/LOGIN-MICROSOFT.md)
11. [Segurança operacional](docs/SEGURANCA-OPERACIONAL.md)
12. [Integração com a Operator API](docs/INTEGRACAO-OPERATOR-API.md)

## Índice por camada

- [`src/app`](src/app/README.md) e [`src/app/api`](src/app/api/README.md)
- [`src/components`](src/components/README.md)
- [`src/domain`](src/domain/README.md)
- [`src/repositories`](src/repositories/README.md) e [`src/repositories/bff`](src/repositories/bff/README.md)
- [`src/server`](src/server/README.md): [`auth`](src/server/auth/README.md), [`data-source`](src/server/data-source/README.md), [`security`](src/server/security/README.md), [`sharepoint`](src/server/sharepoint/README.md), [`operator-api`](src/server/operator-api/README.md)
- [`src/mocks`](src/mocks/README.md)
- [`src/types`](src/types/README.md)

Novo integrante: rode o mock, percorra fila/revisão, leia tipos/contrato e siga uma decisão pelos testes. Antes de dados reais, leia os documentos operacionais.

## Contrato da decisão

`PATCH /api/itens/{id}/decisao` recebe `action`, `approvedMaterialId` e `observation`. Aprovação exige material oficial e fornecedor; rejeição exige material `null`. O BFF obtém autoria da sessão e rejeita campos extras. Em `sharepoint`, quando todas as pré-condições são satisfeitas, o PATCH foi implementado para enviar material aprovado, status, observação e auditoria; `Material_Sugerido_Ref` não muda. Em `mock`, a alteração existe apenas em memória. Em `operator-api`, decisões são recusadas com `403 READ_ONLY_DATA_SOURCE`. A persistência SharePoint real permanece pendente de validação administrativa e teste controlado.
