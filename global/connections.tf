# App Connections. Credentials arrive as TF_VAR_* from the apply job, which
# fetches them from the platform-bootstrap Infisical project at runtime.
# They are never committed and never stored as GitHub Actions secrets.

resource "infisical_app_connection_github" "bearfire" {
  name        = "bearfire-github"
  description = "GitHub Actions secret delivery for paperkeel repositories (managed by infisical-iac)"
  method      = "pat"

  credentials = {
    personal_access_token = var.github_connection_pat
    instance_type         = "cloud"
  }
}

resource "infisical_app_connection_cloudflare" "bearfire" {
  name        = "bearfire-cloudflare"
  description = "Cloudflare Workers secret delivery (managed by infisical-iac)"
  method      = "api-token"

  credentials = {
    account_id = var.cloudflare_account_id
    api_token  = var.cloudflare_api_token
  }
}

# Railway: no native provider resource in infisical/infisical 0.19.24.
# Reconciled by the API bridge; the token is read from RAILWAY_API_TOKEN in the
# apply job environment and never passes through Terraform.
resource "terraform_data" "railway_connection" {
  input = {
    kind        = "railway-connection"
    name        = "bearfire-railway"
    description = "Railway variable delivery (managed by infisical-iac bridge)"
    method      = "account-token"
    # Bump to force the bridge to re-submit the credential after rotating RAILWAY_API_TOKEN.
    credentialVersion = var.railway_credential_version
  }
  triggers_replace = [var.railway_credential_version]

  provisioner "local-exec" {
    when        = create
    working_dir = abspath("${path.module}/..")
    command     = "pnpm --silent infisical:reconcile railway-connection upsert"
    environment = {
      BRIDGE_CONFIG = jsonencode(self.input)
    }
  }

  provisioner "local-exec" {
    when        = destroy
    working_dir = abspath("${path.module}/..")
    command     = "pnpm --silent infisical:reconcile railway-connection delete"
    environment = {
      BRIDGE_CONFIG = jsonencode(self.input)
    }
  }
}
