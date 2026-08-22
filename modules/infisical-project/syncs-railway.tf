# Provider 0.19.24 has no native Railway App Connection / Secret Sync resources.
# Railway syncs are reconciled through the isolated API bridge (see
# modules/railway-sync-bridge and tools/infisical-api-bridge). The project.yaml
# contract is identical to native syncs so a future native resource can replace
# the bridge with an import + `moved` block and no project configuration change.
module "railway_sync" {
  for_each = local.syncs_by_type["railway"]
  source   = "../railway-sync-bridge"

  name          = each.key
  description   = each.value.description
  project_id    = infisical_project.this.id
  environment   = each.value.source.environment
  secret_path   = each.value.secret_path
  connection_id = local.connection_ids.railway

  auto_sync_enabled       = each.value.auto_sync
  initial_sync_behavior   = each.value.initial_sync_behavior
  disable_secret_deletion = each.value.disable_secret_deletion
  key_schema              = each.value.key_schema

  destination = each.value.destination

  depends_on = [infisical_secret_folder.this, infisical_secret.slot]
}
