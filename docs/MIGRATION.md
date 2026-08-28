# Migration of existing projects and secrets

Plan §19. Goal: bring Infisical projects, environments, and secrets that already exist (and destinations that already hold good values) under this repository without overwriting anything.

Hard rule: **never create a placeholder that overwrites a known-good production destination.**

## Phases

1. Inventory (names only, no values): project, environments, folders, secret names, which destination consumes which key, who owns the destination today.
2. Pilot on a throwaway repository/worker/railway service; then one low-risk application.
3. Import existing objects with write-only import; reach a no-op plan.
4. Create syncs with the safest initial behavior; verify.
5. Declare Infisical authoritative; remove manual destination management.

## 1. Inventory

```bash
infisical secrets --projectId <id> --env prod --path /runtime --plain 2>/dev/null | awk '{print $1}'    # names only
gh secret list --repo paperkeel/<app>
```

Write the `project.yaml` so every existing secret is declared with `required_in` matching reality. Choose folders carefully: one secret set per destination ownership.

## 2. Import

Import rather than create. Resource addresses use the module's stable keys. Run locally with `source scripts/local-auth.sh project` and `INFISICAL_TOKEN`.

```bash
scripts/terraform-init.sh project:<slug>
cd projects/<slug>

# project, environments, folders
terraform import 'module.project.infisical_project.this' '<project_id>'
terraform import 'module.project.infisical_project_environment.this["prod"]' '<project_id>:prod'          # per provider docs
terraform import 'module.project.infisical_secret_folder.this["prod:/runtime"]' '<folder_id>'

# secrets: WRITE-ONLY import — the value is never read into state
terraform import 'module.project.infisical_secret.slot["prod:/runtime:DATABASE_URL"]' 'write-only:<project_id>:prod:/runtime:DATABASE_URL'

# tags, control-plane memberships
terraform import 'module.project.infisical_secret_tag.this["terraform-managed"]' '<tag_id>'
```

Check the exact import ID format per resource in the provider docs for 0.19.24 and record what worked in [PROVIDER_COMPATIBILITY.md](PROVIDER_COMPATIBILITY.md).

After importing:

```bash
terraform plan -detailed-exitcode   # must be 0 (no changes) before the PR
terraform state pull | jq '[.resources[] | select(.type == "infisical_secret") | .instances[] | select(.attributes.value != null or (.attributes | has("value_wo")))] | length'   # must be 0
```

If the plan wants to rewrite `value_wo`, the `value_wo_version` in state does not match `placeholder_version` (default 1). Do not "fix" it by applying; investigate (it would overwrite the live value with the placeholder).

## 3. Syncs to destinations that already have values

Set for the migration window:

```yaml
syncs:
  prod-runtime-to-github:
    initial_sync_behavior: import-prioritize-destination   # pull existing destination values into Infisical first
    manage_deletions: false                                 # do not delete unknown destination keys yet
```

Apply, then `pnpm secrets:check <slug>` (values now present in Infisical) and `pnpm sync:status <slug>`. Compare destination keys against the declaration. Once everything matches, open a second PR switching to defaults (`overwrite-destination`, `manage_deletions: true`). That second PR is the moment Infisical becomes authoritative; after it, direct edits in the destination are drift.

## 4. Remove manual management

- Delete duplicate GitHub secrets that are not in any declared set (they are now drift).
- Remove `wrangler secret put` / Railway UI steps from app runbooks.
- App PRs stop carrying secret-handling instructions; they reference `Depends on paperkeel/infisical-iac#<n>`.

## Railway bridge → native resource (future)

When the provider gains a Railway resource: add it to the module, `terraform import` the existing sync by ID, verify no-op plan, delete the `module.railway_sync` block with a `moved`/`removed` block so the bridge's destroy provisioner does not fire (or run without `INFISICAL_BRIDGE_ALLOW_DELETE`). `project.yaml` stays unchanged.
