# Consumed by `pnpm connections:lock`, which writes global/connections.lock.json.
output "connections_lock" {
  description = "Non-secret identifiers for project roots. No credentials."
  value = {
    schemaVersion = 1
    organization  = { id = var.organization_id, slug = var.organization_slug }
    identities = {
      plan  = { id = var.plan_identity_id, name = "infisical-iac-github-plan" }
      apply = { id = var.apply_identity_id, name = "infisical-iac-github-apply" }
    }
    github     = { id = infisical_app_connection_github.bearfire.id, name = infisical_app_connection_github.bearfire.name }
    cloudflare = { id = infisical_app_connection_cloudflare.bearfire.id, name = infisical_app_connection_cloudflare.bearfire.name }
    # Railway ID is resolved by `pnpm connections:lock` through the bridge (by stable name).
    railway = { id = null, name = terraform_data.railway_connection.input.name }
    tags    = local.shared_tags
  }
}
