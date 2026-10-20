# Fase M.3 — investigação de dependências

Inspeção em 20/10/2026, sem atualização de package.json/package-lock.json e sem `npm audit fix`.

## Resultado e impacto

`npm audit --json`: saída 1, cinco classificações altas, todas relacionadas à mesma cadeia:

`eslint-config-next@16.3.8` (direta, desenvolvimento) → `@next/eslint-plugin-next@16.3.8` → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`.

`npm ls` confirmou a cadeia (saída 0). As cinco classificações propagadas não representam cinco vulnerabilidades independentes.

O aviso GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 descreve negação de serviço por exaustão de pilha com padrões aninhados em braces <=3.0.3. O audit apresentou CVSS v3 7,5; a página do aviso apresenta também CVSS v4 8,7, sem versão corrigida publicada. Fonte primária: [GitHub Advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

`npm view braces version` retornou 3.0.3. `npm view @next/eslint-plugin-next@16.4.2 dependencies --json` ainda retornou fast-glob 3.3.1. Portanto, atualizar Next/eslint-config-next para 16.4.2 não é evidência de correção dessa cadeia.

Inferência a partir da cadeia e das referências locais: a exposição identificada está no ferramental de lint/build. Não foi identificado import de braces pelo código funcional; isso não constitui prova de ausência de qualquer superfície explorável. Padrões não confiáveis processados por essas ferramentas podem afetar disponibilidade do processo/CI.

O projeto já contém `scripts/patch-braces.cjs`, executado no postinstall/pretest, com limites de profundidade 128 e nós 50.000 e verificação de versão/fonte. Seus testes fazem parte da regressão. É mitigação local, não release upstream corrigida nem motivo para zerar o audit. Evitar entrada não confiável em padrões de glob e preservar o guard verificável.

O fixAvailable do audit sugere eslint-config-next 14.2.35 com mudança major: é downgrade incompatível com a linha Next 16 do projeto. Não aplicar automaticamente e não executar `--force`.

## Versões disponíveis observadas

`npm outdated`: saída 1 (há versões mais novas; não significa falha de instalação).

| Pacote | Atual | Wanted | Latest |
|---|---|---|---|
| @azure/msal-node | 7.0.0 | 7.1.0 | 7.1.0 |
| @opennextjs/cloudflare | 1.20.7 | 1.20.12 | 1.20.12 |
| @types/node | 20.19.43 | 20.19.43 | 26.6.5 |
| esbuild | 0.27.0 | 0.27.7 | 0.28.2 |
| eslint | 9.39.5 | 9.39.5 | 10.13.0 |
| eslint-config-next | 16.3.8 | 16.3.8 | 16.4.2 |
| jose | 6.2.12 | 6.2.13 | 6.2.13 |
| next | 16.3.8 | 16.3.8 | 16.4.2 |
| react / react-dom | 19.2.8 | 19.2.8 | 19.3.1 |
| typescript | 5.9.3 | 5.9.3 | 7.0.2 |
| vitest | 4.1.11 | 4.1.12 | 5.0.5 |
| wrangler | 4.143.1 | 4.151.3 | 4.151.3 |

Versão mais nova não é automaticamente correção de segurança. Não foram revisadas todas as notas de migração, portanto nenhuma atualização é declarada livre de incompatibilidades.

## Plano priorizado

1. **Alta:** manter a mitigação existente, testes dos limites e controle de padrões não confiáveis no CI; acompanhar release upstream corrigida. O risco permanece registrado enquanto o audit reportar a cadeia.
2. **Alta, próxima mudança separada:** quando existir correção upstream, revisar diff/changelog e compatibilidade, atualizar a menor cadeia necessária, validar lockfile, audit, testes de glob, lint e build. Override ou patch vendorizado novo exige revisão específica; não presumir compatibilidade com micromatch.
3. **Moderada:** avaliar atualizações patch/minor separadamente, com rollback por lockfile revisado. MSAL/jose exigem regressão de sessão/OIDC e segurança; OpenNext/wrangler exigem validação do alvo de build; Next e eslint-config-next devem ser avaliados juntos; React e react-dom devem permanecer alinhados. Nenhum desses upgrades foi realizado.
4. **Planejada:** ESLint 10, TypeScript 7, Vitest 5, esbuild 0.28 e tipos Node 26 exigem análise de breaking changes, plugins, configuração e runtime suportado. Não misturar essa migração com a persistência de reabertura.

Atualizações somente em tarefa posterior autorizada, com avaliação de release notes oficiais e testes apropriados. A M.3 não elimina nem oculta as cinco classificações altas.
