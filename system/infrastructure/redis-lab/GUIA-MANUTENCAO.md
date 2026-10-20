# Redis — estudo, manutenção e operação

Revisão: 19/10/2026. Escopo exclusivo: laboratório Redis e contrato do Operator Web.

Rodada abrangente: Engine disponível, R1 revalidada, nove verificações de recuperação
fictícia isolada PASS. Imagem ativa preservada. Lockfile/npm ci e contexto restrito
foram construídos em candidato, sem deploy. Recuperação principal permanece
pendente. Consulte o [plano atual](../../../docs/PLANO-CONTINUIDADE-2026-10-19.md).
Leia o [README](README.md) para os comandos completos dos testes.

## Arquitetura e confiança

```text
Operator Web / securityCommand
  -> HTTPS + Bearer -> Caddy (CA interna)
  -> HTTP privado -> gateway / createHandler
  -> TCP privado -> Redis / volume AOF
```

A porta publicada é loopback; containers da rede application também alcançam
Caddy. O Bearer permite todas as operações da whitelist, sem autorização por
usuário/tenant no gateway: autorização de domínio continua no BFF. Acesso direto
à rede Redis ou comprometimento do gateway pode contornar a whitelist. Rede
interna não substitui ACL e TLS. Este desenho permanece exclusivo de laboratório.

## Roteiro de leitura

| Ordem | Arquivo | Responsabilidade |
| --- | --- | --- |
| 1 | [commands.mjs](gateway/commands.mjs) | Função pura de validação; comandos, namespaces, UUID, TTL e Lua exato. |
| 2 | [handler.mjs](gateway/handler.mjs) | Autenticação, leitura limitada do corpo, validação e resposta HTTP. |
| 3 | [server.mjs](gateway/server.mjs) | Conexão Redis, limites de fila, inicialização e timeouts. |
| 4 | [store.ts](../../apps/operator-web/src/server/security/store.ts) | Transporte HTTPS do BFF; memória somente em desenvolvimento/teste. |
| 5 | [scripts.ts](../../apps/operator-web/src/server/security/scripts.ts) | Lua compartilhado pelo domínio e verificado por contrato. |
| 6 | [item-correction-service.ts](../../apps/operator-web/src/server/sharepoint/item-correction-service.ts) | Intenção, confirmação, reconciliação e liberação da trava. |
| 7 | [gateway.test.mjs](gateway/gateway.test.mjs) | Testes positivos/negativos e integração real opt-in. |
| 8 | [compose.yaml](compose.yaml), [compose.gateway.yaml](compose.gateway.yaml) | Volume, redes, credenciais e isolamento do processo. |

## Invariantes para manutenção

- SET NX retorna OK ao criar e null quando a chave já existe.
- CAS compara UUID e remove atomicamente: 1 significa liberação pelo dono;
  0 significa ausente ou outro dono. Não converter strings em confirmação.
- Lua exige igualdade exata de bytes. Alterar texto requer revisar BFF, gateway
  e testes de contrato; nunca aceitar scripts arbitrários por conveniência.
- Locks/evidências de correção não expiram. Timeout exige reconciliar pelo mesmo
  operationId; não gerar novo UUID nem excluir lock manualmente para desbloquear.
- Sessões expiram; rate limit incrementa e define TTL no mesmo Lua.
- O timeout da Promise não cancela uma escrita já recebida pelo Redis. 503 não
  demonstra ausência de mutação; não adicionar retry automático de escrita.
- Memória local não oferece durabilidade ou compartilhamento entre processos.
- Redis e SharePoint não formam uma transação atômica.

Mantenha validação em commands, transporte em handler e conexão em server.
Ao alterar operação, atualize contrato, testes positivos/negativos e documentação
na mesma entrega. Comentários devem explicar motivos e invariantes, não narrar
cada instrução. Testes simulados não substituem homologação do serviço ativo.

## Diagnóstico

Na raiz do repositório:

```powershell
docker info --format '{{.ServerVersion}}'
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'
node --test system/infrastructure/redis-lab/gateway/gateway.test.mjs
```

Com Engine e containers disponíveis, execute o validador Windows do README com
UseContainerCredential e relatório externo. O validador executa testes que criam
chaves fictícias e limpam somente as chaves exatas: não é exclusivamente leitura.
Não publicar inspect completo: Config.Env pode conter token. Nunca registrar
cookies, payloads de sessão, tokens ou chave privada.

| Sintoma | Investigar | Conduta |
| --- | --- | --- |
| Engine indisponível | Docker Desktop e contexto do Engine | Recuperar acesso sem recriar volumes ou inferir perda de dados. |
| 401 | Configuração do token | Corrigir fonte secreta sem imprimir valor; rotação coordenada BFF/gateway. |
| TLS inválido | CA, validade, SNI/hostname, relógio | Corrigir confiança; nunca desabilitar validação TLS. |
| CAS retorna 400 | Lua e versão da imagem ativa | Comparar com candidato; não flexibilizar whitelist. |
| 503 | Saúde Redis, memória, AOF/disco, latência | Preservar UUID e reconciliar; não repetir escrita cegamente. |
| Lock persistente | Intenção, outcome e estado remoto | Reconciliar; não adicionar TTL nem DEL para desbloquear. |

## Plano priorizado e critérios de aceite

1. **Manter visibilidade do laboratório.** A indisponibilidade inicial de 19/10
   foi superada na R1; Engine e inventário foram novamente verificados na varredura.
2. **Atualização gateway: R1 concluída.** Em futuras janelas autorizadas, preservar imagem anterior, fontes,
   Compose efetivo e volume; substituir somente gateway. Não usar down -v.
   Aceite: healthcheck, HTTPS autenticado, rejeições e CAS no serviço ativo.
   Em falha, suspender correções e restaurar imagem compatível preservando dados.
   A imagem antiga conhecida rejeita CAS: rollback não libera correções humanas.
3. **Homologar recuperação.** Após smoke aprovado e autorização de reinício,
   usar AuthorizeRedisRestart; exigir marcador preservado e recuperação HTTPS.
   Registrar versão de imagem, horário e relatório sanitizado.
4. **Homologar backup/restauração.** Definir responsável e RPO/RTO; procedimento
   compatível com AOF multipart e reescrita; cópia criptografada fora do host,
   acesso restrito e restauração em ambiente isolado. Não copiar ingenuamente
   arquivos AOF ativos nem restaurar sobre o volume original. Medir recuperação.
5. **Dimensionar e endurecer antes de uso além do lab.** Medir memória, carga e
   crescimento sem TTL; definir maxmemory e limites de container com margem para
   reescrita/AOF. Implementar ACL mínima e TLS interno com testes negativos, sem
   conceder CONFIG/FLUSH ao gateway. Testar as permissões necessárias ao Lua.
6. **Reproduzir builds e observar operação.** Lockfile/npm ci foram preparados
   e construídos sem atualizar a imagem ativa; revisar antes de implantar.
   Registrar digests e avaliar dependências. Monitorar e
   monitorar latência, 400/401/503, memória, disco, persistência e locks pendentes
   sem conteúdo sensível. Definir retenção formal da auditoria.

AOF não substitui backup ou trilha imutável. noeviction evita remoção automática
quando o limite é atingido, mas pode recusar escritas; não define capacidade por si.
Não há liberação de produção ou escrita SharePoint nesta revisão.

## Referências oficiais consultadas em 19/10/2026

- [Segurança, ACL e TLS](https://redis.io/docs/latest/operate/oss_and_stack/management/security/)
- [Persistência e backup](https://redis.io/docs/latest/management/persistence/)
- [Memória e noeviction](https://redis.io/docs/latest/develop/reference/eviction/)

As prioridades são avaliação do código local; não constituem pentest, varredura
de CVEs ou certificação de segurança.
