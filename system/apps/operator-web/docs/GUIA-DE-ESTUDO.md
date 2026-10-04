# Como estudar o operator-web

O projeto separa a tela, as regras de interação e o acesso aos dados. Comece pelo caminho de uma decisão e depois estude os controles de segurança. Todos os perfis autorizados podem ler a fila inteira; somente Operador e Comprador podem decidir.

## 1. Entenda os dados e os contratos

Leia `src/types/operator.ts`: `Budget` é o orçamento, `BudgetItem` é o item e `OfficialMaterial` é o material do catálogo. `ItemDecision` distingue aprovação de rejeição. `DecisionContext` transporta a versão do item e, no servidor, a identidade de quem decidiu.

Em `src/repositories/operator-repository.ts`, a interface `OperatorRepository` descreve as operações disponíveis. A tela trabalha com esse contrato, sem precisar conhecer SharePoint ou os dados fictícios.

## 2. Siga uma aprovação

```text
ValidationWorkspace → ReviewController → BffOperatorRepository
   navegador: escolha humana, versão do item e chamada HTTP
                       ↓
PATCH /api/itens/[id]/decisao
   servidor: sessão, perfil, origem, limite e validação do JSON
                       ↓
SharePointOperatorRepository → GraphClientCredentialsReadTransport
   servidor: versão, orçamento aberto, autoria, auditoria e permissão Graph
                       ↓
SharePoint: PATCH com If-Match e campos explícitos
```

| Arquivo | O que observar |
| --- | --- |
| `src/components/validation-workspace.tsx` | A tela guarda a seleção e apresenta erros; não concede permissão ao usuário. |
| `src/domain/review-controller.ts` | Impede decisões simultâneas na mesma tela e altera o estado somente após sucesso. |
| `src/repositories/bff/bff-operator-repository.ts` | Converte a decisão para JSON e envia a versão no cabeçalho `If-Match`. |
| `src/app/api/itens/[id]/decisao/route.ts` | Valida cada requisição e obtém a autoria da sessão, nunca do JSON do navegador. |
| `src/server/sharepoint/sharepoint-operator-repository.ts` | Reúne os dados, detecta alterações concorrentes e prepara uma decisão auditável. |
| `src/server/sharepoint/graph-read-transport.ts` | Obtém o token da aplicação e envia HTTP ao Graph com destino, timeout e permissão controlados. |

`If-Match` é a condição “grave somente se o item ainda estiver nesta versão”. Se outra pessoa alterou o item, o servidor retorna conflito. Desabilitar o botão enquanto salva evita duplo clique na tela; verificar a versão no servidor protege também contra outra aba ou outro operador.

## 3. Separe as duas identidades Microsoft

O registro `ENTRA_LOGIN_*` autentica a pessoa. O registro `MICROSOFT_*` autentica a aplicação que acessa o Graph. A permissão Graph da aplicação não concede automaticamente permissão de decisão à pessoa: a rota ainda verifica o perfil da sessão.

Leia nessa ordem:

1. `src/server/auth/configuration.ts`: variáveis necessárias, tenant, origem e perfis.
2. `src/app/api/auth/login/route.ts`: criação de state, nonce e PKCE.
3. `src/app/api/auth/callback/route.ts`: troca do código e criação da sessão depois da validação.
4. `src/server/auth/microsoft.ts`: assinatura e claims do token Microsoft.
5. `src/server/auth/session.ts`: cookie criptografado, sessão exigida e logout.
6. `src/server/security/session-registry.ts`: registro ativo e revogação individual ou por usuário.
7. `src/server/security/store.ts`: Redis compartilhado em produção e memória apenas em desenvolvimento/testes.

State relaciona o retorno ao login iniciado. Nonce relaciona o token à transação. PKCE relaciona a troca do código ao segredo temporário criado pelo servidor. São verificações diferentes, que se complementam.

O cookie tem validade criptográfica, mas isso não basta para autorizar acesso: seu registro no servidor também precisa estar ativo. Logout apaga esse registro. A versão de revogação do usuário permite invalidar todas as sessões anteriores sem trocar o segredo global.

## 4. Estude a leitura e a auditoria

`listBudgets()` lê orçamentos e itens uma vez e agrupa as contagens por orçamento. Uma lista paginada pode exigir várias chamadas; o custo não se multiplica por cada orçamento. Os materiais só são resolvidos onde seus detalhes são necessários.

Na decisão, a auditoria registra intenção antes de enviar o PATCH. O mesmo PATCH grava a identidade do operador, o horário e um identificador da decisão no SharePoint. Uma falha de rede depois de enviar a gravação pode deixar o resultado incerto: por isso, recarregue o item antes de tentar novamente. Uma intenção sem resultado pode ser reconciliada usando o identificador registrado no SharePoint.

## 5. Use os testes como exemplos

```powershell
npm test
npm run typecheck
npm run lint
```

| Teste | Comportamento explicado |
| --- | --- |
| `src/server/security/security.test.ts` | Cookie antigo depois do logout, revogação por usuário, limites e falha do armazenamento. |
| `src/server/auth/microsoft.test.ts` | Rejeição de assinatura, tenant, perfil e contexto inválidos. |
| `src/app/api/auth-access.test.ts` | Consulta não grava, mesmo chamando a API diretamente. |
| `src/app/api/decision-flow.test.ts` | Caminho completo da tela até um Graph simulado. |
| `src/server/sharepoint/sharepoint-operator-repository.test.ts` | Leituras sem repetição, conflito, orçamento fechado e auditoria indisponível. |
| `src/server/sharepoint/graph-write-transport.test.ts` | Permissão restrita, If-Match e conflito retornado pelo Graph. |

Os testes usam dados fictícios e rede simulada. Não edite `.env.local` nem substitua o transporte simulado por chamadas reais para estudar esses cenários.

## 6. Conheça os limites da implementação

Leia [Segurança operacional](SEGURANCA-OPERACIONAL.md) antes de publicar. Produção precisa de Redis com leituras autoritativas; escrita SharePoint precisa das colunas de autoria e da concessão restrita. Mudanças no Entra exigem revogação também no portal; não existe sincronização automática/CAE. A política efetiva de MFA depende do administrador do tenant.

O patch de `braces` em `scripts/patch-braces.cjs` é uma mitigação temporária da ferramenta de dependência, não uma regra de negócio do portal. Seu teste mostra a rejeição controlada de profundidades excessivas. A versão upstream continua no lockfile até existir uma correção oficial adequada.

### Modos de autenticação preservados na integração

SessionUser.authMode distingue entra, local-mock-bypass e local-sharepoint-bypass. O último é uma exceção explícita de desenvolvimento para ler dados reais como Consulta; requireSession(true) o bloqueia antes de acessar o repositório. O contexto MFA pode estar ausente no login Entra somente em desenvolvimento HTTP em loopback; produção continua exigindo contexto válido. Veja os testes de session.test.ts para as combinações permitidas e rejeitadas.
