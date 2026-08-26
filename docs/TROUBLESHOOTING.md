# Troubleshooting

## OIDC login fails (`Infisical OIDC login failed`)

| Cause | Check | Fix |
|---|---|---|
| Job not in the right environment | `environment:` on the job; subject is `repo:bearfire-dev/infisical-iac:environment:<env>` | plan jobs use `terraform-plan`; apply/bootstrap use `production`/`bootstrap` |
| Audience mismatch | `INFISICAL_OIDC_AUDIENCE` variable vs `bound_audiences` on the identity | both `infisical-iac` |
| Apply on non-main ref | apply binding pins `ref=refs/heads/main` | dispatch apply only from `main` |
| Repository transferred/renamed | `repository_id` / `repository_owner_id` claims pinned | update `bootstrap.auto.tfvars` and re-apply bootstrap (locally if identities are unreachable) |
| Wrong identity ID variable | `gh variable list` vs `terraform -chdir=bootstrap/terraform output` | `gh variable set` |
| Token request blocked | `permissions: id-token: write` on the workflow | add it |
| `bootstrap` environment on the first run | the apply identity does not exist yet | run the first bootstrap apply locally ([BOOTSTRAP.md](BOOTSTRAP.md) step 5) |

## `is still the placeholder; populate it in Infisical`

A `platform-bootstrap` value still contains a current or legacy placeholder. Replace it in `/terraform-backend` or `/connections`, then run the job again.

## `not found in platform-bootstrap` / 403 reading secrets

The identity lacks membership (bootstrap grants `viewer` on platform-bootstrap). Check Infisical → IaC Secret CICD → Access Control → Machine identities. Plan identity can read `/terraform-backend` only if folder-level policies were not added; we rely on project-level viewer.

## Backend init fails

- `InvalidAccessKeyId` / `SignatureDoesNotMatch`: the `TF_*_R2_*` pair is wrong or scoped to another bucket.
- `CLOUDFLARE_ACCOUNT_ID` missing: repository variable not set.
- `Error acquiring the state lock`: [STATE_RECOVERY.md](STATE_RECOVERY.md) §1.
- Lockfile unsupported: confirm `use_lockfile` works with R2 for the pinned Terraform (record in [PROVIDER_COMPATIBILITY.md](PROVIDER_COMPATIBILITY.md)).

## `plan for <spec> contains destructive changes`

Expected behaviour. Add the `destructive-change` label to the PR (plan), or ensure the merged PR carried it / pass `allow_destructive: true` on dispatch (apply). See [DELETING_A_SECRET.md](DELETING_A_SECRET.md).

## Plan wants to rewrite every `value_wo`

`value_wo_version` in state differs from `placeholder_version`. Do not apply. Usually a state restore from an older snapshot, or someone changed `placeholder_version`. Compare with the snapshot list.

## Sync `needs the ... App Connection. Apply global and run pnpm connections:lock first`

`global/connections.lock.json` still has zeros for that connection. Apply global, merge `chore/connections-lock`.

## `chore/connections-lock` PR has no CI checks

PRs created with `GITHUB_TOKEN` do not trigger workflows. Close and reopen the PR, or push an empty commit.

## Railway bridge errors

- `RAILWAY_API_TOKEN missing or placeholder`: populate in `platform-bootstrap:/connections`.
- Remote sync remains after removal: expected without `INFISICAL_BRIDGE_ALLOW_DELETE=1`; it is reported by drift. Re-run the apply with the label/input, or delete in the Infisical UI.
- Credential rejected after rotation: bump `railway_credential_version` in `global/variables.tf`.

## `secrets:check` fails after apply

Expected until humans populate values. The apply job continues; application deployment must wait.

## gitleaks fails on an organization repo

Set the `GITLEAKS_LICENSE` repository secret (free for OSS). It is the only permitted repository secret.

## Local `pnpm plan` cannot authenticate

Local runs use `INFISICAL_TOKEN` (human) rather than OIDC. `source scripts/local-auth.sh <class>` needs `INFISICAL_BOOTSTRAP_PROJECT_ID` exported and an `infisical login` session.
