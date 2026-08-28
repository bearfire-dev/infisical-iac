# One secret object per slot. The random suffix is stored in private project
# state. The prefixed placeholder is write-only and is never stored as a secret
# value in state.
# Humans replace the placeholder in Infisical; Terraform does not see or touch
# the live value on subsequent applies unless value_wo_version is incremented.
resource "random_bytes" "placeholder" {
  for_each = local.secret_slots

  length = 128
}

resource "infisical_secret" "slot" {
  for_each = local.secret_slots

  workspace_id = infisical_project.this.id
  env_slug     = each.value.environment
  folder_path  = each.value.path
  name         = each.value.name

  value_wo         = "${local.placeholder_prefix}${random_bytes.placeholder[each.key].hex}"
  value_wo_version = each.value.placeholder_version

  tag_ids = [
    for tag in distinct(concat([local.managed_tag], each.value.tags)) : infisical_secret_tag.this[tag].id
  ]

  metadata = merge(
    {
      managed_by = "terraform"
      repository = "paperkeel/infisical-iac"
      project    = local.project_slug
      secret_set = each.value.secret_set
      required   = "true"
    },
    each.value.comment == null ? {} : { comment = each.value.comment },
  )

  secret_reminder = each.value.reminder_days == null ? null : {
    note        = "Review or rotate this secret (declared in paperkeel/infisical-iac)"
    repeat_days = each.value.reminder_days
  }

  lifecycle {
    # The configured write-only value is relevant on create. Ignore later
    # expression changes unless value_wo_version explicitly requests a reset.
    ignore_changes = [value_wo]
  }

  depends_on = [infisical_secret_folder.this]
}
