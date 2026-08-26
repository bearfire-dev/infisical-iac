resource "infisical_project" "bootstrap" {
  name                       = "IaC Secret CICD"
  slug                       = var.bootstrap_project_slug
  description                = "Control-plane credentials for bearfire-dev/infisical-iac. Values are entered by humans; objects are managed by Terraform."
  type                       = "secret-manager"
  should_create_default_envs = false
  has_delete_protection      = true
}

resource "infisical_project_environment" "bootstrap" {
  project_id = infisical_project.bootstrap.id
  name       = "Production"
  slug       = var.bootstrap_environment
  position   = 1
}

resource "infisical_secret_folder" "bootstrap" {
  for_each = local.bootstrap_secrets

  project_id       = infisical_project.bootstrap.id
  environment_slug = infisical_project_environment.bootstrap.slug
  folder_path      = "/"
  name             = trimprefix(each.key, "/")
  force_delete     = false
}

resource "infisical_secret_tag" "managed" {
  project_id = infisical_project.bootstrap.id
  name       = "terraform-managed"
  slug       = "terraform-managed"
  color      = "#6b7280"
}

resource "random_bytes" "bootstrap_placeholder" {
  for_each = local.bootstrap_secret_slots

  length = 128
}

# Placeholder objects. Random suffixes remain in private bootstrap state. The
# prefixed values are write-only. Humans replace them after the first apply.
resource "infisical_secret" "bootstrap" {
  for_each = local.bootstrap_secret_slots

  workspace_id = infisical_project.bootstrap.id
  env_slug     = infisical_project_environment.bootstrap.slug
  folder_path  = each.value.path
  name         = each.value.name

  value_wo         = "${local.placeholder_prefix}${random_bytes.bootstrap_placeholder[each.key].hex}"
  value_wo_version = 1

  tag_ids = [infisical_secret_tag.managed.id]

  metadata = {
    managed_by = "terraform"
    repository = "bearfire-dev/infisical-iac"
    project    = var.bootstrap_project_slug
    comment    = each.value.comment
  }

  secret_reminder = {
    note        = "Rotate this control-plane credential"
    repeat_days = var.credential_rotation_days
  }

  depends_on = [infisical_secret_folder.bootstrap]
}
