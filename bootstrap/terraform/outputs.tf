output "bootstrap_project_id" {
  value = infisical_project.bootstrap.id
}

output "bootstrap_project_slug" {
  value = infisical_project.bootstrap.slug
}

output "plan_identity_id" {
  value = infisical_identity.plan.id
}

output "apply_identity_id" {
  value = infisical_identity.apply.id
}

output "github_variables" {
  description = "Non-secret values to store as GitHub Actions repository variables."
  value = {
    INFISICAL_HOST                   = var.infisical_host
    INFISICAL_ORG_ID                 = var.organization_id
    INFISICAL_PLAN_IDENTITY_ID       = infisical_identity.plan.id
    INFISICAL_APPLY_IDENTITY_ID      = infisical_identity.apply.id
    INFISICAL_BOOTSTRAP_PROJECT_SLUG = infisical_project.bootstrap.slug
    INFISICAL_BOOTSTRAP_ENV          = var.bootstrap_environment
    INFISICAL_OIDC_AUDIENCE          = var.oidc_audience
  }
}
