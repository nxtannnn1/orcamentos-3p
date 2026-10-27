# Redis Gateway — laboratório Windows

> Laboratório fora do caminho crítico do MVP. O Operator Web usa Redis por protocolo REST compatível com Upstash
> (ver [Status técnico do MVP](../../../docs/STATUS-TECNICO-MVP.md), seção 5). As fases abaixo são registros históricos.
> Os relatórios citados como "não versionado" nunca foram incluídos no Git e não estão disponíveis no repositório.

## Fase 3 — prontidão operacional (20/10/2026)

PARCIAL para prontidão operacional; produção/escrita SharePoint continuam NO-GO. Novo ensaio descartável: 18/18 verificações PASS de reinício, SIGKILL, rewrite e restauração de locks/evidências. Casos negativos comprovaram Redis saudável com volume vazio/backup antigo e perda de cauda AOF com aof-load-truncated=yes; a opção no recusou o mesmo dano no teste. Nenhuma configuração, credencial ou recurso compartilhado foi alterado. O diagnóstico da Fase 2 ainda não está na imagem ativa.

Relatório, runbook, métricas e matriz de homologação: `REDIS-GATEWAY-PRONTIDAO-OPERACIONAL.md` (não versionado).

Ensaio somente em recursos novos: node system/infrastructure/redis-lab/test-operational-persistence.mjs <diretório-exclusivo-de-evidências>. Ele cria e remove seus próprios containers/volumes, sem publicar portas. Não executar os modos históricos de reinício do Redis existente sem autorização específica.

As seções seguintes preservam o histórico; seus comandos/aprovações não substituem o parecer operacional desta fase.

## Fase 2 — resiliência e E2E local (20/10/2026)

GO para integração E2E isolada: 38 testes de gateway com Redis real, 8 de TCP/HTTPS, 19 de HTTP/diagnóstico e 17 cenários no runtime Next real, com identidade/Graph fictícios. Corte TCP, reconexão, indisponibilidade, resposta perdida, UUID concorrente e CAS foram ensaiados sem alterar locks sem TTL. O evento histórico continua sem causa exata comprovável; foi reproduzido timeout causado pelo transporte de teste docker exec sob carga. Produção não homologada.

Relatório, falhas intermediárias, comandos e limitações: `REDIS-GATEWAY-RESILIENCIA-E2E.md` (não versionado).

Runner: node system/infrastructure/redis-lab/run-resilience-e2e.mjs <diretório-de-evidências>. THREEP_BUILD_SNAPSHOT=1 evita tocar em .next da pasta sincronizada. THREEP_NEXT_ONLY=1 e THREEP_NEXT_RUNTIME=1 executam somente a etapa do Next descartável. Nenhum .env existente é copiado para snapshots. Não execute os launchers históricos contra serviços compartilhados para reproduzir esta fase.

## Validação funcional isolada desta continuidade

Nova execução: gateway 36/36 com Redis descartável; integração backend HTTPS/Graph fictício 3/3 na repetição. Parecer geral PARCIAL por lacunas na matriz de falhas e uma ocorrência intermediária de SECURITY_STORE_UNAVAILABLE, preservada no relatório. Nenhum serviço compartilhado foi reiniciado. Produção não autorizada.

Relatório e limitações: `REDIS-GATEWAY-VALIDACAO-FUNCIONAL.md` (não versionado).

## Varredura abrangente de 19/10/2026 — estado mais recente

R1 revalidada: 27 verificações HTTPS PASS; imagem R1 e containers preservados.
Gateway unitário: 31 PASS/1 SKIP. Duas integrações BFF com Redis real e Graph
fictício PASS após renovar fixture TLS, sem tocar nos certificados ativos.

Novo lockfile; Dockerfile usa npm ci; .dockerignore restringe contexto aos arquivos
de runtime. Build candidato PASS, sem atualizar a imagem ativa. npm audit gateway:
zero alertas na consulta. Execução/variáveis do laboratório permanecem as abaixo.

### Recuperação em laboratório separado

```powershell
pwsh -NoProfile -File system/infrastructure/redis-lab/test-isolated-recovery.ps1 `
  -ReportPath C:\CAMINHO-EXTERNO\isolated-recovery.json
```

O diretório de relatório deve existir. O script cria três volumes novos e dois Redis
sem rede, com limites de memória/CPU e dados fictícios. Não monta volume/rede do
Redis existente. Testa reinício e crash somente do temporário, para a origem antes
de copiar AOF/manifesto e restaura em outro volume. Nove verificações PASS.
Não homologa recuperação do Redis principal nem perda de host/disco.

Containers novos ficam parados e volumes são retidos como evidência, sem remoção
automática. Inventariar artefatos para evitar acúmulo. A primeira versão do harness
foi corrigida antes do ensaio válido para não sombrear o executável Docker com
função homônima. Nenhum recurso existente foi alterado nesse ajuste.

Relatório, continuidade e estudo citados nesta rodada (`RELATORIO-VARREDURA-2026-10-19.md`,
`PLANO-CONTINUIDADE-2026-10-19.md`, `ROTEIRO-ESTUDO-SISTEMA-3P.md`) não foram versionados.
Estudo vigente: [Redis: estudo e manutenção](GUIA-MANUTENCAO.md).
As seções seguintes mantêm R1 e histórico; produção continua não autorizada.

## R1 — APROVADA em 19/10/2026, 19:40 -03

O Engine voltou a responder antes desta retomada. Foi preservada a imagem anterior
e recriado **somente o gateway**, agora em `3p-redis-lab-gateway:r1-20261019`, digest
`sha256:2ca06aa6173dfbfc7c9ce666cca15a2e6de52133406bfef73446ce2bd30babd1`.
Healthcheck saudável e 27 verificações PASS pelo HTTPS publicado no loopback
Windows, incluindo autenticação, NX, CAS, TTL, concorrência e idempotência.
Redis/Caddy e demais containers mantiveram IDs, imagens e horários de início;
volume Redis preservado, AOF always/noeviction e estado de escrita AOF ok.

Reproduzir o smoke **a partir do Windows**, na raiz do repositório:

```powershell
node system/infrastructure/redis-lab/gateway/run-loopback-smoke.mjs
```

O launcher verifica identidade/publicação dos containers, lê o token de runtime
somente em memória e obtém apenas a CA pública; não cria arquivo de segredo.
Executa o smoke existente contra `https://localhost:18443/` com validação TLS
ativa. Somente chaves fictícias isoladas são criadas e removidas. Não aceita fases
de persistência/reinício. O token não entra em argumentos nem nos resultados.

A atualização usou os dois Compose existentes e overlay temporário externo,
com env_file resetado e token passado por variável de processo, sem alterar a
fonte original de credenciais. A imagem anterior está preservada em
`3p-redis-lab-gateway:r1-rollback-20261019`. Uma futura recriação pelo Compose base
continua exigindo a fonte segura THREEP_REDIS_GATEWAY_ENV_FILE do laboratório.

R1 não libera produção ou escrita SharePoint. Recuperação após reinício Redis,
backup/restauração e endurecimento interno continuam fora deste aceite (R2/R3).
As seções históricas abaixo registram os estados anteriores à ativação.

## Histórico — primeira tentativa R1 em 19/10/2026

**BLOQUEADA antes do inventário/build.** Docker Desktop foi iniciado, mas encerrou
com erro de acesso ao socket local `sailor-ingest.sock` na inicialização do backend.
Renomeação reversível sem elevação também foi negada. Engine permaneceu
indisponível; nenhuma imagem/container/volume foi alterado por esta execução.
HTTPS/CAS no loopback Windows não foram executados. Recuperar Docker localmente
antes de retomar R1; testes anteriores não constituem aceite desta tentativa.

## Escopo e estado em 18/10/2026

Código desenvolvido sobre o checkout real de `nxtannnn1/orcamentos-3p`, branch
`infra-lab`, HEAD `9e88cfa04071194fdabbc2ac3d80d37b25d03fc6`, igual ao GitHub
na consulta `git ls-remote`. Este diretório já existia localmente, não rastreado.
Backup dos seus arquivos anteriores foi preservado fora do repositório.
Nenhum commit, push, build de imagem, deploy ou reinício foi executado.

Os arquivos de continuidade citados na conversa não foram encontrados nas pastas
pesquisadas (Documents, OneDrive/Documentos, Desktop e Anexos). O smoke test e o
validador desta entrega são implementações novas, não cópias de arquivos ausentes.
O ajuste preexistente `Referrer-Policy: same-origin` foi preservado.

**Estado: PARCIAL.** O candidato corrigido foi testado com Redis real. O gateway
ativo ainda executa o código anterior: TLS/autenticação passam, CAS é rejeitado.
Não confundir a execução temporária do candidato com atualização do serviço.

## Causa e correção

O Operator Web envia `EVAL` com os bytes de `RELEASE_CORRECTION_LOCK`, mas o gateway
anterior aceitava somente o Lua de rate limit. A memória de desenvolvimento do
Operator Web também não implementava o CAS, embora os mocks de correção o fizessem.

`gateway/commands.mjs` permite exatamente dois scripts Lua, sem normalização,
comentários extras, EVALSHA ou scripts enviados livremente. O CAS compara o UUID
e remove a chave na mesma execução Redis: proprietário incorreto retorna 0;
proprietário correto retorna 1; repetição retorna 0 e não remove um novo dono.
Uma string UUID v4, um único KEYS e uma chave
`3p:correction:<sha256>:item:<id-positivo>:pending` são obrigatórios.
Chaves de operação de correção também validam UUID v4 e sufixos conhecidos.

Os comandos aceitos são GET, SET NX (com EX quando permitido), DEL/INCR fora dos
namespaces duráveis e os dois EVAL exatos. FLUSH*, CONFIG, KEYS, SCAN, scripts
arbitrários, sobrescrita e exclusão direta de locks/auditoria são rejeitados.
TTL deve ser inteiro entre 1 e 86400 segundos; no rate limit, no máximo 3600.
O contrato atual de sessão usa até 900 segundos. Corpo: 64 KiB; chave: 512 caracteres;
valor SET: até 60000 bytes. IDs/campos do payload de auditoria continuam sendo
validados pelo serviço de domínio, não interpretados pelo gateway.

Locks de correção e evidências **não expiram**: liberar automaticamente um lock de
resultado incerto permitiria outra correção sem reconciliação. A expiração é testada
nas sessões; não adicionar TTL aos locks para desbloquear uma operação pendente.
O gateway exige token, compara em tempo constante, não registra comandos/segredos,
limita espera Redis a 3 segundos e retorna 503 sem repetir mutações. O cliente Redis
desabilita fila offline, limita fila a 128 e usa connect timeout de 2 segundos.
Timeout não prova que a escrita não ocorreu; reler/reconciliar pelo mesmo UUID.
O Operator Web mantém HTTPS, timeout de 5 segundos, redirects bloqueados e falha
fechada. A confirmação CAS deve ser numérica 0 ou 1; outros resultados ficam incertos.

## Infraestrutura preservada

Serviços existentes: `3p-redis-lab-redis-1`, `3p-redis-lab-gateway-1` e
`3p-redis-lab-caddy-1`. Redis 7.4, volume `3p-redis-lab_redis_data`, rede interna
`3p-redis-lab_redis_private`, sem porta Redis publicada. Caddy publica somente
`127.0.0.1:18443`, TLS de CA interna e integração com a rede application já existente.
Redis real confirmou `appendonly=yes`, `appendfsync=always`, `maxmemory-policy=noeviction`.
O candidato adiciona healthcheck autenticado do gateway com leitura Redis.
Na inspeção de 18/10, gateway ativo e Caddy não tinham healthcheck Docker.
Após a R1, o gateway tem healthcheck saudável; Caddy continua verificado pelo HTTPS.

Esta configuração é **exclusivamente de laboratório**. A ligação gateway→Redis é
TCP interno sem TLS/senha Redis; o gateway autentica Bearer e Caddy termina TLS.
Redis usa protected-mode=no na rede interna. Não é prova de criptografia em todos
os saltos ou configuração adequada à produção. Não existem limites explícitos de
memória/CPU neste Compose; noeviction pode recusar gravações quando recursos se
esgotarem. Não foi criada outra instância Redis nem alterada infraestrutura externa.

## Testes reproduzíveis

Na raiz do repositório:

```powershell
node --test system/infrastructure/redis-lab/gateway/gateway.test.mjs
node system/infrastructure/redis-lab/gateway/run-real-tests.mjs
pwsh -NoProfile -File system/infrastructure/redis-lab/validate-redis-windows.ps1 `
  -UseContainerCredential -ReportPath C:\CAMINHO-EXTERNO\redis-report.json
```

O segundo comando envia o código candidato pela entrada padrão de um processo
Node temporário dentro do gateway existente. Usa o pacote redis já instalado e o
Redis real; não grava arquivos no container nem substitui seu processo principal.
Os testes verificam autenticação HTTP, NX, CAS incorreto/correto, nova aquisição,
16 concorrentes, expiração real, auditoria NX e rate limit. As falhas de
indisponibilidade/timeout/recuperação do handler usam injeção controlada do cliente;
não são falhas reais de rede/Redis nem reinicialização homologada.
A limpeza usa somente as quatro chaves aleatórias exatas criadas pelo ensaio,
via conexão privilegiada de laboratório. Nunca usa flush ou varredura do banco.

O validador Windows verifica Engine, identidade dos containers, healthchecks,
volume/rede, persistência, sintaxe, candidato e HTTPS do gateway ativo. O modo
`-UseContainerCredential` usa o token que já está no processo do gateway, dentro
do container; não exporta nem imprime a credencial. A CA pública vem do Caddy.
O smoke preserva SNI/Host redis-lab-caddy e resolve caddy na rede privada.
Alternativa: `-GatewayEnvFile C:\SEGREDOS\gateway.env -CaFile C:\CERTS\root.crt`.
O arquivo de segredo deve conter `GATEWAY_BEARER_TOKEN`; não copiá-lo ao Git/pacote.
Nunca usar NODE_TLS_REJECT_UNAUTHORIZED=0 ou certificado não verificado.
O preflight CAS usa chave vazia antes de criar locks: gateway antigo falha sem
deixar trava de teste. Resultados são PASS/FAIL/SKIP; saídas 0=PASS, 1=FAIL,
2=PARTIAL por verificações ignoradas. Ver o relatório, não apenas o código de saída.

### Operator Web com Redis real e Graph simulado

`src/server/security/redis-lab.integration.test.ts` é opt-in com
`THREEP_REDIS_INTEGRATION=1`. Exige `THREEP_TEST_TLS_CERT`, `THREEP_TEST_TLS_KEY` e
`NODE_EXTRA_CA_CERTS` definidos antes de iniciar Node, com certificado válido para
localhost. Executar no diretório Operator Web:

```powershell
npm exec vitest run src/server/security/redis-lab.integration.test.ts
```

O teste inicia o handler candidato num servidor HTTPS temporário em loopback e porta
aleatória, exercita securityCommand real e usa docker redis-cli como ponte para o
Redis privado, sem publicar porta. O outro ensaio do gateway exercita o cliente
node-redis real. Graph/Pessoa/schema são fixtures, e somente eles são simulados
neste teste de integração. Cobertura: sessão ativa, revogação, TTL, perda de resposta
após PATCH simulado, reconciliação, CAS, repetição sem novo PATCH e UUID conflitante.
As chaves observadas, de namespace aleatório exclusivo, são removidas diretamente
após o teste. A chave TLS temporária não faz parte do pacote.

### Recuperação e persistência — pendentes

Somente após autorização explícita para reinício e gateway corrigido ativo:

```powershell
pwsh -NoProfile -File system/infrastructure/redis-lab/validate-redis-windows.ps1 `
  -UseContainerCredential -AuthorizeRedisRestart `
  -ReportPath C:\CAMINHO-EXTERNO\redis-restart-report.json
```

Este modo só prossegue se os pré-requisitos passarem, grava marcador aleatório,
reinicia apenas o container Redis existente, preserva o volume, aguarda recuperação,
confere o marcador via HTTPS e remove apenas essa chave. NÃO foi executado nesta
entrega. Não testa perda da máquina, corrupção, restauração de backup ou failover.
Uma falha ambígua pode deixar o marcador; o processo não apaga chaves por padrão.

## Durabilidade e aceite

AOF always melhora a durabilidade, mas não comprova retenção, integridade imutável,
backup/restauração nem proteção contra perda do disco/volume. Redis é auditoria
operacional, não trilha definitiva de conformidade. NX não protege de um administrador
ou da conexão Redis privilegiada. Redis e SharePoint não são transação atômica.

Aceite operacional exige: candidato implantado por ação autorizada; smoke HTTPS/CAS
aprovado no gateway ativo; testes reais de contratos aprovados; healthcheck gateway;
persistência após reinício e recuperação controlada aprovadas; procedimento de backup
e restauração definido. Até lá, PARCIAL, sem liberação de produção ou escrita SharePoint.
As flags e credenciais do Operator Web não foram alteradas. Ver também o relatório
de execução entregue junto do pacote para contagens e limitações de lint/build.

## Revisão Redis — 19/10/2026

O Docker Desktop Engine estava indisponível nesta revisão; o estado atual do
serviço não foi confirmado. A indicação anterior de gateway antigo é histórica
(18/10). Nesta execução: 31 testes do gateway PASS, 1 integração real SKIP.
Consulte o [guia de manutenção](GUIA-MANUTENCAO.md) para roteiro de estudo,
contratos, diagnóstico, riscos e próximos passos com critérios de aceite.
