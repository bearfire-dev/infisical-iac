# Two GitHub-OIDC machine identities with distinct trust boundaries.
#
# plan : read-only. Bound to the `terraform-plan` GitHub environment.
# apply: privileged. Bound to the `production` GitHub environment (approval-gated).
#
# Subject binding uses the immutable repository_id / repository_owner_id claims
# in addition to the `sub` glob so a repository rename cannot widen or break trust.

resource "infisical_identity" "plan" {
  org_id                = var.organization_id
  name                  = "${var.identity_prefix}-plan"
  role                  = var.plan_identity_org_role
  has_delete_protection = true

  metadata = [
    { key = "managed_by", value = "terraform" },
    { key = "repository", value = local.github_repo },
    { key = "purpose", value = "terraform-plan" },
  ]
}

resource "infisical_identity" "apply" {
  org_id                = var.organization_id
  name                  = "${var.identity_prefix}-apply"
  role                  = var.apply_identity_org_role
  has_delete_protection = true

  metadata = [
    { key = "managed_by", value = "terraform" },
    { key = "repository", value = local.github_repo },
    { key = "purpose", value = "terraform-apply" },
  ]
}

locals {
  github_oidc_issuer = "https://token.actions.githubusercontent.com"
  trusted_ips        = [{ ip_address = "0.0.0.0/0" }, { ip_address = "::/0" }]

  base_bound_claims = {
    repository          = local.github_repo
    repository_id       = var.github_repository_id
    repository_owner_id = var.github_owner_id
  }
}

resource "infisical_identity_oidc_auth" "plan" {
  identity_id        = infisical_identity.plan.id
  bound_issuer       = local.github_oidc_issuer
  oidc_discovery_url = local.github_oidc_issuer
  bound_audiences    = [var.oidc_audience]
  bound_subject      = "repo:${local.github_repo}:environment:${var.github_plan_environment}"
  bound_claims       = local.base_bound_claims

  access_token_ttl            = 1800
  access_token_max_ttl        = 1800
  access_token_num_uses_limit = 0
  access_token_trusted_ips    = local.trusted_ips
}

resource "infisical_identity_oidc_auth" "apply" {
  identity_id        = infisical_identity.apply.id
  bound_issuer       = local.github_oidc_issuer
  oidc_discovery_url = local.github_oidc_issuer
  bound_audiences    = [var.oidc_audience]
  bound_subject      = "repo:${local.github_repo}:environment:${var.github_apply_environment}"
  bound_claims = merge(local.base_bound_claims, {
    ref = "refs/heads/${var.github_default_branch}"
  })

  access_token_ttl            = 3600
  access_token_max_ttl        = 3600
  access_token_num_uses_limit = 0
  access_token_trusted_ips    = local.trusted_ips
}

# Both identities read control-plane credentials from the bootstrap project.
resource "infisical_project_identity" "plan" {
  project_id  = infisical_project.bootstrap.id
  identity_id = infisical_identity.plan.id
  roles       = [{ role_slug = "viewer" }]
}

resource "infisical_project_identity" "apply" {
  project_id  = infisical_project.bootstrap.id
  identity_id = infisical_identity.apply.id
  roles       = [{ role_slug = "viewer" }]
}
