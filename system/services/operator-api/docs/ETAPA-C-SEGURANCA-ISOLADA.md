# Etapa C — autenticação e autorização simuladas

09/10/2026. Componentes isolados; nenhuma integração ou escrita ativada.

## Arquitetura encontrada

A API tem `src/server/auth.ts` para token opaco técnico comparado com SHA-256 em tempo constante, `ApiClient.scopes=["read"]` e `protectedRead` limitando métodos a GET/HEAD. O pool e suas transações são somente leitura; a role SQL é inspecionada contra privilégios indevidos. O schema Drizzle é projeção parcial de leitura: fornecedor, orçamento, item e material. Não foi encontrado modelo de tenant/usuário/ACL na API. Não usar essa projeção como fonte de migrações.

O Web, inspecionado somente pelas fontes, possui sessão Entra com `oid`, `tenantId`, roles Consulta/Operador/Comprador e modos locais de bypass; usa `jose` e registro de sessões/revogação separado. Isso não fornece um verificador de atestado na API. Não se presume que a API tem `jose` instalado: seu package.json não o declara. Nenhuma dependência foi instalada nem implementação criptográfica própria criada.

Os contratos v1/v2 continuam separados em `src/importacao`. O resolver v2 exigia catálogo confiável previamente restrito ao escopo; esta etapa acrescenta essa fronteira de autorização no fluxo simulado.

## Novos componentes

- `src/seguranca/contratos.ts`: identidade autenticada, atestado, pedido, contexto, operações, concessões, catálogo e interfaces de verificadores/repositórios.
- `src/seguranca/simulacao-autorizacao.ts`: autenticação e verificação por portas injetadas, decisão fail closed e resolução com catálogo filtrado.
- `tests/autorizacao-c.test.ts`: mocks conhecidos somente nos testes, cenários positivos/negativos e regressão do bloqueio HTTP de mutações.

Não há verificador real, emissão de JWT, rota, consumidor de credencial Entra ou adaptador de banco. Os retornos são **simulados**, não representam autenticação corporativa real.

## Fronteiras de confiança

1. A fábrica exige `NODE_ENV=test` e `VITEST=true`; cada chamada reconfere o ambiente. Nenhum modo de desenvolvimento/bypass ativa esse módulo. Contextos autorizados carregam `simulado: true`. Não conectar esta fábrica a rotas, mesmo em desenvolvimento.
2. Verificadores/repositórios são dependências confiáveis do servidor, não parâmetros de requisição. Fixtures retornam claims apenas para strings de credenciais/atestados conhecidas. Falhas e retornos malformados negam acesso; mensagens internas não são expostas.
3. Claims tipadas não comprovam autenticidade. Identidades e atestados passam por validação estrita, cópia congelada profunda e registro privado de proveniência por instância. Objetos arbitrários, cópias, serializações e provas de outra instância são recusados.
4. Tenant, emissor, audiência e validade temporal são explícitos. Instantes usam segundos inteiros não negativos desde Unix epoch; o relógio é injetado. TTL máximo do atestado: 60 segundos, sem tolerância de relógio nesta simulação; não pode sobreviver à identidade. Expiração é exclusiva, e tempo é rechecado após consultas assíncronas.
5. Pedido, atestado e concessão precisam coincidir exatamente em tenant, sujeito/tipo, operação, fonte, tipo documental, escopo, documento e orçamento quando aplicável. Nenhum wildcard ou concessão automática. Claims desconhecidas e tentativa de incluir papel/sujeito no pedido são rejeitadas.
6. Operações modeladas: leitura documental, importação de orçamento e edição financeira. Importação exige serviço e permissão explícita; edição exige usuário Entra, Comprador, permissão e concessão no orçamento. Essa matriz é regra do laboratório baseada na proposta técnica, não confirma atribuições reais da empresa/Entra.
7. Antes do resolver v2, linhas de catálogo são filtradas por tenant/fonte/tipo/escopo e copiadas/validadas. Concessão e expiração são rechecadas antes e depois da consulta. O contexto também tem proveniência privada; copiá-lo não libera o catálogo.

## Matriz de decisão simulada

| Cenário | Decisão |
|---|---|
| Serviço com permissão de importação, atestado e concessão exatos | Autoriza contexto simulado |
| Usuário Entra Comprador com permissão e concessão no orçamento | Autoriza contexto simulado |
| Consulta documental com permissão e concessão exatas | Autoriza contexto simulado |
| Identidade/credencial ausente, inválida ou sem proveniência | Nega |
| Atestado de cliente, expirado, futuro, emissor/audiência divergentes | Nega |
| Tenant, sujeito, fonte, documento, operação ou orçamento divergentes | Nega |
| Permissão ou concessão ausente/revogada/expirada | Nega |
| Consulta/Operador tentando edição, serviço tentando editar, usuário tentando importar | Nega |
| Fornecedor em outro tenant/fonte/tipo/escopo, inativo ou ambíguo | Nega resolução |
| Falha de verificador/repositório, relógio ou retorno malformado | Nega |
| Alteração de claims/cópias/provas de outra instância | Nega ou impede mutação |
| Produção, desenvolvimento, ausência de marcador de teste | Desabilita simulação |

## Pendências para autenticação real

As interfaces ainda não implementam criptografia JWT/JWS, confiança em chaves, validação da sessão Entra, revogação de identidade/sessão, replay/jti, vinculação de método/caminho/corpo, MFA, CSRF/Origin, rate limiting, auditoria e rotação. A identidade técnica de importação requer também credencial própria e ciclo de revogação/expiração. É necessária nova etapa autorizada para selecionar/verificar biblioteca e adaptadores reais, sem reaproveitar mocks.

As verificações antes/depois das dependências não garantem atomicidade contra revogação ocorrida imediatamente após a última decisão. Persistência futura deve revalidar autorização junto à operação/transação. O catálogo precisa ter metadados de escopo mantidos por fonte confiável; se um registro for classificado incorretamente pelo repositório, a política não detecta sua origem real. A administração do servidor controla as variáveis de ambiente e a injeção de dependências; falsificar ambos os marcadores de teste explicitamente não é uma defesa contra administrador comprometido.

Não houve decisão crítica exigindo implementação real nesta etapa: essas capacidades foram mantidas como interfaces/pêndencias. Relação de documento/orçamento, concessões de negócio e atribuições reais seguem pendentes antes de produção.

## Etapa D — requisitos, sem execução

Ensaiar em banco isolado/restaurável o escopo de tenants/fontes, identidade e controle documental v2, resolução/mapeamento de fornecedor, vínculos de orçamento e concessões, histórico financeiro e versão. Definir constraints compostas/únicas e separação de roles reader/importador/editor/migrador, reconciliação de dados legados, grants mínimos, backup/restauração e testes concorrentes de integridade/rollback. Confirmar fonte única de migrações e regras de negócio antes de qualquer schema. Não copiar dados/segredos do laboratório para o principal.

Nenhuma dessas ações foi executada na Etapa C.

## Validação da entrega

- Suíte completa da Operator API: **321 testes aprovados em 9 arquivos**, incluindo **72 novos testes** da Etapa C e os 249 anteriores.
- `tsc --noEmit --incremental false`: concluído com código 0, sem erros.
- Comparação SHA-256 de **257 arquivos existentes** com snapshot anterior à implementação: nenhum alterado ou removido, incluindo contratos v1/v2, testes da Etapa B, autenticação/rotas/pool, configuração e alterações pendentes de outros trabalhos.
- Quatro arquivos adicionados, listados acima e este documento. Nenhum arquivo anterior modificado.
- Referências ao novo módulo: apenas testes; nenhuma referência nas rotas ou autenticação de produção. Busca por exports POST/PATCH/PUT/DELETE nas rotas: nenhum encontrado. Testes adicionais verificam que o guard HTTP existente rejeita os quatro métodos com 405 antes de executar a ação.
- Fontes novas não importam banco, Graph, n8n ou biblioteca JWT, não contêm chamadas de rede nem SQL. Teste do fluxo simulado completo verifica ausência de chamadas a fetch; verificadores, concessões e catálogo são mocks locais.
- Diff do módulo inspecionado; verificação de whitespace também aplicada aos quatro arquivos novos (que ainda são untracked). Nenhum commit/push realizado.

Testes de autenticação/criptografia/revogação reais, Entra/Graph/SharePoint/n8n, banco/persistência, deploy e E2E de escrita **não executados**, pois são explicitamente excluídos desta etapa e os adaptadores reais não existem. Build não executado: não é requisito desta etapa de módulos isolados; evitou-se gerar artefatos de framework no projeto. Nenhuma verificação obrigatória desta entrega falhou.
