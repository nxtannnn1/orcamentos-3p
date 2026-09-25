# Sistema de Processamento e Padronização de Orçamentos (Sistema 3P)

Repositório de automação, padronização e estruturação do processamento de orçamentos e itens de fornecedores para o Sistema 3P.

> **Baseline Canônica:** A branch `infra-lab` é a baseline canônica atual do projeto, consolidando a arquitetura de referência, automações estruturadas, serviços auxiliares e contratos de dados.

---

## Escopo Real do MVP (Caminho Crítico)

O MVP (Mínimo Produto Viável) foca no fluxo essencial de ingestão estruturada, higienização, vinculação a catálogo mestre e persistência com governança. O caminho crítico do MVP é composto pelas seguintes etapas:

1. **Entrada Estruturada de Orçamento:** Ingestão orientada a dados a partir de payloads JSON padronizados (contendo metadados de cabeçalho e lista de itens), desacoplando o núcleo de processamento das variabilidades de OCR e extração não estruturada.
2. **Processamento de Cabeçalho e Itens:** Validação de integridade e estruturação dos dados para as listas `Orcamentos` (cabeçalho) e `Itens_Importados` (detalhamento técnico e comercial).
3. **Normalização de Materiais:** Padronização textual de descrições de materiais recebidos (limpeza de caracteres, remoção de ruídos e formatação canônica).
4. **Associação ao Catálogo `Materiais_Oficiais`:** Cruzamento determinístico da descrição normalizada contra o catálogo mestre de materiais (`Materiais_Oficiais`). O mecanismo prioriza correspondência exata ou sugestão de candidato único; empates ou ambiguidades são bloqueados sem inferências arbitrárias.
5. **Tratamento de Tributos:** Estruturação, segregação e registro dos dados tributários vinculados a cada item na lista `Tributos_Itens_Orcamentos`.
6. **Persistência Controlada e Idempotente:** Gravação consistente no destino de persistência (como SharePoint / Microsoft Lists), assegurando que reprocessamentos mantenham a integridade dos registros e não sobrescrevam decisões humanas prévias.
7. **Validação Humana:** Ponto de controle indispensável na esteira. O sistema sugere correspondências e estrutura os registros, mas a homologação e aprovação final de itens permanecem sob responsabilidade do operador humano.

---

## Fluxo Operacional do MVP

```text
       [ Entrada Estruturada (Payload JSON) ]
                         │
                         ▼
        ┌───────────────────────────────────┐
        │  Processamento de Cabeçalho e     │
        │  Itens (Orcamentos / Itens)       │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │  Normalização de Materiais        │
        │  (Padronização Textual)          │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │  Associação Determinística        │
        │  (Catálogo Materiais_Oficiais)    │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │  Tratamento de Tributos           │
        │  (Tributos_Itens_Orcamentos)      │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │  Persistência Controlada e        │
        │  Idempotente (SharePoint / Lists) │
        └─────────────────┬─────────────────┘
                          │
                          ▼
        ┌───────────────────────────────────┐
        │  Validação e Homologação Humana   │
        │  (Revisão e Aprovação de Itens)   │
        └───────────────────────────────────┘
```

---

## Componentes Fora do Caminho Crítico e Evoluções Futuras

Os seguintes módulos e iniciativas encontram-se fora do caminho crítico do MVP, constituindo frentes de pesquisa, experimentação ou expansão futura:

- **Extração Automática por IA e Power Automate:** Pipelines de extração ponta a ponta via OCR/LLM a partir de arquivos PDF brutos e fluxos acionados via Power Automate são frentes de entrada complementares em maturação, não sendo requisitos bloqueantes para a execução do core do MVP.
- **Histórico de Preços (`Historico_Precos`):** A modelagem de dados para armazenamento temporal de histórico e comparativos analíticos de preços está prevista no design da solução, mas sua consolidação será integrada após a estabilização do ciclo de aprovação do MVP.
- **`auth-service`:** Microsserviço Spring Boot (`system/services/auth-service`) desenvolvido em caráter de laboratório para estudos de autenticação centralizada e integração com Microsoft Graph. Está estritamente fora do MVP e representa apenas uma possibilidade de evolução futura, não constituindo dependência da arquitetura operacional atual.
- **Orquestração com Kubernetes (`system/infrastructure/k8s`):** Manifests de implantação mantidos como referência declarativa de arquitetura em nuvem/contêineres para suportar futuras fases de escalabilidade.
- **Banco de Dados Dedicado (`system/database`):** Modelagem relacional e schemas Prisma mantidos em ambiente de laboratório para eventual migração ou espelhamento dos dados além do SharePoint.

---

## Estrutura do Repositório

```text
├── .github/workflows/          # Automações de CI, testes de integração e qualidade
├── scripts/                    # Utilitários de apoio ao desenvolvimento e validação
│   ├── k8s/                    # Scripts auxiliares de configuração de ambiente k8s
│   └── n8n/                    # Validadores e analisadores de integridade de workflows
├── system/
│   ├── automation/
│   │   └── n8n/                # Definições laboratoriais e lógicas de automação
│   ├── database/               # Modelagem relacional (DER, Prisma) em fase de laboratório
│   ├── infrastructure/
│   │   ├── k8s/                # Manifests Kubernetes mantidos como referência futura
│   │   └── microsoft-lists/    # Contratos de referência de dados e documentação de listas
│   └── services/
│       └── auth-service/       # Serviço experimental mantido como referência futura
└── README.md                   # Documentação mestre do projeto
```

---

## Contratos de Dados e Diretrizes de Governança

### Schemas do Microsoft Lists
Os arquivos de schema localizados em `system/infrastructure/microsoft-lists/` (`*.schema.json`) funcionam como **contratos de referência sanitizados**. Eles definem a especificação canônica das colunas, tipos e restrições lógicas esperadas pelas integrações, não correspondendo a dumps automáticos do ambiente real.

### Política de Versionamento
- **Não Versionado no Repositório:** Power Apps, Power Automate, Power BI e exports operacionais do n8n não devem ser versionados sob nenhuma hipótese.
- **Critério de Inclusão no Repositório:** Somente ferramentas, código ou definições laboratoriais totalmente sanitizadas e independentes de IDs, URLs, tenants, credenciais ou referências ao ambiente corporativo podem ser mantidas no Git.

---

## Princípios de Engenharia e Integridade

- **Fidelidade aos Dados:** Dados extraídos e transitados mantêm correspondência estrita com a fonte de entrada.
- **Ausência de Inferência:** O sistema não infere nem inventa dados ausentes; quando há ambiguidade na associação de materiais, o status é registrado como tal para análise humana.
- **Persistência Controlada e Idempotente:** Operações de gravação asseguram consistência sem duplicidade de dados, respeitando a integridade referencial e preservando intervenções humanas em reprocessamentos.
- **Supervisão Humana:** A automação atua como assistente determinístico para padronização e sugestão; o controle de qualidade e a decisão final são exercidos pelo operador validador.
