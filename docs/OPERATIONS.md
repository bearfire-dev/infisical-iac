# Operations

Routine tasks, in order of frequency. Commands assume a local shell with `INFISICAL_TOKEN` (or `infisical login`) and `source scripts/local-auth.sh <global|project>` where Terraform state is touched.

## Daily / on demand

| Task | Command |
|---|---|
| Are all declared secrets populated? | `pnpm secrets:check --all` (or `<slug> [--env prod]`) |
| Are syncs healthy? | `pnpm sync:status --all` |
| Is the lock file current? | `pnpm connections:check` |
| What would a PR plan? | `pnpm plan --project <slug>` / `--global` / `--all` |
| Snapshot state before a manual operation | `pnpm state:snapshot project:<slug>` |

## Drift

`drift.yml` opens/updates the single issue "Drift detected" (label `drift`). Triage per row:

| Row | Meaning | Action |
|---|---|---|
| Terraform `DRIFT` | Infisical differs from Git (object deleted/renamed/edited in UI, or lock changed) | Fix in Git (PR) or revert in Infisical. Never apply from the issue. |
| Terraform `plan FAILED` | auth, backend, or lock problem | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| `sync:status` failure | sync missing, auto-sync off, last sync failed, destination mismatch | Re-trigger in Infisical UI; if destination credential expired, rotate (below) |
| `connections:check` failure | `connections.lock.json` stale | merge the open `chore/connections-lock` PR or run `pnpm connections:lock` after `source scripts/local-auth.sh global` |

The issue auto-closes on the next clean run.

## Rotation of control-plane credentials

All nine live in `platform-bootstrap/prod` and carry reminders. Rotate value-in-place; no Terraform change except Railway.

| Credential | Where to create | After updating in Infisical |
|---|---|---|
| `TF_*_R2_*` (3 pairs) | Cloudflare R2 API tokens | next workflow run picks it up; delete the old token |
| `GH_INFISICAL_CONNECTION_PAT` | GitHub fine-grained PAT | `gh workflow run apply.yml -f root=global` (provider re-submits credential) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API tokens | same as above |
| `RAILWAY_API_TOKEN` | Railway tokens | bump `railway_credential_version` in `global/variables.tf` via PR → bridge re-submits |

The apply identity reads `/connections` at apply time; the plan identity never can.

## Manual apply (break-glass)

Only when `apply.yml` cannot run (GitHub outage, identity broken). Requires a human Infisical admin token.

```bash
export INFISICAL_HOST=https://app.infisical.com INFISICAL_TOKEN=<human token> CLOUDFLARE_ACCOUNT_ID=<id>
source scripts/local-auth.sh project
pnpm plan --project <slug>
INFISICAL_IAC_DESTRUCTIVE_APPROVED=0 scripts/terraform-apply.sh project:<slug>
```

Record the run in the PR or an issue; `drift.yml` will confirm convergence the next day.

## Provider / Terraform upgrades

Dedicated PR (Dependabot opens them, label `provider-upgrade`). Required in the PR body: changelog review, `pnpm provider:acceptance` result pasted into [PROVIDER_COMPATIBILITY.md](PROVIDER_COMPATIBILITY.md), all-root plan (`gh workflow run plan.yml -f root=all`), state snapshot confirmed, rollback note (pin back + `terraform init -upgrade`). Update `TERRAFORM_VERSION` in every workflow and the `required_version` constraints together.

## State

- Snapshots: automatic before every apply and daily (`state-backup.yml`, 30-day retention).
- Restore / unlock / re-import: [STATE_RECOVERY.md](STATE_RECOVERY.md).
- `pnpm state:unlock <spec> <lock-id>` wraps `terraform force-unlock`.

## Access review (quarterly)

- `gh variable list` matches bootstrap outputs.
- Infisical: both identities exist, OIDC bindings unchanged (subject, audience, `repository_id`, `repository_owner_id`, `ref` for apply).
- GitHub environments: `production` and `bootstrap` still require reviewers and `main` only.
- No repository secrets except (optionally) `GITLEAKS_LICENSE`: `gh secret list`.

## Railway: multiple accounts, one connection

Bearfire deploys to two separate Railway accounts. The single `bearfire-railway` App Connection uses one Railway token that has access to both; which account a sync targets is determined entirely by `destination.project_id` / `environment_id` / `service_id` in the project's `project.yaml`. When rotating `RAILWAY_API_TOKEN`, the new token must again be granted access to **both** accounts or syncs into the second account will start failing (`pnpm sync:status --all` will show it).

## Why the global root is not planned on pull requests

Infisical custom organization roles are Enterprise-only. Without one, the plan identity's org role is `member`, which cannot read org-scoped App Connections, so a Terraform plan of `global/` fails under the plan identity. Granting the plan identity `admin` would let any same-repo pull request read every project's secret values, which is a larger risk than losing PR-time plans for a rarely-changed root.

Current behaviour:

- `plan.yml` skips `global` on pull requests and posts a notice; `ci.yml` still runs `terraform validate` on it.
- `apply.yml` plans and applies `global` on `main` under the apply identity with `production` approval — the human approving sees the plan summary there.
- `drift.yml` skips `global`; check it manually with `pnpm plan --global` from an operator shell (`docs/BOOTSTRAP.md` §auth) when App Connections change.

After upgrading to Enterprise:

1. Set `enable_custom_org_roles = true` in the bootstrap root and apply it (the plan identity switches to the `infisical-iac-plan` role).
2. In `plan.yml`, remove the `pull_request` exclusion of `global` from the matrix.
3. In `drift.yml`, remove the `global` exclusion **and** make its global plan load the real connection credentials the same way `plan.yml` does (`fetch-connections: true` for the global root instead of the placeholder `TF_VAR_*` values); otherwise the provider will report a false credential diff or fail.
4. Dispatch `plan.yml` with `root=global` and confirm a no-op plan before relying on drift reports for `global`.
