# Documentação do Operator Web

Índice da pasta `docs/`. O estado técnico vigente fica no [Status técnico do MVP](../../../../docs/STATUS-TECNICO-MVP.md);
em conflito, ele prevalece sobre os documentos datados desta pasta.

## Documentação vigente

| Documento | Assunto |
| --- | --- |
| [Arquitetura](ARQUITETURA.md) | Camadas, BFF, fontes de dados e fronteiras |
| [Fluxos do sistema](FLUXOS-DO-SISTEMA.md) | Fila, revisão, decisão e comparação |
| [Login Microsoft](LOGIN-MICROSOFT.md) | Entra ID, sessão, perfis e bypass local |
| [Segurança operacional](SEGURANCA-OPERACIONAL.md) | Requisitos antes de publicar ou liberar escrita |
| [Aprovador em campos de texto](APROVADOR_CAMPOS_TEXTO_2026-10-23.md) | Contrato atual de autoria da decisão (`AprovadoPor`, `EmailAprovador`) |
| [Integração com a Operator API](INTEGRACAO-OPERATOR-API.md) | Fonte `operator-api`, somente leitura |
| [Login Keycloak](LOGIN-KEYCLOAK.md) | Provedor alternativo, desativado por padrão |
| [Demonstração local](DEMO-LOCAL.md) | `npm run dev:demo` com dados fictícios |
| [Fluxo de Histórico de Preços v2](FLUXO_HISTORICO_PRECOS_V2_2026-10-23.md) | Gerador e fixture deste componente; v2 não publicada |

## Guias de estudo e manutenção

[Guia de estudo](GUIA-DE-ESTUDO.md), [Estrutura de pastas](ESTRUTURA-DE-PASTAS.md), [Guia de testes](GUIA-DE-TESTES.md),
[Guia de debug](GUIA-DE-DEBUG.md), [Guia de manutenção](GUIA-DE-MANUTENCAO.md), [Guia de versionamento](GUIA-DE-VERSIONAMENTO.md),
[Glossário](GLOSSARIO.md) e [Autenticação, SharePoint e validação](GUIA_ESTUDO_AUTENTICACAO_SHAREPOINT_VALIDACAO.md).

## Homologações e relatórios históricos

Registram o estado da data indicada e não devem ser lidos como estado atual.

- Histórico do README: [registros até 23/10/2026](HISTORICO-README.md).
- Histórico de Preços: [Auditoria de Historico_Precos](AUDITORIA_HISTORICO_PRECOS_2026-10-23.md),
  [Homologação da aprovação pela interface](HOMOLOGACAO_APROVACAO_UI_2026-10-23.md).
- Relatórios de 22/10/2026: [Correções P0](RELATORIO_CORRECOES_P0_2026-10-22.md),
  [Evolução sem Docker](RELATORIO_EVOLUCAO_MVP_SEM_DOCKER_2026-10-22.md),
  [Homologação E2E](RELATORIO_HOMOLOGACAO_E2E_2026-10-22.md),
  [Persistência do aprovador](HOMOLOGACAO_PERSISTENCIA_APROVADOR_2026-10-22.md),
  [Retomada no ambiente doméstico](RETOMADA_AMBIENTE_DOMESTICO_2026-10-22.md),
  [Continuidade da sprint](CONTINUIDADE_SPRINT_INTERROMPIDA_2026-10-22.md).
- Identidade Entra → Pessoa (abordagem substituída pelo aprovador em texto em 23/10/2026):
  [Resolução de identidade](RESOLUCAO-IDENTIDADE-SHAREPOINT.md),
  [Homologação E2E de identidade](HOMOLOGACAO-E2E-IDENTIDADE-SHAREPOINT.md),
  [Diagnóstico do probe](DIAGNOSTICO-PROBE-IDENTIDADE.md).
- Diagnósticos de login: [Login Microsoft](DIAGNOSTICO-LOGIN-MICROSOFT.md), [Login e datasource](DIAGNOSTICO-LOGIN-DATASOURCE.md).
- Login corporativo: [Entrada corporativa única](LOGIN-CORPORATIVO.md), [testes manuais](LOGIN-CORPORATIVO-TESTES-MANUAIS.md).
- Etapas e fases: [Etapa C](PERSISTENCIA-DECISAO-ETAPA-C.md), [Etapas D, E e F](ETAPAS-DEF.md),
  [Etapas J, K e L](ETAPAS-JKL.md) com o [roteiro](homologacao/ROTEIRO-JKL.md), [Etapa M](ETAPA-M.md),
  [Fase M — 20/10/2026](FASE-M-2026-10-20.md), [Fase M — regras funcionais](FASE-M-REGRAS-FUNCIONAIS.md),
  [Fase 4 — identidade](FASE-4-IDENTIDADE.md), [Fase 4 — testes manuais](FASE-4-TESTES-MANUAIS.md).

## Experimentos e propostas futuras

Contratos e propostas sem persistência ou escrita real provisionada:

- Reabertura e reconciliação (M.3): [arquitetura](FASE-M3-ARQUITETURA.md), [dependências](FASE-M3-DEPENDENCIAS.md), [relatório](FASE-M3-RELATORIO.md).
- Persistência (M.4): [arquitetura](FASE-M4-ARQUITETURA.md), [dependências](FASE-M4-DEPENDENCIAS.md),
  [homologação](FASE-M4-HOMOLOGACAO.md), [permissões](FASE-M4-PERMISSOES.md), [relatório](FASE-M4-RELATORIO.md).

Artefatos que não são documentos de leitura:

| Caminho | Finalidade |
| --- | --- |
| `homologacao/` | Roteiro, manifesto, fixtures sintéticas, templates de listas e a candidata do fluxo v2 (`flow.definition.candidate.json`), usados pelos scripts de homologação |
| `identity-persistence/` | Proposta de SQL da persistência de identidade (Fase 4), não aplicada |
| `phase-m-decision-fields.candidate.json` | Candidato de campos de decisão da Fase M |
| `keycloak-client.example.json` | Exemplo sanitizado de cliente Keycloak |

Ao criar um documento nesta pasta, acrescente uma linha na seção correspondente.
