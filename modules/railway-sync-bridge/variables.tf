variable "name" {
  type = string
}

variable "description" {
  type    = string
  default = null
}

variable "project_id" {
  description = "Infisical project ID."
  type        = string
}

variable "environment" {
  type = string
}

variable "secret_path" {
  type = string
}

variable "connection_id" {
  description = "Infisical Railway App Connection ID (from global/connections.lock.json)."
  type        = string
  nullable    = true
}

variable "auto_sync_enabled" {
  type    = bool
  default = true
}

variable "initial_sync_behavior" {
  type    = string
  default = "overwrite-destination"
}

variable "disable_secret_deletion" {
  type    = bool
  default = false
}

variable "key_schema" {
  type    = string
  default = null
}

variable "destination" {
  description = "Railway destination: project_id, environment_id, optional service_id and display names."
  type        = any
}
