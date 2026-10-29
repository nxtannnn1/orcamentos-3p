# Proteção da branch `infra-lab` (proposta)

Estado: **planejado**. Nada aqui foi aplicado no GitHub. Aplicar somente após revisão e com autorização explícita,
depois que os checks abaixo tiverem rodado ao menos uma vez com sucesso na `infra-lab`.

## Checks obrigatórios

O nome exigido é o `name:` do job, que precisa ser único no repositório.

| Check (contexto) | Workflow | Gatilho em PR |
| --- | --- | --- |
| `Secret scan (gitleaks)` | `security-scan.yml` | todo PR para `infra-lab` |
| `Microsoft Lists offline validation` | `microsoft-lists-validation.yml` | todo PR para `infra-lab` |
| `Power Automate offline validation` | `power-automate-validation.yml` | todo PR para `infra-lab` |

Um check obrigatório cujo workflow é ignorado por filtro de caminhos nunca reporta status e bloqueia o PR
indefinidamente. Por isso esses três workflows não usam `paths` em `pull_request`; em `push` o filtro foi mantido.
São verificações offline de poucos segundos.

Não incluir por enquanto:

- `Operator Web CI` e `CI` (auth-service): usam `paths` em PR. Para torná-los obrigatórios, remova o filtro ou crie
  um job agregador que sempre rode e só execute as etapas caras quando houver mudança no componente.
- Validação n8n: antes de exigi-la, o job precisa de `name:` único (hoje os validadores offline usavam o mesmo id
  `offline-validation`) e não pode ter `paths` em PR.

## Regras propostas (ruleset)

- Impedir exclusão da branch e force push (`deletion`, `non_fast_forward`).
- Exigir PR para alterar a `infra-lab`, com resolução das conversas.
- Exigir os três checks acima, com a branch atualizada antes do merge (`strict_required_status_checks_policy`).
- Revisão: com um único mantenedor, o GitHub não permite aprovar o próprio PR. Exigir uma aprovação só é viável com
  um segundo revisor. Até lá, `required_approving_review_count: 0`, e a revisão das políticas de segurança é feita pelo
  diff do PR mais os testes que fixam as invariantes de `.gitleaks.toml`, dos guardas e dos workflows.
- Quando houver segundo revisor: `required_approving_review_count: 1`, `require_code_owner_review: true`,
  `dismiss_stale_reviews_on_push: true` e um `.github/CODEOWNERS` para os caminhos de política:

```text
/.gitleaks.toml                                   @<revisor-de-seguranca>
/.github/workflows/                               @<revisor-de-seguranca>
/scripts/security/                                @<revisor-de-seguranca>
/system/infrastructure/microsoft-lists/scripts/   @<revisor-de-seguranca>
/system/automation/power-automate/scripts/        @<revisor-de-seguranca>
/scripts/n8n/                                     @<revisor-de-seguranca>
```

Payload para `gh api --method POST repos/<owner>/<repo>/rulesets --input ruleset.json`. Não executar sem aprovação.
`integration_id` 15368 é o app GitHub Actions; ele impede que um status externo com o mesmo nome satisfaça o check.

```json
{
  "name": "infra-lab protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/infra-lab"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Secret scan (gitleaks)", "integration_id": 15368 },
          { "context": "Microsoft Lists offline validation", "integration_id": 15368 },
          { "context": "Power Automate offline validation", "integration_id": 15368 }
        ]
      }
    }
  ],
  "bypass_actors": []
}
```

Para conferir o efeito depois de aplicado: `gh api repos/<owner>/<repo>/rules/branches/infra-lab`.

## Varredura de segredos

- `gitleaks` 8.30.1 é baixado com checksum SHA-256 fixado; `.gitleaks.toml` estende as regras padrão.
- `scripts/security/gitleaks.mjs` centraliza a execução. O preflight exige a versão exata do binário, as invariantes
  de `.gitleaks.toml` e histórico completo (clone superficial falha). Toda varredura usa `--redact` e
  `--ignore-gitleaks-allow`, de modo que comentários `gitleaks:allow` no código não suprimem achados.
- PR: commits do PR (`base..head`). Push: commits novos, ou o histórico completo se o commit anterior não existir.
  Agendado (semanal) e manual: histórico completo de todas as refs.
- Os logs mostram apenas regra, arquivo, linha, commit e fingerprint. A saída da ferramenta é descartada, e o
  relatório JSON, mesmo redigido, fica em diretório temporário apagado ao final, sem publicação como artefato.
- Achados históricos legítimos (falsos positivos ou segredos já revogados) entram em `.gitleaksignore` pelo
  fingerprint, com justificativa no PR. O histórico não é reescrito.
- Varredura local de 28/10/2026 com 8.30.1 sobre todas as refs: 2 achados `generic-api-key`, ambos falsos positivos.
  - Segredo de sessão fixo de teste (`fixture`) em
    `system/apps/operator-web/src/server/security/redis-lab.integration.test.ts`. O conteúdo foi corrigido
    (valor gerado por execução), e só o commit histórico `5decc25` é aceito.
  - Nomes de contêiner Docker com `keycloak` em `system/apps/operator-web/scripts/start-dev-local.mjs`. Sem
    credencial, o conteúdo segue inalterado porque precisa coincidir com o laboratório; só o commit `bac69e3` é aceito.
    Um commit novo que reescreva essa linha volta a ser detectado e exige nova triagem.
- `.gitleaksignore` contém apenas esses dois fingerprints completos (commit:arquivo:regra:linha), cada um com
  justificativa. O preflight rejeita entradas sem commit, malformadas, duplicadas ou sem justificativa, e o teste
  trava o conjunto exato. Com isso, a varredura completa do histórico termina com 0 achados.
