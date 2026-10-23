# Homologação da aprovação pela interface — procedimento (23/10/2026)

Pré-requisito do código: [Aprovador em campos de texto](APROVADOR_CAMPOS_TEXTO_2026-10-23.md). Documento sanitizado, sem IDs nem credenciais.

## 1. Estado do `.env.local` (verificado pelos validadores do próprio portal, sem rede)

| Item | Estado |
| --- | --- |
| `DATA_SOURCE` | `sharepoint` (adicionado) |
| `SHAREPOINT_HUMAN_CORRECTIONS_ENABLED` | `true` |
| `ENTRA_PERSON_READONLY_PROBE` | `false`. Havia uma linha duplicada `true`, que foi removida; no carregamento do Next a última linha prevalecia. `ENTRA_DECISION_READONLY_PREFLIGHT=true` fica inerte, porque só roda dentro desse probe |
| Mapa de campos | `approverName=AprovadoPor`, `approverEmail=EmailAprovador`, `reviewedAt=Data_Decisao` |
| Login | Origem `http://localhost:3000`, MFA vazio: aceito **somente** com `NODE_ENV=development` (`npm.cmd run dev`) |
| **`SECURITY_REDIS_REST_URL` / `_TOKEN`** | **Vazios: é o único bloqueio de configuração.** Com eles preenchidos, a disponibilidade calculada pelo portal passa a `canWrite: true` |

Backups do arquivo: `Documents\meuSistema\backups\aprovador-texto-2026-10-23\env.local.antes-*`.

## 2. Redis sem WSL2: Upstash (REST)

`src/server/security/store.ts` já fala o protocolo REST do Upstash: `POST <url>/` com o comando em JSON (`["SET","k","v","NX"]`),
`Authorization: Bearer <token>`, e lê `{ "result": … }`. Comandos usados: `GET`, `SET` (`NX`, `EX`), `DEL`, `INCR` e `EVAL`. Todos são suportados
pela API REST do Upstash. Não há dependência de cliente Redis nativo, Docker ou WSL2.

Configuração (pelo responsável, no console Upstash):
1. Criar um banco Redis. Escolher a região **São Paulo (sa-east-1)** quando houver: o Redis guarda sessões e a auditoria de decisões, com nome e e-mail do aprovador.
2. Na aba REST API, copiar a URL e o **token padrão** (não o read-only, porque o portal grava).
3. No `.env.local`:
   ```
   SECURITY_REDIS_REST_URL=https://<seu-banco>.upstash.io
   SECURITY_REDIS_REST_TOKEN=<token REST padrão>
   ```
   A URL precisa ser `https`, sem caminho, query ou usuário: o portal recusa qualquer outra forma com `SECURITY_STORE_NOT_CONFIGURED`.
4. Teste de conectividade (não grava nada):
   ```powershell
   $u = "<url>"; $t = "<token>"
   Invoke-RestMethod -Method Post -Uri $u -Headers @{ Authorization = "Bearer $t" } -Body '["PING"]' -ContentType 'application/json'
   # esperado: result = PONG
   ```
5. Reiniciar o `npm.cmd run dev` e **entrar de novo**: as sessões passam a ser registradas no Redis, e as sessões em memória deixam de valer.

## 3. Registros sintéticos (criação manual por quem tem autorização; nada é gravado pelo portal nesta etapa)

Situação lida em 23/10 (somente GET): 59 itens (56 `PENDENTE`, 3 `APROVADO`, todos com `Enviado_Historico=NAO`), 2 orçamentos, 5 materiais e
**nenhum** registro `HOMOLOG-3P-`.

Os 2 orçamentos reais estão com `Status_Revisao = "Pendente"` (fora das opções da coluna). O backend aceita só `PENDENTE`, `EM_REVISAO` ou `CORRIGIR`,
então **itens desses orçamentos serão recusados com "O orçamento não está aberto para revisão"**. Por isso o teste usa um orçamento sintético.

### 3.1 Orçamento sintético (lista Orcamentos)
| Coluna | Valor |
| --- | --- |
| Title | `HOMOLOG 3P — NÃO USAR` |
| Codigo_Orcamento | `HOMOLOG-3P-20261023` |
| Numero_Orcamento | `HOMOLOG-3P-20261023` |
| Fornecedor | `HOMOLOG 3P` |
| Data_Orcamento | data de hoje |
| Status_Revisao | **`PENDENTE`** (escolher na lista, em maiúsculas) |
| Reprocessar_IA | `NAO` |
| DriveFileId / Link_Arquivo | vazios |

### 3.2 Dois itens sintéticos (lista Itens_Importados)
Um item para **rejeitar** e um para **aprovar**:

| Coluna | Item 01 (rejeição) | Item 02 (aprovação) |
| --- | --- | --- |
| Title | `HOMOLOG 3P — NÃO USAR` | idem |
| Codigo_Item | `HOMOLOG-3P-20261023-01` | `HOMOLOG-3P-20261023-02` |
| Codigo_Orcamento (lookup) | orçamento 3.1 | orçamento 3.1 |
| Numero_Item | 1 | 2 |
| Descricao_Original | `HOMOLOG 3P — NÃO USAR` | idem |
| Fornecedor | `HOMOLOG 3P` | idem |
| Quantidade / Unidade_Original | 1 / `UN` | 1 / `UN` |
| Preco_Unitario / Preco_Total | 1 / 1 | 1 / 1 |
| Status_Revisao | `PENDENTE` | `PENDENTE` |
| Enviado_Historico (obrigatório) | `NAO` | `NAO` |
| Material_Aprovado, AprovadoPor, EmailAprovador, Data_Decisao, Revisado_Por_Oid, Decisao_Id, Responsavel_Decisao, Correcao_*, Extracao_Original_JSON | **vazios** | **vazios** |

Regras do backend conferidas no código: item em `PENDENTE`/`EM_REVISAO`/`CORRIGIR`, `Enviado_Historico` exatamente `NAO`, orçamento em
`PENDENTE`/`EM_REVISAO`/`CORRIGIR`, sem JSON de correção pendente. Para aprovar também são exigidos descrição, fornecedor, unidade e
quantidade e preços maiores que zero, além de um Material Oficial escolhido na tela. O material só é referenciado (lookup), nunca alterado. A rejeição
exige justificativa de 10 a 2.000 caracteres.

**Antes de aprovar o item 02:** confirmar no Power Automate que nenhum fluxo **publicado** dispara com `Status_Revisao = APROVADO` em
Itens_Importados (o candidato do repositório copia para `Historico_Precos`). Se existir, fazer só a rejeição ou desligar o fluxo durante o teste.

## 4. Roteiro do teste (após Redis e registros sintéticos)

1. `npm.cmd run dev` e abrir **http://localhost:3000** (não `127.0.0.1`: a origem é conferida). Entrar com a conta Microsoft (perfil Operador ou Comprador).
2. Abrir o orçamento `HOMOLOG-3P-20261023` e conferir os itens 01 e 02 como pendentes, sem o aviso "decisões indisponíveis".
3. Item 01: preencher a justificativa e clicar em **Rejeitar**. Esperado: "… Registrado por <seu nome> (<seu e-mail>)".
4. Item 02: escolher um Material Oficial e clicar em **Aprovar**. Mesmo resultado esperado.
5. Clicar em "Reler dados" e conferir em "Última decisão registrada": status, responsável (nome e e-mail), data e identificador.
6. No SharePoint, conferir nos dois itens: `AprovadoPor`, `EmailAprovador`, `Data_Decisao` (UTC, exibida no fuso do site), `Status_Revisao`,
   `Revisado_Por_Oid` e `Decisao_Id` preenchidos. `Responsavel_Decisao` deve continuar vazio.
7. Negativo: tentar decidir de novo o mesmo item. Esperado: recusa por "Item já decidido", sem nova gravação.

Qualquer erro mostrado pela tela significa que **não** houve confirmação. Não repita a operação; registre o código exibido.

## 5. Depois do teste

Os itens sintéticos ficam como evidência. Para descartá-los, excluir os 2 itens e o orçamento `HOMOLOG-3P-` no SharePoint (os dados reais não são afetados).
O portal não reabre itens decididos.
