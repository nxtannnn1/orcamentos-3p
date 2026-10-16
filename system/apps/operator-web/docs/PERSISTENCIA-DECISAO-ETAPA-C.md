# Persistência completa da decisão — Etapa C

## Arquivos desta etapa

- `src/server/sharepoint/person-resolver.ts` (novo): contrato e bloqueio seguro de identidade.
- `src/server/sharepoint/decision-schema.ts` (novo): validação de nomes e metadados.
- `src/server/sharepoint/sharepoint-types.ts`: tipos de Pessoa e tenant de escrita.
- `src/server/sharepoint/sharepoint-operator-repository.ts`: PATCH completo e pré-requisitos.
- `src/server/data-source/configuration.ts`: configuração de Pessoa e vínculo do tenant.
- `src/server/sharepoint/person-resolver.test.ts` (novo).
- `src/server/sharepoint/complete-decision.test.ts` (novo).
- `src/server/sharepoint/__test-support__/decision.ts` (novo; apenas testes).
- `src/server/sharepoint/sharepoint-operator-repository.test.ts`.
- `src/server/data-source/configuration.test.ts`.
- `src/app/api/decision-flow.test.ts`.
- `docs/SEGURANCA-OPERACIONAL.md`.
- Este documento.

Validação local: 199 testes passaram em 17 arquivos (SharePoint, configuração,
autenticação, segurança, rotas e controlador). TypeScript sem emissão/incremental e
ESLint dos arquivos TypeScript alterados passaram. Testes live não foram executados.
Alterações preexistentes em outros arquivos foram preservadas.

## Estado da implementação

Código local preparado para registrar decisão, material, Pessoa SharePoint, data UTC,
OID e UUID em um único PATCH com ETag. A rejeição registra a mesma autoria/data e
limpa o material. Nenhum histórico de preços é criado pelo Operator.

**A resolução real de Pessoa permanece bloqueada por padrão.** A factory usa
`unavailablePersonResolver`; configurar colunas ou variáveis não habilita a escrita.
Não há resolvedor de produção nem IDs fictícios como fallback. O provedor sintético
em `__test-support__` é importado exclusivamente pelos testes.

Antes de editar, uma autenticação Graph somente de leitura confirmou a role
`Lists.SelectedOperations.Selected`, sem roles de leitura de usuários do diretório.
Não havia fonte de vínculo de identidade configurada. `GET /users/{oid}` em modo
application exige `User.Read.All` (ou permissão superior), conforme documentação:
https://learn.microsoft.com/en-us/graph/api/user-get?view=graph-rest-1.0
Isso não justifica ampliar permissões. Não foi executado ensureUser, nem criado
usuário de site, vínculo, lista, coluna, concessão ou conexão.

## Contrato do resolvedor

`SharePointPersonResolver.findCandidates(actor, siteId)` recebe apenas identidade
proveniente da sessão validada pelo servidor: `tenantId` e `oid`.
Uma implementação futura deve consultar uma fonte autorizada que comprove o vínculo
entre essa identidade e um usuário existente no site. Não basta comparar nome ou
aceitar um ID indicado pelo navegador. A fonte, o acesso e a governança desse vínculo
ainda precisam ser definidos e homologados.

O resultado contém tenant, OID, site e ID numérico local da Pessoa. O guard exige
exatamente um resultado, mesmo tenant/OID/site e ID positivo seguro. Zero resultados,
ambiguidade, falha de consulta ou vínculo divergente bloqueiam a decisão antes do
PATCH e antes de registrar uma intenção de escrita no Redis.

Nenhuma permissão ampla é solicitada automaticamente. Não há endpoint para configurar
vínculos pelo frontend. Depois de autorizado e validado, um adaptador real precisará
ser conectado explicitamente à factory no servidor.

## Configuração proposta, ainda não aplicada

Acrescentar ao objeto `items` de `SHAREPOINT_FIELD_MAP_JSON`, preservando os demais
campos (fragmento ilustrativo, não um mapa completo):

```json
{
  "reviewedByPerson": "Responsavel_Decisao",
  "reviewedAt": "Data_Decisao",
  "reviewedByOid": "Revisado_Por_Oid",
  "decisionId": "Decisao_Id"
}
```

`Responsavel_Decisao` (Pessoa única, somente pessoas) e `Data_Decisao` (Data/hora)
foram confirmadas no tenant durante a auditoria. `Revisado_Por_Oid` e `Decisao_Id`
são **nomes propostos para colunas Texto ainda não provisionadas**, não campos
existentes. A implementação mantém essas colunas obrigatórias para preservar a
auditoria e a reconciliação por UUID existentes. Não basta reapontar `reviewedByOid`
para a coluna Pessoa. Os mapeamentos não são preenchidos silenciosamente.

`reviewedByPerson` recebe o nome interno base, sem sufixo `LookupId`.
`MICROSOFT_TENANT_ID` vincula o tenant autorizado no repositório. O frontend não pode
enviar Pessoa, OID, tenant, data ou UUID: a rota continua aceitando somente action,
approvedMaterialId e observation, além do ETag no cabeçalho.

Pré-requisitos antes de implantação:

- Fonte verificável para resolver a Pessoa, com acesso aprovado e escopo mínimo.
- Colunas reais com os nomes/tipos confirmados; provisionamento separado e autorizado.
- Redis REST compartilhado configurado e autoritativo; nenhuma conexão local foi alterada.
- Sessão Entra com perfil autorizado; bypass local de SharePoint continua somente leitura.
- Permissão Graph de leitura de metadados e concessão de escrita restrita na lista,
  conferida pelo transporte existente. Não foi validada escrita no tenant.
- Ambiente de homologação isolado antes de habilitar um adaptador real.

## Validação antes da escrita

Cada decisão relê metadados da lista, com paginação e limites. Confere existência,
editabilidade e tipos: OID/UUID Texto, data Data/hora, Pessoa única (peopleOnly),
Material_Aprovado lookup único para a lista configurada, status Choice contendo
APROVADO/REJEITADO e observação Texto. Nomes duplicados, colisões e campos ausentes
impedem o PATCH. Mudanças de esquema não são ocultadas por cache de metadados.

Material, fornecedor, orçamento aberto, autorização e ETag continuam obrigatórios
conforme as regras anteriores. A data e UUID são gerados uma vez no servidor e
compartilhados entre intenção Redis e PATCH. O registro de intenção inclui o ID da
Pessoa além da identidade Entra. Não são usados Editor, Modified ou conta de serviço.

## Testes isolados e limites

Os testes usam transporte Graph, Pessoas e metadados sintéticos; não usam tenant,
tokens ou Redis reais. Os testes ponta a ponta simulados substituem explicitamente
o provedor indisponível apenas dentro do processo de teste. O padrão de produção
indisponível possui teste próprio.

Cobertura: aprovação/rejeição completas, resolução ausente/ambígua/divergente,
tenant incorreto, falha de provedor/metadados, tipos/configuração inválidos, autoria
forjada na API, ETag, fornecedor/material, orçamento fechado e auditoria indisponível.

Persistem os limites distribuídos anteriores: Redis e SharePoint não formam uma
transação. Falha após um PATCH pode deixar resultado não confirmado e requer releitura
e reconciliação pelo UUID, sem repetir cegamente. O PATCH usa ETag; a leitura de
metadados não bloqueia uma alteração administrativa concorrente do esquema.

Nenhuma aprovação antiga é reconstruída automaticamente. Os três aprovados sem
autoria/material e históricos incompletos permanecem inalterados. O próximo passo
é homologar a resolução real e a persistência em listas isoladas; somente depois
conectar os campos de decisão ao Power Automate conforme o plano das Etapas A/B.
