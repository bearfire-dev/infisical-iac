terraform {
  required_version = ">= 1.11.0, < 2.0.0"

  required_providers {
    infisical = {
      source  = "infisical/infisical"
      version = "= 0.19.24"
    }
  }
}
