# Etapa M — correção humana auditável

Continuação funcional: [justificativa obrigatória e reabertura condicionada](FASE-M-REGRAS-FUNCIONAIS.md). Responsavel_Decisao foi adotado como candidato conforme orientação; rejeição exige 10–2.000 caracteres.

Atualização de 20/10/2026: [diagnóstico, metadados reais e regressão da Fase M](FASE-M-2026-10-20.md). As colunas candidatas abaixo foram observadas por GET; escrita real e a equivalência de Aprovador continuam pendentes. O registro de 16/10 a seguir é histórico.

## Estado local em 16/10/2026

A Etapa M está implementada e validada localmente no `operator-web`, com Graph,
Redis e SharePoint simulados nos testes. Ela não está homologada no tenant real e
permanece desabilitada por padrão. Nenhum fluxo Power Automate, lista, coluna,
permissão, credencial ou serviço corporativo foi alterado nesta etapa.

O caminho continua sendo o BFF existente → repositório SharePoint → Microsoft
Graph. A correção não cria outro mecanismo de persistência e não utiliza Operator
API, PostgreSQL, Docker, auth-service ou Redis local como novas dependências.

## Contrato e controles implementados

- Somente descrição, quantidade, unidade, preço unitário, preço total, fornecedor,
  material oficial e observação podem ser corrigidos. Campos extras, inclusive
  autoria fornecida pelo navegador, são recusados.
- Quantidade e preços trafegam como decimais textuais validados e são serializados
  sem cálculo binário intermediário. Quantidade deve ser positiva; preço zero é
  preservado. Diferença entre quantidade × unitário e total exige reconhecimento
  explícito e justificativa, sem recalcular o valor comercial.
- A primeira correção captura a extração original uma única vez, com hash, versão,
  valores e nomes físicos já mapeados. Correções seguintes preservam essa evidência
  e registram valor original, anterior e posterior para cada campo alterado.
- O operador vem exclusivamente da sessão autenticada (`tenantId` + `oid`) e é
  resolvido para uma Pessoa única do site. O registro inclui instante UTC, UUID,
  ETag anterior, item, orçamento, justificativa, identidade e encadeamento com a
  correção anterior.
- A correção grava o item como `EM_REVISAO`, limpa eventual material aprovado e
  não aprova nem rejeita. A decisão posterior continua no endpoint e no contrato
  já existentes, que conferem a integridade da correção antes de gravar.
- ETag, orçamento aberto, item não enviado ao histórico, material existente,
  schema físico, permissão Graph mínima e auditoria durável são verificados no
  backend. A interface não habilita escrita quando a configuração está bloqueada.
- O UUID torna repetição idempotente. Conteúdo divergente com o mesmo UUID,
  concorrência, operação pendente e resultado incerto são bloqueados. Após PATCH,
  o serviço relê o item e exige reconciliação durável antes de liberar decisão ou
  nova correção.

## Contrato físico proposto, não homologado

O código espera três campos de texto em `Itens_Importados`:
`Extracao_Original_JSON`, `Correcao_Humana_JSON` e `Correcao_Operacao_Id`. Os dois
primeiros devem ser texto simples multilinha; o último, texto simples de uma linha.
Esses nomes são um contrato candidato da implementação local, não evidência de que
as colunas existam no SharePoint. `SHAREPOINT_HUMAN_CORRECTIONS_ENABLED` permanece
`false` salvo ativação explícita, e a validação de metadados falha antes do PATCH
se nomes, tipos, lookup, choices ou lista de destino divergirem.

Não criar ou renomear colunas para ajustar o ambiente ao código sem revisão e
autorização administrativa. Se a TI aprovar outros nomes, o contrato deve ser
revisto de forma explícita; não se deve contornar a validação.

## Evidência local e pendências externas

Os testes cobrem valores válidos e inválidos, ausência de sessão/perfil de escrita,
autoria forjada, original imutável, trilha de alterações, concorrência por ETag,
duplicidade, repetição, falha antes/depois do PATCH, reconciliação e bloqueio de
aprovação quando a evidência diverge. Testes reais são opt-in e somente leitura;
nenhum PATCH corporativo foi executado.

Para homologar, a TI ainda deve confirmar as três colunas e seus tipos, o mapa dos
campos efetivos, Pessoa do site, Redis REST autoritativo, login/MFA, concessões
`Lists.SelectedOperations.Selected` mínimas e ausência de permissão ampla. Depois,
autorizar um item isolado de homologação para correção, releitura, decisão e
verificação da trilha pelo mesmo UUID. Até esse aceite, o parecer é **Etapa M
concluída localmente e pendente de homologação externa**.
