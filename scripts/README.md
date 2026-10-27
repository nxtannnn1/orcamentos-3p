# Scripts

Este diretório reúne scripts auxiliares utilizados no desenvolvimento, validação e manutenção do Sistema de Orçamentos 3P.

## Estrutura

- `n8n/` — geradores, políticas, validação e testes dos workflows n8n. Ver [scripts n8n](n8n/README.md).
- `local-infra.ps1` — validação, build e execução da infraestrutura local com Docker. Ver [execução local](../system/infrastructure/local/README.md).
- `k8s/` — utilitários do cluster Kubernetes local (`local-plan.ps1`, `check-local-cluster.ps1`) e do `auth-service` (`apply-auth-service-env.ps1`), fora do caminho crítico do MVP. Ver [Kubernetes](../system/infrastructure/k8s/README.md).

## Diretrizes

- Os scripts deste diretório não fazem parte do fluxo operacional do MVP.
- Devem ser executados a partir da raiz do repositório, salvo indicação em contrário.
- Nenhum script deve armazenar credenciais, tokens, dados pessoais ou informações sensíveis do ambiente.
- Alterações devem ser avaliadas antes de sua inclusão em processos automatizados de CI/CD.

Consulte o README de cada subdiretório para informações específicas.
