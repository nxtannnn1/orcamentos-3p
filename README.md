# Sistema 3P

Solução interna da 3P para **processar, padronizar, comparar e validar orçamentos de fornecedores**.

O Sistema 3P organiza os itens recebidos em orçamentos, associa cada item a um material do catálogo oficial e apoia a decisão humana com comparação de preços e histórico. A automação sugere; a aprovação é sempre de uma pessoa autorizada, com registro de quem decidiu e quando.

> O projeto está em fase de **MVP**. Parte dos componentes já foi exercitada no ambiente Microsoft 365 da 3P, mas a homologação formal ainda não foi concluída. O estado detalhado de cada componente está em [Status técnico do MVP](docs/STATUS-TECNICO-MVP.md).

## Como funciona

```text
 Orçamento do fornecedor
          │
          ▼
 1. Registro          Cabeçalho e itens em Orcamentos e Itens_Importados (SharePoint)
          │
          ▼
 2. Padronização      Normalização das descrições, preservando o texto original (n8n)
          │
          ▼
 3. Associação        Sugestão de Material Oficial por código ou chave exata; ambiguidade vai para revisão
          │
          ▼
 4. Revisão humana    Correção, aprovação ou rejeição no Operator Web, com autoria e controle de versão
          │
          ▼
 5. Comparação        Ofertas aprovadas do mesmo material, em unidade compatível, lado a lado
          │
          ▼
 6. Histórico         Itens aprovados registrados em Historico_Precos (Power Automate) e indicadores (Power BI)
```

Princípios que orientam todas as etapas:

- **Equivalência explícita:** dois itens só são comparados quando apontam para o mesmo Material Oficial. Descrições parecidas não criam associação.
- **Sugestão não é decisão:** a menor oferta e o material sugerido são apoio visual. Nada é aprovado automaticamente.
- **Fidelidade à origem:** o dado original é preservado; a padronização não descarta informações técnicas como tensão, classe ou dimensões.
- **Falha segura:** sem permissão, auditoria ou versão confirmada, a gravação é bloqueada em vez de prosseguir.

## Funcionalidades

Estados usados: **implementado**, **testado localmente**, **exercitado no ambiente real** (teste controlado no Microsoft 365 da 3P), **homologado** e **planejado**. Nenhuma funcionalidade está homologada ainda.

| Funcionalidade | Estado |
| --- | --- |
| Fila de orçamentos, consulta de itens e catálogo | Implementado; leitura exercitada no ambiente real |
| Correção, aprovação e rejeição de itens com autoria e ETag | Implementado; exercitado no ambiente real com registros de teste |
| Login Microsoft Entra ID com perfis Consulta, Operador e Comprador | Implementado; exercitado em desenvolvimento; MFA e produção pendentes |
| Comparação de preços com pré-seleção e indicadores por material | Implementado e testado localmente |
| Persistência da pré-seleção e cesta de compras | Planejado |
| Ponte de Materiais Oficiais por código SAP, com aprovação supervisionada | Implementado e testado localmente; pendente no n8n |
| Registro de itens aprovados em `Historico_Precos` | Fluxo Power Automate em operação; versão revisada implementada, não publicada |
| Painel de compras no Power BI | Implementado; publicação planejada |
| Consulta via Operator API e PostgreSQL | Implementado, somente leitura; testado localmente |

Extração automática de PDFs por OCR ou IA **não é requisito da primeira entrega**. A entrada estruturada de orçamentos é o caminho principal do MVP.

## Arquitetura

```text
                  Operador / Comprador
                          │
                          ▼
        ┌───────────────────────────────────┐
        │   Operator Web (Next.js + BFF)    │──── Microsoft Entra ID (login)
        │   revisão, decisão e comparação   │──── Redis REST (sessões e auditoria)
        └────────────────┬──────────────────┘
                         │ DATA_SOURCE
         ┌───────────────┼────────────────────┐
         ▼               ▼                    ▼
       mock         sharepoint           operator-api
   dados simulados  Microsoft Graph      Operator API → PostgreSQL
                    → SharePoint Lists   (somente leitura)
                         ▲
          ┌──────────────┼──────────────┐
          │              │              │
         n8n      Power Automate     Power BI
     ingestão e     histórico de     indicadores
     materiais      preços
```

| Componente | Responsabilidade |
| --- | --- |
| **Operator Web** | Interface de revisão e comparação, com BFF que concentra autenticação, autorização e acesso aos dados. |
| **SharePoint Lists** | Fonte operacional: `Orcamentos`, `Itens_Importados`, `Materiais_Oficiais`, `Tributos_Itens_Orcamentos` e `Historico_Precos`. |
| **n8n** | Ingestão de orçamentos, normalização, associação de materiais e ponte do catálogo Neoenergia para `Materiais_Oficiais`. |
| **Power Automate** | Cópia dos itens aprovados para `Historico_Precos`. |
| **Power BI** | Indicadores de compras sobre as listas, com exclusão de registros de teste. |
| **Operator API** | Serviço de consulta somente leitura sobre PostgreSQL, opcional no MVP. |

As fontes de dados do Operator Web não têm fallback automático entre si: o comportamento depende da fonte configurada. O `auth-service` (Java/Spring Boot) é experimental e está fora do MVP.

## Como executar

Pré-requisitos: Node.js e npm. A CI usa **Node.js 24.16.0**; versões anteriores não foram verificadas. No PowerShell, use `npm.cmd` caso a política de execução bloqueie `npm`.

**Interface com dados simulados** (sem credenciais nem integrações):

```powershell
cd system/apps/operator-web
npm install
npm run dev
```

Sem `DATA_SOURCE` definido, a fonte é `mock`. O `.env.example` lista os nomes das variáveis aceitas; valores reais ficam apenas no `.env.local`, fora do Git. O acesso exige login, exceto pelo bypass local descrito em [Login Microsoft](system/apps/operator-web/docs/LOGIN-MICROSOFT.md).

**Demonstração isolada**, com dados fictícios e sem login corporativo:

```powershell
cd system/apps/operator-web
npm run dev:demo      # abre em http://127.0.0.1:3100/demo
```

**Validação do Operator Web** (os mesmos passos da CI):

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

**Automações n8n**, testes e validação offline dos workflows, a partir da raiz:

```powershell
node --test scripts/n8n/material-bridge-sap.test.mjs scripts/n8n/material-bridge.test.mjs scripts/n8n/workflow-integrity.test.mjs
node scripts/n8n/validate-workflows.mjs
```

Para usar SharePoint, Operator API ou Redis reais, siga os guias de cada componente na seção [Documentação](#documentação). Nenhum comando acima grava em sistemas reais.

## Estrutura do repositório

```text
.
├── .github/workflows/          CI, varredura de segredos e qualidade
├── docs/                       Documentação transversal do projeto
├── scripts/                    Utilitários (n8n, infraestrutura local)
└── system/
    ├── apps/operator-web/      Interface e BFF (Next.js)
    ├── automation/
    │   ├── n8n/                Workflows sanitizados e documentação
    │   └── power-automate/     Fluxos do Power Automate
    ├── analytics/powerbi/      Projeto Power BI (PBIP) e gerador
    ├── services/
    │   ├── operator-api/       API de consulta somente leitura
    │   └── auth-service/       Serviço experimental, fora do MVP
    ├── database/               Modelagem e laboratório PostgreSQL/Prisma
    └── infrastructure/         Contratos das listas, execução local, Redis e Kubernetes
```

## Documentação

| Tema | Documento |
| --- | --- |
| Estado técnico, riscos e prioridades | [Status técnico do MVP](docs/STATUS-TECNICO-MVP.md) |
| Guias de estudo por componente | [Estudos](docs/ESTUDOS.md) |
| Regras para agentes e contribuição | [AGENTS.md](AGENTS.md) |
| Operator Web: visão geral e execução | [README do Operator Web](system/apps/operator-web/README.md) |
| Arquitetura do Operator Web | [Arquitetura](system/apps/operator-web/docs/ARQUITETURA.md) |
| Segurança operacional | [Segurança operacional](system/apps/operator-web/docs/SEGURANCA-OPERACIONAL.md) |
| Testes | [Guia de testes](system/apps/operator-web/docs/GUIA-DE-TESTES.md) |
| Login Microsoft | [Login Microsoft](system/apps/operator-web/docs/LOGIN-MICROSOFT.md) |
| Contratos das listas SharePoint | [Microsoft Lists](system/infrastructure/microsoft-lists/README.md) |
| Workflows n8n | [Camada n8n](system/automation/n8n/README.md) |
| Ponte de Materiais Oficiais por SAP | [Ponte R02](scripts/n8n/material-bridge-sap.md) |
| Power BI | [Projeto 3P-Compras](system/analytics/powerbi/README.md) |
| Operator API | [README da Operator API](system/services/operator-api/README.md) |
| Execução local com Docker | [Infraestrutura local](system/infrastructure/local/README.md) |

## Segurança

- **Nenhum segredo no Git.** Credenciais, tokens e IDs de ambiente ficam em variáveis do servidor ou em cofres; os arquivos versionados usam marcadores.
- **Exports sanitizados.** Workflows n8n, fluxos Power Automate e projetos Power BI só entram no repositório sem IDs corporativos, dados pessoais ou credenciais.
- **Autorização no servidor.** Perfis e permissões são verificados no BFF; um botão desabilitado não é controle de segurança.
- **Escrita controlada.** Gravações exigem sessão válida, perfil autorizado, versão atual do registro (ETag) e auditoria. Na dúvida sobre o resultado, o registro é relido; a operação nunca é repetida às cegas.
- **Permissões mínimas.** O acesso ao Microsoft Graph é restrito às listas e operações necessárias.

## Estado do projeto

O MVP tem a jornada de revisão e decisão implementada e já exercitada com registros de teste no SharePoint. As frentes de automação (n8n, Power Automate) e indicadores (Power BI) avançam em paralelo, cada uma com a própria homologação.

Próximos passos:

1. Concluir a homologação formal da decisão pelo Operator Web, incluindo MFA e hospedagem.
2. Homologar a ponte de Materiais Oficiais na instância n8n, primeiro somente em leitura.
3. Publicar a versão revisada do fluxo de Histórico de Preços.
4. Publicar o painel Power BI com atualização agendada.

Detalhes, evidências e riscos: [Status técnico do MVP](docs/STATUS-TECNICO-MVP.md).
