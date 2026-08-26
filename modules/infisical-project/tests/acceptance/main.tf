# Throwaway acceptance fixture used by scripts/provider-acceptance.sh.
# Local state only. Never point this at a real project.
terraform {
  required_version = ">= 1.11.0, < 2.0.0"
  required_providers {
    infisical = {
      source  = "infisical/infisical"
      version = "= 0.19.24"
    }
    random = {
      source  = "hashicorp/random"
      version = "= 3.9.0"
    }
  }
}

provider "infisical" {}

variable "suffix" { type = string }
variable "metadata_marker" {
  type    = string
  default = "initial"
}

locals {
  names = { for i in range(1, 21) : format("ACCEPT_SECRET_%02d", i) => i }
}

resource "infisical_project" "acceptance" {
  name                       = "iac-acceptance-${var.suffix}"
  slug                       = "iac-acceptance-${var.suffix}"
  should_create_default_envs = false
}

resource "infisical_project_environment" "prod" {
  project_id = infisical_project.acceptance.id
  name       = "Production"
  slug       = "prod"
  position   = 1
}

resource "infisical_secret_folder" "runtime" {
  project_id       = infisical_project.acceptance.id
  environment_slug = infisical_project_environment.prod.slug
  folder_path      = "/"
  name             = "runtime"
}

resource "infisical_secret" "slot" {
  for_each = local.names

  workspace_id     = infisical_project.acceptance.id
  env_slug         = "prod"
  folder_path      = "/runtime"
  name             = each.key
  value_wo         = "replace_default_key_${random_bytes.placeholder[each.key].hex}"
  value_wo_version = 1
  metadata         = { managed_by = "terraform", marker = var.metadata_marker }

  lifecycle {
    ignore_changes = [value_wo]
  }

  depends_on = [infisical_secret_folder.runtime]
}

resource "random_bytes" "placeholder" {
  for_each = local.names
  length   = 128
}

output "project_id" { value = infisical_project.acceptance.id }
