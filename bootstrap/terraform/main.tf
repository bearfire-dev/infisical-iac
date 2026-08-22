# Bootstrap root: the minimum set of Infisical resources that make the rest of
# the system operable. Applied by a human (locally, with a short-lived token) or
# by the explicitly dispatched bootstrap.yml workflow. Never applied from an
# ordinary pull request merge.
#
# Auth for this root is environment-driven (see docs/BOOTSTRAP.md):
#   INFISICAL_HOST, and either INFISICAL_TOKEN (human/bootstrap token) or
#   INFISICAL_AUTH_METHOD=oidc + INFISICAL_MACHINE_IDENTITY_ID + INFISICAL_AUTH_JWT.
provider "infisical" {
  host = var.infisical_host
}

locals {
  placeholder = "__REPLACE_IN_INFISICAL__"
  github_repo = "${var.github_owner}/${var.github_repository}"

  bootstrap_secrets = {
    "/terraform-backend" = {
      TF_GLOBAL_R2_ACCESS_KEY_ID      = "R2 access key for the sensitive bootstrap/global state bucket"
      TF_GLOBAL_R2_SECRET_ACCESS_KEY  = "R2 secret key for the sensitive bootstrap/global state bucket"
      TF_PROJECT_R2_ACCESS_KEY_ID     = "R2 access key for the project state bucket"
      TF_PROJECT_R2_SECRET_ACCESS_KEY = "R2 secret key for the project state bucket"
      TF_BACKUP_R2_ACCESS_KEY_ID      = "R2 access key for the state backup bucket"
      TF_BACKUP_R2_SECRET_ACCESS_KEY  = "R2 secret key for the state backup bucket"
      ALCHEMY_STATE_TOKEN             = "Authenticates bootstrap/alchemy to its Cloudflare-hosted state store; required to re-run pnpm bootstrap:state"
    }
    "/connections" = {
      CLOUDFLARE_API_TOKEN        = "Cloudflare API token for the Cloudflare App Connection (Workers secrets scope)"
      GH_INFISICAL_CONNECTION_PAT = "GitHub fine-grained PAT for the GitHub App Connection (Actions secrets write on managed repos)"
      RAILWAY_API_TOKEN           = "Railway API token for the Railway App Connection"
    }
  }

  bootstrap_secret_slots = merge([
    for path, secrets in local.bootstrap_secrets : {
      for name, comment in secrets : "${path}:${name}" => {
        path    = path
        name    = name
        comment = comment
      }
    }
  ]...)
}
