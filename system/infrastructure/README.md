# Infraestrutura — Sistema de Orçamentos 3P

Esta pasta concentra os artefatos, configurações e documentação técnica da infraestrutura utilizada pelo Sistema de Orçamentos 3P.

O objetivo é manter os componentes técnicos do sistema organizados, documentados e versionados junto ao projeto.

## Estrutura

A infraestrutura é organizada por tecnologia ou responsabilidade.

```text
system/infrastructure/
├── README.md
├── microsoft-lists/   contratos sanitizados das listas SharePoint
├── sharepoint/        política de versionamento do SharePoint
├── local/             execução local com Docker Compose
├── redis-lab/         laboratório do Redis Gateway (fora do caminho crítico)
├── keycloak-poc/      prova de conceito Keycloak (fora do MVP)
└── k8s/               manifests Kubernetes de referência (fora do MVP)
```

| Pasta | Documentação |
| --- | --- |
| `microsoft-lists/` | [Contratos das listas](microsoft-lists/README.md) |
| `sharepoint/` | [SharePoint](sharepoint/README.md) |
| `local/` | [Execução local](local/README.md) |
| `redis-lab/` | [Redis Gateway](redis-lab/README.md), [estudo e manutenção](redis-lab/GUIA-MANUTENCAO.md) |
| `keycloak-poc/` | [PoC Keycloak](keycloak-poc/README.md) |
| `k8s/` | [Kubernetes](k8s/README.md) |

Os workflows do n8n e os fluxos do Power Automate pertencem a `system/automation/`.
