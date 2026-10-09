# Guia de estudo — Operator API

## 1. O papel do serviço

O Sistema 3P passa a ter um lugar próprio para consultas ao PostgreSQL. O frontend continua responsável pela interface e pelo login Microsoft. A API é chamada pelo servidor do Operator Web e pelo n8n; o navegador não recebe o token de serviço nem a conexão do banco.

```text
Navegador → Operator Web / sessão Microsoft
                    ↓ chamada do servidor
              Operator API → PostgreSQL
                    ↑
                  n8n
```

A implantação inicial atende somente leitura. Ela não substitui imediatamente as Lists e não cria uma segunda autoridade para decisões humanas. O frontend existente não foi alterado.

O Next.js é usado por seus Route Handlers. Não há páginas, Server Actions, upload, chamadas Graph, mecanismo de login próprio ou dependência do auth-service Java nesta API.

## 2. Como uma solicitação percorre o código

Exemplo: `GET /api/v1/orcamentos?limit=20&after=10`.

1. `src/app/api/v1/orcamentos/route.ts` recebe a solicitação.
2. `protectedRead`, em `src/server/http.ts`, aplica limite global, método, configuração, autenticação, limite por cliente e concorrência.
3. `queryOptions` valida os parâmetros. Os nomes e valores não se tornam fragmentos livres de SQL.
4. `repository.budgets` monta um SELECT explícito com Drizzle e parâmetros separados.
5. `withRead` obtém conexão do pool, inicia `BEGIN READ ONLY` e verifica os privilégios da role.
6. O PostgreSQL executa a consulta com timeout.
7. O repositório corta a linha adicional utilizada para detectar a próxima página.
8. A API devolve JSON sem cache e um identificador gerado para a solicitação.
9. A transação é encerrada e a conexão volta ao pool, inclusive em erro. Uma conexão cujo rollback falhou é descartada.

A autenticação fica no handler que realmente executa a operação; não depende apenas de middleware, proxy ou de um cabeçalho enviado pelo navegador.

## 3. Organização dos arquivos

| Local | Responsabilidade |
|---|---|
| `src/app/api` | Rotas HTTP, sem regras SQL espalhadas |
| `src/server/config.ts` | Validar ambiente; recusar configuração insegura |
| `src/server/auth.ts` | Validar token de serviço e origem |
| `src/server/http.ts` | Controles comuns e erros seguros |
| `src/server/limits.ts` | Limites por janela e concorrência |
| `src/server/query.ts` | IDs, parâmetros, busca literal e paginação |
| `src/server/repository.ts` | SELECTs e projeções de resposta |
| `src/server/db/schema.ts` | Nomes/tipos necessários para leitura |
| `src/server/db/client.ts` | Pool, TLS, transações e verificação de role |
| `tests` | Testes de recusas, transações, rotas e SQL parametrizado |
| `docs/openapi.json` | Contrato inicial de integração |

O pacote `server-only` impede importar configuração, autenticação ou banco em código de navegador. A configuração TypeScript usa modo estrito.

## 4. Autenticação entre serviços

`API_CLIENTS_JSON` contém uma lista de até dez clientes:

```json
[
  {
    "id": "operator-web",
    "sha256": "<hash hexadecimal de 64 caracteres>",
    "scopes": ["read"]
  },
  {
    "id": "n8n",
    "sha256": "<outro hash hexadecimal de 64 caracteres>",
    "scopes": ["read"]
  }
]
```

Esse exemplo é estrutural e não contém credenciais válidas. A configuração recusa hashes malformados, IDs/hashes repetidos, campos inesperados e scopes diferentes de read.

Execute localmente:

```powershell
node scripts/generate-client-token.mjs
```

O script gera 32 bytes aleatórios e mostra um token base64url e seu SHA-256. Essa saída é sensível: execute em terminal privado e não cole em chat, Git, logs ou capturas de tela.

- O token bruto fica somente no consumidor, preferencialmente em gerenciador de segredos.
- O hash fica no ambiente da API.
- Cada cliente possui token diferente.
- O consumidor envia `Authorization: Bearer <token>`.
- As comparações usam digests de tamanho fixo e comparação resistente a diferenças de tempo.
- Os tokens não expiram automaticamente: definir rotação e revogação operacional.

Esta autenticação identifica o serviço, não o usuário humano. O servidor do Operator Web deve continuar verificando sessão Microsoft e perfil antes de chamar a API. O scope read atual autoriza leitura de todo o conjunto exposto. Não há isolamento por usuário, orçamento ou empresa nesta versão.

Ao implantar, TLS entre consumidor e API é obrigatório. Os scripts locais usam HTTP apenas em loopback. A API recusa cabeçalho Origin e contexto cross-site; não há CORS permissivo. Isso reduz uso pelo navegador, mas CORS/origem não substituem autenticação.

## 5. Configurar sem expor credenciais

Copiar `.env.example` para `.env.local` localmente e preencher somente depois de existir a role apropriada:

```powershell
Copy-Item .env.example .env.local
```

Variáveis:

| Variável | Significado |
|---|---|
| `DATABASE_URL` | Conexão da role própria somente leitura |
| `DATABASE_TLS_MODE` | verify-full por padrão; disable somente em loopback fora de produção |
| `API_CLIENTS_JSON` | IDs, hashes e scopes dos consumidores |

A URL precisa de usuário, senha e banco. Não aceita parâmetros de query ou fragmento: opções de SSL/host não podem contornar a política TLS definida pelo serviço. Codificar caracteres especiais da senha na URL. Nenhuma variável deve usar prefixo NEXT_PUBLIC_.

`verify-full` ativa verificação do certificado. Para certificado privado, preparar confiança na CA no ambiente de execução, sem desabilitar a verificação. O container PostgreSQL atual precisa ser avaliado/configurado para TLS antes de uso produtivo; isso não foi alterado.

Os arquivos de ambiente estão ignorados pelo Git. Apenas o exemplo sem credenciais é versionável.

## 6. Por que a role atual é recusada

Na inspeção, a role orcamentos é superusuário. A API recusa:

- Superusuário, criação de bancos/roles, replicação e bypass de RLS.
- Mudança entre session_user e current_user.
- Permissão CREATE no schema public.
- Propriedade de relações em public, inclusive via membership efetiva.
- Permissões de INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER e REFERENCES em tabelas ou colunas de public.

A verificação ocorre em cada transação, antes da consulta de negócio. O pool também solicita `default_transaction_read_only=on` e cada chamada inicia uma transação explicitamente somente leitura. Essas camadas reduzem impacto caso uma nova rota seja implementada incorretamente.

Para habilitar a leitura, o administrador deverá preparar uma role com LOGIN, sem poderes administrativos, USAGE no schema public e SELECT apenas nas quatro tabelas usadas. Não é preciso conceder acesso às sequences para SELECT.

**Esse provisionamento modifica o banco e não foi executado.** Revisar também privilégios herdados/PUBLIC, acesso a outros schemas e funções antes da produção. A verificação implementada não é uma auditoria completa de todas as capacidades de uma role.

Exemplo para revisão futura, NÃO executar como parte desta entrega:

```sql
CREATE ROLE operator_api_reader LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE orcamentos TO operator_api_reader;
GRANT USAGE ON SCHEMA public TO operator_api_reader;
GRANT SELECT ON public.orcamento, public.item_orcamento,
  public.material_oficial, public.fornecedor TO operator_api_reader;
```

Definir a senha por mecanismo seguro, por exemplo `\password operator_api_reader` em psql interativo. Não gravar senha literal em migração. Confirmar que a role não herdou privilégios incompatíveis.

## 7. Contrato das rotas

| Rota GET | Resposta |
|---|---|
| `/api/health` | Liveness público: processo responde; não comprova banco/configuração |
| `/api/v1/ready` | Autenticado; verifica role e acesso às quatro tabelas |
| `/api/v1/orcamentos` | Lista paginada |
| `/api/v1/orcamentos/{id}` | Detalhe ou 404 |
| `/api/v1/orcamentos/{id}/itens` | Itens paginados; orçamento inexistente retorna 404 |
| `/api/v1/materiais` | Catálogo paginado, com busca opcional |
| `/api/v1/fornecedores` | Fornecedores paginados, com busca opcional |

As rotas protegidas exigem token. Não há rotas de escrita. Next.js devolve 405 para métodos não implementados; HEAD/OPTIONS podem ser tratados automaticamente pelo framework. HEAD passa pelo GET autenticado.

Nas listas, `limit` tem padrão 50 e máximo 100. `after` é cursor pelo ID, inteiro positivo. A próxima página utiliza o nextAfter retornado:

```json
{
  "data": [],
  "pagination": { "limit": 50, "nextAfter": null }
}
```

O cursor usa o ID interno PostgreSQL. Não é o ID SharePoint, número do orçamento ou numero_item. Itens são ordenados por ID para manter o cursor consistente; a ordenação de revisão por número do item será decisão do adapter/frontend.

O detalhe não aceita query. Nas listas, parâmetros desconhecidos ou duplicados são recusados. `q` existe somente em materiais/fornecedores, limitado a 100 caracteres, sem controles. URLs acima de 2048 caracteres são recusadas nas consultas.

Busca usa parâmetros SQL e escapa %, _ e barra invertida para tratá-los como texto literal. Nomes de tabelas, colunas e ordenação não são fornecidos pelo usuário.

Valores numeric são strings decimais; ausência permanece null. IDs são números. Timestamps são textos PostgreSQL com timezone preservado. Não usar Number para cálculos financeiros. Se o frontend precisar de outro DTO, criar conversão explícita.

Fornecedores expõem somente ID, razão social, nome fantasia e status. CNPJ, email e telefone não são devolvidos. O orçamento não expõe conexão, caminhos de arquivo ou IDs externos. O item não inventa reviewStatus, suggestedMaterial ou approvedMaterial.

## 8. Erros, cabeçalhos e limites

Erros tratados usam:

```json
{
  "error": { "code": "UNAUTHORIZED", "message": "Autenticação necessária." },
  "requestId": "<identificador gerado>"
}
```

Principais statuses: 400 parâmetros inválidos; 401 token inválido; 403 origem não permitida; 404 orçamento ausente; 429 limite; 503 configuração, role insegura, indisponibilidade ou concorrência.

Não são devolvidas mensagens de erro do driver, SQL, senhas ou stack. Logs explícitos da aplicação contêm evento e requestId, sem URL/query/token. Revisar também logs do framework e do proxy na implantação; não registrar cabeçalho Authorization.

Cabeçalhos: no-store, nosniff, frame DENY, CSP restritiva, referrer no-referrer e permissões de câmera/microfone/geolocalização desabilitadas. Esses cabeçalhos não tornam segura uma dependência vulnerável. HSTS deve ser aplicado no ponto HTTPS de produção.

Limites atuais:
- 600 chamadas/minuto globais nas rotas protegidas.
- 120 chamadas/minuto por cliente.
- Oito operações concorrentes; excedente recebe 503.
- Cinco conexões no pool.
- Três segundos para obter conexão.
- Cinco segundos de statement_timeout no banco e um segundo de lock_timeout.
- Oito segundos de query timeout/idle em transação.
- Máximo 100 registros por página.

Os limites são por processo, em memória. Não são defesa completa contra DDoS, nem quota compartilhada entre réplicas. Para publicar, usar controles no gateway/proxy e definir limites globais. O endpoint de liveness não usa os limites da API protegida. Textos grandes existentes no banco também podem produzir respostas grandes; avaliar volume antes de publicar.

## 9. O que os testes demonstram

61 testes iniciais cobrem configuração, autenticação, origem, limites, validação de IDs, paginação, SQL parametrizado, privacidade dos SELECTs, erro genérico, bloqueio de role, rollback e rotas.

O build e o typecheck verificam estrutura Next.js/TypeScript. npm audit foi executado para todas as dependências e para produção: zero vulnerabilidades catalogadas na data da inspeção.

O smoke HTTP local confirmou liveness 200, ausência de token 401, origem 403, limit inválido 400, POST 405 e role administrativa recusada com 503. As credenciais de teste existiram somente no ambiente do processo; nenhum arquivo real de ambiente foi criado. O processo de teste foi encerrado.

Não foi comprovado GET 200 de dados reais com uma role própria: essa role ainda precisa de autorização/provisionamento. Os testes do repositório interceptam o driver; demonstram geração de SQL e contrato, não substituem um teste real PostgreSQL após provisionamento. Nenhum teste alterou dados.

## 10. Atualizações e vulnerabilidades

Versões exatas e lockfile tornam a instalação reproduzível. Isso não elimina a necessidade de atualização. Rodar `npm ci --ignore-scripts` evita scripts de instalação de dependências. Os pacotes usados passaram nos checks com esse modo; dependências futuras com hooks precisam ser avaliadas individualmente.

Evitar `npm audit fix --force`: pode trocar versões principais e quebrar contratos. Revisar advisory, atualizar explicitamente, gerar novo lockfile e repetir typecheck, testes, build e auditoria.

Em 08/10/2026, Next.js anunciou atualização para 14/10/2026: duas falhas Critical e uma High upstream, detalhes ainda pendentes. A ausência desses achados em npm audit hoje não prova que o conjunto está imune. Manter apenas uso local até revisar o release corrigido.

## 11. Próximas etapas sem perder o SharePoint

1. Aprovar e provisionar a role somente leitura; configurar tokens localmente e testar GET real.
2. Revisar a correção Next.js anunciada antes de qualquer publicação.
3. Criar um adapter PostgreSQL/API no Operator Web, mantendo sessão Microsoft e fonte SharePoint como padrão.
4. Completar o schema para sugestão, aprovação, revisão, versão e auditoria; aprovar migrações separadamente.
5. Adicionar decisões com If-Match e transação, e importações com identidade de origem/idempotência.
6. Espelhar Lists com reconciliação antes de trocar a autoridade das gravações.
7. Só então planejar implantação, TLS, backups, monitoramento e recuperação.

Os campos de matching existentes não representam aprovação humana. Reprocessamento n8n deverá preservar decisões humanas, como já faz o fluxo de itens inspecionado. IDs e estados SharePoint precisam de mapeamento explícito, sem equivalência por coincidência numérica.

Não existem migrations, migrate, push ou seed neste serviço. Não usar o modelo parcial Drizzle para inferir o schema completo.
