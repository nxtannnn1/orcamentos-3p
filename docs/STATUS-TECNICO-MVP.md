# Status técnico do MVP — Sistema 3P

Referência técnica para desenvolvimento, homologação e continuidade. Revisado em **27/10/2026**, na branch `infra-lab`.

Guias por componente: [Estudos](ESTUDOS.md). Cada afirmação deste documento indica sua evidência e data. Testes locais e simulados demonstram regras e contratos; não substituem a homologação no ambiente real. Registros com data descrevem o estado daquele momento e devem ser revalidados antes de decisões novas.

## 1. Vocabulário de estado

| Estado | Significado |
| --- | --- |
| **Implementado** | Código e testes automatizados existem no repositório. |
| **Exercitado no ambiente real** | Executado contra o Microsoft 365 da 3P em teste controlado, com evidência registrada. Não equivale a homologação. |
| **Homologado** | Aceito em roteiro formal, com autorização, evidências e critérios de aceite. |
| **Planejado** | Desenho ou intenção, sem implementação concluída. |

Até esta revisão, **nenhuma jornada está homologada de ponta a ponta**.

## 2. Estado por componente

| Componente | Estado | Evidência mais recente |
| --- | --- | --- |
| Operator Web — consulta, fila e catálogo | Implementado; leitura SharePoint exercitada | Leituras Graph e metadados das listas (22–23/10/2026) |
| Operator Web — correção e decisão | Implementado; escrita exercitada com registros sintéticos | Aprovação pelo portal em item `HOMOLOG-3P-` e teste de ETag (23/10/2026) |
| Operator Web — comparação de preços | Implementado e testado localmente | Testes de domínio; pré-seleção apenas em memória |
| Login Microsoft Entra ID | Implementado; login real em ambiente de desenvolvimento | Sessão Microsoft funcional com origem local HTTP (22–23/10/2026) |
| Operator API / PostgreSQL | Implementado, somente leitura; validado localmente | Consultas reais com role de leitura (09/10/2026) |
| n8n — ingestão, normalização e associação | Workflows sanitizados e validados offline | Validador e testes de integridade (27/10/2026) |
| n8n — Ponte de Materiais Oficiais R02 | Implementado; não homologado no n8n | 109 testes offline (27/10/2026) |
| Power Automate — Histórico de Preços | v1 em operação; v2 preparada, não publicada | Execuções reais observadas (23/10/2026) |
| Power BI — 3P-Compras | Modelo e relatório gerados; leitura das listas verificada no Desktop | Validação TMDL e leitura no Desktop (23/10/2026) |
| `auth-service` | Experimental, fora do MVP | Auditoria somente leitura (27/10/2026) |
| OCR / IA na ingestão | Ramo experimental no n8n; fora do caminho crítico | — |

## 3. Operator Web

Aplicação Next.js 16 / React 19 com BFF em `system/apps/operator-web`. A interface depende do contrato `OperatorRepository`, nunca de SharePoint diretamente.

### 3.1. Fontes de dados

| `DATA_SOURCE` | Consulta | Decisão e persistência | Limitação |
| --- | --- | --- | --- |
| `mock` (padrão) | Dados simulados | Em memória no processo do servidor | Decisões se perdem ao reiniciar; não representa persistência real |
| `sharepoint` | Microsoft Graph sobre `Orcamentos`, `Itens_Importados` e `Materiais_Oficiais` | PATCH com ETag, autoria e auditoria Redis | Depende de concessões Graph, colunas reais e Redis; homologação formal pendente |
| `operator-api` | Operator API → PostgreSQL | **Bloqueada** na interface e no servidor | Somente leitura; o token identifica o serviço, não a pessoa |

Não existe fallback automático entre fontes. A rota `/comparacao-precos` aceita `mock` ou `sharepoint` e, no SharePoint, considera apenas itens `APROVADO` com Material Oficial associado. O mock nunca substitui uma falha do Graph.

### 3.2. Decisão e autoria

- Aprovação, rejeição e correção gravam o nome e o e-mail da **sessão Microsoft** em `AprovadoPor` e `EmailAprovador`, com `Data_Decisao`, `Status_Revisao`, `Revisado_Por_Oid` e `Decisao_Id` (desde 23/10/2026). O cliente não pode enviar esses campos.
- A coluna Pessoa `Responsavel_Decisao` passou a ser somente lida, para registros antigos. O resolvedor Entra → Pessoa (`SHAREPOINT_PERSON_RESOLVER`) não tem mais efeito no caminho de escrita.
- Regras do servidor: item e orçamento em `PENDENTE`, `EM_REVISAO` ou `CORRIGIR`; `Enviado_Historico = NAO`; material escolhido para aprovar; justificativa de 10 a 2.000 caracteres para rejeitar; item já decidido não é reaberto.
- Escrita exige Redis REST configurado. Sem ele, a disponibilidade calculada pelo portal permanece sem permissão de escrita.

### 3.3. Evidências

| Data | Escopo | Resultado | Fonte |
| --- | --- | --- | --- |
| 23/10/2026 | Suíte local após aprovador em texto | 1.469 aprovados, 24 ignorados; typecheck, lint e build OK | [Aprovador em campos de texto](../system/apps/operator-web/docs/APROVADOR_CAMPOS_TEXTO_2026-10-23.md) |
| 23/10/2026 | Schema real das colunas de decisão | Aprovado por `verifyDecisionColumns`, somente GET | idem |
| 23/10/2026 | Escrita pelo portal | Correção e aprovação gravadas pela aplicação no SharePoint, registradas no histórico de versões do item; aprovação positiva em registro sintético | [Auditoria de Historico_Precos](../system/apps/operator-web/docs/AUDITORIA_HISTORICO_PRECOS_2026-10-23.md), [Fluxo v2](../system/apps/operator-web/docs/FLUXO_HISTORICO_PRECOS_V2_2026-10-23.md) |
| 27/10/2026 | Suíte local nesta revisão (`npm test`, `npm run typecheck`, `npm run lint`) | 1.680 aprovados, 24 ignorados; typecheck e lint sem erros | Execução local; build não executado |

Registros sintéticos criados para os testes usam o prefixo `HOMOLOG-3P-` e devem ser excluídos de relatórios e indicadores. A remoção depende de autorização.

## 4. Autenticação, MFA e autorização

- Login Microsoft Entra ID com MSAL Node, sessão cifrada (JWE) e perfis **Consulta**, **Operador** e **Comprador**. A autorização é verificada no servidor.
- Keycloak via OIDC existe como provedor alternativo, desativado por padrão; não libera escrita.
- Origem local HTTP com contexto MFA vazio é aceita **somente** com `NODE_ENV=development`. O contexto MFA efetivo e a política do tenant ainda precisam ser configurados e comprovados.
- Login da pessoa e acesso Graph têm configurações separadas no código, mas o ambiente local usa o mesmo Client ID para ambos. A separação em registros distintos é decisão pendente da TI.
- A credencial de runtime deve usar `Lists.SelectedOperations.Selected` com concessões por lista; permissões amplas são recusadas pela política do código.
- O bypass local de autenticação é restrito a desenvolvimento e não substitui login, MFA ou autorização reais.

Detalhes: [Login Microsoft](../system/apps/operator-web/docs/LOGIN-MICROSOFT.md), [Segurança operacional](../system/apps/operator-web/docs/SEGURANCA-OPERACIONAL.md) e o histórico de identidade em [Resolução de identidade](../system/apps/operator-web/docs/RESOLUCAO-IDENTIDADE-SHAREPOINT.md).

## 5. Redis, auditoria e concorrência

- O Redis REST guarda sessões, revogação, limites de requisição e auditoria das decisões. O cliente usa o protocolo REST compatível com Upstash, sem Docker nem WSL2.
- Toda escrita usa `If-Match` com o ETag lido. Respostas 412 e 428 bloqueiam a operação; após erro incerto, o registro é relido em vez de reenviado.
- Correções usam bloqueio com recuperação e identificador de operação (`Correcao_Operacao_Id`).
- Pendências: Redis compartilhado entre as instâncias do ambiente hospedado e roteiro de reconciliação após falha incerta em homologação formal.

## 6. Microsoft Graph e SharePoint

**Confirmado por leitura (22–23/10/2026):** metadados das listas principais, colunas de autoria e decisão, concessão técnica `write` observada na lista de itens e `GET .../permissions` em Graph v1.0.

**Pendências:**

- A credencial técnica do portal **não tem concessão** em `Historico_Precos`: o Graph devolve lista vazia, não erro. Ler essa lista com a sessão do usuário ou conceder leitura explícita.
- Os 2 orçamentos reais observados em 23/10 têm `Status_Revisao = "Pendente"`, fora das opções da coluna; o servidor os recusa para revisão até a correção do dado.
- Valores Choice de `Status`, `Tipo_Registro` e `Origem_Catalogo` em `Materiais_Oficiais` não estão no snapshot do schema.
- Não há snapshot sanitizado do `Catalogo_Neoenergiav2` no repositório, nem confirmação de índice nas colunas de código.
- Os contratos em [`system/infrastructure/microsoft-lists`](../system/infrastructure/microsoft-lists/README.md) são referências sanitizadas e não substituem a conferência dos nomes internos reais.

## 7. n8n

Workflows sanitizados em [`system/automation/n8n`](../system/automation/n8n/README.md). O fluxo funcional é: arquivo → orquestrador → leitura e extração → `Orcamentos` → `Itens_Importados` → normalização e associação → `Tributos_Itens_Orcamentos`.

- **Integridade de itens:** PATCH automático só com ETag e estado elegível; campos humanos e de auditoria nunca são alterados pelo fluxo; colisões e respostas incompletas interrompem.
- **Ponte R01:** avaliação somente leitura por registro de catálogo, sem POST ou PATCH.
- **Ponte R02 por código SAP** (commit `bd13ba4`, 27/10/2026): agrupa fabricantes por identidade técnica e gera um plano com hash. O modo `PREPARAR` apenas lê; `APLICAR` exige o mesmo hash, aprovação explícita e `escrita_habilitada`, que é `false` no export. Detalhes em [Ponte R02](../scripts/n8n/material-bridge-sap.md).
- **Caso de referência:** E2E manual em 27/10/2026 com o SAP 610096, que resultou em um Material Oficial e três registros de fabricantes associados a ele. A R02 reconhece esse estado como consolidado e não propõe gravações.

| Data | Escopo | Resultado |
| --- | --- | --- |
| 27/10/2026 | `material-bridge-sap`, `material-bridge` e `workflow-integrity` | 109 aprovados, 0 falhas |
| 27/10/2026 | `validate-workflows.mjs` | 0 erros, 24 avisos (campos sem snapshot de schema) |

**Pendências:** importar a R02 na instância n8n e executar o checklist somente leitura; comparar os workflows publicados com os versionados antes de qualquer importação; confirmar IDs reais dos subworkflows; revisar a normalização legada de `workflow-normalizar-associar-materiais-v0.json`, que difere da política da ponte.

## 8. Power Automate e Histórico de Preços

| Item | Estado |
| --- | --- |
| Fluxo "Itens aprovados para Histórico de Preços" **v1** | Publicado. Em 23/10/2026, uma aprovação pelo portal disparou o fluxo, que criou o registro em `Historico_Precos` (201) e marcou `Enviado_Historico = SIM` (204). |
| Riscos da v1 | Marca `SIM` com `IF-MATCH: "*"`, usa valores do gatilho sem reler o item, não grava aprovador nem decisão e roda com conexão pessoal. |
| **v2** (gerador `scripts/historico-precos-flow.mjs` no Operator Web) | Relê e valida o item, confere o histórico criado e marca com o ETag lido. O formato de ETag do conector foi verificado em registro sintético: gravação aceita com versão atual (204) e recusada com versão desatualizada (412). **Não publicada**; a importação foi descartada e a publicação adiada pelo responsável. |
| Colunas `AprovadoPor` e `EmailAprovador` em `Historico_Precos` | Criadas em 23/10/2026. |
| Integração com a interface | **Não existe.** A comparação de preços não lê `Historico_Precos`. |
| Versionamento dos fluxos em `system/automation/power-automate` | Em preparação. Snapshots e scripts locais ainda não versionados não devem ser tratados como publicados. A homologação deve ser avaliada fluxo a fluxo. |

A jornada **aprovação → histórico → indicador** foi exercitada uma vez com a v1, mas não está homologada. Referências: [Auditoria](../system/apps/operator-web/docs/AUDITORIA_HISTORICO_PRECOS_2026-10-23.md) e [Fluxo v2](../system/apps/operator-web/docs/FLUXO_HISTORICO_PRECOS_V2_2026-10-23.md).

## 9. Power BI

Projeto PBIP `3P-Compras` (modelo TMDL, relatório PBIR com 7 páginas, 45 medidas), gerado por `gerar-pbip.mjs`. O modelo foi validado pelo serializador TMDL e pelo motor do Power BI Desktop, e a leitura das listas pela raiz do tenant funcionou no Desktop em 23/10/2026. Exclui registros `HOMOLOG-3P` e materiais `TESTE`, e exibe aviso de base enquanto houver menos de 30 cotações válidas.

Pendências: publicação no Serviço (licença Pro ou capacidade), conta de serviço para atualização agendada e revisão dos visuais com dados reais. Ver [Projeto 3P-Compras](../system/analytics/powerbi/README.md).

## 10. Operator API, PostgreSQL e `auth-service`

- **Operator API** (09/10/2026): consultas paginadas de orçamentos, itens, materiais e fornecedores; transação somente leitura; recusa roles com privilégio de escrita; autenticação entre serviços. Sem credenciais, as rotas protegidas retornam 503 por desenho. Ver [README](../system/services/operator-api/README.md).
- **PostgreSQL / Prisma** (`system/database`): modelagem e laboratório. SharePoint e n8n continuam sendo o ambiente operacional.
- **`auth-service`**: protótipo Spring Boot, sem consumidores no MVP. A auditoria de 27/10/2026 concluiu que ele não é a solução para centralizar identificadores dos workflows; a recomendação é configuração por ambiente no próprio n8n. Os testes de contexto exigem PostgreSQL. Ver [auditoria anterior](../system/services/auth-service/docs/auditoria-tecnica-auth-service-r00.md).

## 11. Riscos técnicos

| Risco | Impacto | Mitigação atual |
| --- | --- | --- |
| Concessões Graph amplas ou ausentes | Escrita indevida ou leituras vazias silenciosas | Política de permissão restrita; leitura vazia de `Historico_Precos` documentada |
| Redis não compartilhado em produção | Sessões e auditoria inconsistentes entre instâncias | Escrita bloqueada sem Redis configurado |
| MFA não comprovado no tenant | Acesso sem segundo fator | Aceite de contexto vazio só em desenvolvimento |
| v1 do Power Automate com `IF-MATCH: "*"` | Marcação `SIM` sobre estado alterado | v2 preparada; unicidade de `Chave_Historico` impede duplicatas |
| Workflows publicados divergentes dos versionados | Importação reintroduz comportamento antigo | Comparação obrigatória antes de importar |
| Identificadores corporativos em exports | Exposição de informações do ambiente | Sanitização e marcadores; verificação automática de identificadores ainda não está no CI |
| Dados de entrada fora do contrato (Choice, status) | Itens bloqueados para revisão | Validação estrita no servidor e no n8n |
| Registros sintéticos em indicadores | Distorção de métricas | Prefixo `HOMOLOG-3P-` excluído no Power BI |

## 12. Prioridades do MVP

| Prioridade | Frente | Evidência de conclusão esperada |
| --- | --- | --- |
| P0 | Decisão pelo Operator Web | Roteiro formal de aprovação e rejeição com releitura, Redis compartilhado e evidências |
| P0 | Permissões Graph | Concessões mínimas por lista confirmadas, incluindo leitura de `Historico_Precos` onde necessário |
| P0 | Concorrência e auditoria | ETag, 412 e reconciliação após falha incerta verificados em homologação |
| P1 | Autenticação | MFA, perfis e registros de aplicação definidos e validados no tenant |
| P1 | Histórico de Preços | v2 publicada e verificada com aprovação controlada |
| P1 | Ponte R02 | Checklist somente leitura executado na instância n8n |
| P2 | Power BI | Publicação no Serviço com atualização agendada |
| P2 | Hospedagem | Ambiente, secrets e smoke test do deploy definidos |
| P2 | Operator API | Teste de integração live reproduzível, se a fonte for mantida |

## 13. Fora do caminho crítico

- **OCR, IA e extração de PDFs:** o workflow de orçamentos tem um ramo com IA, mas a entrada estruturada é o caminho do MVP. Qualquer uso de IA exige revisão humana, testes e governança de dados.
- **Persistência da pré-seleção e cesta de compras:** planejadas, sem implementação.
- **Kubernetes:** manifestos de referência; não há ambiente de produção homologado.
- **Ampliação da Operator API para escrita:** exige arquitetura e autorização próprias; nenhuma escrita deve ser presumida.

## 14. Princípios de engenharia

- Documentação revisada na mesma entrega do código (ver [AGENTS.md do Operator Web](../system/apps/operator-web/AGENTS.md)).
- Fidelidade aos dados de origem e nenhuma inferência arbitrária: ambiguidades vão para decisão humana.
- Idempotência e concorrência: nenhuma gravação sobre estado desatualizado nem repetição cega após falha.
- Rastreabilidade de decisões e resultados.
- Falha segura: falta de credencial, permissão ou auditoria nunca habilita escrita.
- Alterações em permissões, infraestrutura e registros reais só com autorização e plano de validação.
