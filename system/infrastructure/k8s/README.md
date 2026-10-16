# Kubernetes

Este diretório reúne manifests Kubernetes mantidos como referência de infraestrutura do Sistema de Orçamentos 3P.

## Estrutura

- `auth-service/` — manifests relacionados ao serviço experimental de autenticação e integração.
- `local/` — overlay da Operator Web/SharePoint para Docker Desktop; API apenas como manifesto opcional fora do overlay principal. Procedimento em `../local/README.md`. Namespace dedicado, sem banco, Ingress ou Secrets versionados.

## Status

A infraestrutura Kubernetes e o `auth-service` não fazem parte do caminho crítico do MVP atual.

Os manifests devem ser tratados como referência para evolução futura da arquitetura.

## Diretrizes

- Não armazenar secrets reais no repositório.
- Arquivos de exemplo não devem conter credenciais, tokens ou identificadores sensíveis.
- Alterações nesta área devem ser realizadas separadamente das entregas do MVP.
- Não assumir que os manifests representam um ambiente de produção ativo.
