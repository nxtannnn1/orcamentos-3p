# Fase M.4 — plano de remediação

Consulta em 20/10/2026. Complementa [M.3 dependências](FASE-M3-DEPENDENCIAS.md), sem alterar versões ou remover a mitigação.

## Evidência atual

- `npm audit --json`: saída 1, cinco alertas altos. Todos propagam **um advisory independente**, GHSA-vfj7-8cjw-p6xm / CVE-2026-93687.
- `npm ls ... --all`: cadeia confirmada: eslint-config-next 16.3.8 (direta dev) → @next/eslint-plugin-next 16.3.8 → fast-glob 3.3.1 → micromatch 4.0.8 → braces 3.0.3 (transitivas).
- `npm audit --omit=dev --json`: nenhum alerta no conjunto de produção consultado.
- `npm view braces version`: 3.0.3; o [aviso primário](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) continua sem versão corrigida e descreve exaustão de pilha por padrões aninhados.
- Plugin Next 16.4.2 ainda depende de fast-glob 3.3.1; atualizar o par Next/eslint-config-next não demonstra correção deste advisory.
- Node local: **24.16.0**. Metadados npm de Next 16.4.2 exigem Node >=20.9.0; atende ao piso, mas isso não substitui build e regressão.

O audit completo informa CVSS v3 7,5; o aviso apresenta CVSS v4 8,7. São métricas distintas do mesmo problema, não vulnerabilidades adicionais.

## Alcance e risco contextual

O caminho identificado é de ferramentas de desenvolvimento/lint/build. Audit de produção zero reduz o alcance conhecido no conjunto de dependências runtime, mas não prova inexistência de exploração: ambientes que mantêm devDependencies ou executam ferramentas com padrões não confiáveis ainda precisam de proteção. Não foi identificado caminho HTTP do portal até braces nesta inspeção; isso é uma conclusão limitada à cadeia/referências examinadas, não um teste de penetração.

Manter `scripts/patch-braces.cjs`: limites de profundidade/nós, validação da versão/fonte, execução em postinstall/pretest e testes existentes. O lockfile ainda contém versão vulnerável; scanner continuará alertando. A mitigação não deve ser removida para satisfazer scanner nem chamada de correção upstream.

## Prioridades e aceite

| Prioridade | Medida posterior | Critério de aceite |
|---|---|---|
| Alta/imediata operacional | Preservar patch, evitar glob não confiável, controlar ferramentas de CI | Guard aplicado, testes adversariais e usos normais passam; sem scripts ignorados inadvertidamente |
| Alta/próxima correção | Acompanhar release corrigida e revisar menor atualização da cadeia | Advisory resolvido ou tratamento formal documentado; diff/lockfile revisados; compatibilidade comprovada |
| Moderada | Atualizar patches/minors em mudanças separadas | Changelog oficial revisado; auth/session, lint, testes e build passam |
| Planejada | Avaliar majors de ESLint/TypeScript/Vitest/Node types/esbuild | Plano de migração e rollback, compatibilidade com Node e plugins |

`npm audit` sugere downgrade para eslint-config-next 14.2.35; não aplicar contra Next 16. Não usar `npm audit fix --force`. Override de transitive/vendor novo requer revisão própria e prova de compatibilidade micromatch/braces, não simples supressão do alerta.

Versões mais novas observadas na M.3 não são declaradas correções. Manter Next/eslint-config-next alinhados e React/react-dom alinhados. Mudanças MSAL/jose exigem regressão de autenticação; OpenNext/wrangler exigem validação do alvo Cloudflare além do build Next. Tipos Node devem seguir runtime suportado, não apenas latest.

Após atualização autorizada: instalação reproduzível em ambiente isolado, audit completo e produção, `npm ls`, testes do patch/upstream com padrões profundos e normais, suíte completa, typecheck, lint e build. Comparar outputs e ausência de regressões; remover patch somente quando a substituição segura for demonstrada. Não houve atualização nesta fase.
