variable "config" {
  description = "Decoded projects/<slug>/project.yaml. Validated against schemas/project.schema.json by `pnpm validate` before Terraform runs; the module re-checks structural invariants."
  type        = any

  validation {
    condition     = try(var.config.schema_version, 0) == 1
    error_message = "project.yaml must declare schema_version: 1."
  }

  validation {
    condition = alltrue([
      for set_key, set in var.config.secret_sets : alltrue([
        for secret_name, secret in try(set.secrets, {}) : alltrue([
          for env in secret.required_in : contains(keys(var.config.environments), env)
        ])
      ])
    ])
    error_message = "Every secret's required_in must reference a declared environment."
  }

  validation {
    condition = alltrue([
      for sync_key, sync in try(var.config.syncs, {}) :
      contains(keys(var.config.environments), sync.source.environment) &&
      contains(keys(var.config.secret_sets), sync.source.secret_set)
    ])
    error_message = "Every sync source must reference a declared environment and secret set."
  }

  validation {
    condition     = length(distinct([for k, s in var.config.secret_sets : s.path])) == length(var.config.secret_sets)
    error_message = "Secret set paths must be unique within a project."
  }
}

variable "connections" {
  description = "Decoded global/connections.lock.json: non-secret App Connection IDs, organization ID, and control-plane identity IDs."
  type = object({
    schemaVersion = number
    organization  = object({ id = string, slug = string })
    identities = object({
      plan  = object({ id = string, name = string })
      apply = object({ id = string, name = string })
    })
    github     = optional(object({ id = string, name = string }))
    cloudflare = optional(object({ id = string, name = string }))
    railway    = optional(object({ id = string, name = string }))
  })
}

variable "default_tag_color" {
  type    = string
  default = "#6b7280"
}

variable "control_plane_plan_role" {
  description = "Project role granted to the control-plane plan identity in this project."
  type        = string
  default     = "viewer"
}

variable "control_plane_apply_role" {
  description = "Project role granted to the control-plane apply identity in this project."
  type        = string
  default     = "admin"
}
