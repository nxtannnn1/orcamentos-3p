# Power BI corporativo — Compras 3P (`3P-Compras`)

Projeto Power BI (PBIP): modelo semântico em **TMDL** + esqueleto do relatório + tema 3P Energia. Gerado por
`gerar-pbip.mjs` (fonte única: Power Query, relacionamentos e DAX). **Não edite os arquivos gerados à mão.** Altere o gerador e rode:

```powershell
node system/analytics/powerbi/gerar-pbip.mjs          # regenera 3P-Compras/ (marcadores, versionável)
node --test system/analytics/powerbi/gerar-pbip.test.mjs
```

Estado em 23/10/2026: **modelo validado** pelo serializador TMDL e pelo `Model.Validate()` do próprio Power BI Desktop (2.159),
com 0 erros. **Ainda não aberto nem atualizado no Desktop**: Power Query e DAX só são avaliados pelo motor na primeira atualização.

## 1. Fontes reais (levantadas em 23/10/2026, somente leitura)

| Lista | Registros reais | Observações |
| --- | --- | --- |
| Historico_Precos | 3 | **1** com material, fornecedor e preço; 2 antigos sem material ou fornecedor (ficam em "Integridade", fora dos preços) |
| Itens_Importados | 59 (+3 sintéticos excluídos) | 1 com material aprovado; `Status_Matching`, `Score_Matching` e `Decisao_Material` ainda vazios |
| Orcamentos | 2 (+1 sintético excluído) | |
| Materiais_Oficiais | 5 | `Tipo_Registro = TESTE` é excluído |

Exclusões (Power Query): `Codigo_Item`, `Codigo_Orcamento` ou `Title` iniciados por `HOMOLOG-3P` e materiais `TESTE`. Nenhum dado é inventado.
O painel mostra o **"Aviso de Base"** enquanto houver menos de 30 cotações válidas.

## 2. Conexão e permissões

- Conector: `Web.Contents` na API REST do SharePoint (`_api/web/lists(guid'…')/items`), com **nomes internos** das colunas e paginação
  por `odata.nextLink`. URL base fixa (parâmetro `SiteUrl`) + `RelativePath`, o que permite atualização agendada no Serviço sem gateway.
- Credencial: **Conta organizacional** de quem atualiza, com leitura nas 4 listas. A credencial técnica do portal **não** serve:
  ela não tem concessão em `Historico_Precos`, e o Graph devolve lista vazia sem erro (ver `AUDITORIA_HISTORICO_PRECOS_2026-10-23.md`).
- Publicar e compartilhar no Serviço exige licença Power BI Pro (ou capacidade). Recomenda-se uma conta de serviço com leitura para a atualização agendada.
- Parâmetros: `SiteUrl`, `ListaItensId`, `ListaOrcamentosId`, `ListaMateriaisId`, `ListaHistoricoId`. No repositório ficam **marcadores**.
  A cópia local preenchida é gerada **fora do Git**:

```powershell
node system/analytics/powerbi/preparar-copia-local.mjs --site-url https://<tenant>.sharepoint.com/sites/<site> --destino C:\Users\<usuario>\Documents\meuSistema\powerbi
```

## 3. Modelo (estrela)

```
Materiais (dim) ──< Historico (fato de preços) >── Orcamentos (dim)
     │                  │      └──< Calendario (Data_Referencia)
     │                  └──< Fornecedores (dim, chave normalizada)
     ├──< Itens (fato de itens/decisões) >── Orcamentos
     │        └──< CorrecoesCampos (campos alterados nas correções humanas)
     └··< Itens.Material_Sugerido_ID (inativo; usado em "Acerto da Sugestão")
```

| Tabela | Grão | Chaves e colunas derivadas |
| --- | --- | --- |
| Historico | 1 cotação aprovada enviada ao histórico | `Registro_Valido_Preco`, `Tem_Rastreabilidade`, `Data_Referencia` (orçamento → aprovação → criação), `Fornecedor_Chave` |
| Itens | 1 item extraído | `Extracao_Completa`, `Total_Divergente`, `Tem_Correcao`, `Decisao_Rastreavel`, `Origem_Decisao` |
| CorrecoesCampos | 1 campo alterado por correção | lido de `Correcao_Humana_JSON.changes` (campo, extraído, anterior, corrigido, quem e quando) |
| Materiais, Orcamentos, Fornecedores, Calendario | dimensões | `Fornecedor_Chave` = maiúsculas e sem pontuação simples |

Datas do SharePoint (UTC) são convertidas para Brasília (UTC-3).

## 4. Medidas (tabela `_Medidas`, 45 no total)

- **1 Preços**: Cotações Válidas, Materiais/Fornecedores Cotados, Preço Unitário Mínimo/Máximo/Médio Ponderado, **Preço Mínimo do Mercado**
  (menor preço do mesmo material e período entre todos os fornecedores), Dispersão %, Último Preço, Fornecedor com Menor Preço.
- **2 Economia**: Gasto Registrado, **Economia Potencial (R$)** (Σ (preço pago − menor preço do material no período) × quantidade),
  Economia Potencial (%), Gasto ao Menor Preço.
- **3 Fornecedores**: **Índice de Competitividade** (1,00 = sempre no menor preço; ponderado pela quantidade) e Materiais com Menor Preço.
- **4 Qualidade**: % Extração Completa, Itens com Total Divergente, Itens sem Fornecedor, % Itens com Correção, Campos Corrigidos, Acerto da Sugestão de Material.
- **5 Aprovações**: Aprovados, Rejeitados, Pendentes, % Revisados, Decisões Rastreáveis × Legadas sem Responsável, % Rastreabilidade,
  Responsáveis Distintos, Dias Médios até a Decisão.
- **6 Integridade**: Aprovados Aguardando Envio, Enviados sem Histórico, Histórico sem Item de Origem, Histórico Incompleto, Histórico sem
  Rastreabilidade, Decisão Divergente Item × Histórico, Chaves Duplicadas, Unidade Divergente do Padrão, Material Fora do Catálogo e Pendências de Integridade.
- **0 Executivo**: Aviso de Base.

Regra de comparabilidade: preços só são comparados **dentro do mesmo material**. A medida "Unidade Divergente do Padrão" sinaliza
cotações em unidade diferente da unidade padrão do material, que não devem ser comparadas diretamente.

## 5. Páginas (o esqueleto já tem as 7; os visuais são montados no Desktop conforme abaixo)

Tema: `3P-Compras/tema-3P-Energia.json` (verde-escuro `#0B3D2E`, verde `#1F7A4D`, fundo branco, páginas `#F3F7F4`).
Aplicar em **Exibir → Temas → Procurar temas**. Cabeçalho de cada página: faixa verde-escura com título branco e segmentações de
Período (Calendario[Mes]), Família (Materiais[Familia]), Material (Materiais[Material_Rotulo]) e Fornecedor (Fornecedores[Fornecedor]).

| Página | Visuais |
| --- | --- |
| **Visão Executiva** | Cartões: Gasto Registrado, Economia Potencial (R$), Economia Potencial (%), Materiais Cotados, Fornecedores Cotados, % Rastreabilidade das Decisões, Pendências de Integridade. Cartão de texto: Aviso de Base. Tabela "Melhor preço por material": Material_Rotulo, Preço Mínimo do Mercado, Fornecedor com Menor Preço, Último Preço Unitário, Economia Potencial (R$). Barras: Top 10 Economia Potencial (R$) por material |
| **Preços por Material** | Matriz Material × Fornecedor com Preço Unitário Médio Ponderado (formatação condicional: menor = verde) · Tabela com Mínimo, Médio, Máximo, Dispersão %, Cotações Válidas, Unidade Divergente do Padrão |
| **Fornecedores** | Barras: Índice de Competitividade por fornecedor (linha de referência em 1,00) · Tabela: Fornecedor, Gasto Registrado, Materiais com Menor Preço, Economia Potencial (R$), Índice · Dispersão: Gasto × Índice |
| **Evolução de Preços** | Linhas: Preço Unitário Médio Ponderado e Preço Mínimo do Mercado por Calendario[Mes] (filtrar 1 material) · Tabela de cotações por data |
| **Qualidade das Extrações** | Cartões: % Extração Completa, Itens com Total Divergente, Itens sem Fornecedor, % Itens com Correção, Acerto da Sugestão de Material · Barras: CorrecoesCampos[Campo_Rotulo] × Campos Corrigidos · Tabela de correções (item, campo, extraído → corrigido, quem, quando) |
| **Aprovações e Rastreabilidade** | Rosca: Itens[Origem_Decisao] · Cartões: Aprovados, Rejeitados, Pendentes, Dias Médios até a Decisão · Tabela: AprovadoPor, EmailAprovador, Data_Decisao, Decisao_Id, Codigo_Item |
| **Integridade dos Dados** | Tabela de verificações (uma medida por linha, com formatação: 0 = verde, >0 = vermelho) · Tabelas de detalhe: aprovados aguardando envio; histórico incompleto ou sem rastreabilidade |

## 6. Como abrir e validar

1. Abrir `<destino>\3P-Compras\3P-Compras.pbip` (cópia local preenchida pelo comando do §2) no Power BI Desktop.
2. **Atualizar** e escolher Conta organizacional para `https://<tenant>.sharepoint.com/sites/<site>`, com o nível de privacidade Organizacional.
3. Conferir os valores esperados, calculados dos dados reais em 23/10/2026:

| Medida | Esperado |
| --- | --- |
| Itens Importados | 59 |
| Itens com Extração Completa / Itens sem Fornecedor | 57 / 2 |
| Itens com Correção Humana / Campos Corrigidos | 1 / 2 |
| Itens Aprovados / Rejeitados / Pendentes de Revisão | 4 / 0 / 55 |
| Decisões Rastreáveis / Legadas sem Responsável | 1 / 3 |
| Aprovados Aguardando Envio / Enviados sem Histórico | 3 / 0 |
| Cotações Válidas / Gasto Registrado / Economia Potencial (R$) | 1 / R$ 3,00 / R$ 0,00 |
| Histórico Incompleto / Histórico sem Item de Origem | 2 / 2 |

4. Se o PBIP não abrir (esqueleto de relatório), alternativa: relatório em branco → **Exibição TMDL** → colar e aplicar
   `3P-Compras.tmdl-view.tmdl` (mesmo modelo, em um script).

## 7. Limitações conhecidas

- Base ainda pequena: os indicadores de preço, economia e competitividade só ganham significado com mais aprovações enviadas ao histórico.
- Os registros antigos do histórico não têm rastreabilidade; isso é exibido e não preenchido artificialmente.
- O fluxo v2 do Power Automate (que grava rastreabilidade no histórico) **não está publicado** (`FLUXO_HISTORICO_PRECOS_V2_2026-10-23.md`).
  Até lá, novos registros do histórico chegam sem aprovador, e-mail ou decisão, e entram em "Histórico sem Rastreabilidade".
- `Status_Matching` e `Score_Matching` estão vazios na origem; por isso não há indicadores de matching automático nesta versão.
