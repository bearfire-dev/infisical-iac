# State recovery

Three situations: a stuck lock, a corrupted/lost state object, and state that no longer matches reality (re-import). Always snapshot first when the current state is readable.

## Credentials

```bash
export CLOUDFLARE_ACCOUNT_ID=<account id>
export INFISICAL_TOKEN=<human token>
source scripts/local-auth.sh global      # or project
# backups bucket credentials (read from platform-bootstrap:/terraform-backend):
export TF_BACKUP_R2_ACCESS_KEY_ID=$(infisical secrets get TF_BACKUP_R2_ACCESS_KEY_ID --projectId <bootstrap project id> --env prod --path /terraform-backend --plain)
export TF_BACKUP_R2_SECRET_ACCESS_KEY=$(infisical secrets get TF_BACKUP_R2_SECRET_ACCESS_KEY --projectId <bootstrap project id> --env prod --path /terraform-backend --plain)
R2="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"
```

Use the AWS CLI against R2 with `--endpoint-url "$R2"` and `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` set to the relevant pair (`region` must be `auto`).

## 1. Stuck lock

Symptom: `Error acquiring the state lock` with an ID and a workflow run that is no longer running.

```bash
gh run list --workflow apply.yml --limit 5            # confirm nothing is running on that root
pnpm state:unlock project:<slug> <LOCK_ID>            # wraps terraform force-unlock
```

Manual equivalent: `scripts/terraform-init.sh project:<slug> && terraform -chdir=projects/<slug> force-unlock <LOCK_ID>`. With `use_lockfile = true` the lock is the object `<key>.tflock` in the state bucket; if `force-unlock` fails, delete that object:

```bash
AWS_ACCESS_KEY_ID=$TF_PROJECT_R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$TF_PROJECT_R2_SECRET_ACCESS_KEY \
aws --endpoint-url "$R2" --region auto s3 rm s3://bearfire-infisical-project-state/projects/<slug>/terraform.tfstate.tflock
```

## 2. Restore a state object from backup

List snapshots (timestamped immutable keys):

```bash
AWS_ACCESS_KEY_ID=$TF_BACKUP_R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$TF_BACKUP_R2_SECRET_ACCESS_KEY \
aws --endpoint-url "$R2" --region auto s3 ls s3://bearfire-infisical-state-backups/projects/<slug>/
```

Restore (download with backup creds, upload with the root's creds; never via a public path; delete the local copy afterwards):

```bash
tmp=$(mktemp -d)
AWS_ACCESS_KEY_ID=$TF_BACKUP_R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$TF_BACKUP_R2_SECRET_ACCESS_KEY \
aws --endpoint-url "$R2" --region auto s3 cp s3://bearfire-infisical-state-backups/projects/<slug>/<ISO>.tfstate "$tmp/state.json"

AWS_ACCESS_KEY_ID=$TF_PROJECT_R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$TF_PROJECT_R2_SECRET_ACCESS_KEY \
aws --endpoint-url "$R2" --region auto s3 cp "$tmp/state.json" s3://bearfire-infisical-project-state/projects/<slug>/terraform.tfstate
rm -rf "$tmp"

scripts/terraform-init.sh project:<slug>
terraform -chdir=projects/<slug> plan -detailed-exitcode     # expect 0, or a diff you can explain
```

Global/bootstrap: bucket `bearfire-infisical-global-state`, keys `global/terraform.tfstate`, `bootstrap/terraform.tfstate`, credentials `TF_GLOBAL_R2_*`. Global state contains App Connection credentials: handle the downloaded file as a secret.

Alternative without the AWS CLI: `terraform state push "$tmp/state.json"` after init (checks serial/lineage; use `-force` only when you have verified the lineage).

## 3. State lost or diverged: re-import

When no snapshot is usable, rebuild state by import. IDs come from the Infisical UI/API (`GET /api/v1/workspace`, `/api/v1/workspace/<id>/environments`, folders, secrets). Use the stable resource keys:

```bash
cd projects/<slug>
terraform import 'module.project.infisical_project.this' '<project_id>'
terraform import 'module.project.infisical_secret_folder.this["prod:/runtime"]' '<folder_id>'
terraform import 'module.project.infisical_secret.slot["prod:/runtime:DATABASE_URL"]' 'write-only:<project_id>:prod:/runtime:DATABASE_URL'
terraform import 'module.project.infisical_secret_sync_github.this["prod-ci-to-github"]' '<sync_id>'
```

Railway bridge resources (`terraform_data`) cannot be imported; after re-import, a plan shows them as creates. The bridge upsert is idempotent by name, so applying is safe (no `INFISICAL_BRIDGE_ALLOW_DELETE`).

Finish with `terraform plan -detailed-exitcode` → 0, then `pnpm state:snapshot project:<slug>`.

## 4. Buckets themselves

Alchemy never deletes the buckets (`delete: false`). If a bucket is gone, recreate with `pnpm bootstrap:state` (adopts by name), then restore objects from backups. If the backups bucket is gone, rebuild every state by import.

## Test this

Recovery counts as implemented only after a restore has been exercised on a throwaway project (plan §24). Record the date here:

| Date | Root | Scenario | Result |
|---|---|---|---|
| — | — | — | not yet tested |
