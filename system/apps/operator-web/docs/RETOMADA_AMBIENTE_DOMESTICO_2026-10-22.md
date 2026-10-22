# Retomada no computador doméstico — 22/10/2026

Branch canônica: `infra-lab`. Caminhos deste guia são relativos à raiz do repositório, salvo indicação diferente. Nenhuma instalação, serviço Redis, escrita corporativa ou alteração de política foi executada durante a consolidação.

## A. Estado do sistema

- Implementados e testados localmente: correções P0 de identidade/Graph, recuperação segura de correções recusadas, decisão com ETag/auditoria, conferência, comparação por material oficial/unidade e cálculo monetário seguro.
- Demonstração: fila, conferência, decisões mock e comparador com dados fictícios. O estado mock é temporário; não representa persistência corporativa nem economia realizada. A pré-seleção do comparador permanece local à página.
- Identidade: `ExplicitPersonResolver` é um contrato/adaptador isolado, sem seleção na factory. Valida tenant/OID/site/Pessoa, evidência, validade, revogação e duplicidade. A origem corporativa ainda depende de aprovação da TI.
- Desativados: resolvedor real por padrão (`SHAREPOINT_PERSON_RESOLVER=disabled`) e correções reais (`SHAREPOINT_HUMAN_CORRECTIONS_ENABLED=false`). Redis não está configurado neste computador. Não habilitar flags apenas porque os testes passaram.
- Pendentes: sessão humana/MFA, fonte autoritativa de Pessoa, Redis durável, escrita isolada, workflows publicados, envio ao histórico e aceite visual de navegador. `Historico_Precos` não é alimentado pelo comparador.
- Sem alteração de arquitetura: auth-service, Keycloak e PostgreSQL não são pré-requisitos do MVP desta retomada.

## B. Dependências confirmadas no repositório

| Componente | Referência verificável |
| --- | --- |
| Node do portal | 24.16.0 em `.github/workflows/operator-web-ci.yml` |
| Next.js / React | 16.3.8 / 19.2.8 em `system/apps/operator-web/package.json` e lockfile |
| TypeScript / Vitest | 5.9.3 / 4.1.11 resolvidos no lockfile |
| Node do container gateway | `node:22-alpine` em `system/infrastructure/redis-lab/gateway/Dockerfile` |
| Cliente Redis gateway | 5.0.0 em `gateway/package.json` |
| Redis / Caddy | `redis:7.4-alpine` / `caddy:2-alpine` nos Compose do laboratório |
| Docker, Compose e WSL | Não há versão exata fixada pelo projeto; validar compatibilidade na instalação doméstica |

Use Git e npm com o Node do portal e preserve os lockfiles. Use `npm.cmd ci`, não atualize versões durante a retomada. O pretest/postinstall mantém a mitigação de braces; não a desative. Não copie `node_modules`, `.next` ou ambientes corporativos para outra máquina.

### Windows, WSL2 e Docker — somente no computador doméstico

Verifique os requisitos atuais e siga a instalação oficial: [WSL Microsoft](https://learn.microsoft.com/windows/wsl/install) e [Docker Desktop Windows](https://docs.docker.com/desktop/setup/install/windows-install/). A instalação de componentes WSL pode exigir privilégios locais e reinicialização; faça-a somente em máquina sob sua administração. Para esse laboratório, selecione backend WSL2 e containers Linux.

```powershell
# Diagnóstico inicial e posterior à instalação, no computador doméstico
wsl --status
wsl --version
wsl --list --verbose
docker version
docker compose version
```

O cliente Docker instalado não basta: `docker version` deve alcançar o servidor. Verifique virtualização e distribuição WSL2 se o engine não iniciar. Não executar estes procedimentos administrativos no computador corporativo desta entrega.

### Redis compatível com o portal

Reutilize `system/infrastructure/redis-lab/compose.yaml` e `compose.gateway.yaml`, conforme o [README do laboratório](../../../infrastructure/redis-lab/README.md). O portal usa REST HTTPS com Bearer, não conexão direta `redis://`. O gateway aceita somente os comandos e os dois scripts Lua autorizados. A configuração prevista mantém Redis privado e publica Caddy apenas em `127.0.0.1:18443`.

Requisitos: `appendonly yes`, `appendfsync always`, `maxmemory-policy noeviction`, volume persistente, capacidade de disco/memória e ensaios de backup/restauração. Intenções, resultados, evidências e locks não têm TTL; não adicionar expiração para desbloquear operações. AOF/noeviction não garantem recuperação por si só. O Compose é de laboratório (salto interno TCP sem TLS/autenticação Redis), não uma configuração aprovada de produção.

Antes de subir:

1. Escolha um projeto Compose exclusivo e confira que não está apontando para volumes/containers existentes de terceiros.
2. Prepare um arquivo de segredo fora do repositório com `GATEWAY_BEARER_TOKEN`, gerado de forma segura. Configure `THREEP_REDIS_GATEWAY_ENV_FILE` com o caminho desse arquivo, sem expor seu conteúdo.
3. O overlay exige a rede externa `sistema-3p-local_application`. Verifique sua existência; numa máquina nova, crie a rede de laboratório apenas após confirmar que o nome não é de recurso compartilhado. Não suba toda a infraestrutura histórica para obter essa rede.
4. Valide o Compose sem imprimir valores e então inicialize o laboratório:

```powershell
docker compose -p 3p-redis-lab -f system/infrastructure/redis-lab/compose.yaml -f system/infrastructure/redis-lab/compose.gateway.yaml config --quiet
docker compose -p 3p-redis-lab -f system/infrastructure/redis-lab/compose.yaml -f system/infrastructure/redis-lab/compose.gateway.yaml up -d --build
docker compose -p 3p-redis-lab -f system/infrastructure/redis-lab/compose.yaml -f system/infrastructure/redis-lab/compose.gateway.yaml ps
```

Não use `docker compose down -v`, flush ou comandos de limpeza ampla. Os launchers históricos podem depender de nomes/imagens exatos: valide os pré-requisitos no README antes de executá-los.

### Variáveis e certificados

Prepare o ambiente local a partir de `.env.example`, sem sobrescrever arquivo existente. Transfira secrets somente por meio autorizado, fora do Git; obtenha configuração corporativa de homologação com a TI. Nomes relevantes:

- `DATA_SOURCE`, `AUTH_APP_ORIGIN`, `AUTH_SESSION_SECRET`.
- `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `ENTRA_MFA_AUTH_CONTEXT_ID`.
- `SHAREPOINT_SITE_ID`, IDs das listas e `SHAREPOINT_FIELD_MAP_JSON` conforme `.env.example`.
- `SECURITY_REDIS_REST_URL`, `SECURITY_REDIS_REST_TOKEN` para gateway HTTPS autoritativo.
- `SHAREPOINT_PERSON_RESOLVER=disabled` e `SHAREPOINT_HUMAN_CORRECTIONS_ENABLED=false` até homologação.

Configure confiança na CA pública do laboratório via `NODE_EXTRA_CA_CERTS` antes de iniciar Node, conforme o README. Não copie chave privada para o repositório e não use `NODE_TLS_REJECT_UNAUTHORIZED=0`. Não imprima dumps de ambiente, cookies, tokens ou `docker inspect` completo em relatórios. Confirme `git check-ignore system/apps/operator-web/.env.local` antes de versionar.

### Testes opt-in

São testes reais de infraestrutura com Graph/identidade sintéticos; não homologam SharePoint. Não ativar as flags em processos comuns do portal.

- Gateway: `node system/infrastructure/redis-lab/gateway/run-real-tests.mjs`, da raiz, após preparar o laboratório requerido. Executa o candidato contra Redis real e utiliza chaves sintéticas isoladas.
- Portal: `src/server/security/redis-lab.integration.test.ts`, habilitado por `THREEP_REDIS_INTEGRATION=1`; requer Docker/Redis e `THREEP_TEST_TLS_CERT`, `THREEP_TEST_TLS_KEY`, `NODE_EXTRA_CA_CERTS`. Os arquivos TLS devem existir e ser válidos para localhost, fora do Git. Após preparar esses requisitos, no portal:

```powershell
$env:THREEP_REDIS_INTEGRATION = '1'
try {
    npm.cmd test -- src/server/security/redis-lab.integration.test.ts
} finally {
    Remove-Item Env:THREEP_REDIS_INTEGRATION -ErrorAction SilentlyContinue
}
```

- Resiliência: `redis-resilience-http.integration.test.ts` usa `THREEP_RESILIENCE=1` e recursos descartáveis preparados pelo runner `system/infrastructure/redis-lab/run-resilience-e2e.mjs`. Leia seu código/README antes de rodar: exige OpenSSL no caminho Windows nele definido e a imagem local `3p-redis-lab-gateway:r1-20261019`. Em instalação nova, essa imagem pode não existir; prepare a imagem do código revisado e confira a identidade, sem assumir que o `up --build` produz essa tag. Não execute o teste apenas definindo a flag.
- Persistência: `test-operational-persistence.mjs` recebe diretório exclusivo de evidências fora do Git e cria/remove seus próprios recursos. Execute somente com os pré-requisitos do README; não reinicie Redis compartilhado para reproduzi-lo.
- Leitura live SharePoint exige acesso autorizado e configuração própria; `operator-api-live.test.ts` depende de PostgreSQL e continua fora deste MVP. Nem todos os 24 testes ignorados se tornam aplicáveis apenas instalando Redis.

Registre PASS/FAIL/SKIP e os limites de cada ensaio. Preserve relatórios locais sanitizados; não versione certificados, logs brutos ou fixtures com dados corporativos.

## C. Sequência de continuidade do MVP

1. Reproduzir primeiro a demonstração fictícia e a suíte local.
2. Validar Redis REST, TLS, NX, CAS, revogação de sessão, indisponibilidade e recuperação. Executar persistência/backup/restauração em laboratório isolado.
3. Homologar com a TI a fonte de tenant/OID/site/Pessoa. Permissões de lista são fonte parcial; não usar email/nome nem criar concessões para forçar correspondência. O adaptador explícito não está disponível como valor de variável: falta conectar uma fonte autorizada após decisão formal.
4. Validar login humano, perfis, contexto MFA, HTTPS e escopo mínimo Graph.
5. Seguir o §11 do [relatório E2E](RELATORIO_HOMOLOGACAO_E2E_2026-10-22.md), com autorização de escrita isolada. Capturar ETag/original; usar item sintético em orçamento aberto e `Enviado_Historico=NAO`; verificar schema, autoria, UUID e intenção durável antes de PATCH. Campo ausente/vazio não autoriza decisão.
6. Corrigir e reler; decidir e reler; testar conflito de versão, repetição, recusa comprovada e resposta incerta sem retry cego. Auditoria indisponível deve impedir a escrita; uma reversão também exige autorização e novo ETag.
7. Confrontar workflows publicados com os contratos versionados e homologar n8n → SharePoint → conferência → comparação → aprovação → histórico. Na comparação atual, só materiais aprovados entram como equivalentes; sugestões não são aprovação. Não publicar workflows ou alimentar histórico sem autorização.

## D. Comandos de retomada

Em diretório escolhido no computador doméstico, para clone novo:

```powershell
git clone --branch infra-lab --single-branch https://github.com/nxtannnn1/orcamentos-3p.git
Set-Location orcamentos-3p
git branch --show-current
git status --short
```

Em checkout já existente, confira e preserve alterações locais antes de trocar branch ou atualizar:

```powershell
git status --short
git fetch origin infra-lab
git switch infra-lab
git pull --ff-only origin infra-lab
```

Se houver divergência ou mudanças locais incompatíveis, pare e revise; não usar reset destrutivo nem force push.

```powershell
Set-Location system/apps/operator-web
node --version
npm.cmd --version
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
# Demonstração fictícia isolada em loopback, porta 3100:
npm.cmd run dev:demo
```

O launcher de demonstração já existente define mock e bypass estritamente local; isso não autoriza bypass no ambiente corporativo. Para login real, configure o ambiente autorizado e use `npm.cmd run dev`, sem reaproveitar as flags de demonstração. O comando de desenvolvimento permanece ativo até ser encerrado.

Da raiz, em outro terminal:

```powershell
node --test system/infrastructure/redis-lab/gateway/gateway.test.mjs
node --test scripts/n8n/workflow-integrity.test.mjs
node scripts/n8n/validate-workflows.mjs
git diff --check
```

O gateway pode instalar suas dependências com `npm.cmd ci` em `system/infrastructure/redis-lab/gateway` quando necessário para execução fora do container. Não instalar outro serviço de autenticação ou banco para executar esses testes.

## E. Evidências da consolidação

| Verificação em 22/10/2026 | Resultado |
| --- | --- |
| Portal completo | 1.437 aprovados / 24 ignorados |
| Gateway sem Redis real | 37 aprovados / 1 ignorado |
| n8n | 14 aprovados |
| Validador n8n | 0 erros / 22 avisos preexistentes |
| TypeScript, lint, build Next.js | Aprovados, saídas 0 |

Revisão das alterações e dos arquivos novos: correções P0 preservadas; testes presentes; factory/flags continuam bloqueadas; sem dependências, workflows, configuração produtiva ou permissões alterados. Caminhos pessoais foram removidos do relatório de evolução. UUIDs repetitivos e credenciais sintéticas nos testes foram classificados como fixtures; cabeçalhos Bearer usam variável, não segredo literal. A verificação local por padrões e a revisão manual não são certificação de ausência de todo segredo possível; o binário gitleaks não estava instalado e não foi instalado nesta execução. O CI existente mantém sua verificação própria.

`.env.local`, dependências, artefatos de build, backups e ferramentas de auditoria locais não integram o commit. A confirmação de commit/push deve ser obtida da resposta Git e da igualdade de HEAD com `refs/heads/infra-lab` no remoto; este guia não antecipa sucesso de envio.
