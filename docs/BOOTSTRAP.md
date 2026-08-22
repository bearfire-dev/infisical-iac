# Bootstrap

One-time setup of the root of trust. Everything after step 9 is done through pull requests. Nothing here puts a secret value into Git or GitHub Secrets.

Prerequisites: `gh` (authenticated, admin on `bearfire-dev/infisical-iac`), `terraform` 1.13.x, `node` 24 + `pnpm`, `infisical` CLI, Cloudflare dashboard access, Infisical org admin.

## 1. Repository settings

```bash
gh repo edit bearfire-dev/infisical-iac --enable-auto-merge=false --delete-branch-on-merge
gh label create destructive-change --color B60205 --description "Plan deletes or replaces resources; requires production approval"
gh label create drift --color FBCA04 --description "Opened by drift.yml"
gh label create automated --color 0E8A16
gh label create provider-upgrade --color 5319E7
```

Branch protection on `main`: require PRs, require `ci` status checks, require CODEOWNERS review, no force pushes.

Environments (`terraform-plan`, `production`, `bootstrap`):

```bash
R=repos/bearfire-dev/infisical-iac
gh api -X PUT $R/environments/terraform-plan -f 'deployment_branch_policy=null' >/dev/null
# production: reviewers + main only
gh api -X PUT $R/environments/production \
  --input - <<'JSON'
{"reviewers":[{"type":"Team","id":REPLACE_WITH_TEAM_ID}],"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false}}
JSON
gh api -X PUT $R/environments/bootstrap \
  --input - <<'JSON'
{"reviewers":[{"type":"Team","id":REPLACE_WITH_TEAM_ID}],"deployment_branch_policy":{"protected_branches":true,"custom_branch_policies":false}}
JSON
# team id: gh api orgs/bearfire-dev/teams/platform --jq .id
```

## 2. Infisical organization

In the Infisical UI: create or select the `bearfire` organization. Note the organization ID (Organization Settings) and slug. Create a short-lived **human** token for the bootstrap apply (User Settings → Personal tokens) or use `infisical login` and export:

```bash
export INFISICAL_HOST=https://app.infisical.com
export INFISICAL_TOKEN=<short-lived human or bootstrap token>   # shell only; never written anywhere
export INFISICAL_ORG_ID=<organization uuid>
```

## 3. State buckets (Alchemy)

```bash
pnpm install
export CLOUDFLARE_ACCOUNT_ID=<account id>
export CLOUDFLARE_API_TOKEN=<human dashboard token>     # or CLOUDFLARE_API_KEY=<global key> CLOUDFLARE_EMAIL=<email>
export ALCHEMY_STATE_TOKEN=$(openssl rand -hex 32)     # first run: generate; later runs: reuse the same value
pnpm bootstrap:state
```

Creates `bearfire-infisical-global-state`, `bearfire-infisical-project-state`, `bearfire-infisical-state-backups` (private; never deleted on destroy). Alchemy's own state lives in a Cloudflare Worker/Durable Object it creates on first run; `ALCHEMY_STATE_TOKEN` authenticates to it. Store the token as `ALCHEMY_STATE_TOKEN` in `platform-bootstrap:/terraform-backend` after step 6 so future operators can re-run the stack. (A first-run `404 This Worker does not exist` log line is expected — Alchemy then creates the state Worker.)

## 4. Three scoped R2 API tokens

Cloudflare dashboard → R2 → Manage R2 API Tokens → Create. One token per bucket, **Object Read & Write**, scoped to exactly that bucket:

| Token name | Bucket | Becomes |
|---|---|---|
| `infisical-iac-global-state` | `bearfire-infisical-global-state` | `TF_GLOBAL_R2_ACCESS_KEY_ID` / `TF_GLOBAL_R2_SECRET_ACCESS_KEY` |
| `infisical-iac-project-state` | `bearfire-infisical-project-state` | `TF_PROJECT_R2_ACCESS_KEY_ID` / `TF_PROJECT_R2_SECRET_ACCESS_KEY` |
| `infisical-iac-state-backups` | `bearfire-infisical-state-backups` | `TF_BACKUP_R2_ACCESS_KEY_ID` / `TF_BACKUP_R2_SECRET_ACCESS_KEY` |

Keep them in your password manager until step 6; then delete the local copies.

## 5. First bootstrap apply (local, chicken-and-egg)

The bootstrap root creates the identities that `bootstrap.yml` authenticates with, so the first apply is local.

```bash
cd bootstrap/terraform
cp bootstrap.example.tfvars bootstrap.auto.tfvars        # git-ignored
gh api repos/bearfire-dev/infisical-iac --jq .id         # → github_repository_id
gh api orgs/bearfire-dev --jq .id                        # → github_owner_id
$EDITOR bootstrap.auto.tfvars                            # organization_id, github_repository_id, github_owner_id (all strings)
cd ../..

# Backend credentials for the global-state bucket (from step 4), shell only:
export TF_GLOBAL_R2_ACCESS_KEY_ID=... TF_GLOBAL_R2_SECRET_ACCESS_KEY=...
export TF_BACKUP_R2_ACCESS_KEY_ID=... TF_BACKUP_R2_SECRET_ACCESS_KEY=...
export CLOUDFLARE_ACCOUNT_ID=<account id>

scripts/terraform-plan.sh bootstrap      # review: 2 identities, 2 OIDC auths, project, env, 2 folders, tag, 9 secrets
scripts/terraform-apply.sh bootstrap
terraform -chdir=bootstrap/terraform output github_variables
terraform -chdir=bootstrap/terraform output -raw bootstrap_project_id
```

`terraform-apply.sh` snapshots state first; on the very first run there is no state yet, which `pnpm state:snapshot` treats as a no-op.

## 6. Populate the 9 placeholders

In Infisical → project **Platform Bootstrap** → env `prod`:

| Folder | Secret | Value |
|---|---|---|
| `/terraform-backend` | `TF_GLOBAL_R2_ACCESS_KEY_ID`, `TF_GLOBAL_R2_SECRET_ACCESS_KEY` | step 4, global token |
| `/terraform-backend` | `TF_PROJECT_R2_ACCESS_KEY_ID`, `TF_PROJECT_R2_SECRET_ACCESS_KEY` | step 4, project token |
| `/terraform-backend` | `TF_BACKUP_R2_ACCESS_KEY_ID`, `TF_BACKUP_R2_SECRET_ACCESS_KEY` | step 4, backups token |
| `/connections` | `GH_INFISICAL_CONNECTION_PAT` | fine-grained PAT: Actions secrets **Read and write** on repos that receive syncs, plus `Administration: read` for org-scoped syncs |
| `/connections` | `CLOUDFLARE_API_TOKEN` | Workers Scripts **Edit** on the account |
| `/connections` | `RAILWAY_API_TOKEN` | Railway account/team token with access to the destination projects |

Or via CLI (values read from your password manager, never typed into history):

```bash
PID=$(terraform -chdir=bootstrap/terraform output -raw bootstrap_project_id)
infisical secrets set TF_GLOBAL_R2_ACCESS_KEY_ID="$(pass show cloudflare/r2/global/id)" --projectId "$PID" --env prod --path /terraform-backend
```

Every placeholder must be replaced; the composite action refuses `__REPLACE_IN_INFISICAL__`.

## 7. GitHub repository variables (non-secret)

```bash
R=bearfire-dev/infisical-iac
terraform -chdir=bootstrap/terraform output -json github_variables | jq -r 'to_entries[] | "\(.key) \(.value)"' \
  | while read -r k v; do gh variable set "$k" --repo $R --body "$v"; done
gh variable set INFISICAL_ORG_SLUG      --repo $R --body bearfire
gh variable set CLOUDFLARE_ACCOUNT_ID   --repo $R --body <account id>
gh variable list --repo $R
```

Expected set: `INFISICAL_HOST`, `INFISICAL_ORG_ID`, `INFISICAL_ORG_SLUG`, `INFISICAL_PLAN_IDENTITY_ID`, `INFISICAL_APPLY_IDENTITY_ID`, `INFISICAL_BOOTSTRAP_PROJECT_SLUG`, `INFISICAL_BOOTSTRAP_ENV`, `INFISICAL_OIDC_AUDIENCE` (`infisical-iac`), `CLOUDFLARE_ACCOUNT_ID`.

## 8. Verify OIDC

```bash
gh workflow run plan.yml --repo bearfire-dev/infisical-iac -f root=global
gh run watch --repo bearfire-dev/infisical-iac
```

Success = the `Authenticate to Infisical (plan identity)` step prints `Authenticated to Infisical as identity ...` and the global plan runs (it will show creates; nothing is applied). Failure modes: [TROUBLESHOOTING.md](TROUBLESHOOTING.md) → OIDC.

## 9. Global apply

Open a PR touching `global/` (for example the Railway `credentialVersion` comment) or dispatch:

```bash
gh workflow run apply.yml --repo bearfire-dev/infisical-iac -f root=global
```

Approve the `production` deployment. The job applies the App Connections, runs `pnpm connections:lock`, and opens `chore/connections-lock`. Merge it; `global/connections.lock.json` now has real IDs and `status` is no longer `unbootstrapped`.

Local alternative: `source scripts/local-auth.sh global && scripts/terraform-apply.sh global && pnpm connections:lock` with `TF_VAR_*` exported from `/connections`.

## 10. Cleanup

```bash
unset INFISICAL_TOKEN TF_GLOBAL_R2_ACCESS_KEY_ID TF_GLOBAL_R2_SECRET_ACCESS_KEY TF_BACKUP_R2_ACCESS_KEY_ID TF_BACKUP_R2_SECRET_ACCESS_KEY
rm -f bootstrap/terraform/bootstrap.auto.tfvars bootstrap/terraform/backend.generated.hcl
history -c   # if any value was ever typed inline
```

Revoke the human Infisical token. Delete the local copies of the R2 tokens from step 4. From now on `bootstrap.yml` (dispatch, `bootstrap` environment) handles bootstrap changes; the only recurring manual task is rotating the nine values on the reminder schedule ([OPERATIONS.md](OPERATIONS.md)).
