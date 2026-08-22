resource "infisical_secret_sync_github" "this" {
  for_each = local.syncs_by_type["github"]

  name          = each.key
  description   = each.value.description
  project_id    = infisical_project.this.id
  environment   = each.value.source.environment
  secret_path   = each.value.secret_path
  connection_id = local.connection_ids.github

  auto_sync_enabled = each.value.auto_sync

  destination_config = {
    scope                   = each.value.destination.scope
    repository_owner        = each.value.destination.owner
    repository_name         = try(each.value.destination.repository, null)
    repository_environment  = try(each.value.destination.repository_environment, null)
    visibility              = try(each.value.destination.visibility, null)
    selected_repository_ids = try(each.value.destination.selected_repository_ids, null)
  }

  sync_options = {
    initial_sync_behavior   = each.value.initial_sync_behavior
    disable_secret_deletion = each.value.disable_secret_deletion
    key_schema              = each.value.key_schema
  }

  depends_on = [infisical_secret_folder.this, infisical_secret.slot]

  lifecycle {
    precondition {
      condition     = local.connection_ids.github != null
      error_message = "Sync '${each.key}' needs the GitHub App Connection. Apply global and run `pnpm connections:lock` first."
    }
  }
}
