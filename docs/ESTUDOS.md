# Estudos por componente

Índice dos guias existentes. Cada guia fica junto do seu componente; este arquivo só aponta onde começar.
Estado atual e prioridades: [Status técnico do MVP](STATUS-TECNICO-MVP.md).

| Área | Comece por | Aprofunde em |
| --- | --- | --- |
| **Frontend / Operator Web** (React, Next.js, interface, testes) | [Guia de estudo](../system/apps/operator-web/docs/GUIA-DE-ESTUDO.md); índice em [docs do Operator Web](../system/apps/operator-web/docs/README.md) | [Arquitetura](../system/apps/operator-web/docs/ARQUITETURA.md), [Estrutura de pastas](../system/apps/operator-web/docs/ESTRUTURA-DE-PASTAS.md), [Guia de testes](../system/apps/operator-web/docs/GUIA-DE-TESTES.md), [Glossário](../system/apps/operator-web/docs/GLOSSARIO.md) |
| **Autenticação** (Entra ID, sessão, perfis) | [Login Microsoft](../system/apps/operator-web/docs/LOGIN-MICROSOFT.md) | [Autenticação, SharePoint e validação](../system/apps/operator-web/docs/GUIA_ESTUDO_AUTENTICACAO_SHAREPOINT_VALIDACAO.md), [Segurança operacional](../system/apps/operator-web/docs/SEGURANCA-OPERACIONAL.md) |
| **Backend / Operator API** (serviço, contratos, segurança) | [Guia de estudo](../system/services/operator-api/docs/GUIA-DE-ESTUDO.md) | [README da Operator API](../system/services/operator-api/README.md), [Integração com o Operator Web](../system/apps/operator-web/docs/INTEGRACAO-OPERATOR-API.md) |
| **Banco de dados** (PostgreSQL, modelagem, integridade) | [Visão geral](../system/database/visao-geral.md) | [Modelo entidade-relacionamento](../system/database/der.md), [README do banco](../system/database/README.md) |
| **SharePoint / Microsoft Graph** (schemas, permissões, lookups, concorrência) | [Contratos das listas](../system/infrastructure/microsoft-lists/README.md) | [Fluxos do sistema](../system/apps/operator-web/docs/FLUXOS-DO-SISTEMA.md), [Aprovador em campos de texto](../system/apps/operator-web/docs/APROVADOR_CAMPOS_TEXTO_2026-10-23.md), [Persistência da decisão](../system/apps/operator-web/docs/PERSISTENCIA-DECISAO-ETAPA-C.md) |
| **n8n** (workflows, identificação de materiais, testes) | [Camada n8n](../system/automation/n8n/README.md) | [Scripts n8n](../scripts/n8n/README.md), [Ponte R02 por SAP](../scripts/n8n/material-bridge-sap.md), [Revisão da ponte R01](../scripts/n8n/material-bridge-review.md) |
| **Power Automate** (fluxos, persistência, validação) | [Power Automate — definições versionáveis](../system/automation/power-automate/README.md) | [Fluxo de Histórico de Preços v2](../system/apps/operator-web/docs/FLUXO_HISTORICO_PRECOS_V2_2026-10-23.md), [Auditoria de Historico_Precos](../system/apps/operator-web/docs/AUDITORIA_HISTORICO_PRECOS_2026-10-23.md) |
| **Power BI** (modelo, medidas, atualização) | [Projeto 3P-Compras](../system/analytics/powerbi/README.md) | — |
| **Infraestrutura** (configuração, Redis, implantação) | [Infraestrutura](../system/infrastructure/README.md) | [Execução local](../system/infrastructure/local/README.md), [Redis: estudo e manutenção](../system/infrastructure/redis-lab/GUIA-MANUTENCAO.md), [Kubernetes](../system/infrastructure/k8s/README.md) |

Manutenção e diagnóstico do Operator Web: [Guia de manutenção](../system/apps/operator-web/docs/GUIA-DE-MANUTENCAO.md) e [Guia de debug](../system/apps/operator-web/docs/GUIA-DE-DEBUG.md).

Ao criar um estudo novo, coloque-o na pasta do componente e acrescente uma linha aqui. Não duplique conteúdo entre guias.
