variable "infisical_host" {
  type    = string
  default = "https://app.infisical.com"
}

variable "organization_id" {
  description = "Infisical organization ID (non-secret)."
  type        = string
}

variable "organization_slug" {
  type = string
}

variable "plan_identity_id" {
  description = "From bootstrap outputs (non-secret)."
  type        = string
}

variable "apply_identity_id" {
  description = "From bootstrap outputs (non-secret)."
  type        = string
}

variable "github_connection_pat" {
  description = "Fetched at runtime from platform-bootstrap:/connections/GH_INFISICAL_CONNECTION_PAT. Never commit."
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID (treated as sensitive by the provider)."
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "Fetched at runtime from platform-bootstrap:/connections/CLOUDFLARE_API_TOKEN. Never commit."
  type        = string
  sensitive   = true
}

variable "railway_credential_version" {
  description = "Increment after rotating RAILWAY_API_TOKEN so the bridge re-submits it."
  type        = number
  default     = 1
}
