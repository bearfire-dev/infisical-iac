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
  role                  = var.enable_custom_org_roles ? infisical_org_role.plan[0].slug : var.plan_identity_org_role
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

  # GitHub's immutable subject format embeds the owner and repository IDs:
  #   repo:<owner>@<owner_id>/<repo>@<repo_id>:environment:<env>
  # A rename of the org or repository therefore changes the *name* parts but
  # the bound IDs still pin trust to this exact repository.
  github_subject_prefix = "repo:${var.github_owner}@${var.github_owner_id}/${var.github_repository}@${var.github_repository_id}"

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
  bound_subject      = "${local.github_subject_prefix}:environment:${var.github_plan_environment}"
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
  bound_subject      = "${local.github_subject_prefix}:environment:${var.github_apply_environment}"
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

# The apply identity manages this project's settings, folders, and objects
# from bootstrap.yml, so it needs project admin (org admin does not override
# project-level roles). The first grant must come from a human session.
resource "infisical_project_identity" "apply" {
  project_id  = infisical_project.bootstrap.id
  identity_id = infisical_identity.apply.id
  roles       = [{ role_slug = "admin" }]
}

# Least-privilege organization role for the plan identity. Project-level reads
# come from per-project `viewer` membership (granted by the project module);
# this role only adds what org-scoped resources a plan must read.
#
# Custom organization roles require the Infisical Enterprise plan. Until then
# the plan identity stays `member` (cannot read org-scoped App Connections), so
# the global root is planned only on main under the apply identity. Set
# enable_custom_org_roles = true after upgrading to switch to this role.
resource "infisical_org_role" "plan" {
  count = var.enable_custom_org_roles ? 1 : 0

  name        = "Infisical IaC plan"
  slug        = "infisical-iac-plan"
  description = "Read-only organization access for paperkeel/infisical-iac Terraform plans"

  permissions = [
    { subject = "app-connections", action = ["read"] },
    { subject = "identity", action = ["read"] },
    { subject = "role", action = ["read"] },
  ]
}
