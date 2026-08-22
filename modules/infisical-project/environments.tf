resource "infisical_project_environment" "this" {
  for_each = local.environments

  project_id = infisical_project.this.id
  name       = each.value.name
  slug       = each.key
  position   = each.value.position
}
