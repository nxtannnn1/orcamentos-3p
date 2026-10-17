# Fase 4 — aceitação pessoal no navegador

Responsável: __________________  Data: __________  Versão testada: __________

Todos os resultados começam **NÃO EXECUTADO**. Somente o responsável pode escolher
APROVADO / REPROVADO / BLOQUEADO / NÃO EXECUTADO. Não interpretar um pré-requisito
ausente como aprovação. As evidências podem ser relatadas com o ID do teste e
resultado, sem tokens, cookies, senhas ou capturas que mostrem credenciais.

## Ambiente e segurança dos testes

Portal isolado: http://127.0.0.1:13300/login, DATA_SOURCE=mock,
AUTH_DISABLED=false, KEYCLOAK_ENABLED=true. Keycloak local: realm 3p-poc,
client 3p-operator-web. Usuário fictício existente: poc-ficticio (Consulta).
Não usar o portal de negócio na porta 3300 para estes testes de escrita.
Não alterar roles/credenciais/usuários automaticamente. Os demais usuários
fictícios dependem de preparação administrativa separada e autorizada.

Os testes positivos de vínculo real TM-04/TM-05 e o fluxo de revogação TM-06
dependem da futura composição autorizada de persistência/fonte/administração.
Essa composição NÃO está disponível nesta entrega local. Não há tela de
vinculação nem banco provisionado. Não substituir esses testes por mock
silenciosamente: registrar BLOQUEADO caso o pré-requisito continue ausente.

Para cada teste, evidência mínima: horário, URL sem query de callback, cenário,
resultado observado e status HTTP quando aplicável. Nunca compartilhar a aba
Network completa, cabeçalhos Authorization/Cookie/Set-Cookie ou corpo de tokens.

## TM-01 — Consulta lê

Pré-requisitos: portal/Keycloak disponíveis e usuário poc-ficticio com Consulta.
Dados: exclusivamente orçamentos fictícios de mock.

1. Abra janela privativa e acesse a URL do portal isolado.
2. Selecione login Keycloak e informe pessoalmente suas credenciais fictícias.
3. Confira a identidade exibida e abra um orçamento fictício.
4. Confira que ações de revisão não estão disponíveis para Consulta.

Esperado: autenticação e leitura permitidas; nenhuma escrita.
Evidência: captura da página autenticada sem dados secretos.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-02 — Consulta tenta aprovar

Pré-requisitos: TM-01 e ID de um item fictício visto no mock.
Usuário: poc-ficticio, Consulta.

1. Confira que não há botão habilitado de aprovação.
2. Opcionalmente, no console do navegador dessa MESMA origem, envie uma tentativa
   de PATCH para `/api/itens/ID_FICTICIO/decisao`, com Content-Type application/json,
   If-Match do item e corpo `{ "action":"APPROVE", "approvedMaterialId":"ID_MATERIAL_FICTICIO", "observation":"Teste fictício" }`.
3. Confira status e releia o item. Não use item/URL de fonte real.

Esperado: HTTP 403 para sessão Consulta; item inalterado.
Evidência: apenas método, caminho e status, sem cabeçalhos secretos.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-03 — Operador sem vínculo

Pré-requisitos: usuário Keycloak fictício com client role Operador, sem vínculo,
e ambiente de homologação isolado com fonte de escrita protegida. O mock genérico
da Fase 3 permite revisão por papel e NÃO comprova este teste de vínculo real.

1. Faça logout e entre pessoalmente com o Operador fictício preparado.
2. Abra item da fonte isolada protegida e tente aprovar.
3. Confira a recusa e a ausência de alteração.

Esperado: recusa de escrita. Enquanto runtime real não ativado, o bloqueio global
permanece; sua evidência não comprova sozinho o diagnóstico específico de vínculo.
Evidência: status, código de recusa e item fictício inalterado.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-04 — Operador vinculado e autorizado

Pré-requisitos: composição real autorizada em ambiente sem dados de negócio,
fonte verificadora confiável, banco separado, Pessoa fictícia existente, vínculo
verificado e concessão APPROVE para aquele site/lista/orçamento/item.

1. Administrador autorizado ativa o vínculo e a concessão com justificativa.
2. Faça novo login pessoalmente como Operador fictício; não reutilize sessão antiga.
3. Aprove item fictício com material válido e versão atual.
4. Releia o item e confira sua Pessoa corporativa, identidade externa, versão do
   vínculo, operação e resultado na auditoria autorizada.

Esperado: operação permitida, estado confirmado e auditoria correlacionada.
Evidência: IDs fictícios da operação/vínculo/revisão e resultado, sem segredos.
Situação atual do pré-requisito: composição não ativada nesta entrega.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-05 — Comprador com concessão específica

Pré-requisitos: os de TM-04, usuário fictício Comprador e concessão explícita
REJECT para item fictício A; nenhuma concessão CORRECT para o mesmo item.

1. Faça login pessoalmente como Comprador fictício em sessão nova.
2. Execute rejeição no item A e confira confirmação/auditoria.
3. Tente corrigir o mesmo item em estado apropriado usando outro cenário fictício,
   sem concessão CORRECT. Não reutilize item concluído para confundir bloqueios.

Esperado: rejeição concedida permitida; correção sem concessão recusada.
Evidência: operações, concessões e status sem credenciais.
Situação atual do pré-requisito: composição não ativada nesta entrega.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-06 — Revogar com sessão aberta

Pré-requisitos: TM-04 e outro item fictício aberto com concessão; administrador
autorizado disponível. Não iniciar chamada Graph antes da revogação neste teste.

1. Mantenha a sessão fictícia aberta após uma leitura autorizada.
2. Administrador revoga o vínculo, informando versão e motivo; aguarde confirmação.
3. Sem sair ou renovar o cookie, tente aprovar o outro item.
4. Confira recusa e ausência de nova escrita. Reativar vínculo não deve conceder
   privilégios à sessão antiga; seria necessário novo login.

Esperado: novas operações recusadas após revogação confirmada. Operações que já
estavam em voo têm tratamento separado e não podem ser declaradas canceladas.
Evidência: horário/versão da revogação e tentativa posterior recusada.
Situação atual do pré-requisito: composição não ativada nesta entrega.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-07 — Mesmo e-mail, identidades distintas

Pré-requisitos: dois usuários fictícios Keycloak com mesmo email e subjects
diferentes, permitindo essa preparação apenas no realm isolado autorizado.
Um possui vínculo/concessão; o outro não. Composição de TM-04 necessária.

1. Entre como primeiro usuário e confira sua identidade/vínculo.
2. Faça logout completo e entre como segundo usuário.
3. Tente a ação concedida somente ao primeiro.
4. Confira nos registros autorizados que issuer/subject são distintos.

Esperado: segundo usuário não herda vínculo/permissões pelo email. Um cenário
adicional com subjects que diferem só em maiúsculas também deve permanecer separado.
Evidência: identificadores fictícios distintos e recusa, sem cookies.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-08 — Microsoft existente

Pré-requisitos: ambiente de homologação autorizado com login Microsoft real já
configurado, conta de teste corporativa e política MFA existente. O portal local
Keycloak não supre essas configurações. Não alterar registros de negócio.

1. Em janela privativa, abra o ambiente Microsoft de homologação autorizado.
2. Execute o login Microsoft e seu MFA pessoalmente.
3. Confira identidade, papel e leitura permitida.
4. Faça logout e confirme que a sessão anterior não continua autenticada.

Esperado: fluxo anterior preservado, sem associação automática ao Keycloak.
Evidência: ambiente, horários e resultado do MFA/login/logout, sem detalhes secretos.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-09 — Logout e replay do cookie

Pré-requisitos: TM-01. Execute apenas no navegador pessoal de teste isolado.

1. Antes de sair, mantenha eventual cópia do cookie de sessão SOMENTE localmente,
   no próprio ambiente de teste; não o envie ao relatório, terminal ou conversa.
2. Use Sair e confirme encerramento no Keycloak, caso solicitado.
3. Tente abrir página protegida: deve voltar ao login.
4. Se souber operar as ferramentas do navegador, restaure o cookie antigo apenas
   nesse perfil isolado e tente ler `/api/orcamentos`; deve retornar 401.
5. Remova a cópia/cookie e feche a janela privativa. Se não executar replay,
   registre essa parte como não executada; logout sozinho não comprova replay.

Esperado: sessão revogada rejeitada, mesmo com cookie antigo ainda não expirado.
Evidência: status 401 e horários, sem valor do cookie.
Resultado: NÃO EXECUTADO. Observações: __________________

## TM-10 — Manipular identificadores

Pré-requisitos: usuário fictício Operador, mock isolado para validar corpo estrito;
para comprovar concessão corporativa por recurso, composição de TM-04.

1. No mock, tente enviar PATCH de decisão incluindo campos extras `oid`,
   `tenantId`, `personLookupId`, `issuer` ou `subject` no corpo.
2. Confira recusa e releia o item. Esses campos nunca definem o ator.
3. No ambiente com vínculo, tente trocar item/orçamento para outro sem concessão,
   mantendo a mesma sessão. O servidor deve resolver o recurso real e recusar.
4. Não manipule tokens nem use recursos reais de negócio.

Esperado: corpo inválido recusado (400), ou 403 se uma barreira anterior impedir
a operação; recurso fora da concessão recusado. O bloqueio anterior não comprova
sozinho a validação posterior: registrar exatamente qual etapa foi exercitada.
Evidência: campos tentados, caminho/status e item inalterado, sem corpo sensível.
Resultado: NÃO EXECUTADO. Observações: __________________

## Devolutiva do responsável

Para cada ID, informe resultado, data/hora, evidência segura e observações.
Falhas devem ser investigadas antes de nova execução. Não há GO final da IA:
todos os cenários obrigatórios precisam da sua homologação, além dos testes
automatizados e das dependências reais autorizadas.
