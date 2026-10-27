# Auditoria final pré-commit — 27/10/2026

Escopo: somente `system/automation/power-automate/`, alterações Power Automate do
`.gitignore` e `.github/workflows/power-automate-validation.yml`. Branch `infra-lab`.
Nenhum commit, stage, push, fetch, publicação ou mudança em produção/histórico.
Alterações simultâneas de n8n não foram auditadas nem incluídas na lista de entrega.

## Parecer

Os arquivos atuais listados abaixo estão tecnicamente aptos para revisão e eventual
commit autorizado. **Não há aprovação irrestrita de segurança do repositório**:
dois exports brutos continuam acessíveis nas branches locais `v0`, `v0-java` e
`v0-java-contaminated`. A investigação complementar abaixo não os encontrou no
histórico de `infra-lab` nem nas referências remotas disponíveis localmente.
O responsável deve tratar essas branches antigas separadamente. O CI está implementado e conectado no YAML, mas
ainda não está publicado/ativo no GitHub; isso depende de commit/push autorizados.

## Verificações

| Item | Evidência | Resultado |
|---|---|---|
| Representação técnica do fluxo de entrada | Comparação recursiva independente com definição do ZIP indicado | 16 expressões, zero expressões alteradas; 20 substituições de bindings; 7 objetos de metadados removidos |
| Representação técnica do Histórico v1 | Comparação com definição original externa já identificada | 45 expressões, zero expressões alteradas; 19 substituições de bindings; 6 objetos de metadados removidos |
| Integridade estrutural estática | Nomes/chaves, tipos, arrays, constantes, condições, `runAfter`, operadores e referências conferidos | Nenhuma divergência estrutural inesperada detectada; funcionamento real não homologado |
| Dados sensíveis atuais | Validador estático e inspeção das substituições; conectores públicos preservados | Nenhum identificador/endpoint corporativo, credencial, dado pessoal ou payload real detectado nos dois snapshots |
| JSON/estrutura | Validação dos dois snapshots | 2 aprovados, 0 rejeitados |
| Reprodutibilidade | Sanitização em memória comparada ao snapshot, duas repetições | Idêntica nos dois casos |
| Originais | Hashes em memória antes/depois da auditoria (não publicados) | Bytes inalterados; nenhuma extração bruta para disco |
| ZIP atual | `git check-ignore` e `git ls-files` | Ignorado, não rastreado |
| Índice | `git ls-files --cached --ignored --exclude-standard -- system/automation/power-automate` | Nenhum arquivo rastreado atualmente apesar das exclusões |
| CI | YAML executa guarda de índice, testes e validador | Implementado localmente; execução remota não comprovada nem autorizada |
| Histórico | `git rev-list --objects --all -- system/automation/power-automate`, blobs lidos em memória | 6 versões únicas de arquivos inspecionadas; 2 ZIPs brutos com achados |

Preservação é referente à definição técnica; campos de instalação e metadados de
designer foram intencionalmente removidos/substituídos. Não houve execução do motor
Power Automate nem prova de comportamento runtime após reconfiguração.

## Achados históricos (valores mascarados)

Commit de inclusão identificado: `ec8a613`. Os caminhos estão ausentes da branch
canônica atual, mas permanecem rastreados nos tips de três branches locais antigas.
Não se deve interpretar ausência em `infra-lab` como remoção de todas as branches.

| Arquivo histórico | Entrada interna / linha | Tipo | Valor |
|---|---|---|---|
| `system/automation/power-automate/exportar-schema-listas/exportar-schema-listas_20260818180852.zip` | `definition.json:1` | GUIDs/IDs e endpoint | `[MASCARADO]` |
| Mesmo ZIP | `apisMap.json:1`, `connectionsMap.json:1` | IDs/referências | `[MASCARADO]` |
| Mesmo ZIP | `manifest.json:1` | GUIDs/IDs, endpoint e e-mail | `[MASCARADO]` |
| `system/automation/power-automate/processamento-arquivo/processamento-orcamento.zip` | `definition.json:1` | GUIDs/IDs e endpoint | `[MASCARADO]` |
| Mesmo ZIP | `apisMap.json:1`, `connectionsMap.json:1` | IDs/referências | `[MASCARADO]` |
| Mesmo ZIP | `manifest.json:1` | GUIDs/IDs, endpoint e e-mail | `[MASCARADO]` |

JSONs históricos estão minificados, portanto os achados ocorrem na linha 1. Não se
publicam paths internos contendo IDs. Não foram detectados tokens pelos padrões
utilizados; isso não equivale a uma certificação de ausência de segredos no histórico.
A existência de um antigo fluxo de exportação de schema amplia o inventário histórico,
mas não comprova que esse fluxo esteja publicado atualmente.

`.gitignore` não resolve esses blobs históricos. Não foi executado `git rm --cached`,
reescrita ou limpeza. Qualquer remediação histórica requer decisão/autorização própria,
avaliando refs remotas, clones e acessos; esta auditoria não consultou o servidor Git.

## CI e proteções adicionais nesta auditoria

- Incluído `.gitignore` nos filtros de disparo de PR/push para `infra-lab`.
- Guarda de índice verifica todos os caminhos da pasta, não apenas `flows`, rejeitando
  exports anteriormente rastreados e nomes fora da lista permitida, sem imprimir valores.
- Validador rejeita connection reference keys opacas sem placeholder.
- Testes adicionais para drift funcional, arquivos rastreados e referências opacas.
- O workflow não exige credenciais Microsoft. Publicação remota, required checks e
  proteção de branch não foram verificadas nem alteradas.

## Investigação complementar de alcance e exposição

Consulta somente leitura, sem fetch: `git for-each-ref --contains`,
`git merge-base --is-ancestor`, `git ls-tree` e `git rev-list --objects`.
Além da ancestralidade do commit, foram procurados os **dois blobs exatos** em todo
o histórico alcançável de cada ref, inclusive se aparecessem sob outro caminho.
O clone não é shallow e não possui replace refs; nenhuma tag local foi encontrada.

| Referência disponível localmente | Alcança `ec8a613`? | ZIPs no tip / blobs históricos exatos |
|---|---|---|
| `infra-lab`, `master`, `backup-trabalho-local-24-09` (branches locais) | Não | 0 / 0 |
| `v0`, `v0-java`, `v0-java-contaminated` (branches locais) | Sim, cada uma | 2 / 2 em cada uma |
| `origin/infra-lab` | Não | 0 / 0 |
| `origin/master` | Não | 0 / 0 |
| `origin/v0`, `origin/v0-java` | Não | 0 / 0 |
| `origin/backup-trabalho-local-24-09` | Não | 0 / 0 |
| `origin/feat/sistema-3p-mvp-integracao` | Não | 0 / 0 |
| `origin/HEAD` (simbólica para `origin/master`) | Não | 0 / 0 |
| `origin/main` | Ref inexistente neste clone | Não determinável no servidor |
| Tags locais | Nenhuma | Nenhuma alcança o commit |

As refs `origin/*` são cópias locais do último estado conhecido: **não comprovam o
estado atual ou o histórico de exposição do servidor**. Não houve fetch, consulta ao
servidor ou varredura de outros clones. ZIPs recompostos/recomprimidos têm outros hashes
e não são descartados pela busca dos dois blobs exatos.

### Natureza dos achados nos dois ZIPs

Todos os JSONs dos dois pacotes foram lidos diretamente dos blobs Git em memória,
sem extrair conteúdo bruto para disco. Confirmados IDs de tenant/recursos/conexões,
endpoints e e-mails. Os valores continuam mascarados na tabela de achados.

Não foram encontrados valores literais de senha, client secret, access/refresh token,
Bearer/JWT, chave privada ou parâmetro de assinatura/token em URL pelos critérios
inspecionados. Cada definição possui um default SecureObject vazio; referências
dinâmicas a autenticação não são credenciais embutidas. Os dois valores opacos longos
investigados estão no campo `connectionName` de `definition.json:1`, um por ZIP, e
correspondem ao formato de identificador de instância de conector, não a um segredo
confirmado. Não se testou a validade de credenciais nem o controle de acesso dos endpoints.

Conclusão limitada: **dados de ambiente e pessoais confirmados; nenhum segredo real
confirmado na inspeção**. Isso não certifica ausência de formatos desconhecidos ou
dados codificados. Não há evidência específica nesta inspeção que justifique afirmar
que uma credencial foi vazada ou exigir sua rotação.

### Menor procedimento seguro recomendado (não executado)

1. Não reescrever `infra-lab` nem solicitar force push: o commit e os dois blobs não
   são alcançáveis por essa branch ou por `origin/infra-lab` no estado conhecido.
   Um futuro push explicitamente limitado a `infra-lab` não publica objetos exclusivos
   das três branches antigas. Evitar `--all`, `--mirror` e merges dessas branches.
2. Para saneamento local, decidir com o responsável se as três branches precisam ser
   mantidas. Antes de qualquer descarte, preservar trabalho necessário em armazenamento
   privado controlado e revisar diferenças, sem publicar backup contaminado.
3. Se forem dispensáveis, a menor intervenção é remover **somente as três refs locais**,
   mediante autorização separada. Não há motivo comprovado para reescrever a branch
   canônica. Remover refs impede alcance por branches, mas não apaga imediatamente
   objetos preservados por reflogs, stash, outras refs ou backups.
4. Se a exigência for eliminação física do clone, fazer inventário adicional dessas
   retenções e limpeza controlada de reflogs/objetos somente depois de autorização e
   verificação de backups. Alternativa com menor risco para o workspace atual: preparar
   outro clone isolado contendo apenas a história limpa de `infra-lab`, sem hardlinks
   locais, e transferir somente as alterações revisadas; o clone antigo continua
   precisando de política de retenção/descarte.
5. Se for necessário preservar a história das três branches, planejar sanitização
   **em cópia isolada**, removendo os dois caminhos/blobs de todas as refs contaminadas
   relevantes e verificando renomeações/cópias. Reescrever esses históricos custa mais
   e não é a primeira opção. Só planejar limpeza remota se consulta futura autorizada
   demonstrar refs remotas contaminadas; nenhum push corretivo é indicado agora.

Nenhuma dessas etapas destrutivas foi realizada. A situação conhecida permite tratar
o saneamento local separadamente da publicação futura de arquivos revisados em
`infra-lab`, sem afirmar que o servidor esteja comprovadamente livre de exposições antigas.

## Testes

```powershell
node --test --test-isolation=none system/automation/power-automate/scripts/policy.test.mjs
node system/automation/power-automate/scripts/validate.mjs
git ls-files -- system/automation/power-automate | node system/automation/power-automate/scripts/check-tracked.mjs
git diff --check -- .gitignore .github/workflows/power-automate-validation.yml system/automation/power-automate
```

Resultado final: **30 testes, 30 aprovados, 0 reprovados**. Validador: **2 snapshots,
0 rejeitados**. Guarda do índice atual: **1 arquivo rastreado, 0 rejeitados** (os novos
arquivos ainda não foram adicionados). A guarda também foi testada contra lista sintética
de exports brutos já rastreados. `diff --check` sem erros de whitespace.

### Como interpretar as contagens

| Contagem | Universo e significado |
|---|---|
| 1 arquivo | Entrada de `git ls-files -- system/automation/power-automate`: apenas README já rastreado no índice atual |
| 12 arquivos | Entrada de `git ls-files --cached --others --exclude-standard` na pasta: 1 rastreado + 11 novos não ignorados; não significa 12 arquivos staged |
| 14 arquivos da entrega | Os 12 da pasta + `.gitignore` + YAML do CI, externos à pasta |
| 2 arquivos novos no validador de snapshots | Os dois `*.sanitized.json`; não é varredura de todas as fontes/docs |
| 6 versões históricas | Blobs de arquivos únicos inspecionados na auditoria histórica inicial; não é contagem da guarda do índice |
| 30 testes | Casos da suíte local; não são execuções de fluxos no Power Automate |

A guarda valida os **caminhos recebidos pela entrada padrão**. Sua mensagem usa o
rótulo `tracked files` inclusive quando recebe a união de rastreados e não rastreados;
o comando que produziu a entrada determina o universo real. Zero rejeitados na guarda
significa nomes/caminhos permitidos, não comprovação de ausência de segredos no conteúdo.
O validador de JSON e a revisão humana são verificações distintas e complementares.

O comparador reutilizável `scripts/audit-snapshots.mjs ORIGINAL SNAPSHOT` lê fontes em
memória e emite somente contagens/resultados. Os caminhos de originais externos e
hashes privados não são necessários em CI nem publicados neste relatório.

## Lista exata de arquivos da entrega (14)

1. `.gitignore` — somente acréscimo Power Automate.
2. `.github/workflows/power-automate-validation.yml`
3. `system/automation/power-automate/README.md`
4. `system/automation/power-automate/AUDIT.md`
5. `system/automation/power-automate/flows/sistema-3p-export-20261027.sanitized.json`
6. `system/automation/power-automate/flows/historico-precos-v1.sanitized.json`
7. `system/automation/power-automate/scripts/policy.mjs`
8. `system/automation/power-automate/scripts/sanitize.mjs`
9. `system/automation/power-automate/scripts/read-zip.mjs`
10. `system/automation/power-automate/scripts/validate.mjs`
11. `system/automation/power-automate/scripts/policy.test.mjs`
12. `system/automation/power-automate/scripts/audit-snapshots.mjs`
13. `system/automation/power-automate/scripts/check-tracked.mjs`
14. `system/automation/power-automate/templates/environment.example.json`

Não incluir ZIPs, históricos, originais, mudanças n8n ou qualquer outro arquivo.
O `git diff --stat` padrão não contabiliza arquivos não rastreados; consultar a lista
acima e o `git status --short`, não apenas o resumo de diff.

## Estado Git observado ao final

Saída de `git status --short` (inclui mudanças concomitantes apenas para evidenciar
o estado; **todos os caminhos n8n ficam fora desta entrega**):

```text
 M .gitignore
 M scripts/n8n/material-bridge.mjs
 M system/automation/n8n/README.md
 M system/automation/n8n/workflow-ponte-catalogo-materiais-oficiais-r01.json
 M system/automation/power-automate/README.md
?? .github/workflows/power-automate-validation.yml
?? scripts/n8n/build-material-bridge-sap.mjs
?? scripts/n8n/material-bridge-plan.mjs
?? scripts/n8n/material-bridge-sap.md
?? scripts/n8n/material-bridge-sap.test.mjs
?? scripts/n8n/n8n-sim.mjs
?? system/automation/n8n/workflow-ponte-materiais-sap-r02.json
?? system/automation/power-automate/AUDIT.md
?? system/automation/power-automate/flows/
?? system/automation/power-automate/scripts/
?? system/automation/power-automate/templates/
```

`git diff --stat` global observado:

```text
 .gitignore                                         |   9 ++
 scripts/n8n/material-bridge.mjs                     |  20 ++-
 system/automation/n8n/README.md                     |   1 +
 ...flow-ponte-catalogo-materiais-oficiais-r01.json    |   8 +-
 system/automation/power-automate/README.md           | 160 +++++++++++++++++++++
 5 files changed, 188 insertions(+), 10 deletions(-)
```

Restrito ao escopo autorizado: **2 arquivos rastreados alterados, 169 inserções**;
os 12 arquivos novos da entrega não entram nesse stat. Nenhuma alteração do escopo
está staged. A lista conjunta de arquivos atuais rastreados e novos em Power Automate
também passou na guarda de caminhos: **12 verificados, 0 rejeitados**. Os dois caminhos
históricos de ZIP passam em `git check-ignore --no-index`, mas os blobs antigos não
são eliminados por essa regra. O estado pode mudar por trabalho simultâneo após esta captura.

## Riscos residuais

Detecção baseada em padrões não identifica universalmente nomes próprios, valores
comerciais, identificadores opacos, conteúdo codificado ou formatos de credencial
incomuns. Revisão humana continua obrigatória. Os testes usam dados sintéticos;
comparações dos snapshots usaram os originais privados sem alterá-los. O histórico
inspecionado limita-se às refs já disponíveis localmente e ao escopo solicitado:
reflogs, objetos inalcançáveis, refs remotas não baixadas e demais pastas não estão
cobertos. Templates sanitizados exigem bindings privados e não são diretamente importáveis.
