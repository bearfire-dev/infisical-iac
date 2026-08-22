variable "infisical_host" {
  type    = string
  default = "https://app.infisical.com"
}

variable "organization_id" {
  description = "Infisical organization ID (non-secret). Found under Organization Settings."
  type        = string
}

variable "bootstrap_project_slug" {
  type    = string
  default = "platform-bootstrap"
}

variable "bootstrap_environment" {
  type    = string
  default = "prod"
}

variable "identity_prefix" {
  type    = string
  default = "infisical-iac-github"
}

variable "plan_identity_org_role" {
  description = "Organization role for the plan identity. `member` is enough to read projects it is a member of; project memberships are granted per project by the module."
  type        = string
  default     = "member"
}

variable "apply_identity_org_role" {
  description = "Organization role for the apply identity. Creating projects, org-scoped App Connections, and identities currently needs `admin`; narrow to a custom org role once one is defined in global/roles.tf."
  type        = string
  default     = "admin"
}

variable "github_owner" {
  type    = string
  default = "bearfire-dev"
}

variable "github_repository" {
  type    = string
  default = "infisical-iac"
}

variable "github_repository_id" {
  description = "Immutable numeric repository ID (gh api repos/bearfire-dev/infisical-iac --jq .id), as a string."
  type        = string
}

variable "github_owner_id" {
  description = "Immutable numeric owner/org ID (gh api orgs/bearfire-dev --jq .id), as a string."
  type        = string
}

variable "github_default_branch" {
  type    = string
  default = "main"
}

variable "github_plan_environment" {
  type    = string
  default = "terraform-plan"
}

variable "github_apply_environment" {
  type    = string
  default = "production"
}

variable "oidc_audience" {
  description = "Audience requested by the workflow's OIDC token and bound on both identities."
  type        = string
  default     = "infisical-iac"
}

variable "credential_rotation_days" {
  type    = number
  default = 90
}
