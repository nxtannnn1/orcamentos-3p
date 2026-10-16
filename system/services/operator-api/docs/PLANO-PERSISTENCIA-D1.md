# Sistema 3P — D1: auditoria estática e projeto de persistência

Data: 09/10/2026. Estado: projeto para revisão, sem execução de D2. Único arquivo criado nesta etapa: este documento. Nenhum banco, código funcional, infraestrutura ou arquivo anterior foi alterado.

## 1. Resultado executivo e limites da evidência

É viável reutilizar `fornecedor`, `orcamento` e `item_orcamento`, acrescentando escopos, vínculos autorizados, identidade documental e histórico. O schema encontrado ainda não oferece unicidade documental, isolamento de tenants, resolução externa de fornecedor, versão financeira ou histórico obrigatório de edição. A canonicalização v2 e a política simulada da Etapa C são componentes de aplicação, não garantias de persistência existentes.

**Auditoria dinâmica não realizada.** A consulta ao inventário Docker falhou porque o daemon Docker Desktop Linux não estava disponível. Não foi possível identificar e confirmar uma instância autorizada; não houve conexão PostgreSQL, tentativa de descobrir outra instância, inicialização de containers ou leitura de credenciais. Isso atende à regra de interromper a inspeção dinâmica diante de incerteza sobre o ambiente. A análise estática é a alternativa autorizada para D1.

Consequentemente, versão atual, schemas adicionais, roles/grants efetivos, triggers adicionados fora das migrações, histórico Flyway aplicado, contagens de dados e divergências live são **não verificados**. Ausência de objeto nos arquivos não demonstra ausência no banco. Os números abaixo descrevem a V1 encontrada no repositório.

## 2. Inventário da arquitetura e fonte de migrações

Repositório: `C:\Users\natan\OneDrive\Documentos\Projetos\3P - Sistema`. Branch: `infra-lab`. HEAD observado: `1356568` — `feat: add read-only operator API and frontend integration`.

| Fonte real | Evidência e papel |
|---|---|
| `system/database/schema.sql` | Desenho PostgreSQL inicial, com 11 tabelas e 5 enums; não comprovado como mecanismo de instalação ativo |
| `system/services/auth-service/src/main/resources/db/migration/V1__initial_schema.sql` | Única migração SQL versionada encontrada nesse diretório; formato de dump, objetos em `public` |
| `system/services/auth-service/src/main/resources/application.properties:103–104` | Flyway habilitado, `classpath:db/migration` |
| `system/services/auth-service/src/main/resources/application-local.properties` | Perfil local desabilita Flyway e autoconfiguração JDBC/JPA |
| `system/services/auth-service/pom.xml` | Dependências Flyway e suporte PostgreSQL |
| `system/database/compose.yml` | Imagem `postgres:18`, nome esperado `3p-postgres`, porta publicada `5432:5432`, volume `/var/lib/postgresql`; não comprova versão patch, instância em execução ou dados |
| `system/services/auth-service/docker-compose.yaml` | Serviço separado, rede externa `database_default`; não executar serviço para auditar, pois perfil efetivo pode iniciar migrações |
| `system/database/prisma/schema.prisma`, `prisma.config.ts`, `prisma/migrations/migration_lock.toml` | Provider SQLite, datasource local `file:./dev.db`; duas migrações init com sintaxe SQLite/AUTOINCREMENT |
| `system/database/prisma/check.sql` | Consulta a `sqlite_master`, não PostgreSQL |
| `system/services/operator-api/src/server/db/schema.ts` | Projeção Drizzle parcial de leitura: fornecedor, orçamento, item e material oficial. Não encontrada configuração própria drizzle-kit de migrações |
| `system/services/operator-api/src/server/db/client.ts` | Pool reader, `default_transaction_read_only=on`, transações `BEGIN READ ONLY`, verificação de role contra privilégios de escrita/owner/superuser/BYPASSRLS |
| `src/importacao/validar-orcamento*.ts`, `hash-orcamento*.ts`, `fornecedor-v2.ts` | Contratos puros v1/v2, cálculo exato, identificação e resolução em catálogo confiável; sem persistência |
| `src/seguranca/contratos.ts`, `simulacao-autorizacao.ts` | Identidade, atestado e grants exatos em mocks; bloqueio fora de testes. Nenhuma autenticação real utilizável por SQL |

**Conclusão sobre fonte efetiva:** Flyway é o mecanismo PostgreSQL **configurado** no auth-service. Não se comprova que esse perfil foi executado, que V1 está aplicada ou que houve baseline. Prisma é laboratório SQLite; Drizzle é leitura. Recomenda-se escolher Flyway como único responsável pela evolução PostgreSQL, em processo administrativo dedicado, após conferir o histórico real e ownership. Não editar/reaplicar a V1 nem executar `repair` para esconder divergências. A localização definitiva das próximas migrações e o desacoplamento do auth-service precisam ser aprovados antes de D2.

README/visão geral de `system/database` ainda descrevem laboratório SQLite e SharePoint/n8n operacional; são contexto histórico, não evidência de implantação atual. Os arquivos PostgreSQL e SQLite têm nomes, tipos, ações de FK e estratégias de precisão diferentes; não mesclar os dois históricos.

Estado Git inicial: Compose já modificado; documentos, módulos e testes das etapas anteriores ainda untracked. Todos devem ser preservados. Não fazer commit/push como parte da auditoria.

## 3. Inventário PostgreSQL comprovado nos arquivos

O cabeçalho da V1 registra dump de PostgreSQL **18.6** e pg_dump 18.6. É informação histórica do arquivo, não identificação da instância atual.

| Categoria | Encontrado na V1 |
|---|---|
| Schema qualificado | `public` para objetos de negócio; sem criação de outros schemas |
| Tabelas / PKs | 11 / 11, PK simples `id integer` |
| Identity | 11 `GENERATED BY DEFAULT AS IDENTITY`; sequências associadas declaradas no dump, incremento 1, faixa integer |
| FKs | 16, todas sem tenant, referências por IDs simples |
| UNIQUE de negócio | 2: `material_neoenergia(chave_importacao)` e `material_fornecedor_homologado(material_neoenergia_id,fornecedor_id)` |
| Índices explícitos | 27 B-tree; além dos índices de suporte às PKs/UNIQUE |
| CHECK / triggers / funções próprias | Nenhum encontrado nessa V1 |
| Índices parciais | Nenhum encontrado nessa V1 |
| Roles/grants/RLS | Não declarados na V1; privilégios e políticas reais desconhecidos |
| Histórico Flyway | Tabela/histórico aplicado não auditados; V1 no filesystem não prova sucesso ou checksum aplicado |

Enums: `status_registro={ATIVO,INATIVO}`; `status_associacao={EXATO,SEMASSOCIACAO}`; `motivo_material={MATCH_EXATO_ATIVO,CANDIDATO_TECNICO_UNICO,CANDIDATOS_AMBIGUOS,SEM_CANDIDATO_COMPATIVEL}`; `fonte_neoenergia={NEOENERGIA_REDE,NEOENERGIA_SUBESTACOES}`; `status_carrinho={RASCUNHO,CALCULADO,APROVADO,CANCELADO}`. `fonte_neoenergia` é origem de catálogo técnico, não a fonte documental `sharepoint` do contrato v2.

### 3.1 Entidades e colunas

Todas as tabelas da V1 têm `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. Não há trigger encontrado para atualizar automaticamente `updated_at` em edições.

| Tabela | Colunas/relações relevantes comprovadas |
|---|---|
| `cliente` | `nome VARCHAR(255) NOT NULL`, documento opcional, status; orçamento referencia cliente |
| `fornecedor` | Razão social obrigatória; nome fantasia, CNPJ `VARCHAR(30)`, email e telefone opcionais; status. Índice de CNPJ **não único** |
| `orcamento` | Número `VARCHAR(100)`, cliente/fornecedor opcionais, data TIMESTAMPTZ; subtotal/frete/desconto/tributos/total NUMERIC(18,2) nullable; status, arquivo TEXT, `drive_file_id VARCHAR(255)` |
| `item_orcamento` | Orçamento obrigatório; número e código opcionais; descrições original/normalizada, unidade VARCHAR(50); quantidade/preço unitário/total NUMERIC(18,4) nullable; material opcional, flags/regras de associação e observação |
| `material_oficial` | Nome/nome normalizado VARCHAR(500) obrigatórios, categoria, especificação técnica, status |
| `material_neoenergia` | Material oficial opcional; códigos regionais, descrição/especificação, família/subfamília, fonte enum e chave de importação TEXT única |
| `material_fornecedor_homologado` | Material Neoenergia e fornecedor obrigatórios; referência/desenho, datas, documentação, condições/status e observações; par material/fornecedor único |
| `cotacao` | Fornecedor obrigatório; número/data/validade, frete/desconto/total, condições, prazo e arquivo |
| `oferta_item` | Cotação e fornecedor obrigatórios; material oficial opcional; descrição, quantidade/unidade/preços, prazo e flag válida |
| `carrinho` | Orçamento obrigatório; status enum, valor base/otimizado/economia |
| `carrinho_item` | Carrinho e item de orçamento obrigatórios; oferta/fornecedor opcionais; quantidade/preços e flags de seleção |

Dependências: cliente/fornecedor → orçamento → item; material oficial → item/material Neoenergia/oferta; Neoenergia+fornecedor → homologação; fornecedor → cotação → oferta; orçamento → carrinho → carrinho item, que também referencia item/oferta/fornecedor. CASCADE aparece em orçamento→itens, carrinho→carrinho itens, cotação→ofertas e Neoenergia→homologações; as demais FKs da V1 não especificam CASCADE. Não ampliar cascatas para controle documental/histórico.

Índices explícitos cobrem nome cliente; razão social/CNPJ fornecedor; número/cliente/fornecedor orçamento; nome normalizado/categoria material; orçamento/código/material item; material/fonte/código Nordeste Neoenergia; material/fornecedor homologação; fornecedor/número cotação; cotação/fornecedor/material/valida oferta; orçamento carrinho; carrinho/item/oferta/fornecedor carrinho item. Não há índice único por número/código de item dentro de orçamento nem por drive/arquivo.

### 3.2 Auditoria dinâmica pendente

Após confirmação do alvo e autorização para acesso: registrar container/host, porta, database e finalidade sem credenciais; usar sessão somente leitura com timeout, sem iniciar o auth-service. Levantar `version()`, `current_database()`, usuário efetivo/da sessão, `pg_namespace`, `pg_class`, `pg_attribute`, `pg_type`, `pg_enum`, `pg_constraint`, `pg_index`, `pg_sequences`, `pg_trigger`, dependências e policies. Não consultar `pg_authid`, senhas, variáveis de ambiente ou conteúdo pessoal.

Histórico Flyway: localizar schema real e consultar apenas versão/tipo/script/checksum/sucesso, sem usuário de instalação desnecessário. Confirmar também eventual `_prisma_migrations`; não inferir uso pelo filesystem. Privilégios: atributos de `pg_roles`, memberships, owners, ACLs, default privileges, USAGE/CREATE de schema e privilégios efetivos de tabela/coluna/sequência/função. Contar tabelas/linhas, nulos financeiros, duplicidades de chave, órfãos e valores inválidos usando **somente agregados**, sem expor CNPJ, nomes, identificadores documentais ou conteúdo de orçamentos. Estimativas de `pg_stat_*` não substituem contagens exatas para validar constraints. A etapa atual não produziu essas estatísticas.

## 4. Divergências banco × contratos × autorização

| Tema | Comprovado nos arquivos | Necessidade proposta |
|---|---|---|
| Identidade documental | Somente `drive_file_id`, sem drive/tenant/fonte/namespace únicos | Chave composta de tenant + escopo documental + documento, independente do hash |
| Fornecedor | CNPJ nullable, indexado sem UNIQUE; sem vínculo de escopo | Identificador canônico/external exato e cadastro ativo autorizado no escopo |
| Financeiro | NULL permitido e sem CHECK | Entrada v2 completa; quantidade positiva, preços/ajustes não negativos, cálculos/limites exatos |
| Itens | Número/código nullable e sem unicidade por orçamento | Ambos obrigatórios e únicos no contrato v2 |
| Data | TIMESTAMPTZ nullable | Instante com timezone; não inventar horário para data civil |
| Hash | Nenhum campo encontrado | Versões do contrato/canonicalização e digest original imutável |
| Metadados | Arquivo/driveFileId parciais; observação de item é genérica | Preservar identidade completa, código externo, nomes documentais e observação original sem substituir revisão |
| Tenant/ACL | Nenhum modelo encontrado na API/V1 | Escopo persistido e concessão exata; papel Entra não equivale a grant SQL |
| Histórico/concorrência | Sem versão financeira/histórico próprio | Versão, transação e histórico vinculados; conflito 409 para versão obsoleta |
| Drizzle | Apenas quatro tabelas/projeção parcial | Não gerar schema de escrita a partir dela |
| Catálogo C | Metadados tenant/fonte/tipo/escopo apenas nos mocks | Representar membership real; `material_fornecedor_homologado` não substitui autorização de importação |

O v2 preserva IDs como strings e compara caixa/zeros exatamente; o banco existente usa PK integer e não informa collation efetiva. Novas chaves textuais precisam de comparação determinística sensível a caixa, por exemplo collation `C` a ensaiar. As claims da Etapa C aceitam strings até 1024 caracteres; o persistidor deve validar limites específicos, sem truncamento, e confirmar que tenant/oid corporativos são UUIDs reais. Tenants fictícios dos testes não podem ser backfill de produção.

NUMERIC(18,s) pode arredondar entrada ao converter: validar strings antes do cast; CHECK após armazenamento não detecta casas já perdidas. Considerar rejeição explícita de `NaN`, além de sinais e limites. CNPJ com formato/DV válido não comprova titularidade/situação fiscal.

## 5. Modelo lógico proposto — nada criado

**Proposta preferida:** cadastro de fornecedor reutilizado, com autorização de uso por escopo. Não duplicar fornecedor/orçamento/itens para v2. Nenhuma tabela abaixo é apresentada como existente. Aprovação depende da política de compartilhamento entre tenants e do inventário live.

| Entidade proposta/evoluída | Chave e campos | Justificativa |
|---|---|---|
| `tenant` nova | UUID corporativo PK, status e timestamps | Âncora de isolamento; não persistir credenciais ou claims completas |
| `escopo_documental` nova | BIGINT identity; tenant, fonte, tipo drive/externa, chave escopo/drive/namespace até 255, ativo | Substitui concatenação ambígua; UNIQUE `(tenant,fonte,tipo,chave)` e `(tenant,id)` |
| `fornecedor_escopo` nova | PK `(tenant,escopo_id,fornecedor_id)`, ativo e timestamps | Permite reutilizar cadastro global sem torná-lo automaticamente acessível a todos |
| `identificacao_fornecedor` nova | BIGINT identity; tenant/escopo/fornecedor, tipo CNPJ/externa, CNPJ canônico ou sistema/escopo externo/id externo | Mapeamento exato, vários identificadores de um fornecedor; FK de membership e unicidade da chave externa |
| `orcamento` evoluída | Mantém PK integer e campos existentes; acrescenta tenant, escopo documental e versão financeira | Preserva leitores existentes; FK composta para fornecedor autorizado; UNIQUE de suporte `(tenant,id)` e `(tenant,escopo_id,id)` |
| `item_orcamento` evoluída | Mantém PK integer; tenant, requisitos v2 de número/código/valores; FK `(tenant,orcamento_id)` | Impede vínculo entre tenants; UNIQUE de suporte `(tenant,orcamento_id,id)` |
| `controle_documental` nova | BIGINT identity; tenant/escopo/documento; orçamento; contrato/canonicalização; digest original; JSON canônico como TEXT; código/nome arquivo; ator técnico e instante de aceite | Identidade e única importação aceita, snapshot original e idempotência. Não duplicar cabeçalho/itens atuais; texto canônico conserva estado original após edição |
| `historico_financeiro` nova | BIGINT identity; tenant/orçamento/item; versões anterior/nova; valores anterior/novo, ajustes/subtotais/totais; requestId, ator tenant/oid, instante e versão da política | Evidência de alteração e reconciliação pós-timeout; append-only para aplicação |
| `concessao_documental` nova | BIGINT identity; tenant, sujeito, tipo usuário/serviço; escopo/documento/operação; orçamento para edição; validade/revogação e autor administrativo | Persiste grant exato da C, separado de papéis corporativos e de privilégios SQL |

`identificacao_fornecedor` usa variantes exclusivas sem campos opcionais na chave efetiva: CNPJ exige valor canônico; externa exige sistema+escopo externo+ID. Unicidade recomendada por `(tenant,escopo_documental,tipo/chave-identificacao)` via dois índices únicos parciais, um por variante. CNPJ existente pode ser reconciliado para essa tabela, sem alterar silenciosamente `fornecedor.cnpj`. Se a empresa exigir unicidade global de CNPJ e propriedade exclusiva de cadastro, essa política muda o modelo e requer aprovação. Não remover duplicados por nome.

Membership e identificação de fornecedor são configurações administrativas, não escolhas livres do importador. Inativação deve manter a linha para integridade histórica; FK prova associação estrutural, enquanto ativo/validade precisam de decisão/rechecagem transacional. Catálogo para resolução deve consultar apenas `(tenant,escopo)` autorizado, sem carregar nomes, emails ou telefones fora dele.

`controle_documental` tem FK `(tenant,escopo_id,orcamento_id)` para orçamento. UNIQUE da identidade **não inclui versão ou hash**: mudança de versão/conteúdo no mesmo documento precisa conflitar, não criar duplicata. Recomendação inicial: um documento de importação por orçamento v2, UNIQUE `(tenant,orcamento_id)`; aprovar antes de D2 caso um orçamento deva reunir vários documentos.

O snapshot canônico conserva identificação e nomes do fornecedor, observação de origem, itens e cabeçalho tal como importados. Nome de arquivo/código externo são preservados separadamente e comparados conforme contrato; não usar cadastro mestre mutável para reconstruir hash. Não aceitar JSON arbitrário de cliente. Controle também é o histórico da **importação aceita**; uma tabela adicional de tentativas só se justifica com requisitos de retenção/observabilidade aprovados, evitando redundância e gravação de dados sensíveis em falhas.

Material oficial/Neoenergia/homologações podem continuar catálogos compartilhados de referência somente leitura se a política permitir. Cotações, ofertas, clientes, carrinhos e seus itens carregam relações/dados de negócio: tenant e FKs precisam alcançar esse grafo antes de afirmar isolamento integral. Não conceder acesso amplo a essas tabelas através das novas roles. A D2 restrita ao fluxo orçamento não certifica multi-tenancy do sistema inteiro.

## 6. Matriz de constraints propostas

| Garantia | Mecanismo PostgreSQL proposto | Limite/validação adicional |
|---|---|---|
| Tenant/escopo existentes | FKs `(tenant,escopo_id)` e tenant UUID | Tenant autorizado não vem do payload importador |
| Documento único | UNIQUE NOT DEFERRABLE `(tenant,escopo_id,documento_id)` com collation determinística | Drive/namespace distinguido no escopo, sem concatenar strings |
| Orçamento/documento do mesmo tenant e fonte | FK tripla controle→orçamento, referências UNIQUE correspondentes | Colunas obrigatórias no fluxo novo; não permitir NULL contornar FKs |
| Fornecedor dentro do escopo | FK orçamento→membership `(tenant,escopo_id,fornecedor_id)`; identificação→membership | Ativo/revogação requer função transacional, não só FK |
| Identificação única | Índices únicos parciais por CNPJ ou tripla externa dentro do tenant/escopo | Primeiro reconciliar CNPJ/identificadores duplicados e inválidos |
| Item do orçamento correto | FK `(tenant,orcamento_id)` e UNIQUE `(tenant,orcamento_id,id)` | Histórico usa tenant+budget+item, não itemId sozinho |
| Número/código de item únicos | UNIQUE `(orcamento_id,numero_item)` e `(orcamento_id,codigo_item)` após reconciliação | Campos NOT NULL para v2; legados não viram v2 por default |
| Financeiro válido | CHECK intralinha com quantidade>0, valores não negativos/não NaN; produto arredondado e fórmula total | Soma de itens é interlinha e requer rotina transacional |
| Versão financeira | Versão >=0, incremento exato de 1 e UNIQUE histórico `(tenant,orcamento_id,versao_nova)` | Não pode saltar/retroceder; função/trigger verifica vínculo da alteração |
| Snapshot/hash original | Versões suportadas, digest hexadecimal lowercase de 64 chars, limites de snapshot; sem UPDATE/DELETE da aplicação | Formato não comprova SHA-256 correto; testes golden e canonicalização na aplicação |
| Históricos coerentes | FKs compostas, versão nova=anterior+1, requestId único por tenant/ação | Função de edição e guard diferido para impedir commit sem histórico |
| Grant restrito | CHECK operação/tipo, orçamento exigido para edição; FK de edição `(tenant,escopo_id,documento_id,orcamento_id)` para controle, com UNIQUE de suporte correspondente | Importação pode ser pré-autorizada antes de o documento existir; não exigir esse FK para a variante de importação. Expiração/revogação e roles verificadas na API e operação |

CHECK não valida soma/estado de outra tabela; usar FK/UNIQUE e rotina/trigger para requisitos interlinha. Também combinar CHECK e NOT NULL: uma expressão que resulte NULL não serve como proibição de NULL. [PostgreSQL 18 — constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

Para legados, adicionar tenant/escopo/versionamento nullable primeiro. Não impor requisitos v2 universalmente sem reconciliação. A elegibilidade financeira deve ser explícita, por exemplo versão não nula somente após saneamento comprovado; CHECK condicionais precisam exigir **todos** os campos/valores do modo controlado, e a função rejeita legados incompletos. Não usar NULL tenant como acesso global nem preencher valores financeiros ausentes com zero.

Grants podem ter vários eventos de concessão/revogação; se for necessário impedir dois grants ativos iguais, usar índices parciais separados para orçamento nulo/não nulo, com `revogado_em IS NULL`. Não usar `now()` como predicado de índice. Expiração não remove a linha do índice: renovar exige revogar/encerrar o grant anterior pelo fluxo administrativo. Não armazenar atestado como autorização duradoura.

## 7. Idempotência e importação concorrente

1. Validar credencial real futura, tenant/fonte/escopo e contrato v2 antes da transação; resolver fornecedor somente no catálogo autorizado. O cliente não escolhe tenant, concessão, ator ou ID interno do fornecedor.
2. Na transação, revalidar membership/identificação ativa e grants/fonte, bloqueando linhas relevantes conforme política de revogação. Não criar fornecedor implicitamente.
3. Verificar controle documental por chave composta. Mesma versão e hash original, e metadados que o contrato manda comparar: retornar IDs existentes, preservando qualquer edição financeira posterior. Hash diferente: 409 de conteúdo. Versões incompatíveis: 409 de contrato. Nome de arquivo renomeado não muda hash nem autoriza sobrescrever controle original.
4. Para primeira ocorrência, inserir orçamento/itens e controle no **mesmo commit**, com dados originais/versionamento e autoria técnica. UNIQUE documental arbitra a corrida. Consulta prévia é apenas otimização.
5. Se duas requisições passarem pela consulta inicial, a perdedora deve desfazer todas as suas inserções provisórias; depois ler o controle vencedor e comparar novamente. Não deixar orçamento/itens órfãos ao usar DO NOTHING no controle. Não usar DO UPDATE para sobrescrever orçamento, hash ou versão financeira.
6. Implementação recomendada para ensaio: função restrita com subtransação para criação concorrente ou rollback completo seguido de nova leitura/transação. READ COMMITTED exige uma nova instrução para enxergar o vencedor de um DO NOTHING; a mesma instrução/CTE pode não vê-lo. Timeout, deadlock/serialização e falhas de rede recebem tratamento limitado, sem retry cego de edição. [PostgreSQL 18 — isolamento](https://www.postgresql.org/docs/18/transaction-iso.html).

A chave documental é autoridade; digest é comparação de conteúdo. Conteúdo igual em dois documentos não deduplica documentos. Número de orçamento/nome de arquivo não são identidade. Identity pode consumir números mesmo em rollback: lacunas não indicam perda de orçamento.

Antes de primeira importação, reconciliar orçamentos com `drive_file_id` sem controle: é insuficiente inferir drive/tenant/namespace. Sem evidência confiável, bloquear colisão/reimportação e manter pendente; não inventar identidade nem criar controles retroativos como se fossem importações v2 originais. Hash v1 não é recalculado como v2.

## 8. Edição financeira, histórico e concorrência

Proposta: única função de edição com EXECUTE pela role editor, sem UPDATE direto nas tabelas. Recebe parâmetros financeiros/versão e contexto fornecido pela API autenticada; obtém item pelo conjunto tenant+orçamento+item. A função não prova identidade Entra por receber `oid` como parâmetro: autoria ainda depende da API/verificador corporativo real.

Ordem de bloqueios: orçamento, concessão/membership conforme ordem global definida, depois item; evitar inversão entre edição/importação/revogação. Revalidar autorização junto à operação. Bloquear orçamento `FOR UPDATE`, comparar versão esperada, rejeitar estado financeiro legado incompleto, atualizar item, somar itens com quatro casas e arredondar subtotal uma vez a duas; manter frete/desconto/tributos, atualizar total e incrementar versão; inserir histórico antes do commit. Versão divergente retorna conflito, não último escritor vence.

Um histórico por versão atende o PATCH atual de um item; operações em lote exigiriam evento+detalhes e nova decisão de contrato. Valores iguais também geram versão/histórico, conforme proposta. Snapshot original/hash não são modificados por edição ou reimportação. RequestId permite reconciliar timeout pós-commit; não garantir rollback só porque o cliente perdeu resposta.

**Garantia de histórico no PostgreSQL:** revogar DML direto das roles operacionais e expor apenas funções controladas; adicionar constraint trigger diferido que, ao commit, confirme histórico correspondente à mudança financeira/versão. Ensaiar também alterações em item sem incremento de versão e alterações de cabeçalho sem histórico. Se escolher apenas grants de coluna+INSERT de histórico, o banco **não impede** um cliente de atualizar e omitir histórico: alternativa menos forte, não recomendada para o requisito. Administrador/owner continua capaz de burlar medidas; não prometer imutabilidade absoluta.

FK de histórico ao orçamento/item deve usar RESTRICT/NO ACTION, sem CASCADE. Definir arquivamento/retention antes de modificar os fluxos de exclusão legados. Histórico append-only para aplicação, sem UPDATE/DELETE/TRUNCATE. Dados de auditoria minimizados: ator técnico ou tenant/oid, requestId, instante, ação/política e valores necessários; sem tokens, cookies, JWT ou claims completas.

## 9. Segurança SQL e matriz de privilégios

| Role proposta | Permissões mínimas | Proibições |
|---|---|---|
| Reader existente | SELECT estritamente necessário, USAGE de schemas de leitura; manter transações readonly | Escrita, ownership, CREATE, escalonamento e funções mutantes |
| Importador | Preferência EXECUTE na função de importação + acesso mínimo necessário à resposta/verificações | DML direto, criação de fornecedor/grants, edição financeira, histórico corporativo amplo |
| Editor financeiro | EXECUTE em função financeira + leitura autorizada de snapshot/histórico | DML direto, alteração de identidade/hash/fornecedor/ACL, apagar histórico |
| Migrador administrativo | DDL/migrações e grants controlados; separado de aplicações | Credencial na API/n8n/Web e execução automática no start operacional |

Funções teriam owner dedicado sem login e permissões estritamente necessárias; não usar superuser. Revogar EXECUTE de PUBLIC, `search_path` fixo com schemas não graváveis, nomes qualificados, SQL parametrizado e validação estrita. Se SECURITY DEFINER for adotado, ensaiar injeção, objetos temporários, policies/ownership e todos os caminhos de função. Definer pode contornar RLS conforme ownership: não considerá-lo seguro por nome.

Alternativa de pools com DML direto: importador SELECT restrito+INSERT em orçamento/itens/controle, editor UPDATE só em colunas financeiras/versão+INSERT em histórico, USAGE de sequências quando a forma de geração usar acesso explícito a elas. Essa opção exige triggers para história e regras adicionais. Não conceder UPDATE/TRUNCATE/DELETE indiscriminados ou poderes administrativos. Validar o comportamento real de identity/RETURNING e suas necessidades de SELECT/sequência no ensaio, sem grants universais.

Todas as roles operacionais devem ser não owner, sem superuser/CREATEDB/CREATEROLE/BYPASSRLS/replication e sem CREATE em schemas de função/dados. Auditar memberships, privilégios herdados, funções existentes e default privileges, não só grants explícitos. Restrição de rede, TLS e segredos são requisitos futuros, não mudanças desta etapa.

### 9.1 RLS e conexão real

A API usa um pool reader técnico sem tenant/oid por transação. Preservar isso não implanta ACL por pessoa. Não reutilizar credencial reader global para contornar grants corporativos, nem introduzir SET ROLE no leitor atual: seu guard rejeita diferença entre current_user/session_user.

Recomendação para ensaio multi-tenant: RLS nas tabelas tenantizadas, com policies USING/WITH CHECK e identidades SQL não bypass; testar ausência de contexto como deny, isolamento em pools e funções. Owner normalmente contorna RLS; superuser/BYPASSRLS contornam, e FORCE altera o tratamento de owner. [PostgreSQL 18 — RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).

`SET LOCAL app.tenant_id` controla duração em transação, mas **não prova tenant**: uma credencial com capacidade de executar SQL pode escolher esse valor. GUC livre protege contra erros de aplicação, não contra credencial SQL comprometida. Para proteção mais forte, avaliar conexão/role vinculada a tenant por mapping administrativo não gravável pelo cliente, ou funções que obtenham contexto de mecanismo confiável. Usar login+mapping sem wildcard e ensaiar SECURITY DEFINER com session_user; não substituir o principal de autenticação por current_user da função. A escolha entre isolamento por login/tenant, pool compartilhado+API e mecanismo de contexto confiável é decisão arquitetural pendente. SQL não verificará automaticamente sessão Entra ou assinatura do BFF.

Material/fornecedor global deve ser exposto por views/funções limitadas ao membership; RLS apenas no orçamento não impede vazamento de nomes/dados de fornecedor. FKs compostas impedem referências cruzadas inválidas, mas não autorizam SELECT e não substituem RLS/API.

## 10. Plano expand-and-contract e riscos de migração

| Passo futuro | Entrega / validação | Risco e retorno |
|---|---|---|
| D2.0 — gates | Confirmar instância, versão, histórico, ownership; comparar esquema real com baseline; escolher migrador; aprovar regras pendentes | Não executar migração se alvo/checksum/fonte incertos |
| D2.1 — restauração isolada | Backup autorizado e restauração em ambiente isolado sem integrações; dados fictícios ou saneados; verificar recuperação | Backup sem restauração testada não atende gate; evitar cópia de dados pessoais/segredos |
| D2.2 — expansão | Novas tabelas/colunas opcionais e chaves de suporte, sem mudar IDs/nomes antigos ou ligar escrita | Locks DDL, storage e versão de aplicação; reduzir lotes e usar timeouts planejados |
| D2.3 — reconciliação | Mapear tenant/escopo/origem por evidência; cadastrar membership/identificadores; sanear duplicidades/nulos sem zeros inventados | Não deduzir fornecedor por nome nem unidade financeira por palpite; legado não resolvido permanece não elegível |
| D2.4 — integridade progressiva | FKs/CHECK inicialmente NOT VALID quando adequado; validar após saneamento; índices únicos após deduplicação | UNIQUE/PK não aceitam NOT VALID; não usar NOT ENFORCED como proteção |
| D2.5 — funções/policies | Ensaiar roles, rotina de importação/edição, triggers de histórico e RLS escolhida | Credencial direta/definer/GUC podem atravessar trust boundary; executar cenários adversariais |
| D2.6 — concorrência/falhas | Disputas documentais, versões, deadlocks, rollback, timeout pós-commit e revogação; preservar fixture v1/v2 | Qualquer duplicata/parcialidade ou histórico ausente impede avanço |
| D2.7 — compatibilidade | GETs atuais, testes B/C, precisão, leituras de legado, relatórios e dependências do carrinho | NÃO ativar mocks C como auth real; mudanças em contratos exigem aprovação própria |
| D2.8 — encerramento do ensaio | Relatório com migrações propostas, tempos/locks, restore, constraints válidas e plano de produção separado | D2 não equivale a liberação operacional; novas autorizações para integrar/pilotar |

FK/CHECK NOT VALID protege novas mudanças, permitindo validar o legado separadamente. Usar índices únicos de suporte e depois anexar constraints quando aplicável; índice parcial não é chave de referência genérica de FK. NOT NULL global apenas após provar ausência de nulos; preferir CHECK condicional para legado não reconciliado. Detalhes e locks dependem da versão/estrutura confirmada. [PostgreSQL 18 — ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html).

`CREATE INDEX CONCURRENTLY` tem restrições próprias, não cabe em transação normal e pode deixar índice inválido em falha; separar da migração transacional e verificar validade antes de usar. Ensaio deve medir duração, bloqueios, espaço e tráfego. Mesmo DDL de expansão pode exigir locks. [PostgreSQL 18 — CREATE INDEX](https://www.postgresql.org/docs/18/sql-createindex.html).

Backfill em lotes com checkpoints, agregado de antes/depois e tabela de exceções administrativa se necessária; não permitir overwrites silenciosos. Só validar constraints quando todas as violações tiverem resolução documentada. FKs compostas exigem índices UNIQUE de destino com exatamente as colunas referenciadas; referências novas devem existir antes de eliminar caminhos antigos.

Rollback preferido é desativar consumidores novos e conservar expansão/dados/histórico. Não apagar controle de idempotência para repetir importações. Reverter schema ou restaurar backup após escrita exige preservar alterações ocorridas desde o backup, com estratégia aprovada; restauração cega perde dados. Em banco isolado descartável, reconstrução é aceitável somente após confirmar alvo e retenção de evidências. Contract/removal de campos antigos só depois de consumidores reconciliados e nova etapa autorizada.

Riscos principais: baseline Flyway desconhecido; cadastros globais sem ownership; CNPJ duplicado/mascarado; origem documental incompleta; nulos/duplicidades legadas sem contagens; locks/índices inválidos; FK CASCADE contra retenção; numerics arredondados silenciosamente; reader amplo e SQL direto; grants sem revogação coordenada; catálogos compartilhados versus dados restritos; dependências de cotação/carrinho não tenantizadas.

## 11. Decisões pendentes e critérios de D2

Antes de criar SQL executável ou acessar banco na D2, confirmar:

1. Instância/database autorizado para auditoria e clone de ensaio; versão, tamanho e histórico Flyway realmente aplicado.
2. Flyway como única fonte PostgreSQL, executor administrativo e numeração de migrações, sem alterar V1.
3. Tenant corporativo real e política de cadastro global versus fornecedor de propriedade do tenant; materials compartilhados e alcance da tenantização no grafo.
4. Fonte dos drives/namespaces e códigos estáveis; decisão de um documento por orçamento; regra para documentos já existentes sem controle.
5. Regra de concessão para orçamento recém-importado: importador não escolhe Comprador/ACL. Sem política administrativa, criação não libera acesso financeiro automaticamente.
6. Fórmula/tributos/ajustes, preço zero, data sem horário e tratamento de documentos incompletos; responsáveis por cadastro/membership/grants/revogação.
7. RLS/contexto SQL confiável e funções versus DML direto; sincronização de revogação com operações em curso.
8. Retenção/acesso a snapshot/histórico, arquivamento e impacto das FKs na exclusão legada; governança de dados pessoais.
9. Adaptação de autenticação real, que continua pendente e não pode ser substituída pela simulação da C.

Aceite do ensaio D2: uma só importação aceita por identidade sob concorrência; nenhum orçamento/item parcial; fornecedor/grant fora de escopo recusados; edição obsoleta sem efeito; toda edição com histórico coerente; hash original e fixtures intactos; reader segue sem escrita; isolamento entre tenants comprovado inclusive em conexões reutilizadas; restore demonstrado. Nenhum teste desses foi executado em PostgreSQL na D1.

## 12. Evidências e preservação

Snapshot SHA-256 dos **261 arquivos existentes** obtido antes de criar este documento; comparação final confirmou **zero arquivos alterados/removidos** e exatamente um novo caminho: `system/services/operator-api/docs/PLANO-PERSISTENCIA-D1.md`. Contratos B/C e autenticação/rotas/migrações/Compose permanecem protegidos. Diff/whitespace do documento novo verificado. Nenhuma cópia, script, migration ou output adicional foi criado nesta etapa.

Hashes das duas referências SQL lidas:

- `system/database/schema.sql`: `D238C6FE34357C14BB15EBA535505D55B788D817DC544275C416BFA706737D14`.
- `system/services/auth-service/src/main/resources/db/migration/V1__initial_schema.sql`: `F2B17A973E0520E5E0B5895BAC1F36428241969437CD2FDFFB181F2F21AC9E56`.

Esses hashes distintos fixam os arquivos auditados; não são evidência de divergência live nem de igualdade semântica entre as duas fontes. Contagens de objetos foram extraídas da V1 estática. Compose/configurações foram examinados sem divulgar linhas de credenciais. Nenhum `.env` foi consultado.

Não executados: conexão/queries PostgreSQL e contagens legadas, migrações/DDL/DML, restauração, instalação, Graph/SharePoint/n8n, autenticação real e deploy. Suíte de 321 testes/TypeScript corresponde à entrega anterior da C; não foi repetida na D1, que cria somente planejamento e não altera código. A conclusão é **projeto estático fundamentado**, com auditoria dinâmica pendente, não certificação do banco em operação.
