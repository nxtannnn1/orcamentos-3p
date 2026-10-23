# Fluxo "Itens aprovados para Histórico de Preços" — v2 (23/10/2026) — ARTEFATO DE DESENVOLVIMENTO, NÃO PUBLICADO

> **Estado: NÃO PUBLICADA.** O fluxo ativo em produção continua sendo a **v1** (definição em §3, backup em §2).
> A importação da v2 foi iniciada e **não concluída**, e foi descartada. Publicação, testes de aprovação em produção e limpeza
> dos registros sintéticos foram adiados por decisão do responsável (23/10/2026). Não confundir este artefato com o fluxo ativo.

Gerador: `scripts/historico-precos-flow.mjs` (transformação pura da definição exportada). Testes: `scripts/historico-precos-flow.test.ts`,
sobre uma cópia sanitizada da v1 (`scripts/fixtures/historico-precos-flow.v1.sanitized.json`). Autorização: usuário, nesta data.

## 1. Alterações no SharePoint (executadas, com a sessão do responsável)

| Lista | Alteração | Resultado |
| --- | --- | --- |
| Historico_Precos | Coluna `AprovadoPor`, texto de uma linha, não obrigatória, 255 caracteres | Criada (HTTP 200) |
| Historico_Precos | Coluna `EmailAprovador`, idem | Criada (HTTP 200) |
| Historico_Precos | `Aprovador` (Pessoa) | Preservada, sem alteração |

## 2. Backup do fluxo publicado (v1)

`Documents\meuSistema\backups\power-automate-2026-10-23\flow-original.zip` (pacote exportado, SHA-256 `4A71229D…ABB41`), também extraído
em `original-extraido\`. Fora do repositório. Para reverter: Importar → Package d'importation (hérité) → este zip → "Mettre à jour" do
mesmo fluxo, com as mesmas conexões.

## 3. v1 publicada (confirmada pela definição exportada)

Gatilho por sondagem a cada 3 minutos, uma execução por vez (`concurrency.runs = 1`). Filtro pelo `triggerBody()`. `Obter item` lê o
**material**; `Obter item 1` lê o **orçamento**. O item aprovado **não era relido**. `Obter itens` procura por `ID_Item_Importado`, com `$top 1`.
`Criar item 1` usa os valores do gatilho e não registra aprovador, data, decisão, OID nem correção. A marcação usava MERGE com `IF-MATCH: "*"`.

## 4. v2

1. Mantidos: o gatilho, a concorrência 1, as conexões e o filtro rápido do gatilho.
2. **`Reler_item_aprovado`**: GetItem do próprio item em Itens_Importados.
3. **`Validar_item_relido`**: `APROVADO`, `NAO`, `Decisao_Id` não vazio, `EmailAprovador` em formato de e-mail, `AprovadoPor` e `Data_Decisao`
   preenchidos, além das mesmas exigências de material, orçamento, descrição, quantidade maior que 0, preço, fornecedor e unidade.
   Se falhar, nada é feito. **Aprovações legadas** (sem decisão ou e-mail) **ficam como estão**, sem histórico e sem responsável inventado.
4. Material, orçamento e o histórico passam a ser lidos a partir do **item relido**. `Obter itens` usa `$top 2`.
5. `Criar item 1` (só quando não existe histórico) usa os valores relidos e acrescenta `Item_Origem`, `Data_Aprovacao` (= `Data_Decisao`),
   `AprovadoPor`, `EmailAprovador`, `Decisao_Id`, `Revisado_Por_Oid`, `Correcao_Operacao_Id` e `Extracao_Original_Hash`
   (`hash` do `Extracao_Original_JSON`, ou vazio).
6. **`Reler_historico`** (após a criação ou quando o histórico já existe) e **`Conferir_historico`**: exige exatamente 1 registro, com o mesmo `Decisao_Id`,
   `Chave_Historico`, `ID_Item_Importado`, material, e-mail, preço unitário, total e quantidade. Se divergir, **não marca**, e a execução termina
   como *Failed* com `HISTORICO_DIVERGENTE`, para ficar visível.
7. **Marcação** `Enviado_Historico=SIM` com `IF-MATCH` igual ao `@odata.etag` do item relido. Compatibilidade verificada em 23/10 no item sintético 346:
   o formato do conector `"N"` gravou (204) quando atual e recusou (412) quando desatualizado; `"999"` recebeu 412.
8. Duplicidade: além da busca, `Chave_Historico` e `ID_Item_Importado` continuam **únicas** na lista. Uma criação repetida falha e não marca.

Sequência: validar → criar (se ausente) ou reaproveitar → reler e conferir → marcar.

## 5. Registros sintéticos (criados para os testes; não são dados reais)

| Lista | ID | Identificação |
| --- | --- | --- |
| Orcamentos | 117 | `Codigo_Orcamento = HOMOLOG-3P-20261023`, `PENDENTE` |
| Itens_Importados | 345 | `HOMOLOG-3P-20261023-01`: aprovação positiva pelo portal |
| Itens_Importados | 346 | `HOMOLOG-3P-20261023-02`: teste de ETag (só `Observacao_Item`) e caso negativo sem decisão |
| Itens_Importados | 347 | `HOMOLOG-3P-20261023-03`: caso de histórico divergente |

Relatórios e Power BI devem excluir `Codigo_Orcamento`/`Title` iniciados por `HOMOLOG-3P`. A exclusão dos registros sintéticos depende de autorização.

## 6. Situação da importação

Pacote v2: `backups\power-automate-2026-10-23\flow-v2-import.zip`, com a definição gerada a partir do export real; o gatilho e as conexões
foram conferidos como idênticos aos da v1. A importação ("Mettre à jour" no mesmo fluxo e as mesmas duas conexões da conta do fluxo)
**não foi concluída** e foi descartada (fluxo ativo = v1). Publicação adiada pelo responsável.
