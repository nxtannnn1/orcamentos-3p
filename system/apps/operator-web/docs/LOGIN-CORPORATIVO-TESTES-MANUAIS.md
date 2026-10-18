# Homologação pessoal — entrada corporativa única

Responsável: __________________ Data: __________ Ambiente: _______________

Somente o responsável executa o login e preenche resultados. Para cada cenário,
selecionar APROVADO / REPROVADO / BLOQUEADO / NÃO EXECUTADO. Todos começam NÃO EXECUTADO.
Não marcar como aprovado um cenário impedido por pré-requisito ausente.

## Pré-requisitos comuns e limite atual

- Ambiente isolado com dados fictícios, sem escrita SharePoint/Graph/banco real.
- Portal local http://127.0.0.1:13300 e Keycloak local disponíveis.
- Configuração corporativa externa da proposta LOGIN-CORPORATIVO.md previamente
  autorizada e homologada: client flow, nota server-owned, tenant, membros,
  concessões explícitas de client roles e MFA. NÃO foi aplicada nesta entrega.
- Só após isso, habilitar no processo autorizado do portal:
  AUTH_CORPORATE_LOGIN_ENABLED=true e KEYCLOAK_CORPORATE_IDP_ALIAS=oidc,
  mantendo KEYCLOAK_ENABLED=true, AUTH_DISABLED=false e bypasses false.
- Reutilizar segredo de sessão e credenciais existentes, sem copiá-los para
  terminal, evidências, screenshots ou conversa. Não alterar arquivos Entra/Keycloak
  nem preparar contas novas sem autorização separada.
- Conta de teste corporativa autorizada e com papel explícito do client
  3p-operator-web; conta sem papel e usuário local fictício poc-ficticio existentes.
- O modo permanece desligado no processo existente. Sem o mapper de origem,
  habilitá-lo recusará novos logins do broker com CORPORATE_ACCOUNT_REQUIRED.
  Isso é a recusa por padrão esperada, não licença para remover a validação.

Evidência segura: horário, caminho sem query de callback, resultado, status HTTP
e captura com dados fictícios. Nunca coletar URL completa de callback, token,
cookie, cabeçalhos de autenticação, senha ou exportação integral do Network.

## MC-01 — Uma entrada corporativa e login Microsoft via Keycloak

Pré-requisitos: todos os comuns, com a proposta externa efetivamente aprovada.

1. Abra janela privativa em /login e confira um único botão **Entrar com conta corporativa**.
2. Clique; confira que passa pelo Keycloak e segue para a Microsoft corporativa,
   sem pedir escolha de provedor ou senha em formulário do Operator Web.
3. Faça pessoalmente o login e o MFA exigido pela política corporativa.
4. Confirme retorno ao portal, identidade e papel corretos. Nenhuma escrita real.

Esperado: acesso permitido somente à conta autorizada. Sem mapper/política,
registrar BLOQUEADO, sem substituir o teste por login local do Keycloak.
Evidência: tela final sem segredos e resultado do MFA observado.
Resultado: NÃO EXECUTADO. Observações: __________________

## MC-02 — Navegação, atualização e guard de sessão

Pré-requisitos: MC-01 e dados fictícios de mock.

1. Abra fila inicial, orçamento fictício e comparação de preços, se disponível.
2. Use navegação do portal, voltar/avançar e atualizar em cada página.
3. Confirme que permanece com a mesma identidade e permissões de leitura.
4. Em outra janela privativa independente, tente uma URL protegida sem autenticar.

Esperado: navegação autenticada funciona; janela anônima vai ao login e APIs
retornam 401. Nenhum dado sensível de autenticação deve aparecer em localStorage.
Evidência: caminhos/horários/status, sem valores de armazenamento do navegador.
Resultado: NÃO EXECUTADO. Observações: __________________

## MC-03 — Logout em duas abas sem concluir confirmação

Pré-requisitos: MC-01; duas abas duplicadas no MESMO perfil do navegador.

1. Duplique uma aba autenticada e confirme leitura em ambas.
2. Na primeira, clique Sair. Pare na confirmação do Keycloak, sem confirmá-la.
3. Atualize a segunda aba ou consulte uma API protegida.
4. Volte à primeira aba; não interprete cancelar a confirmação como restaurar sessão.

Esperado: a segunda aba perde a sessão local após atualizar (página vai ao login,
API 401). Conteúdo já renderizado pode permanecer visível até nova requisição.
Isso comprova logout LOCAL antecipado; não comprova logout SSO Keycloak/Microsoft.
Evidência: horário do clique, confirmação pendente e status da outra aba.
Resultado: NÃO EXECUTADO. Observações: __________________

## MC-04 — Conclusão SSO e limites do logout federado

Pré-requisitos: MC-01 e uma nova sessão corporativa válida após MC-03.

1. Clique Sair e conclua a confirmação Keycloak.
2. Confirme retorno ao /login e que página/API do portal não aceitam sessão antiga.
3. Inicie novo login e registre se o Keycloak/Microsoft reutiliza SSO ou pede entrada.
4. Só declare a sessão Microsoft encerrada se houver evidência específica do
   provedor em ambiente autorizado. Redirecionar para uma logoutUrl não basta.

Esperado garantido pelo portal: sessão local revogada. Resultado SSO Keycloak e
Microsoft deve ser anotado separadamente. Reentrada automática pode significar
SSO upstream ainda ativo; não implica restauração da sessão JWE revogada.
Evidência: resultado local, Keycloak e Microsoft separados, sem tokens/URLs sensíveis.
Resultado local: NÃO EXECUTADO. SSO Keycloak: NÃO EXECUTADO. SSO Microsoft: NÃO EXECUTADO.
Observações: __________________

## MC-05 — Usuários não autorizados e tentativa de contornar o hint

Pré-requisitos: somente contas fictícias aprovadas, já existentes, e fluxo externo
configurado para rejeitar acessos fora da política. Não criar convidados reais.

1. Tente usuário Microsoft de teste do tenant sem client role: deve recusar acesso.
2. Tente poc-ficticio ou outro usuário local de teste no contexto corporativo.
   Mesmo que a tela nativa seja alcançada alterando o hint, não deve entrar no portal.
3. Teste usuário de outro tenant e convidado apenas se já houver contas de teste
   autorizadas. Registre BLOQUEADO se elas não estiverem disponíveis.
4. Confira que não há concessão por email/domínio, nem role atribuída automaticamente.

Esperado: sem papel, ROLE_REQUIRED; sem origem corporativa, CORPORATE_ACCOUNT_REQUIRED
ou bloqueio anterior do Keycloak; convidados/outro tenant recusados pela política.
Uma recusa anterior não comprova uma validação posterior que não foi exercitada.
Evidência: cenário/código de recusa, sem identificadores pessoais ou credenciais.
Resultado: NÃO EXECUTADO. Observações por subcenário: __________________

## MC-06 — Ausência de opções duplicadas em toda a interface

Pré-requisitos: modo corporativo habilitado; não precisa concluir login.

1. Abra /login e / sem sessão; a segunda deve encaminhar ao login.
2. Confira tela, cabeçalho, marca e navegação: nenhuma escolha pública entre Microsoft
   e Keycloak, nenhum campo de senha do portal e somente a ação corporativa.
3. Após autenticar, confira que o cabeçalho mostra apenas Sair para encerrar sessão.

Esperado: uma opção pública corporativa. Rotas técnicas legadas continuam existentes,
mas não são apresentadas como botão duplicado nesse modo.
Evidência: capturas das páginas sem dados sensíveis.
Resultado: NÃO EXECUTADO. Observações: __________________

## MC-07 — Compatibilidade Microsoft legada

Pré-requisitos: configuração legada e MFA originais funcionais em ambiente de
homologação autorizado; sessão Microsoft emitida antes da ativação do modo.
Se o tenant não atende ao auth context legado, registrar BLOQUEADO, sem removê-lo.

1. Com a sessão Microsoft antiga, atualize o portal após ativar o modo corporativo.
2. Confira identidade, papéis e acesso; o cabeçalho deve usar logout Microsoft original.
3. Em perfil independente, abra diretamente /api/auth/login e faça login legado
   pessoalmente, com todas as verificações originais. Não há botão público para isso.
4. Execute logout legado e confira a recusa da sessão antiga pelo portal.

Esperado: sessões e rotas preservadas. Habilitar UI corporativa não migra silenciosamente
uma sessão Microsoft para Keycloak nem relaxa a exigência MFA existente.
Evidência: tipo de sessão observado, resultado e horários, sem cookies/tokens.
Resultado: NÃO EXECUTADO. Observações: __________________

## MC-08 — Expiração

Pré-requisitos: sessão corporativa válida e dados fictícios; nenhuma escrita real.

1. Deixe a sessão expirar naturalmente, sem autenticar novamente (máximo de 15
   minutos no portal, podendo ser menor pelo ID token Keycloak).
2. Atualize uma página protegida e consulte uma API protegida.
3. Faça novo login para continuar.

Esperado: sessão expirada rejeitada, página volta ao login e API 401. Não há
renovação silenciosa de JWE pelo portal. Nova sessão SSO pode existir upstream.
Evidência: horários, resultados e status, sem valores de cookie.
Resultado: NÃO EXECUTADO. Observações: __________________

## MC-09 — Recuperação administrativa

Pré-requisitos: operador do ambiente local autorizado e acesso administrativo
Keycloak independente no master; nenhum teste em produção.

1. Confira que o administrador ainda consegue acessar a administração Keycloak
   separada do client do portal, sem usar credenciais de conta de negócio no browser flow.
2. Se for necessário rollback local da interface, desabilite a flag corporativa
   no processo autorizado do portal e reinicie somente esse processo.
3. Confira retorno das opções legadas e que segredo JWE, MFA, papéis e sessões
   Microsoft originais não foram alterados para recuperar acesso.
4. Ao fim, registre a configuração em que deixou o ambiente. Não reative o modo
   corporativo sem os pré-requisitos externos aprovados.

Esperado: caminho de manutenção disponível sem senha própria no portal, sem
AUTH_DISABLED e sem permissões automáticas. Rotas legadas só funcionam quando
suas configurações originais são válidas.
Evidência: resultado de recuperação sem credenciais ou screenshots de segredos.
Resultado: NÃO EXECUTADO. Observações: __________________

## Devolutiva

Informe para cada ID resultado e evidência segura; no MC-04 separe os três tipos
de sessão. A IA investigará falhas antes de propor correções. Nenhum resultado
manual foi aprovado nesta entrega. Não há GO final de modo corporativo/produção.
