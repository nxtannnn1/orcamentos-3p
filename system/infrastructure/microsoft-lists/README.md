# Microsoft Lists / SharePoint — Sistema 3P

Referência central para consultar nomes internos, tipos, Choices e Lookups antes de
alterar integrações. A organização local foi autorizada; não houve novas consultas
corporativas, mudança de permissões ou alterações de workflows nesta organização.

## Índice das referências atuais

| Lista | Documentação | Cobertura Graph de 29/10/2026 |
|---|---|---|
| Catalogo_Neoenergiav2 | [Catálogo](arquivos-processados/catalogo-neoenergiav2/README.md) | 102 colunas |
| Materiais_Oficiais | [Materiais](arquivos-processados/materiais-oficiais/README.md) | 107 colunas |
| Itens_Importados | [Itens](arquivos-processados/itens-importados/README.md) | 117 colunas |
| Orcamentos | [Orçamentos](arquivos-processados/orcamentos/README.md) | 105 colunas |
| Tributos | [Pendência](arquivos-processados/tributos-itens/README.md) | Sem schema atual; acesso/identificação pendentes |
| Historico_Precos | [Histórico](arquivos-processados/historico-precos/README.md) | 111 colunas |
| Arquivos_Processados | [Arquivos](arquivos-processados/arquivos-processados/README.md) | 91 colunas |
| Fornecedores | [Fornecedores](arquivos-processados/fornecedores/README.md) | 91 colunas |
| Materiais_Fornecedores_Homologados | [Associações](arquivos-processados/materiais-fornecedores-homologados/README.md) | 102 colunas |

Cada documentação aponta ao seu schema.json. Os Choices e relações ficam nos
documentos individuais, derivados dos mesmos schemas, sem reprodução neste índice.
Arquivos_Orcamentos também permanece sem identificação confirmada na descoberta.

## Estrutura, origem e preservação

arquivos-processados originalmente continha apenas Arquivos_Processados.schema.json
e README.md, não um schema agregado. Esses originais e as demais pastas legadas
foram preservados. Conforme a organização solicitada, as referências atuais ficam
em arquivos-processados/<lista>/schema.json e README.md. Não foram criadas pastas
schemas ou examples nem um segundo exportador.

As fontes privadas estão em exports-local/2026-10-29T17-10-58-966Z/:
oito arquivos de colunas, manifesto e duas referências derivadas — 11 arquivos.
[Referência local](exports-local/2026-10-29T17-10-58-966Z/reference.local.md) e
[manifesto](exports-local/2026-10-29T17-10-58-966Z/manifest.local.json) só estão
disponíveis nesta máquina; não são distribuídos pelo Git.

Extração: 29/10/2026 17:10:58.966 a 17:11:02.428 UTC. O manifesto registra
complete=false para o conjunto; cada lista obtida tem paginação concluída.
Não há schema artificial para Tributos. O legado Tributos_Itens_Orcamentos está
preservado, mas não comprova o título, estrutura ou acesso atuais.

Os oito schemas novos preservam todas as propriedades de coluna retornadas, exceto
IDs de infraestrutura: id de coluna removido; lookup.listId substituído por relação
lógica comprovada ou UNRESOLVED_LIST_PLACEHOLDER. Referências opacas de coluna
usam nome confirmado ou UNRESOLVED_COLUMN_PLACEHOLDER. Brutos permanecem intactos.

## Cobertura e diferenças entre APIs

Graph forneceu name/displayName, description, required/readOnly/hidden, indexed,
enforceUniqueValues, defaultValue quando retornado e opções das facetas text, choice,
lookup, personOrGroup, dateTime, number, currency e boolean. As propriedades originais
foram mantidas; faltantes não foram preenchidas com valores presumidos.

Graph não retornou FromBaseType ou TypeAsString REST. Uma coluna sem faceta tipada
continua desconhecida. choice.displayAs não é convertido em uma confirmação de
Choice/MultiChoice; essa confirmação exige REST/SchemaXml. Lookup.allowMultipleValues
é preservado quando fornecido. Outros tipos/propriedades futuros exigem revisão do
contrato antes de aceitação, sem descarte silencioso.

Ver [columnDefinition](https://learn.microsoft.com/en-us/graph/api/resources/columndefinition?view=graph-rest-1.0),
[consulta de colunas](https://learn.microsoft.com/en-us/graph/api/list-list-columns?view=graph-rest-1.0),
[Field REST/XML](https://learn.microsoft.com/en-us/sharepoint/dev/schema/field-element-list) e
[CHOICES](https://learn.microsoft.com/en-us/sharepoint/dev/schema/choices-element-list).

Diferenças confirmadas contra o legado: Nome_Normalizado de Materiais_Oficiais está
indexado; Chave_Historico de Historico_Precos exige unicidade; Itens_Importados e
Historico_Precos possuem campos adicionais de decisão/correção. O catálogo não tinha
snapshot anterior. Muitas colunas adicionais são de sistema, omitidas pelo filtro
histórico: diferença de contagem não equivale a número de colunas criadas.

## Auditoria do exportador Power Automate — 29/10/2026

Pacote identificado: exportar-schema-listas_20260818180852.zip, no Downloads local
e historicamente em system/automation/power-automate/exportar-schema-listas/.
Foi lido em memória usando o parser existente read-zip.mjs. O arquivo local
schema-lists.json declara extração em 18/08/2026 17:07:29 UTC e é parcial.

O fluxo histórico usa gatilho manual Button, inicializa Titulos e percorre nove
nomes: Arquivos_Processados, Orcamentos, Itens_Importados, Materiais_Oficiais,
Fornecedores, Materiais_Fornecedores_Homologados, Historico_Precos,
Tributos_Itens_Orcamentos e Arquivos_Orcamentos. Não inclui Catalogo_Neoenergiav2.

Conector shared_sharepointonline, operação HttpRequest GET sobre
_api/web/lists/getbytitle('<titulo>')/fields. getbytitle usa título, não segmento
interno de URL; não substituir grafias por suposição. Títulos são interpolados sem
escape de apóstrofos; os nove literais históricos não possuem esse caractere.

O select contém Title, InternalName, TypeAsString, Required, EnforceUniqueValues,
Indexed, Hidden, ReadOnlyField, LookupList, LookupField e FromBaseType. O filtro
exclui ocultos e campos de base, exceto ID/Title/Created/Modified. top=5000 não
comprova completude. Não coleta Choices, limites, defaults ou descrição.

Após GET bem-sucedido, Compor_2 monta site/title/type/fields a partir de value.
O tipo de biblioteca é inferido pelo título Arquivos_Orcamentos. Criar_arquivo_2
executa CreateFile para <titulo>.schema.json em /Documentos Compartilhados.
São arquivos na biblioteca SharePoint, baixáveis pela interface, não gravação direta
no Windows. Existência atual dos arquivos e semântica de conflito não foram testadas.
Veja o [conector oficial](https://learn.microsoft.com/en-us/connectors/sharepointonline/).

runAfter=Succeeded impede gravar após falha daquele GET, mas não desfaz arquivos
anteriores. Não há validação de corpo, paginação, manifesto de falhas, promoção do
conjunto ou política explícita de repetição/retry. O pacote não comprova permissões
efetivas da conexão; executar o fluxo exigiria leitura e criação de arquivos.

**Versão publicada atual não acessada.** Para comparar versões, obter sem executar
o fluxo: pacote da versão publicada, data de modificação/publicação e evidência de
ativação. Guardar pacote privado, sem logs de itens ou credenciais. Nenhum fluxo foi
executado/editado/publicado, nem conexões alteradas nesta auditoria.

A leitura Graph anterior reutilizou configuração/preflight existentes; observou a
role Lists.SelectedOperations.Selected e leu somente metadados/permissões, sem items.
Tributos e biblioteca não retornaram na descoberta acessível: isso não prova exclusão.
Houve POST OAuth para token sob a autorização inicial, antes da restrição posterior
de autenticação. Após essa restrição não houve novas autenticações ou consultas.

## Pendências futuras do mecanismo existente

| Prioridade | Ajuste proposto | Risco e teste necessário |
|---|---|---|
| Crítica | Completar metadados e incluir catálogo/confirmar títulos | Comparar tipos, Choices literais, limites e Lookups contra a fonte |
| Crítica | Seguir páginas e validar corpo/nomes/contagens | Simular paginação truncada, corpo inválido e lista indisponível |
| Crítica | Manifesto com data, status por lista e promoção após validação | Falhar na última lista e comprovar preservação do snapshot válido |
| Necessária | Política explícita de repetição/conflitos e retry | Testar repetição, 403/404/429/5xx em cópia autorizada |
| Opcional | Resolver metadados em vez de inferir tipo pelo nome; escapar títulos | Testar título renomeado/com apóstrofo sem mudar bindings publicados |

As mudanças corporativas dependem de autorização separada. Não implementar serviço,
gateway ou exportador paralelo. O fluxo existente é reaproveitável, mas o pacote
histórico não atende sozinho à documentação completa solicitada.

## Atualização, download e segurança

1. Baixar exports já existentes da biblioteca SharePoint, sem executar fluxo nesta
   etapa. Confirmar origem/data e guardar em nova pasta privada de exports-local.
2. Nova autenticação/leitura ou execução/edição de fluxo exige autorização prévia.
   Para Graph, as consultas de metadados são lists e lists/{list-id}/columns, seguindo
   todas as páginas. O preflight existente diagnostica acesso; não é exportador completo.
3. Preservar fonte e snapshot anteriores, comparar todas as propriedades e conferir
   completude por lista. Não confundir envelope Graph com schema REST.
4. Sanitizar IDs e revisar todos os literais, incluindo defaults/descrições/Choices.
   Não aceitar itens, preços, usuários, URLs internas, tokens ou dados comerciais.
5. Atualizar schema e documentação individual a partir da mesma fonte validada.
   Não há gerador permanente novo. Valores ausentes ficam ausentes; relações não
   confirmadas usam placeholders explícitos. Não promover export incompleto.
6. Executar testes/validação/guarda, revisar diff e obter autorização própria antes
   de stage/commit/publicação. Nada é adicionado automaticamente.

O contrato legado foi preservado. O validador existente agora também verifica um
contrato Graph separado, fechado, com o scanner de dados sensíveis já utilizado.
Novos caminhos são permitidos individualmente; Tributos/schema.json não é permitido.
exports-local está integralmente ignorada, inclusive README e schema; adição forçada
de brutos é recusada pela guarda. Detecção por padrões não certifica texto arbitrário:
revisão humana permanece obrigatória. Gitleaks é complementar.

Da raiz do repositório:

~~~powershell
node --test --test-isolation=none system/infrastructure/microsoft-lists/scripts/policy.test.mjs
node system/infrastructure/microsoft-lists/scripts/validate.mjs
cmd /c "git ls-files -z -- system/infrastructure/microsoft-lists | node system/infrastructure/microsoft-lists/scripts/check-tracked.mjs"
git diff --check
~~~

## Verificação final local

34 testes Microsoft Lists aprovados; oito schemas legados e oito Graph válidos.
Na auditoria anterior, os 34 testes Power Automate e dois snapshots passaram;
não houve mudanças naquele componente.

A falha de segurança LF/CRLF foi isolada: o teste procura condition = "AND" com LF
literal, enquanto a configuração local usa CRLF. Com normalização apenas em memória,
os nove testes de segurança executáveis passaram. Nenhum arquivo de configuração ou
teste de segurança foi modificado. Portanto é falha de portabilidade do teste, não
evidência de relaxamento das regras. A execução original continua sujeita à falha.

Gitleaks 8.30.1 não está disponível no PATH/configuração local verificada; seis testes
de detecção real continuam ignorados. Não foi instalado/atualizado nenhum binário.
Não declarar varredura Gitleaks concluída. Fluxo publicado e completude REST permanecem
pendentes; a reorganização não altera esse diagnóstico.
