# Execução local — MVP SharePoint do Sistema 3P

O caminho principal é **Operator Web → Microsoft Graph → SharePoint Lists**,
com sessão Microsoft Entra e auditoria Redis. PostgreSQL e Operator API são
testes isolados opcionais, sem dependência no fluxo de conferência SharePoint.
Nenhum serviço novo de banco, Redis, proxy ou Microsoft é provisionado aqui.

## Docker

Na raiz do repositório:

```powershell
./scripts/local-infra.ps1 -Action Validate
./scripts/local-infra.ps1 -Action Build
./scripts/local-infra.ps1 -Action Start
./scripts/local-infra.ps1 -Action Status
```

Build e Start atuam somente na Web. Start não exige a rede do PostgreSQL nem
inicia a API. O contexto Docker é fixado em desktop-linux e seu pipe local é
verificado. A Web publica somente `127.0.0.1:3300`; nenhuma porta foi ampliada.
API eventualmente já iniciada continua disponível, sem ser removida pelo helper.

A imagem executa como UID 1000, com autenticação obrigatória, sem capabilities e
sem privilégios. Limites iniciais: 512 MiB, 1 CPU, 128 processos. Logs: 3 × 10 MB.
O healthcheck `/favicon.ico` comprova liveness do servidor, não login, Graph ou
auditoria. **Healthy não significa MVP operacional.**

Copiar `.env.web.example` para `.env.web` somente quando houver configuração
aprovada. O arquivo real é ignorado pelo Git e excluído do build. Nunca copiar
automaticamente `.env.local`: o ambiente de desenvolvimento existente pode
conter flags de bypass e apontar para recursos reais. O Compose impõe
DATA_SOURCE=sharepoint, AUTH_DISABLED=false e ambos os bypasses false.

### HTTPS, callback e sessão

O container atende HTTP interno em 3000; a porta 3300 permite verificar a tela de
login bloqueada e o healthcheck. Para login corporativo no modo production:

1. Preparar terminação HTTPS local aprovada e certificado confiável pelo navegador.
   Nenhum certificado, proxy ou listener adicional foi criado automaticamente.
2. Definir AUTH_APP_ORIGIN como a origem HTTPS exata realmente disponível.
   `https://localhost:3443` no exemplo é uma proposta, não um endpoint existente.
3. A URI de callback deriva exclusivamente de AUTH_APP_ORIGIN:
   `https://HOST:PORTA/api/auth/callback`. Configuração de callback no Entra exige
   autorização externa; alterar só a variável não registra essa URI.
4. Manter tenant/client de login, segredo de sessão estável, contexto MFA efetivo
   e Redis autoritativo aprovados. O segredo de sessão não é regenerado no startup.
5. Os cookies permanecem HttpOnly/SameSite=Lax/Secure e, em HTTPS, usam prefixo
   __Host-. HTTP em production é recusado, inclusive em loopback.

Não confiar em headers de proxy enviados livremente para escolher origem/callback.
Não declarar MFA ativa só porque o claim acrs existe: verificar a política efetiva
e os logs com a TI. Redis indisponível bloqueia sessão/escrita, sem fallback em
produção. Não alterar registro de aplicativo, permissões ou serviços externos.

## Diagnóstico SharePoint

No diretório system/apps/operator-web, com ambiente autorizado:

```powershell
# Somente presença/configuração local; não faz chamadas externas.
node --env-file=.env.local scripts/sharepoint-preflight.mjs
# Leitura de metadados e concessão; não escreve recursos nem testa aprovação.
node --env-file=.env.local scripts/sharepoint-preflight.mjs --live --discover-history
```

O POST permitido nesse diagnóstico é exclusivamente aquisição OAuth; recursos
Graph usam GET. O relatório não inclui tokens, IDs reais ou dados dos registros.
A descoberta opcional do histórico aceita somente um nome exato Historico_Precos,
usa apenas seu ID em memória para ler metadados e não altera configuração local.
Permissão ampla detectada é um bloqueio de escrita, não motivo para removê-la
automaticamente ou pedir concessões maiores sem revisão.

Teste de leitura Graph real, explicitamente opt-in e sem sessão humana:

```powershell
$env:RUN_SHAREPOINT_READ_CHECK = 'true'
node --env-file=.env.local node_modules/vitest/vitest.mjs run scripts/sharepoint-live-read.test.ts
Remove-Item Env:RUN_SHAREPOINT_READ_CHECK
```

Esse teste usa o transporte real GET da aplicação, com leituras paginadas e cache
por execução. Não executa PATCH, auditoria, ensureUser ou operações de decisão.
Relata apenas totais; duas ofertas e persistência continuam sujeitos ao aceite
isolado em docs/homologacao/ROTEIRO-JKL.md. Testes automatizados normais não ativam
esse acesso externo.

## Kubernetes Docker Desktop

O overlay `../k8s/local` contém somente a Web, ConfigMap, Namespace e Service
ClusterIP. O Deployment não depende da API. Secret operator-web-env é apenas
referenciado; não há Secret real versionado ou provisionado nesta entrega.
AUTH_APP_ORIGIN deve ser fornecida nesse Secret com a origem HTTPS aprovada.

```powershell
./scripts/k8s/local-plan.ps1
kubectl --context docker-desktop apply --dry-run=server --validate=strict -k system/infrastructure/k8s/local
```

O planejamento verifica contexto, servidor loopback e node Docker Desktop Ready;
inspeciona recursos e mostra o diff. No Windows, usa o diff.exe já incluído no Git
sem alteração permanente de PATH. Nenhum script aplica workloads automaticamente.

Antes de aplicar, conferir namespace, nomes, labels, Secrets, PVCs, propriedade e
diff. Não adotar objetos sem propriedade comprovada. kube-root-ca.crt é gerenciada
pelo cluster. Inspecionar o dry-run estrito após a criação/revisão do Namespace.
Não alterar pods de default, instalar componentes de sistema ou usar Ingress/
NodePort/LoadBalancer para expor a Web. Acesso de diagnóstico pode usar
port-forward com --address 127.0.0.1 quando houver workload autorizado pronto.

imagePullPolicy=Never exige que a imagem local esteja disponível no runtime do
node. Docker Engine e containerd do cluster podem ter stores diferentes. A imagem
Web não foi encontrada no inventário do kubelet em 16/10/2026; distribuição local
de imagem deve ser preparada sem push externo e sem alterar componentes de sistema.

Sem imagem, Secrets, certificado ou identidade aprovados, manter o workload
preparado; não criar pods deliberadamente incapazes de operar nem provisionar
credenciais reais para forçar um rollout.

## Operator API opcional — fora do caminho SharePoint

```powershell
docker --context desktop-linux compose -f system/infrastructure/local/compose.yml --profile operator-api build operator-api
docker --context desktop-linux compose -f system/infrastructure/local/compose.yml --profile operator-api up -d operator-api
./scripts/local-infra.ps1 -Action Ready
```

Ready é exclusivamente o probe autenticado da API opcional, não o aceite do MVP
SharePoint. O perfil usa a rede externa existente database_default e .env.api;
não cria banco/volume/usuário/schema. DATABASE_NETWORK permite outra rede local.
TLS verify-full permanece obrigatório em production. Nenhuma ampliação PostgreSQL,
migração, correção de exposição ou alteração de volume foi executada nesta etapa.

O volume existente database_postgres_data:/var/lib/postgresql foi preservado.
Não renomear o projeto Compose do banco, executar down -v ou prune de volumes.
PostgreSQL 5432 e auth 8080 já estavam publicados em todas as interfaces; qualquer
recriação/restrição de exposição exige revisão e aprovação prévias.

O helper antigo apply-auth-service-env.ps1 continua desativado porque aplicava
credenciais no contexto corrente/default sem propriedade ou diff. O auth-service
experimental também não é dependência artificial do MVP SharePoint.
