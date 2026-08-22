resource "infisical_secret_sync_cloudflare_workers" "this" {
  for_each = local.syncs_by_type["cloudflare-workers"]

  name          = each.key
  description   = each.value.description
  project_id    = infisical_project.this.id
  environment   = each.value.source.environment
  secret_path   = each.value.secret_path
  connection_id = local.connection_ids.cloudflare

  auto_sync_enabled = each.value.auto_sync

  destination_config = {
    script_id = each.value.destination.script_id
  }

  sync_options = {
    initial_sync_behavior   = each.value.initial_sync_behavior
    disable_secret_deletion = each.value.disable_secret_deletion
    key_schema              = each.value.key_schema
  }

  depends_on = [infisical_secret_folder.this, infisical_secret.slot]

  lifecycle {
    precondition {
      condition     = local.connection_ids.cloudflare != null
      error_message = "Sync '${each.key}' needs the Cloudflare App Connection. Apply global and run `pnpm connections:lock` first."
    }
  }
}
