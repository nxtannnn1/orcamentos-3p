# AGENTS.md — Sistema 3P

Regras compartilhadas para todos os agentes. `AGENTS.md` de subdiretórios complementam estas regras no seu componente;
em conflito, prevalece a regra mais restritiva de segurança e, nos detalhes do componente, a instrução local.

## Projeto e prioridades

- Sistema interno da 3P para processar, padronizar, comparar e validar orçamentos. Visão geral: [README](README.md).
- Meta: entregar o MVP até dezembro de 2026, sem ampliar escopo.
- Prioridade: revisão e decisão humana auditável no Operator Web sobre SharePoint; Materiais Oficiais (n8n);
  Histórico de Preços (Power Automate); indicadores (Power BI).
- Fora do caminho crítico: OCR/IA na ingestão, `auth-service`, Kubernetes, escrita pela Operator API.
- Branch canônica: `infra-lab`. Não criar branches, merge, rebase ou force push sem pedido explícito.

## Mapa

| Caminho | Responsabilidade |
| --- | --- |
| `system/apps/operator-web` | Interface Next.js e BFF: autenticação, autorização, leitura e decisão |
| `system/services/operator-api` | Consulta somente leitura ao PostgreSQL |
| `system/automation/n8n` + `scripts/n8n` | Workflows sanitizados, políticas, geradores e testes |
| `system/automation/power-automate` | Snapshots sanitizados dos fluxos, sanitizador e validador (versionados em `ec9bec1`) |
| `system/analytics/powerbi` | Projeto PBIP e gerador |
| `system/infrastructure` | Contratos das listas, execução local; `redis-lab`, `keycloak-poc` e `k8s` são laboratórios ou referência |
| `system/database` | Modelagem PostgreSQL e laboratório Prisma/SQLite, fora do caminho crítico |
| `scripts/` | Utilitários de n8n, infraestrutura local e Kubernetes |
| `system/services/auth-service` | Experimental, fora do MVP |

## Contexto e economia de tokens

- Leia este arquivo e depois apenas o necessário: estado em [docs/STATUS-TECNICO-MVP.md](docs/STATUS-TECNICO-MVP.md),
  guias em [docs/ESTUDOS.md](docs/ESTUDOS.md) e o README do componente afetado.
- Documentos com data no nome, relatórios de fase e as seções históricas dos índices (por exemplo
  `system/apps/operator-web/docs/README.md`) descrevem o estado daquela data; só abra quando a tarefa exigir.
- Não carregue todos os documentos nem repita investigações já documentadas sem motivo novo.
- Prefira buscas e testes focados; amplie conforme o risco. Evite logs extensos e relatórios repetitivos.
- Registre decisões duráveis nos documentos, nunca transcrições de conversa.

## Segurança e dados corporativos

- Nunca versionar credenciais, tokens, tenant/site/list IDs, URLs privadas, e-mails pessoais ou dados reais.
  Arquivos versionados usam marcadores (`*_PLACEHOLDER`); valores reais ficam em `.env.local` ou na cópia do ambiente.
- Exports de n8n, Power Automate e Power BI só entram sanitizados e sem dados de execução.
- Não imprimir segredos em saídas, logs ou relatórios.
- Nunca contornar permissões, auditoria, ETag ou validações para concluir uma tarefa. Na dúvida, falhar com segurança.

## Ambientes corporativos (Microsoft 365, n8n, Power Automate, Power BI)

- Leituras só quando necessárias à tarefa.
- Qualquer escrita, publicação, ativação, importação ou mudança de permissão exige autorização explícita para aquela operação.
- Não alterar workflows ou fluxos publicados; trabalhar em cópias inativas e com dados sintéticos (`HOMOLOG-3P-`).
- Testes locais e mocks não equivalem a homologação.

## Trabalho simultâneo

- Comece com `git status --short`. Arquivos alterados fora do escopo pertencem a outra frente: não editar, reverter,
  formatar nem incluir.
- Use `git add` com caminhos explícitos; nunca `git add .` ou `git add -A`.
- Commit e push somente quando pedidos. Antes de publicar, confira o intervalo `origin/infra-lab..HEAD`.

## Testes e regressões

- Proporcionais à mudança: documentação → links e `git diff --check`; código → testes focados, `typecheck` e `lint`
  do componente; contrato, segurança ou persistência → suíte completa do componente.
- Correção de defeito inclui teste de regressão.
- Artefatos gerados (pontes n8n, PBIP, fluxo de histórico) não são editados à mão: altere o gerador e regenere.
- Comandos: Operator Web `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`;
  n8n `node --test scripts/n8n/*.test.mjs`, `node scripts/n8n/check-policy.mjs` e `node scripts/n8n/validate-workflows.mjs`;
  Power BI `node --test system/analytics/powerbi/gerar-pbip.test.mjs`;
  Power Automate `node --test system/automation/power-automate/scripts/policy.test.mjs` e
  `node system/automation/power-automate/scripts/validate.mjs`.

## Documentação contínua

Após mudanças relevantes, avalie se é preciso atualizar:

- **README** — visão do produto, arquitetura ou forma de execução.
- **docs/STATUS-TECNICO-MVP.md** — entrega, homologação, bloqueio ou mudança de estado, com data e evidência.
- **Estudo do componente** — aprendizado, decisão técnica ou lacuna relevante.
- **Guia de manutenção** — procedimento recorrente, correção estrutural ou risco operacional.

Considere também correções e regressões, segurança e permissões, dependências e compatibilidade, qualidade e
continuidade operacional. Não faça auditorias globais nem atualize todos os documentos a cada pequena alteração.

## Conclusão e comunicação

- Uma tarefa está concluída quando o pedido foi atendido, as verificações proporcionais passaram e os documentos
  afetados estão coerentes.
- Use os estados: implementado, testado localmente, exercitado no ambiente real, homologado, planejado.
- Responda de forma objetiva: resultado, evidências (comandos e saídas resumidas), riscos e próxima ação.
- Informe o que não foi executado ou verificado. Não afirme resultados sem evidência.
