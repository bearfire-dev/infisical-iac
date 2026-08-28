locals {
  project_slug = var.config.project.slug
  environments = var.config.environments
  secret_sets  = var.config.secret_sets
  syncs        = try(var.config.syncs, {})
  identities   = try(var.config.identities, {})

  placeholder_prefix = "replace_default_key_"

  # ---------------------------------------------------------------------------
  # Secret slots: one Infisical secret object per (environment, secret set, name).
  # Keys are stable, human-readable identities: "<env>:<path>:<NAME>".
  # Array indexes are never used as resource identities.
  # ---------------------------------------------------------------------------
  secret_slots = merge([
    for set_key, set in local.secret_sets : {
      for pair in flatten([
        for secret_name, secret in try(set.secrets, {}) : [
          for env in secret.required_in : {
            key                 = "${env}:${set.path}:${secret_name}"
            name                = secret_name
            environment         = env
            path                = set.path
            secret_set          = set_key
            comment             = try(secret.comment, null)
            reminder_days       = try(secret.reminder_days, null)
            tags                = try(secret.tags, [])
            placeholder_version = try(secret.placeholder_version, 1)
          }
        ]
      ]) : pair.key => pair
    }
  ]...)

  # ---------------------------------------------------------------------------
  # Folders: one per (environment, secret set) where the set has at least one
  # secret required in that environment. Keys: "<env>:<path>".
  # ---------------------------------------------------------------------------
  folders = {
    for pair in distinct([
      for slot in values(local.secret_slots) : {
        key         = "${slot.environment}:${slot.path}"
        environment = slot.environment
        path        = slot.path
        secret_set  = slot.secret_set
      }
      ]) : pair.key => merge(pair, {
      name        = trimprefix(pair.path, "/")
      description = try(local.secret_sets[pair.secret_set].description, "")
    })
  }

  # Tags referenced anywhere in the project, plus the always-present managed tag.
  managed_tag = "terraform-managed"
  tag_slugs = distinct(concat(
    [local.managed_tag],
    flatten([for slot in values(local.secret_slots) : slot.tags]),
  ))

  # Syncs grouped by type. Source folder must exist in the source environment.
  syncs_by_type = {
    for type in ["github", "cloudflare-workers", "railway"] : type => {
      for key, sync in local.syncs : key => merge(sync, {
        folder_key              = "${sync.source.environment}:${local.secret_sets[sync.source.secret_set].path}"
        secret_path             = local.secret_sets[sync.source.secret_set].path
        auto_sync               = try(sync.auto_sync, true)
        disable_secret_deletion = !try(sync.manage_deletions, true)
        initial_sync_behavior   = try(sync.initial_sync_behavior, "overwrite-destination")
        key_schema              = try(sync.key_schema, null)
        description             = try(sync.description, "Managed by paperkeel/infisical-iac (${local.project_slug})")
      }) if sync.type == type
    }
  }

  connection_ids = {
    github     = try(var.connections.github.id, null)
    cloudflare = try(var.connections.cloudflare.id, null)
    railway    = try(var.connections.railway.id, null)
  }
}
