resource "infisical_secret_folder" "this" {
  for_each = local.folders

  project_id       = infisical_project.this.id
  environment_slug = each.value.environment
  folder_path      = "/"
  name             = each.value.name
  description      = each.value.description

  # Deleting a folder that still contains secrets must be a deliberate, reviewed act.
  force_delete = false

  depends_on = [infisical_project_environment.this]
}
