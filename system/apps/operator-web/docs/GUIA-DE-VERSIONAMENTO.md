# Guia de versionamento

Git registra versões. **Commit** é um ponto do histórico; **branch**, uma linha de trabalho; **merge**, combinação; **pull request** (PR), proposta revisável numa plataforma remota.

## Leitura (não altera o repositório)

```bash
git status --short --branch
git branch --all
git log --oneline --decorate -20
git diff
git diff --staged
```

## Escrita (altera estado)

```bash
git switch -c docs/minha-alteracao
git add system/apps/operator-web/docs/ARQUIVO.md
git commit -m "docs(operator-web): descreve fluxo"
git switch outra-branch
```

`add` prepara conteúdo, `commit` registra, `switch` troca a linha. Verifique trabalho local antes. Não use `reset --hard`, `clean` ou restauração destrutiva sem saber o que será perdido.

## Branches verificadas

Na análise: `infra-lab` (corrente), `v0` (outro worktree), `master`, `backup-trabalho-local-24-09`, `v0-java` e `v0-java-contaminated`; havia remotas equivalentes, exceto a última. A lista muda: confirme com `git branch --all`. Nome não garante finalidade.

Conflitos exigem entender os dois lados, remover marcadores e testar. Para desfazer commit compartilhado, prefira `git revert`. Antes de recuperar algo, use `git log`, `git reflog` e `git show <hash>:caminho`; peça revisão antes de comandos destrutivos.

## Fluxo com Codex

1. `git status` e leitura do código/documentação.
2. Branch dedicada conforme equipe.
3. Alteração de escopo limitado.
4. Revisão humana de `git diff --check` e `git diff` completos.
5. Confirmar ausência de secrets/artefatos.
6. Rodar lint, typecheck, testes, build e validação manual.
7. `git add` somente dos caminhos intencionais; revisar `git diff --staged`.
8. Commit claro e PR com testes/pendências.

Nenhum código gerado por IA deve ser aceito sem revisão humana.
