# Ponte de materiais por código SAP — R02 (2026-10-27)

Workflow `system/automation/n8n/workflow-ponte-materiais-sap-r02.json`, gerado por
`build-material-bridge-sap.mjs`. Não editar o JSON: alterar a política e regenerar.
A R01 (`workflow-ponte-catalogo-materiais-oficiais-r01.json`) continua como avaliação
somente leitura por registro e recebeu apenas as correções de classificação e identidade.

## Fluxo

```text
Entrada {modo, codigo_sap, campo_codigo, aprovacao}
  -> CONFIG - Ambiente (único ponto com site/listas; escrita desabilitada no export)
  -> ENTRADA - Validar -> GET Catálogo (filtro pelo código, $top=100)
  -> AGRUPAR - Identidade técnica (fabricantes agrupados; divergência técnica bloqueia)
  -> GET Materiais Oficiais candidatos ($top=2) -> PLANO (operações + plano_hash)
  -> GATE - Aprovação e revalidação
       PREPARAR: devolve o plano e para (nenhum POST/PATCH)
       APLICAR: exige escrita_habilitada, aprovacao válida e o mesmo plano_hash
  -> [POST Material Oficial -> GET de confirmação] (só se o plano cria)
  -> PATCH lookup por registro (If-Match = ETag lido) -> GET de confirmação
  -> RELATORIO -> SAIDA
```

APLICAR refaz todas as leituras na mesma execução e recalcula o plano. O hash cobre
códigos, identidade, IDs, ETags dos registros do catálogo e do Material Oficial e os
campos do POST. Qualquer alteração após a aprovação muda o hash e bloqueia
(`PLANO_DIVERGENTE_REPREPARAR`). O plano aprovado nunca é reaplicado: após qualquer
falha, executar PREPARAR de novo.

## Regras

- Um Material Oficial por identidade técnica: códigos (vazio é compatível; valores
  diferentes conflitam), nome normalizado, especificação, subfamília e descrição completa.
  O fabricante não compõe a identidade; cada registro do catálogo é preservado e associado.
- `Status_Homologacao` do catálogo não é aprovação 3P. Toda escrita exige aprovação humana.
- Criação: `Revisao_Obrigatoria: true` sempre. `Familia`/`Categoria` só com valor em
  `choices_confirmados.Familia`. `Status`, `Tipo_Registro`, `Origem_Catalogo` e
  `Unidade_Padrao` são omitidos, a menos que estejam configurados **e** confirmados;
  `Status: ATIVO` é proibido na criação. No snapshot local, `Categoria` é Text e `Familia` é Choice.
- Grupo já consolidado: se todos os registros do catálogo apontam para o mesmo Material Oficial
  e a busca devolve exatamente esse material, o resultado é `SEM_ALTERACAO` (`JA_CONSOLIDADO`
  ou `JA_CONSOLIDADO_COM_DIVERGENCIAS`), com `material_oficial`, `registros` e `divergencias`.
  Nada é proposto, independentemente do estado do material; divergências (código ausente ou
  conflitante, texto, especificação, subfamília, Familia fora dos Choices confirmados) vão para
  revisão humana. A R02 nunca atualiza um Material Oficial existente. Se os vínculos apontam
  para um material que a busca não encontra: `VINCULADO_A_MATERIAL_NAO_LOCALIZADO`, sem POST.
- Material existente: reutilizado se códigos e dados técnicos coincidirem e o estado for
  `ATIVO`/`MATERIAL`/`Revisao_Obrigatoria=false`. Em outro estado, só é aceito se o grupo
  já estiver todo associado a ele (`JA_CONSOLIDADO`); senão `MATERIAL_OFICIAL_PROTEGIDO`.
- Lookup `Material_OficialLookupId` (valor único -> `Materiais_Oficiais.ID`): vínculo com
  outro ID bloqueia o plano inteiro (`VINCULO_CONFLITANTE`). Ausência da coluna na resposta
  é tratada como vazio e sinalizada (`LOOKUP_VAZIO_INFERIDO_POR_AUSENCIA`), pois o Graph
  omite colunas vazias; If-Match e o GET de confirmação protegem a escrita.
- Escritas sem retry. 412 vira `CONFLITO` sem reaplicação. Resposta perdida é resolvida pelo
  GET de confirmação (PATCH) ou por novo PREPARAR (POST). 409 no POST indica duplicidade
  pela unicidade de `Codigo_Neoenergia`.
- Erros 4xx/5xx, timeouts, `@odata.nextLink`, resposta sem `value`, IDs inválidos e ETag
  ausente bloqueiam. Entrada vazia ou genérica (`OUTROS`) não gera identidade nem consulta.

## Testes

```powershell
node scripts/n8n/build-material-bridge.mjs --write
node scripts/n8n/build-material-bridge-sap.mjs --write
node --test scripts/n8n/material-bridge-sap.test.mjs scripts/n8n/material-bridge.test.mjs scripts/n8n/workflow-integrity.test.mjs
node scripts/n8n/validate-workflows.mjs
```

`material-bridge-sap.test.mjs` executa o JSON exportado em `n8n-sim.mjs` (executor mínimo
de Code/IF/HTTP e Graph em memória, com omissão de colunas vazias, ETag, 412, 409 de
unicidade e paginação). Dados técnicos do SAP 610096 servem de fixture; IDs e ETags de
SharePoint são sintéticos. O simulador não substitui a execução no n8n real.

## Contratos confirmados pelo E2E de 2026-10-27

- Lookup: o export publicado anterior gravou `Material_OficialLookupId` a partir de um campo
  Set do tipo string; a R02 envia `String(id)` e aceita string ou número na leitura.
- If-Match: valor por expressão (`={{ $json.if_match }}`), com as aspas do ETag preservadas;
  o ETag usado é o `eTag` do listItem lido na mesma execução. Sem `*`.
- Choice: apenas `Familia = CAPACITORES_E_BANCOS` é tratado como confirmado. O payload antigo
  gravava `Status=ATIVO`, `Tipo_Registro=MATERIAL`, `Unidade_Padrao=UN`; isso é indício, não
  confirmação, e a R02 não grava esses campos. Reutilizar material existente para **novos**
  vínculos exige `Status === 'ATIVO'` e `Tipo_Registro === 'MATERIAL'` literais; outro rótulo
  real bloqueia (seguro) até ser confirmado.

## Checklist — homologação somente leitura (PREPARAR, `escrita_habilitada: false`)

1. [ ] Exportar o workflow publicado atual como backup fora do repositório; não alterá-lo.
2. [ ] Importar `workflow-ponte-materiais-sap-r02.json` como **novo** workflow, inativo.
3. [ ] Selecionar a credencial OAuth2 Graph existente nos 6 nós HTTP (os 2 de escrita ficam inalcançáveis).
4. [ ] Em `CONFIG - Ambiente`: preencher `site` e `listas.CATALOGO_NEOENERGIA` / `MATERIAIS_OFICIAIS`;
       conferir `escrita_habilitada: false` e `valores_novo_material: {}`.
5. [ ] Em `ENTRADA - Manual (editar)`: `modo: 'PREPARAR'`, `codigo_sap: '610096'`. Executar.
6. [ ] Esperado: `status: SEM_ALTERACAO`, `motivo: JA_CONSOLIDADO` ou `JA_CONSOLIDADO_COM_DIVERGENCIAS`,
       `material_oficial_id: 134`, `registros` 5/60/96 com `lookup_atual: 134`, `operacoes: []`, sem `plano_hash`.
7. [ ] Na execução, confirmar que só rodaram os 2 GETs; POST/PATCH/GETs de confirmação sem execução.
8. [ ] Registrar `divergencias` e `material_oficial` (Status, Tipo_Registro, Revisao_Obrigatoria, Familia)
       para revisão humana; não corrigir pelo fluxo.
9. [ ] Repetir com `modo: 'APLICAR'` e qualquer aprovação: deve continuar `SEM_ALTERACAO` sem escrita
       (e qualquer proposta seria barrada por `ESCRITA_DESABILITADA_NO_AMBIENTE`).
10. [ ] Testes negativos: `codigo_sap: ''` (bloqueia sem GET); código inexistente (`SAP_NAO_ENCONTRADO_NO_CATALOGO`);
        `campo_codigo: 'Codigo_Elektro'` com `36635` (mesmo resultado do item 6).
11. [ ] Se o GET do catálogo falhar por coluna não indexada, registrar o status HTTP: o fluxo bloqueia.
12. [ ] Desativar/remover a cópia de teste e não exportá-la com valores reais.

Gravações reais exigem autorização separada, lista de homologação e `escrita_habilitada: true`
somente na cópia do ambiente, com `aprovacao: { plano_hash, aprovado_por, confirmacao: 'APLICAR_PLANO' }`.

## Pendências antes de gravações reais

- Confirmar os valores Choice de `Status`, `Tipo_Registro`, `Origem_Catalogo` e o estado
  de "pendente de revisão" para novos materiais. Divergência: o pedido trata `Categoria` como
  Choice; o snapshot local indica Text.
- Exportar o schema sanitizado do `Catalogo_Neoenergiav2` (ausente no repositório) e confirmar
  se `Codigo_Nordeste`/`Codigo_Elektro`/`Codigo_Brasilia` são indexados. Sem índice, o filtro
  depende do header `Prefer` e pode falhar em listas grandes; a falha bloqueia, não cria.
- Confirmar no tenant o tipo aceito em `Material_OficialLookupId` (enviado como string) e
  se If-Match com o `eTag` do listItem é aceito no PATCH `/fields`, como no E2E.
- Sem `Codigo_Neoenergia`, não há unicidade no SharePoint para impedir criação concorrente.
- Não há fila durável de aprovação: a aprovação é o `plano_hash` informado na execução.
  `aprovado_por` é texto informado pelo operador, não identidade autenticada.
- O material 134 do E2E pode não passar nas guardas atuais (ex.: estado ou texto divergente);
  nesse caso a R02 devolve revisão, o que é o comportamento esperado.
