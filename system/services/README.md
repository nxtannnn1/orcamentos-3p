# Services

Este diretório reúne serviços de aplicação e componentes de backend do Sistema de Orçamentos 3P.

## Componentes

### `auth-service`

Serviço experimental desenvolvido para estudos de autenticação, segurança e integração controlada com serviços Microsoft.

## Status no projeto

O `auth-service` **não faz parte do MVP atual** e não integra o caminho crítico do fluxo E2E de orçamentos.

Seu desenvolvimento deve ser tratado como evolução futura e retomado de forma independente, sem bloquear as funcionalidades prioritárias do sistema.

## Diretrizes

- Não utilizar credenciais reais versionadas.
- Manter configurações sensíveis fora do repositório.
- Alterações no serviço não devem ser consideradas requisito para conclusão do MVP.
- A documentação específica está disponível em `auth-service/README.md`.
