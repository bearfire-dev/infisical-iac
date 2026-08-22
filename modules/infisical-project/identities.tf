# Control-plane identities (created in bootstrap) get membership in every project.
# The apply identity created the project and is auto-added by Infisical, so we adopt it.
resource "infisical_project_identity" "control_plane_apply" {
  project_id     = infisical_project.this.id
  identity_id    = var.connections.identities.apply.id
  adopt_existing = true

  roles = [{ role_slug = var.control_plane_apply_role }]
}

resource "infisical_project_identity" "control_plane_plan" {
  project_id  = infisical_project.this.id
  identity_id = var.connections.identities.plan.id

  roles = [{ role_slug = var.control_plane_plan_role }]
}

# Optional project-specific machine identities (for example an application's
# runtime identity that reads its own secrets directly from Infisical).
resource "infisical_identity" "project" {
  for_each = local.identities

  org_id = var.connections.organization.id
  name   = "${local.project_slug}-${each.key}"
  role   = "no-access"

  metadata = [
    { key = "managed_by", value = "terraform" },
    { key = "project", value = local.project_slug },
  ]
}

resource "infisical_project_identity" "project" {
  for_each = local.identities

  project_id  = infisical_project.this.id
  identity_id = infisical_identity.project[each.key].id

  roles = [{ role_slug = each.value.role }]
}

resource "infisical_identity_oidc_auth" "project" {
  for_each = { for k, v in local.identities : k => v.oidc if try(v.oidc, null) != null }

  identity_id          = infisical_identity.project[each.key].id
  bound_issuer         = each.value.issuer
  oidc_discovery_url   = each.value.discovery_url
  bound_audiences      = try(each.value.bound_audiences, null)
  bound_subject        = try(each.value.bound_subject, null)
  bound_claims         = try(each.value.bound_claims, null)
  access_token_ttl     = try(each.value.access_token_ttl, 3600)
  access_token_max_ttl = try(each.value.access_token_ttl, 3600)

  access_token_trusted_ips = [{ ip_address = "0.0.0.0/0" }, { ip_address = "::/0" }]
}
