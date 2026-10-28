# Microsoft Lists / SharePoint — Sistema 3P

Esta pasta contém a documentação e os snapshots de schema das listas utilizadas pelo Sistema de Orçamentos 3P.

## Estrutura

Cada lista ou biblioteca possui uma pasta própria contendo:

- `README.md` — identificação rápida e finalidade do componente;
- `<Lista>.schema.json` — snapshot do schema real no SharePoint, quando disponível.

## Componentes

| Componente | Tipo | Finalidade |
|---|---|---|
| Arquivos_Processados | List | Controle dos arquivos processados pelas automações |
| Orcamentos | List | Cabeçalho e dados gerais dos orçamentos |
| Itens_Importados | List | Itens extraídos dos orçamentos |
| Materiais_Oficiais | List | Cadastro mestre de materiais |
| Fornecedores | List | Cadastro mestre de fornecedores |
| Materiais_Fornecedores_Homologados | List | Relação entre materiais e fornecedores homologados |
| Historico_Precos | List | Histórico de preços dos materiais |
| Tributos_Itens_Orcamentos | List | Tributos associados aos itens dos orçamentos |
| Arquivos_Orcamentos | Document Library | Armazenamento dos arquivos de orçamento |

## Versionamento

Os arquivos `*.schema.json` são snapshots parciais de metadados sanitizados.
Não contêm itens e não são pacotes de provisionamento/importação. A equivalência com
o ambiente atual não está comprovada. O exportador histórico encontrado no Git consulta
`/fields`; sua versão publicada atual e a origem exata de cada snapshot não foram confirmadas.

Não criar arquivos `v1`, `v2`, `v3`.

As alterações devem ocorrer sobre o mesmo arquivo para que o histórico seja mantido pelo Git.

Exemplo:

`system/infrastructure/microsoft-lists/orcamentos/Orcamentos.schema.json`

## Regra de manutenção

Quando houver alteração estrutural em uma lista:

1. obter metadados somente mediante autorização para o ambiente; guardar originais fora do Git;
2. preparar uma cópia sanitizada, sem itens, dados pessoais ou bindings reais;
3. revisar constantes e atualizar somente o respectivo `*.schema.json`;
4. executar validação, testes e guarda de caminhos abaixo;
5. revisar o diff e a documentação funcional;
6. realizar commit/publicação somente quando autorizados separadamente.

## Segurança local e CI

`scripts/policy.mjs` define um contrato fechado para os metadados atualmente conhecidos.
Rejeita propriedades desconhecidas (inclusive itens, valores de registros, defaults e
amostras), flags inválidas, nomes duplicados, GUIDs, endpoints, padrões de credenciais
e dados pessoais. Novos atributos estruturais exigem revisão da política e testes;
não descartar silenciosamente propriedades de um export bruto para fazê-lo passar.

Os padrões não detectam universalmente nomes próprios, conteúdo comercial em texto livre,
segredos opacos ou codificados. Revisão humana de todos os literais continua obrigatória.
O Gitleaks existente é complementar. A aprovação local não certifica o ambiente real.

Separação obrigatória:

- **Schema:** nomes internos, tipos e flags das colunas; referências lógicas verificadas.
- **Configuração ambiental:** site/list/tenant IDs, conexões e URLs ficam fora do Git.
- **Dados operacionais:** itens, preços, fornecedores e usuários reais não são aceitos.

Em 28/10/2026, dois `LookupList` residuais foram substituídos:

- `Materiais_Fornecedores_Homologados.Fornecedor_Ref`: `list:Fornecedores`, relação
  documentada no README da lista e com `field_1` existente no schema de destino.
  É uma referência lógica, não comprovação do binding atual no tenant.
- `Historico_Precos.Aprovador`: `USER_INFORMATION_LIST_PLACEHOLDER`; mantém tipo `User`
  e `LookupField` original. O destino ambiental permanece não resolvido.

Os placeholders legados `EXAMPLE_LIST_ID*` permanecem explícitos e não são resolvidos por
inferência. Referências `list:<titulo>` devem resolver uma lista e seu nome interno de
campo no conjunto validado. Nenhuma rotina acessa Microsoft 365 ou aplica alterações.

Na raiz do repositório, com Node.js 22 ou superior:

```powershell
node --test --test-isolation=none system/infrastructure/microsoft-lists/scripts/policy.test.mjs
node system/infrastructure/microsoft-lists/scripts/validate.mjs
git ls-files -- system/infrastructure/microsoft-lists | node system/infrastructure/microsoft-lists/scripts/check-tracked.mjs
git diff --check
```

O workflow `.github/workflows/microsoft-lists-validation.yml` usa o índice Git com
separação NUL, testes e validação dos oito arquivos esperados. É acionado em PR/push
para `infra-lab` quando schemas, ferramentas ou regras de proteção mudam. Sua execução
remota e a configuração de checks obrigatórios dependem de publicação/revisão separadas.

O `.gitignore` bloqueia arquivos por padrão nesta pasta, liberando schemas, documentação
e ferramentas. A guarda usa caminhos exatos e rejeita brutos mesmo adicionados com
`git add -f`. Estruturas de registros operacionais em um caminho de schema permitido são
rejeitadas pelo contrato. Literais em campos textuais ainda exigem revisão humana.
Arquivos ignorados ou já existentes no histórico não são apagados por esses checks.

Não há Choices, defaults ou regras de validação completos nos snapshots; ausência de
metadado significa desconhecido, não configuração vazia. `Arquivos_Orcamentos` continua
sem schema e sem justificativa comprovada de exclusão. Nenhum desses dados foi inventado.

## Importante

O schema JSON é uma referência técnica parcial, sujeita às limitações acima.

Os arquivos Markdown documentam a finalidade e as regras funcionais do Sistema 3P.

Alterações no schema podem impactar:

- n8n;
- Power Automate;
- Power Apps;
- integrações;
- consultas e relatórios.
