Sistema de Processamento e Padronização de Orçamentos (Sistema 3P)
Repositório de desenvolvimento do Sistema 3P, voltado à ingestão estruturada, padronização, consulta e validação de orçamentos e itens de fornecedores, com governança sobre as decisões humanas e a persistência dos dados.
Baseline de desenvolvimento: a branch infra-lab é a referência atual informada para o projeto. A documentação abaixo distingue a visão funcional do MVP das funcionalidades implementadas e efetivamente validadas. A publicação dos commits documentais e a aprovação do CI não equivalem à homologação completa das integrações externas.

1. Objetivo e escopo do MVP
O MVP tem como objetivo estruturar o processamento de orçamentos e apoiar a conferência humana de itens, materiais e informações comerciais. O fluxo funcional pretendido abrange:
1. Entrada estruturada de orçamento: recebimento de dados padronizados, incluindo cabeçalho e itens, sem depender inicialmente de OCR ou extração automática de PDFs.
2. Validação de cabeçalho e itens: verificação de integridade, consistência e campos esperados para os registros de Orcamentos e Itens_Importados.
3. Normalização de materiais: limpeza e padronização das descrições recebidas, preservando a fidelidade aos dados de origem.
4. Associação ao catálogo oficial: correspondência determinística com Materiais_Oficiais, sem escolha arbitrária em situações de empate ou ambiguidade.
5. Tratamento tributário: organização dos tributos associados aos itens, considerando a modelagem de Tributos_Itens_Orcamentos.
6. Persistência governada: proteção contra duplicidade e sobrescrita indevida de decisões humanas em reprocessamentos.
7. Validação humana: revisão dos itens e decisão final por operador autorizado, com rastreabilidade.
Importante: os itens acima descrevem o fluxo-alvo do MVP. Não devem ser interpretados como confirmação de que todos os estágios já operam integrados e homologados no ambiente real.
2. Estado atual da implementação
A aplicação possui uma interface Operator Web e diferentes fontes de dados selecionáveis por configuração. Os caminhos têm capacidades distintas:
Fonte	Situação conhecida	Consulta	Decisão/persistência
mock	Ambiente simulado para desenvolvimento e testes	Dados simulados	Decisões simuladas em memória; não persistem nos sistemas reais
operator-api	Integração de leitura com serviço e PostgreSQL	Implementada como leitura somente; há testes automatizados, mas a execução atual não realizou teste live	Aprovação/rejeição bloqueadas na interface e no servidor
sharepoint	Integração com Microsoft Graph e Microsoft Lists	Caminho implementado, sujeito a configuração e permissões reais	Código de escrita existente, sem validação ponta a ponta no ambiente real


Não há fallback automático entre as fontes: o comportamento depende da fonte configurada.
2.1. Operator Web
Aplicação Next.js/React localizada em system/apps/operator-web. Oferece a interface de consulta e revisão de orçamentos, com fronteiras entre apresentação, domínio, repositórios e integrações de servidor. A disponibilidade de ações depende da fonte de dados e das regras de autorização.
2.2. Operator API e PostgreSQL
A Operator API é um serviço de consulta que acessa dados do PostgreSQL com operações somente de leitura. O Operator Web se comunica com esse serviço por uma integração de servidor para servidor, distinta da identidade do usuário final. Esse caminho não deve ser descrito como motor de aprovação ou gravação do MVP.
Uma validação local de leitura PostgreSQL foi registrada na documentação do projeto; na execução mais recente relatada, foram comprovados testes automatizados e build, enquanto o teste de integração live permaneceu não executado.
2.3. SharePoint / Microsoft Lists
O caminho SharePoint usa as listas Orcamentos, Itens_Importados e Materiais_Oficiais. Há lógica de revisão e decisão com controle de concorrência, mas a gravação real ainda depende de verificações e configurações externas, incluindo:
- Concessões de acesso Microsoft Graph apropriadas às listas.
- Confirmação dos nomes internos e tipos dos campos de auditoria.
- Infraestrutura de Redis necessária ao fluxo seguro de decisão e auditoria.
- Validação da verificação de permissões e do uso de ETag/If-Match.
- Teste de homologação autorizado, com releitura e conferência do resultado gravado.
A existência do código de escrita não significa que a persistência SharePoint esteja homologada. Não se deve contornar permissões, auditoria ou concorrência para simular a conclusão dessa etapa.
2.4. Autenticação e autorização
A arquitetura inclui fluxos de autenticação Microsoft e verificações de autorização no Operator Web. Há também um auth-service em Java/Spring Boot, com código e testes específicos de segurança/OIDC, cuja integração operacional ao MVP não foi demonstrada como dependência obrigatória.
O bypass local de desenvolvimento é restrito a condições controladas e não constitui substituto de autenticação, MFA e autorização validadas no ambiente real.
3. Arquitetura operacional resumida
                      [ Operador humano ]
                              |
                              v
                 [ Operator Web (Next.js) ]
                              |
                 [ Fonte de dados configurada ]
                              |
           +------------------+------------------+
           |                  |                  |
           v                  v                  v
      [ mock ]          [ operator-api ]   [ sharepoint ]
   Dados simulados       Operator API       Microsoft Graph
   Decisão em memória      |                Microsoft Lists
                           v                     |
                      PostgreSQL                 v
                     SOMENTE LEITURA       Revisão / decisão
                                           NÃO HOMOLOGADA
Limites importantes:
- A Operator API não grava decisões.
- O mock não representa persistência real.
- O SharePoint tem implementação de escrita, mas ainda requer validação controlada.
- O fluxo de processamento de orçamento, normalização, tributos e homologação descrito no escopo é a visão funcional, não a comprovação de uma esteira integrada já operacional.
4. Fluxo funcional pretendido do MVP
        [ Entrada estruturada de orçamento (JSON) ]
                           |
                           v
             [ Validação de cabeçalho e itens ]
                           |
                           v
                [ Normalização de materiais ]
                           |
                           v
        [ Associação determinística ao catálogo oficial ]
                           |
                           v
              [ Tratamento dos dados tributários ]
                           |
                           v
            [ Persistência controlada e idempotente ]
                           |
                           v
               [ Revisão e validação humana ]
A ordem representa o fluxo de negócio pretendido. A implementação e a homologação de cada etapa devem ser acompanhadas individualmente. Em especial, os caminhos de leitura e decisão disponíveis hoje não devem ser confundidos com uma execução ponta a ponta desse fluxo.
5. Estrutura de referência do repositório
├── .github/workflows/                # CI e verificações automatizadas
├── scripts/                          # Utilitários de apoio e validação
├── system/
│   ├── apps/
│   │   └── operator-web/             # Interface e integrações BFF (Next.js)
│   ├── services/
│   │   ├── operator-api/             # Serviço de consulta somente leitura
│   │   └── auth-service/             # Serviço Java e estudos/implementações de autenticação
│   ├── database/                     # Artefatos de modelagem e apoio ao banco de dados
│   ├── automation/
│   │   └── n8n/                      # Definições e estudos de automação
│   └── infrastructure/
│       ├── k8s/                      # Referências declarativas de infraestrutura
│       └── microsoft-lists/          # Contratos de referência para listas
└── README.md                         # Visão geral do projeto
A árvore acima destaca os componentes relevantes à arquitetura relatada; não pretende ser uma listagem exaustiva de todos os arquivos. Consulte os READMEs locais para detalhes de execução, configuração e responsabilidades.
6. Contratos de dados e governança
Microsoft Lists
Os arquivos em system/infrastructure/microsoft-lists/ são contratos de referência sanitizados para estrutura, campos e restrições esperados. Não substituem a verificação dos nomes internos e tipos efetivos das colunas nas listas reais.
Segurança e versionamento
- Não versionar senhas, tokens, Client Secrets ou outros dados sensíveis.
- Não publicar exportações operacionais, dados de clientes ou configurações corporativas sem revisão e sanitização apropriadas.
- Tratar Power Apps, Power Automate, Power BI e exportações de n8n segundo a política de versionamento do projeto, preservando a separação entre artefatos laboratoriais sanitizados e ambientes reais.
- Evitar alterações de permissões, infraestrutura e registros reais sem autorização e plano de validação.
Princípios de engenharia
- Fidelidade aos dados: preservar a origem e evitar alterar o significado dos registros.
- Sem inferência arbitrária: sinalizar ambiguidades e solicitar decisão humana quando necessário.
- Idempotência e concorrência: evitar duplicidades e gravações sobre estados desatualizados.
- Rastreabilidade: manter evidências das decisões e dos resultados das operações.
- Supervisão humana: a automação auxilia a classificação e revisão, mas não substitui a aprovação autorizada.
- Falha segura: ausência de credenciais, permissões ou auditoria não deve habilitar escrita sem controle.
7. Fora do caminho crítico imediato e evoluções
- OCR, LLM e extração de documentos brutos: integração futura ou complementar à ingestão estruturada.
- Power Automate e n8n: automações complementares; não pressupor dependência obrigatória do fluxo inicial de validação no Operator Web.
- Histórico de preços (Historico_Precos): evolução de análise e acompanhamento temporal, após estabilização do fluxo essencial.
- Kubernetes: referência de implantação e escalabilidade, sem implicar ambiente de produção homologado.
- Ampliação da Operator API: eventual evolução além da leitura exige definição de arquitetura, autorização e testes; nenhuma capacidade de escrita deve ser presumida.
8. Pendências prioritárias para homologação
Prioridade	Frente	Evidência de conclusão esperada
P0	Permissões Graph sobre as listas	Acessos mínimos necessários confirmados e verificados
P0	Campos e mapeamento de auditoria	Schema real conferido e gravação auditável validada
P0	Redis e estado de decisões	Infraestrutura configurada e comportamento de falha segura testado
P0	Concorrência e ETag	Leitura, decisão e releitura verificadas em homologação autorizada
P1	Autenticação, MFA e perfis	Fluxos e permissões validados no tenant real
P1	Leitura PostgreSQL live	Teste de integração autorizado, reproduzível e registrado
P1	Testes completos do auth-service	PostgreSQL de testes disponível e suíte completa concluída
P2	Dependências e ambiente de CI	Alertas de ferramentas e compatibilidade revisados


Os testes e builds automatizados mais recentes relatados passaram para o Operator Web e a Operator API. Eles não substituem os testes reais de banco, Microsoft Graph, Redis, autenticação e gravação.
9. Estado do versionamento
Na última sincronização informada, infra-lab e origin/infra-lab apontavam para o commit 1fc2cbeb602ef92f9bb44b9dfd1314a1dee34e54, com diretório de trabalho limpo. O workflow Validate Operator Web concluiu com sucesso, incluindo 165 testes aprovados e um teste ignorado. Esse registro descreve o último estado reportado e deve ser revalidado antes de ser usado como status permanente do projeto.
A documentação específica do Operator Web, incluindo arquitetura, fluxos e limites das fontes de dados, encontra-se em system/apps/operator-web/.