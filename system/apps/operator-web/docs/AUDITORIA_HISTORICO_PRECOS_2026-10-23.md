# Auditoria — Power Automate e Historico_Precos (23/10/2026)

Somente leitura (Graph GET, metadados e histórico de versões). Documento sanitizado: sem nomes, e-mails, IDs de site ou lista.

> **CORREÇÃO (mesma data, após inspecionar as execuções reais do fluxo publicado "Itens aprovados para Histórico de Preços"):**
> `Historico_Precos` **não está vazia**. A execução disparada pela aprovação criou o item 10 (HTTP 201, 16:31:18 UTC,
> `Chave_Historico=Itens_Importados:288`, `ID_Item_Importado=288`) e **depois** marcou o item 288 com `SIM` (MERGE, HTTP 204).
> O item 10 existe e a lista tem 3 itens. O "0 registros" das §1–§3 e §6 vinha da credencial técnica do portal, que **não tem
> concessão em Historico_Precos**: o Graph devolve uma lista vazia em vez de erro. Não há inconsistência no item 288 e não há
> regularização a fazer. As seções abaixo ficam como registro histórico. O §7 descreve o fluxo publicado.

## 1. Fato observado (item 288 de Itens_Importados)

| Versão | Quando (UTC) | Autor | Mudança |
| --- | --- | --- | --- |
| 3.0 | 16:30:44 | aplicação do portal (SharePoint App) | correção humana (`Fornecedor`, `Status_Revisao=EM_REVISAO`, colunas de correção) |
| 4.0 | 16:31:00 | aplicação do portal | aprovação (status, material, `AprovadoPor`, `EmailAprovador`, `Data_Decisao`, `Decisao_Id`) |
| 5.0 | 16:31:19 | **pessoa**, a mesma que aprovou (comparação por hash do e-mail) | **somente** `Enviado_Historico: NAO → SIM` |

`Historico_Precos` tem **0 registros**. O item 288 é o único marcado `SIM`, e é também o único `SIM` sem histórico. Há outros 3 itens `APROVADO` com `NAO`.

## 2. Causa: o que está e o que não está comprovado

**Comprovado que não foi:**
- **O portal.** Ele só envia PATCH com campos explícitos e nunca escreve `Enviado_Historico` (ver a auditoria de gravação). A versão 5 não foi gravada pela aplicação.
- **O fluxo candidato do repositório, como documentado:**
  1. ele só executa se o site terminar em `-homolog` com `isolationConfirmed=true`, e o site configurado **não** termina em `-homolog`;
  2. no desenho, `SIM` só é gravado **depois** de `Criar_historico → Reler_historico → Conferir_criado` (todos os campos iguais ao snapshot) → `Conferir_versao_*` (ETags de item, material e orçamento). Portanto `SIM` com zero históricos é um estado que esse desenho não produz;
  3. o manifesto registra `NOT_CREATED_NOT_IMPORTED`.

**Não comprovado:** se a versão 5 veio de uma edição manual no SharePoint ou de **outro** fluxo (ou de uma versão modificada do candidato) rodando com a conexão dessa pessoa. Fluxos com conexão de usuário aparecem no histórico de versões como o próprio usuário. Só o histórico de execuções do Power Automate ou o log de auditoria do Purview distinguem os dois casos (§5).

## 3. Mapeamento Itens_Importados → Historico_Precos (produção)

- **Unicidade:** `Chave_Historico` e `ID_Item_Importado` são **únicas e indexadas** na lista real, e o SharePoint recusa duplicatas. O candidato também busca por `ID_Item_Importado`, `Chave_Historico` ou `Item_Origem` antes de criar, para com `HISTORY_IDENTITY_CONFLICT` se achar mais de um e não tenta de novo `Criar_historico` nem `Marcar_enviado` (`retryPolicy: none`).
- **Colunas faltando** na lista real e usadas pelo snapshot do candidato: **`AprovadoPor` e `EmailAprovador`** (texto de uma linha). Sem elas, a criação ou a conferência falha e o item não é marcado. Criá-las antes de qualquer ativação.
- `Aprovador` (Pessoa) existe, mas o candidato não o preenche mais.
- Os 3 itens `APROVADO` + `NAO` antigos não têm `AprovadoPor`/`EmailAprovador`: o candidato os bloqueia (`APPROVAL_INCOMPLETE`). Não se deve inventar o aprovador. Eles precisam de uma decisão de negócio (ficar fora do histórico ou registrar quem aprovou a partir de evidência).

## 4. Testes acrescentados (sem mudar o fluxo)

`scripts/prepare-homologation.test.ts`:
- `Marcar_enviado_criado` só existe dentro de `Primeira_aprovacao → Conferir_criado → Conferir_versao_criado`, com `Reler_historico` após `Criar_historico`. O único outro ponto de marcação exige histórico existente e equivalente.
- Item `SIM` sem histórico → `SENT_WITHOUT_HISTORY`, sem criar nem marcar.
- O fluxo não executa fora de um site `-homolog`.

## 5. O que verificar no Power Automate / Microsoft 365 (responsável)

1. **Power Automate → Meus fluxos, Compartilhados comigo e Soluções**, com a conta que aprovou: procurar fluxos com gatilho "Quando um item é criado ou modificado" (ou Recorrência + Obter itens) na lista Itens_Importados ou no site.
2. Em cada fluxo encontrado: **Histórico de execuções** em 23/10/2026 entre 16:31:00 e 16:34:00 UTC (13:31–13:34 em Brasília). Abrir a execução e anotar:
   - se houve "Criar item" ou HTTP POST em `Historico_Precos`, com status e ID retornado;
   - qual ação gravou `Enviado_Historico` e se ela veio antes ou depois da criação do histórico;
   - ações com falha ou ignoradas, o status final da execução e para qual lista ou site apontavam os parâmetros.
3. Se nenhum fluxo tiver executado nesse horário: **Purview → Auditoria**, atividade "Item de lista atualizado" no item 288, nesse horário. Os campos *UserAgent*/*ClientApp* distinguem navegador (edição manual) de "Microsoft Flow"/"PowerAutomate".
4. Se houver fluxo ativo em produção: **desligá-lo** até ele seguir o desenho do §2 (criar → reler → conferir → marcar com `If-Match`).

## 6. Regularização segura do item 288 (exige autorização explícita; nada disto foi executado)

Pré-condições: §5 concluído e causa registrada; nenhum fluxo de produção ativo fora do desenho; colunas `AprovadoPor`/`EmailAprovador` criadas em Historico_Precos.

1. Confirmar de novo, só com leitura, que `Historico_Precos` não tem registro com `ID_Item_Importado=288` nem `Chave_Historico='Itens_Importados:288'`.
2. **Opção recomendada:** um único PATCH autorizado no item 288 com `If-Match` da versão lida, contendo apenas `{"Enviado_Historico":"NAO"}`. Assim o item volta ao estado "aprovado, ainda não enviado", e o fluxo homologado cria o histórico, relê, confere e só então marca `SIM`. A unicidade de `Chave_Historico`/`ID_Item_Importado` impede duplicatas mesmo com execução repetida.
3. Não recomendado: criar o histórico à mão e manter `SIM`. Isso pula a conferência campo a campo e a checagem de versão.
4. Depois: reler o item (`SIM`), o histórico (1 registro equivalente) e guardar as evidências. O portal continua bloqueando nova decisão no item, como esperado para `APROVADO`/`SIM`.

**Detecção contínua:** um relatório somente leitura de "itens `SIM` sem histórico com `ID_Item_Importado` correspondente" (a mesma consulta usada nesta auditoria) deve rodar antes e depois de cada ativação do fluxo.

## 7. Fluxo publicado — evidências das execuções reais (Power Automate, somente visualização)

Fluxo "Itens aprovados para Histórico de Preços". Gatilho: SharePoint "Quando um item é criado ou modificado" em Itens_Importados.
Conexão: conta pessoal do responsável. Por isso a versão 5.0 do item 288 aparece com uma pessoa como autor.

| Execução | Gatilho recebeu | Resultado |
| --- | --- | --- |
| 1 (3 s, 16:31:17–18 UTC) | item 288, **versão 4.0** (a aprovação: `APROVADO`, `NAO`, editor = aplicação do portal) | `Obter item` → `Obter item 1` → `Obter itens` (`ID_Item_Importado eq 288`, `$top 1`) → `Condição 1` (0 encontrados) → **`Criar item 1`** (PostItem em Historico_Precos, **201**, ID 10) → **`Enviar uma solicitação HTTP ao SharePoint`** (POST + `X-HTTP-Method: MERGE`, `IF-MATCH: "*"`, corpo `{"Enviado_Historico":"SIM"}`, **204**, ETag `…,5`) |
| 2 (222 ms, 16:31:51 UTC) | item 288, **versão 5.0** (`SIM`, gravada pela execução 1) | Condição externa falsa (`Enviado_Historico ≠ NAO`); nenhuma ação |

A correção (versão 3.0, 16:30:44) não gerou execução própria: o gatilho por sondagem entregou só o estado mais recente (4.0).

Ordem e dependência: a ação HTTP tem `runAfter: { Condição_1: [Succeeded] }`. Se `Criar item 1` falhar, a `Condição 1` falha e o `SIM` não é gravado.
Se o histórico já existir, a ação marca `SIM` sem criar outro registro. A ordem está correta.

### Ajustes recomendados no fluxo publicado (não aplicados)
1. **`IF-MATCH: "*"`** no MERGE: o fluxo grava `SIM` mesmo que o item tenha mudado depois do gatilho. Usar o ETag lido em `Obter item`.
2. **Campos de rastreabilidade não mapeados** em `Criar item 1`: `Data_Aprovacao`, `Decisao_Id`, `Revisado_Por_Oid`, `Item_Origem`,
   `Correcao_Operacao_Id`, `Extracao_Original_Hash` (existem na lista) e o aprovador (`AprovadoPor`/`EmailAprovador`, que precisam ser criados
   na lista; hoje só existe `Aprovador` Pessoa, também não preenchido).
3. Valores vêm de `triggerBody()`. Preferir o item relido em `Obter item` e conferir `Enviado_Historico = NAO` nele antes de criar.
4. Usar uma conta de serviço na conexão, para que o histórico de versões não atribua a marcação a uma pessoa.
5. (Portal/auditoria) Conceder **leitura** em Historico_Precos à credencial técnica, se o portal ou os relatórios precisarem conferir o histórico.
