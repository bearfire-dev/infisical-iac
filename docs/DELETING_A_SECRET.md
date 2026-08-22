# Deleting (or renaming) a secret

Deletion removes the Infisical object **and**, through syncs with `manage_deletions: true` (default), the destination key. Do this as its own PR.

## Rename = add, migrate, delete

1. Add the new name ([ADDING_A_SECRET.md](ADDING_A_SECRET.md)); populate; verify.
2. Deploy consumers using the new name.
3. Confirm the old name is unused (code search across consuming repos; destination access logs where available).
4. Delete the old name per below.

## Delete

1. Check consumers:

   ```bash
   gh search code --owner bearfire-dev 'OLD_SECRET_NAME'
   ```

2. Remove the secret (or the environment from `required_in`) in `project.yaml`. If it was the last secret of a set in that environment, the folder goes too (folders have `force_delete = false`; if Infisical holds non-Terraform secrets there, the apply fails — clean them up first).
3. Open the PR, let `plan.yml` run: it fails with `plan ... is destructive` until the `destructive-change` label is added.

   ```bash
   gh pr edit <n> --add-label destructive-change
   ```

   Re-run the plan check; read the comment: expected `-1 infisical_secret.slot["prod:/runtime:OLD"]` per environment.
4. Reviewer confirms the destroy list matches the PR description. Merge.
5. `apply.yml` needs the `production` approval. The resolve job finds the label on the merged PR and sets `INFISICAL_IAC_DESTRUCTIVE_APPROVED=1` (and `INFISICAL_BRIDGE_ALLOW_DELETE=1` for Railway syncs). State was snapshotted immediately before apply.
6. Verify: `pnpm sync:status <slug>`; destination no longer has the key.

## Deleting a sync

Same flow. A GitHub/Cloudflare sync removal deletes the Infisical sync object only; destination keys already delivered are left in place by Infisical (remove them manually if desired). A Railway sync is removed remotely only when `INFISICAL_BRIDGE_ALLOW_DELETE=1`; without it the bridge keeps the remote sync and `drift.yml` reports it.

## Undo

Re-add the declaration; the next apply recreates the object with a placeholder. The previous value is gone from Infisical (check Infisical's secret versioning / snapshots for the project before deleting if you may need it). State recovery: [STATE_RECOVERY.md](STATE_RECOVERY.md).
