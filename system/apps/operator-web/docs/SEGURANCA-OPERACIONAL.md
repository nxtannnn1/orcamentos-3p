# Segurança operacional do operator-web

## Controles implementados

- Perfis Consulta, Operador e Comprador leem a fila inteira. Essa é a regra de negócio confirmada; não há segregação por orçamento. Apenas Operador e Comprador decidem.
- Sessões JWE duram no máximo 15 minutos e exigem registro ativo no servidor. Cookies anteriores à mudança deixam de ser aceitos. Logout remove o registro; copiar/reapresentar o cookie antigo não restaura acesso.
- Produção exige Redis REST compartilhado e autoritativo, com HTTPS, sem redirects e com timeout. Sem configuração ou com falha, o acesso é bloqueado. Use um endpoint de escrita/leitura consistente, nunca uma réplica eventual. O fallback de memória existe apenas em development/test; reiniciar o processo invalida essas sessões.
- Cada usuário pode fazer 60 leituras e 20 decisões por minuto, em limites separados e compartilhados entre instâncias. Respostas 429 incluem Retry-After. O limite usa janela fixa; não é substituto de proteção de borda contra tráfego anônimo.
- A fila lê orçamentos e itens uma vez por operação, sem resolver materiais nem repetir listas por orçamento. Paginação é limitada a 100 páginas/50.000 itens e detecta ciclos. Cada chamada Graph tem timeout de 15 segundos e não segue redirects.
- Decisões SharePoint exigem ETag enviado pelo cliente e conferido no servidor; PATCH usa If-Match. Item modificado retorna 409, sem repetir a gravação. Versão ausente retorna 428. Orçamento concluído não recebe novas decisões. Revisões de itens continuam permitidas em orçamento aberto.
- Uma decisão registra intenção no Redis antes do PATCH. Autoria, data UTC e ID da decisão são gravados no mesmo PATCH dos campos de negócio. O resultado de auditoria é confirmado, negado ou não confirmado; intenção sem resultado exige reconciliação pelo ID da decisão no SharePoint. Falha antes de registrar intenção impede o PATCH. Falha depois do PATCH não deve ser interpretada como certeza de que nada foi gravado: recarregar antes de tentar novamente.

## Preparação de produção

Provisionar um gateway Redis REST compatível com a API de comandos JSON, aprovado pela organização, cujas leituras e escritas sejam executadas no Redis primário. A compatibilidade de formato REST não garante consistência: o modo eventual padrão do Upstash não atende ao requisito de revogação imediata entre instâncias; não utilizá-lo sem garantia adicional de leituras autoritativas. Não foi criado nenhum serviço remoto por esta alteração.

Configurar como secrets server-side:

```dotenv
SECURITY_REDIS_REST_URL=https://ENDPOINT-REDIS
SECURITY_REDIS_REST_TOKEN=VALOR-SECRETO
```

As chaves de sessão têm TTL. As versões de revogação por usuário não expiram. Os registros de auditoria não expiram automaticamente e usam SET NX, sem atualização posterior do mesmo registro. Restringir quem tem acesso ao Redis, proteger backups e definir retenção conforme a política da 3P. SET NX protege contra sobrescrita pelo fluxo normal, mas não torna o Redis imutável diante de um administrador ou credencial comprometida; exportação para armazenamento imutável é responsabilidade operacional. A observação é registrada na auditoria somente como SHA-256, evitando duplicação do texto sensível.

O armazenamento em memória não oferece auditoria durável. Por isso, escrita SharePoint também exige Redis configurado em desenvolvimento; apenas testes automatizados com rede simulada dispensam esse requisito. Leituras locais em development continuam funcionando sem Redis.

## Autoria no SharePoint antes de liberar write

Criar/reutilizar três colunas na lista Itens_Importados: identidade do operador (texto), data da decisão (data/hora) e identificador da decisão (texto). Esta alteração não cria colunas e não concede permissões.

Adicionar os nomes internos reais ao objeto `items` do SHAREPOINT_FIELD_MAP_JSON, mantendo os demais campos:

```json
{
  "reviewedByOid": "Revisado_Por_Oid",
  "reviewedAt": "Revisado_Em",
  "decisionId": "Decisao_Id"
}
```

Esses nomes são exemplos, não nomes confirmados no tenant. Não podem colidir entre si nem com campos existentes. Se não estiverem configurados, a escrita falha fechada; a leitura é preservada. Testar ETag, tipos das colunas e concessão restrita de write em ambiente de homologação antes de liberar a operação real. Nenhuma chamada de escrita Graph foi feita na implementação ou nos testes.

## Revogação quando o acesso no Entra muda

O portal não consulta permissões individuais do SharePoint: Graph usa identidade de aplicação. A autorização individual é aplicada pelo BFF.

O Entra não notifica automaticamente este registro de sessões. Ao bloquear conta ou remover/alterar perfil, o administrador deve revogar as sessões do usuário no portal também. Em um terminal confiável no diretório operator-web, com .env.local apontando para o mesmo ambiente/Redis:

```powershell
npm run security:revoke-user -- OBJECT-ID-GUID-DO-USUARIO
```

O comando incrementa a versão do usuário e invalida todas as suas sessões anteriores. Não executá-lo com configuração de outro ambiente. Não há endpoint público de revogação. Novos logins continuam sujeitos à validação de roles e tenant no token Entra. Se não houver integração do processo administrativo com esse comando, mudanças no Entra ainda podem levar até 15 minutos para refletir em sessões existentes. A expiração menor é mitigação, não revogação automática/CAE. Para emergência global, rotacionar AUTH_SESSION_SECRET pelo procedimento aprovado.

## MFA

Em produção, o código exige o contexto acrs configurado. Em desenvolvimento HTTP em loopback, a configuração recebida da branch remota permite contexto ausente; isso não comprova MFA. A garantia de MFA continua dependendo de uma política efetiva de Acesso Condicional vinculada ao contexto, sem exclusões indevidas e fora do modo somente relatório. Conferir os logs de entrada do tenant. Não foi alterada política administrativa pelo projeto.

## Dependências

Next.js e eslint-config-next foram atualizados para 16.3.8. A versão braces 3.0.3 ainda não tem sucessora corrigida no registro consultado. scripts/patch-braces.cjs aplica uma mitigação local para GHSA-vfj7-8cjw-p6xm: limita profundidade do parser e valida iterativamente profundidade/tamanho dos ASTs antes dos walkers recursivos. Aplica no postinstall e no pretest; falha se a versão/fonte upstream mudar inesperadamente. Não instalar com --ignore-scripts sem executar o patch manualmente antes de usar as ferramentas.

A versão original permanece no lockfile e scanners continuarão apontando o advisory. Essa mitigação tem testes de regressão, mas não equivale a uma versão corrigida oficialmente pelo mantenedor. Reavaliar/remover o patch quando houver correção upstream. Não existe caminho de payload HTTP até braces identificado no portal.

Referências: [sessões Entra](https://learn.microsoft.com/en-us/entra/identity/users/users-revoke-access), [ETag no PATCH Graph](https://learn.microsoft.com/en-us/graph/api/listitem-update?view=graph-rest-1.0), [Next.js 16.3.8](https://nextjs.org/blog/september-2026-security-release), [Redis REST](https://upstash.com/docs/redis/features/restapi), [advisory braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## Leitura local de SharePoint sem login

A integração preserva ALLOW_LOCAL_SHAREPOINT_BYPASS=true junto com AUTH_DISABLED=true, DATA_SOURCE=sharepoint, NODE_ENV=development e origem HTTP estritamente em loopback. O modo retorna somente Consulta e bloqueia escrita explicitamente antes do repositório. Não disponibilizar o servidor de desenvolvimento na rede; manter escuta em loopback. Produção rejeita esse bypass.
