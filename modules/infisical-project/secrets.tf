# One secret object per slot. The value is write-only: the placeholder is sent
# on create (and whenever value_wo_version changes) but is never stored in state.
# Humans replace the placeholder in Infisical; Terraform does not see or touch
# the live value on subsequent applies unless value_wo_version is incremented.
resource "infisical_secret" "slot" {
  for_each = local.secret_slots

  workspace_id = infisical_project.this.id
  env_slug     = each.value.environment
  folder_path  = each.value.path
  name         = each.value.name

  value_wo         = var.placeholder_value
  value_wo_version = each.value.placeholder_version

  tag_ids = [
    for tag in distinct(concat([local.managed_tag], each.value.tags)) : infisical_secret_tag.this[tag].id
  ]

  metadata = merge(
    {
      managed_by = "terraform"
      repository = "bearfire-dev/infisical-iac"
      project    = local.project_slug
      secret_set = each.value.secret_set
      required   = "true"
    },
    each.value.comment == null ? {} : { comment = each.value.comment },
  )

  secret_reminder = each.value.reminder_days == null ? null : {
    note        = "Review or rotate this secret (declared in bearfire-dev/infisical-iac)"
    repeat_days = each.value.reminder_days
  }

  depends_on = [infisical_secret_folder.this]

  lifecycle {
    # Guard: the placeholder constant is the only value Terraform ever writes.
    precondition {
      condition     = var.placeholder_value == "__REPLACE_IN_INFISICAL__"
      error_message = "placeholder_value must be the canonical constant __REPLACE_IN_INFISICAL__."
    }
  }
}
