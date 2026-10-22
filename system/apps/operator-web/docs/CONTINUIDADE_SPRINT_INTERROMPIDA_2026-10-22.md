# Continuidade da sprint interrompida — 22/10/2026

Repositório `orcamentos-3p`, branch `infra-lab`, base `6be903e`. Execução feita pelo Claude Code após a interrupção do Codex. Não houve reset, checkout, clean, commit, push, deploy, publicação de workflow ou chamada real ao SharePoint.

## 1. Estado encontrado

- `git log -1`: `6be903e feat(operator-web): consolidate P0 fixes and MVP improvements`.
- 4 arquivos modificados e nenhum arquivo não rastreado. `git diff --check` sem erros, apenas avisos LF/CRLF.
- Backup do diff do Codex antes de qualquer edição: `Documents\meuSistema\backups\codex-sprint-interrompida-2026-10-22\codex-wip.patch`.
- Os testes focados do comparador passavam. **O `typecheck` falhava** (TS2737: literais BigInt `0n`/`10n`/`100n`/`2n` não são permitidos no target do tsconfig). A sprint, portanto, parou com trabalho incompleto.

## 2. Arquivos deixados pelo Codex (base `system/apps/operator-web`)

| Arquivo | Conteúdo do Codex |
| --- | --- |
| `src/domain/price-comparison.ts` | Total estimado sem arredondar o preço unitário para centavos; deduplicação por `offer.id` |
| `src/types/price-comparison.ts` | Nova pendência `DUPLICATE_OFFER_ID` |
| `src/components/price-comparison-workspace.tsx` | Preço unitário exibido com todas as casas decimais; rótulo da pendência; aviso sobre o arredondamento |
| `src/domain/price-comparison.test.ts` | Testes de precisão decimal e de duplicidade |

## 3. Implementações recuperadas (Codex)

1. **Precisão.** Antes, `Math.round(unitPrice * 100)` arredondava o preço unitário antes da multiplicação. Por exemplo, R$ 0,004 × 1.000 resultava em R$ 0,00 e não em R$ 4,00, e 1,005 virava 100 centavos. Agora a representação decimal do `Number`, incluindo expoentes, é convertida em razão BigInt, e o arredondamento HALF_UP ocorre só no total.
2. **Duplicidade.** Repetições idênticas da mesma oferta contam uma vez. Repetições divergentes tornam a oferta inelegível com `DUPLICATE_OFFER_ID`, sem entrar no menor preço nem nos indicadores.
3. **Defesa.** Uma razão de quantidade com denominador ≤ 0 retorna `null`, o que evita divisão por zero.

## 4. Problemas identificados

| # | Problema | Origem | Situação |
| --- | --- | --- | --- |
| P1 | Literais BigInt quebravam o `tsc --noEmit` | Codex (incompleto) | Corrigido |
| P2 | A deduplicação comparava só as chaves do primeiro registro: um campo presente apenas na repetição era ignorado | Codex | Corrigido |
| P3 | A deduplicação usava `!==`, então duas cópias idênticas com preço `NaN` eram tratadas como conflito | Codex | Corrigido |
| P4 | Aviso n8n falso-positivo: `Fornecedores_Homologados_Materiais_Subestacoes` é o nome de um arquivo `.xlsm` em `cachedResultName` (cache da UI do n8n), não um campo | Preexistente | Corrigido |
| P5 | 21 avisos n8n restantes: os workflows de catálogo gravam na lista Catálogo Neoenergia (`9455cede-…`), cujo schema **não está versionado** em `system/infrastructure/microsoft-lists` | Preexistente | Pendente: precisa de snapshot autorizado |
| P6 | `SharePointFieldMap.materials.status` está declarado, mas nunca é lido. Materiais inativos do cadastro aparecem no catálogo e podem ser escolhidos | Preexistente | Pendente: os valores do Choice `Status` não estão no snapshot |
| P7 | `workflow-normalizar-associar-materiais-v0.json` está exportado com `"active": true` | Preexistente | Apenas registrado; nada foi publicado |

Sobre P5: o R02 (`workflow-importar-catalogo-rede-neoenergia.json`) já consulta `/columns` em tempo de execução e confere `expectedFields` antes de gravar. O risco está contido nesse workflow, mas o validador estático não consegue comprovar o contrato. Os R01 (`carga-catalogo`, `carga-redetransmissao`, `.backup`) não têm essa trava e contêm IDs reais de site e lista em URL fixa.

## 5. Correções realizadas pelo Claude

- `src/domain/price-comparison.ts`: `BigInt(n)` no lugar de literais (P1); nova função `sameOfferRecord` com união de chaves e `Object.is` (P2/P3). Um ID já conflitante permanece conflitante mesmo que uma cópia posterior volte a coincidir.
- `src/domain/price-comparison.test.ts`: literal BigInt do teste ajustado; novo teste cobrindo campo extra, `NaN` idêntico e três cópias com conflito intermediário.
- `scripts/n8n/validate-workflows.mjs` (raiz): a varredura de nomes de campos ignora chaves `cachedResult*`. A varredura de referências `$()` e as demais verificações continuam usando o JSON completo (P4).

Não foram alterados: identidade (resolvedor OID → Pessoa continua desligado da factory; sem fallback por e-mail ou nome), autenticação, auditoria, bloqueios de correção humana, workflows, package/lockfile e `.env.local`.

## 6. Testes executados (resultados reais desta execução)

| Comando | Resultado |
| --- | --- |
| `npm.cmd test` (portal) | **1.444 aprovados, 24 ignorados** (opt-in); 63 arquivos aprovados, 4 ignorados |
| `npm.cmd test -- src/domain/price-comparison.test.ts` | 43 aprovados (antes do teste extra) |
| `npm.cmd run typecheck` | Exit 0 (era exit 2 no estado deixado pelo Codex) |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd run build` | Exit 0 |
| `node --test system/infrastructure/redis-lab/gateway/gateway.test.mjs` | **37 aprovados**, 1 ignorado (Redis real) |
| `node --test scripts/n8n/workflow-integrity.test.mjs` | **14 aprovados** |
| `node scripts/n8n/validate-workflows.mjs` | **0 erros, 21 avisos** (eram 22) |
| `git diff --check` | Sem erros de whitespace (somente avisos LF/CRLF) |

Variação: de 1.437 para 1.444 testes no portal (+7: 6 do Codex e 1 do Claude).

## 7. Arquivos modificados em relação a `6be903e`

| Arquivo | Codex | Claude |
| --- | --- | --- |
| `system/apps/operator-web/src/domain/price-comparison.ts` | ✔ | ✔ |
| `system/apps/operator-web/src/domain/price-comparison.test.ts` | ✔ | ✔ |
| `system/apps/operator-web/src/types/price-comparison.ts` | ✔ | — |
| `system/apps/operator-web/src/components/price-comparison-workspace.tsx` | ✔ | — |
| `scripts/n8n/validate-workflows.mjs` | — | ✔ |
| `system/apps/operator-web/docs/CONTINUIDADE_SPRINT_INTERROMPIDA_2026-10-22.md` | — | novo |

## 8. Pendências restantes

1. **P5:** exportar, com leitura autorizada, o schema da lista Catálogo Neoenergia para `system/infrastructure/microsoft-lists/` (sem dados). Depois, confirmar os nomes internos de `Codigo_Nordeste`, `Numero_Patrimonio_*` e `Status_Homologacao`. Na lista Materiais_Fornecedores_Homologados, `Status_Homologacao` é o *título* do campo interno `field_11`; o Graph exige o nome interno.
2. **P6:** obter as opções do Choice `Materiais_Oficiais.Status`. A regra de negócio (quais status impedem aprovação ou comparação) precisa ser decidida antes de ligar `materials.status` no mapper e no repositório.
3. Os R01 de catálogo não verificam o schema antes do POST. Avaliar a aposentadoria ou a adoção da trava do R02.
4. `material-autocomplete.tsx` está minificado em uma linha e usa `toLowerCase()` sem locale nem remoção de acentos (diferente do filtro do comparador). É uma melhoria de usabilidade, não um defeito comprovado.
5. Ao trocar de material, o comparador não verifica se `data.material.id` corresponde ao material solicitado. O total já é protegido por `summarizePricePreselection`; a divergência afetaria apenas a exibição.
6. Continuam valendo as pendências externas: fonte Pessoa homologada, Redis durável, MFA/HTTPS e o ensaio controlado de escrita.

## 9. Reservado para o computador doméstico

- Testes opt-in Redis (`THREEP_REDIS_INTEGRATION=1`, `THREEP_RESILIENCE=1`), `gateway/run-real-tests.mjs` e `test-operational-persistence.mjs` (exigem WSL2/Docker).
- Ensaio controlado de PATCH em item sintético, conforme §11 do relatório E2E.
- Validação visual no navegador do comparador (preço com casas decimais longas e pendência de duplicidade).

## 10. Recomendações de consolidação

- Revisar o diff, com atenção à mudança de semântica do total: agora R$ 0,004 × 1.000 = R$ 4,00, e não R$ 0,00.
- Commit sugerido, a fazer manualmente: `fix(price-comparison): preserve unit price precision and reject conflicting duplicate offers`, incluindo o validador n8n e este relatório.
- Manter o backup do patch do Codex até o commit ser confirmado.
