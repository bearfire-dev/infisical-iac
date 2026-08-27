# Project root wrapper. Identical for every project; all configuration lives in
# project.yaml. Do not add resources here — extend the shared module instead.
provider "infisical" {
  host = var.infisical_host
}

variable "infisical_host" {
  type    = string
  default = "https://app.infisical.com"
}

locals {
  project_config = yamldecode(file("${path.module}/project.yaml"))

  # Non-secret IDs only. Project roots never read global Terraform state.
  connections = jsondecode(file("${path.module}/../../global/connections.lock.json"))
}

module "project" {
  source = "../../modules/infisical-project"

  config      = local.project_config
  connections = local.connections
}

output "project" {
  value = {
    id           = module.project.project_id
    slug         = module.project.project_slug
    environments = module.project.environments
    syncs        = module.project.syncs
  }
}
