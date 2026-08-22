resource "infisical_project" "this" {
  name        = var.config.project.name
  slug        = local.project_slug
  description = try(var.config.project.description, null)
  type        = "secret-manager"

  # Environments are declared explicitly in project.yaml.
  should_create_default_envs = false
  has_delete_protection      = try(var.config.project.delete_protection, true)
  audit_log_retention_days   = try(var.config.project.audit_log_retention_days, null)

  lifecycle {
    # The slug is the project's identity across Infisical, state, and syncs.
    # Changing it is a rename-as-recreate and must be a deliberate migration.
    ignore_changes = []
  }
}

resource "infisical_secret_tag" "this" {
  for_each = toset(local.tag_slugs)

  project_id = infisical_project.this.id
  name       = each.key
  slug       = each.key
  color      = var.default_tag_color
}
