# Railway Secret Sync bridge.
#
# Terraform records the desired non-secret configuration in a terraform_data
# resource and invokes the repository's API bridge to upsert the Infisical
# Railway Secret Sync by stable name. Any change to the configuration hash
# replaces the resource, which re-runs the upsert.
#
# Deletion is guarded: the destroy provisioner only deletes the remote sync when
# INFISICAL_BRIDGE_ALLOW_DELETE=1 is present in the environment. The apply
# workflow sets it only for approved destructive-change runs. Without it the
# remote sync is retained (and reported by drift.yml) rather than silently removed.
terraform {
  required_version = ">= 1.11.0, < 2.0.0"
}

locals {
  desired = {
    kind            = "railway-sync"
    name            = var.name
    description     = var.description
    projectId       = var.project_id
    environment     = var.environment
    secretPath      = var.secret_path
    connectionId    = var.connection_id
    autoSyncEnabled = var.auto_sync_enabled
    syncOptions = {
      initialSyncBehavior   = var.initial_sync_behavior
      disableSecretDeletion = var.disable_secret_deletion
      keySchema             = var.key_schema
    }
    destinationConfig = {
      projectId       = var.destination.project_id
      projectName     = try(var.destination.project_name, null)
      environmentId   = var.destination.environment_id
      environmentName = try(var.destination.environment_name, null)
      serviceId       = try(var.destination.service_id, null)
      serviceName     = try(var.destination.service_name, null)
    }
  }
  config_hash = sha256(jsonencode(local.desired))
}

resource "terraform_data" "sync" {
  input            = local.desired
  triggers_replace = [local.config_hash]

  provisioner "local-exec" {
    when        = create
    working_dir = abspath("${path.module}/../..")
    command     = "pnpm --silent infisical:reconcile railway-sync upsert"
    environment = {
      BRIDGE_CONFIG = jsonencode(self.input)
    }
  }

  provisioner "local-exec" {
    when        = destroy
    working_dir = abspath("${path.module}/../..")
    command     = "pnpm --silent infisical:reconcile railway-sync delete"
    environment = {
      BRIDGE_CONFIG = jsonencode(self.input)
    }
  }

  lifecycle {
    precondition {
      condition     = var.connection_id != null
      error_message = "Railway sync '${var.name}' needs the Railway App Connection. Apply global and run `pnpm connections:lock` first."
    }
  }
}
