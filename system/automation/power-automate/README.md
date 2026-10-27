# Power Automate — definições versionáveis

Processo exclusivamente local para preservar lógica. Não publica, importa, executa
fluxos, altera conexões ou acessa o tenant. Branch de trabalho: `infra-lab`.
JSONs sanitizados **não são pacotes diretamente importáveis**. Aprovação automática
nos checks é necessária, mas não substitui revisão humana antes de commit.

**Integridade estrutural validada não é funcionamento homologado.** Os checks
comparam representação técnica, expressões, dependências e formatos de JSON. Não
executam o motor Power Automate, conectores ou regras no ambiente real. A preservação
das expressões dos exports não comprova que o fluxo funcione após reconfiguração.

## Inventário local em 27/10/2026

| Fluxo/artefato | Evidência local | Estado verificável |
|---|---|---|
| Entrada de arquivos do Sistema 3P | ZIP indicado pelo usuário em `flows`; uma definição com gatilho SharePoint, leitura, HTTP e movimentação de arquivos | Export de pacote legado, data no nome 27/10/2026; publicação atual não consultada |
| Itens aprovados para Histórico de Preços | Backup externo original de 23/10/2026 e fixture existente em `system/apps/operator-web/scripts/fixtures/historico-precos-flow.v1.sanitized.json` | Documentação local identifica v1 como publicada naquela data; não confirma estado atual |
| Candidata de homologação | `system/apps/operator-web/docs/homologacao/flow.definition.candidate.json` e gerador `scripts/historico-precos-flow.mjs` no mesmo aplicativo | Artefatos de desenvolvimento; a documentação `FLUXO_HISTORICO_PRECOS_V2_2026-10-23.md` registra v2 não publicada. Não tratar como export de produção |

Não é inventário completo do tenant. Nenhuma consulta Microsoft foi realizada. Os
artefatos preexistentes do portal não foram alterados ou promovidos a versões publicadas.
As fixtures continuam sendo entradas de testes do portal; os snapshots abaixo são a
representação revisável central, derivada dos exports, sem duplicar geradores do portal.

## Organização

```text
power-automate/
  flows/                         # estrutura existente reaproveitada
    sistema-3p-export-20261027.sanitized.json
    historico-precos-v1.sanitized.json
  scripts/
    policy.mjs                   # transformação pura e regras
    sanitize.mjs                 # CLI, branch e escrita segura
    read-zip.mjs                 # leitura em memória, sem extração
    validate.mjs
    policy.test.mjs
  templates/environment.example.json
  schemas/                       # diretório preexistente, preservado
  README.md
```

`flows` aceita no Git somente `*.sanitized.json`. ZIP/XML, exports, raw e arquivos
locais estão ignorados. O ZIP que o usuário colocou em `flows` permanece privado,
sem alteração e sem stage. Para os próximos exports, preferir pasta fora do repositório.
`.gitignore` não impede `git add -f` nem remove arquivos já rastreados; o check de CI
valida uma lista permitida de caminhos em toda esta pasta, inclusive exports rastreados
em diretórios antigos. Nenhum arquivo bruto foi criado ou copiado por este processo.

## Obter exports sem modificar produção

Preferir export **de uma Solution existente** que já contenha os fluxos e dependências.
A Microsoft documenta a exportação de cloud flows em Solutions e a necessidade de
incluir connection references e environment variables. A exportação pode envolver
versionamento da Solution: deve ser conduzida pelo responsável, fora desta execução.
Não criar Solution, adicionar fluxo, publicar customizações ou remover valores de
ambiente em produção apenas para preparar este Git.

Se o fluxo não estiver em Solution, obter o pacote legado disponibilizado pelo
responsável, como o ZIP recebido nesta tarefa. Não solicitar credenciais. Guardar
exports completos e mapas de reconfiguração exclusivamente em local privado.
Nunca usar histórico de execução como definição do fluxo.

O leitor ZIP implementado aceita **um único `definition.json` de pacote legado**,
armazenado ou deflate, sem criptografia, com limites e CRC. Não processa Solutions ZIP,
ZIP64, múltiplos fluxos ou arquivos arbitrários. Para Solutions, o responsável deve
descompactar fora do Git e fornecer cada JSON de cloud flow reconhecido (`definition`,
`properties.definition` ou definição direta). XML, manifests, connection maps e outras
dependências permanecem privados; documentar a dependência técnica após revisão.
Se o formato não for reconhecido, o sanitizador rejeita em vez de adivinhar.

Referências oficiais:
[Exportar Solution](https://learn.microsoft.com/en-us/power-automate/export-flow-solution),
[Fluxos em Solutions](https://learn.microsoft.com/en-us/power-automate/guidance/coding-guidelines/understand-benefits-solution-aware-flows).

## Atualizar o snapshot

Executar na raiz do repositório com Node.js 22 ou superior:

```powershell
git branch --show-current
git status --short
node system/automation/power-automate/scripts/sanitize.mjs C:/PA_PRIVATE/export.zip entrada-arquivos.sanitized.json
node --test --test-isolation=none system/automation/power-automate/scripts/policy.test.mjs
node system/automation/power-automate/scripts/validate.mjs
git diff --check
```

Usar o mesmo nome do snapshot existente e acrescentar `--replace` para atualizações
deliberadas. O destino existente deve ter o envelope sanitizado; symlinks são rejeitados.
JSON bruto deve estar fora do repositório; ZIP local é permitido como entrada, nunca
como saída. `--stdin` permite receber JSON por pipe sem gravar intermediário bruto.
A branch é verificada pelo HEAD local, sem subprocessos e sem mudança de configuração.
O arquivo só é escrito **após sanitização e validação em memória**. Falhas não imprimem
conteúdo bruto, valores identificados ou mapa de substituição.

Após os checks, revisar o diff com o responsável:

1. Confirmar origem, versão e situação publicada/candidata; atualizar o inventário.
2. Comparar nomes/tipos de ações, gatilhos, `runAfter`, condições, loops, tratamento de
   falhas, parâmetros e expressões com o export privado.
3. Revisar placeholders e toda constante literal: nomes próprios, valores comerciais,
   IDs opacos, conteúdo codificado e payloads não são universalmente detectáveis.
4. Confirmar que apenas JSONs sanitizados, ferramentas e documentação entram no diff;
   conferir `git status` e os caminhos do eventual stage. Nunca `git add -f` de export.
5. Registrar aprovação humana no PR. Commit/push só com autorização separada.

O workflow `.github/workflows/power-automate-validation.yml` prepara os mesmos testes
e validação para PR/push em `infra-lab`. Não foi publicado/executado no GitHub nesta tarefa.
O scan de segredos preexistente permanece complementar e inalterado.

## Política de sanitização

- Extrair apenas definição técnica e referências de conexão. Omitir envelope com
  IDs de fluxo, proprietário, tenant, estado gerenciado e histórico.
- Remover metadados de designer, identificadores de operações e amostras/históricos
  reconhecidos. Metadados não são usados para reconstruir dependências de negócio.
- Substituir IDs, sites/listas, conexões, pastas, URLs, domínios, e-mails e padrões de
  identificação pessoal por tokens determinísticos `__PA_TIPO_N__`.
- Substituir credenciais e defaults de parâmetros SecureString/SecureObject.
  Preservar referências dinâmicas como `@parameters('$authentication')`.
- Manter nomes de campos, operações, gatilhos, condições, ações, exceções, números de
  negócio e expressões. Substituições dentro de expressões mantêm aspas/delimitadores.
- Preservar URL exata do schema público e IDs públicos de conectores conhecidos;
  estes são tipos técnicos, não instâncias corporativas. Novos conectores exigem revisão.
- Não salvar mapa reversível, valores privados ou hashes de segredos. A numeração de
  placeholders pode mudar quando novos valores forem acrescentados ao export.

O validador verifica JSON/envelope, tipos de ação, dependências `runAfter`, ciclos,
referências a ações/conexões, delimitadores e aspas de expressões, GUIDs, endpoints,
credenciais, dados pessoais reconhecíveis e conteúdo de execução conhecido.
É uma verificação estática, não o motor de expressões do Power Automate, schema de
todos os conectores ou detector universal de informações confidenciais.

## Reconstrução controlada e riscos residuais

O template de ambiente só documenta categorias de configuração; seus números não
são um mapa de bindings dos snapshots. Mapear cada placeholder privadamente e revisar
tipos, conexões, sites, listas, pastas, endpoints e parâmetros no ambiente de destino.
Preservar o export original privado para reimportação suportada; estes JSONs não
substituem manifests e dependências de Solution. Qualquer reconstrução/importação
ocorre primeiro em ambiente isolado, com autorização própria, revisão funcional e
gatilhos desativados. Não reimportar este envelope sobre os fluxos publicados.

Riscos residuais: constantes livres, segredos em formatos incomuns/codificados, nomes
próprios, identificadores não padronizados, semântica dos conectores e metadados de
conectores personalizados exigem revisão humana. A política não corrige bugs de
negócio do export; sequência e tratamento de erros existentes são preservados.
Não há confirmação de equivalência com o ambiente corporativo atual.

## Evidência local

- 30 testes automatizados: 30 aprovados, 0 reprovados na auditoria final.
- Dois snapshots sanitizados: ambos aprovados pelo validador.
- ZIP fornecido pelo usuário confirmado como ignorado pelo Git.
- Nenhuma execução de fluxo, conexão Microsoft, alteração de produção, commit ou push.
- Uma tentativa de usar helper PowerShell foi bloqueada pela política de execução;
  nenhuma política foi alterada. O helper foi substituído pelo leitor ZIP em Node.js.
- Alterações preexistentes/concomitantes fora de Power Automate foram preservadas.

Auditoria final, achados históricos e lista exata para revisão: [AUDIT.md](AUDIT.md).
Foram encontrados exports brutos em commits antigos; a aprovação dos snapshots
atuais não representa saneamento do histórico. O novo workflow CI está conectado aos
comandos de segurança no YAML local, mas não está ativo/publicado no GitHub nesta execução.

A investigação complementar encontrou `ec8a613` e seus dois ZIPs apenas nas branches
locais `v0`, `v0-java` e `v0-java-contaminated`, que ainda os rastreiam. Nem a branch
local `infra-lab` nem qualquer ref remota já conhecida alcança esse commit ou os dois
blobs exatos. `origin/main` não existe neste clone; `origin/HEAD` aponta para
`origin/master`. Sem fetch, isso não confirma o estado atual do servidor.

As contagens têm universos distintos: **1** arquivo da pasta já rastreado;
**12** arquivos da pasta incluindo 11 novos; **14** arquivos da entrega incluindo
`.gitignore` e CI; **2** snapshots verificados; **30** testes locais. A guarda de
caminhos não analisa conteúdo e seu rótulo `tracked files` não significa que arquivos
novos estejam staged. Consulte a explicação e a recomendação de saneamento no AUDIT.
