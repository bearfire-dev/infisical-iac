# Provider compatibility

Plan §16. Pins: Terraform `>= 1.11.0, < 2.0.0` (CI: **1.13.3**), provider `infisical/infisical = 0.19.24`, `.terraform.lock.hcl` committed per root.

## Capability matrix (0.19.24)

| Capability | Resource | Status | Notes |
|---|---|---|---|
| Project, environments, folders | `infisical_project`, `infisical_project_environment`, `infisical_secret_folder` | native | `should_create_default_envs = false`, `has_delete_protection` |
| Write-only secret objects | `infisical_secret` with `value_wo` / `value_wo_version` | native | value never in state; Terraform 1.11+ required |
| Tags, metadata, reminders | `infisical_secret_tag`, `metadata`, `secret_reminder` | native | |
| Machine identities + GitHub OIDC | `infisical_identity`, `infisical_identity_oidc_auth` | native | `bound_claims` supports `repository_id`, `repository_owner_id`, `ref` |
| Project memberships | `infisical_project_identity` | native | `adopt_existing` for the creator identity |
| GitHub App Connection | `infisical_app_connection_github` | native | `method = "pat"` only; GitHub App method deferred |
| Cloudflare App Connection | `infisical_app_connection_cloudflare` | native | `method = "api-token"` |
| Railway App Connection | — | **bridge** | `global/connections.tf` `terraform_data` + `pnpm infisical:reconcile railway-connection` |
| GitHub Secret Sync | `infisical_secret_sync_github` | native | scopes: repository, repository-environment, organization |
| Cloudflare Workers Secret Sync | `infisical_secret_sync_cloudflare_workers` | native | `script_id` |
| Railway Secret Sync | — | **bridge** | `modules/railway-sync-bridge` + `pnpm infisical:reconcile railway-sync` |
| Custom org role for apply identity | `infisical_org_role` | deferred | apply identity uses `admin` until permission set is proven |

## Acceptance suite

`pnpm provider:acceptance` (`scripts/provider-acceptance.sh`, suite in `modules/infisical-project/tests/acceptance`) proves, against a throwaway project:

1. 20 write-only secrets apply; placeholder absent from state
2. repeated plan is a no-op
3. manual value change in Infisical causes no diff
4. unrelated metadata apply does not overwrite the manual value
5. write-only import (`write-only:<project_id>:<env>:<path>:<NAME>`) leaks nothing into state and plans clean
6. destroy succeeds

Run: `INFISICAL_HOST=… INFISICAL_TOKEN=… INFISICAL_ORG_ID=… pnpm provider:acceptance`.

## Results

**Status: NOT YET RUN.** Fill one row per (Terraform, provider) pair before relying on it in production.

| Date | Terraform | Provider | R2 `use_lockfile` verified | Steps passed | Operator | Notes |
|---|---|---|---|---|---|---|
| — | 1.13.3 | 0.19.24 | — | — | — | pending |

## Failure policy

Any step fails → stop the rollout, document here, test the last known-good pair, never mask with broad `ignore_changes`. Upgrades only via dedicated `provider-upgrade` PRs with: changelog review, this table updated, all-root plans, state snapshot, rollback note.

## Evidence from bootstrap (2026-08-22, Terraform 1.13.3, provider 0.19.24)

Observed on the real `bootstrap` root against R2-backed state (not the full `pnpm provider:acceptance` suite, which is still pending):

| Check | Result |
|---|---|
| `value_wo` placeholder absent from state (`value` = null, only `value_wo_version` stored) | ✓ |
| Repeat plan after apply is a no-op | ✓ |
| Values replaced via Infisical CLI; unrelated apply (reminder metadata change) left them intact | ✓ |
| Write-only import (`write-only:<project>:<env>:<path>:<NAME>`) of a CLI-created secret; value not in state; follow-up plan only showed declared metadata | ✓ |
| S3 backend `use_lockfile = true` against R2 (init/plan/apply, lock acquired and released) | ✓ |
| Native `infisical_app_connection_github` (pat) and `infisical_app_connection_cloudflare` (api-token) create + Infisical-side validation | ✓ |
| Railway App Connection via API bridge (`account-token`) | ✓ |

## Acceptance suite result (2026-08-22)

`pnpm provider:acceptance` — **PASSED** with Terraform 1.13.3 and provider `infisical/infisical` 0.19.24 against a throwaway project (20 write-only secrets).

| Step | Result |
|---|---|
| 1 create 20 `value_wo` secrets | ✓ |
| 2 placeholder absent from state | ✓ |
| 3 repeat plan no-op | ✓ |
| 4–5 manual value change via CLI → plan no-op | ✓ |
| 6 unrelated metadata apply leaves manual value intact | ✓ |
| 7 write-only import: value not in state | ✓ (see quirk) |
| 8 destroy | ✓ |

**Known quirk — import reads an empty reminder.** `terraform import 'write-only:…'` populates `secret_reminder = { note = "", repeat_days = 0 }` rather than `null`, so the first plan after import shows one in-place update of that attribute. The reconciliation apply does not touch the value (verified) and the following plan is a no-op. Expect this during migrations (`docs/MIGRATION.md`); it is not a value rewrite.
