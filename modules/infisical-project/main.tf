# Shared Infisical project module.
#
# Expands one decoded project.yaml into:
#   - one Infisical project
#   - declared environments
#   - one folder per (environment, secret set) with required secrets
#   - one write-only placeholder secret per (environment, secret set, name)
#   - project tags
#   - control-plane identity memberships and optional project identities
#   - Secret Syncs to GitHub, Cloudflare Workers, and (via bridge) Railway
#
# Invariants (see AGENTS.md):
#   - Secret values are never inputs to this module.
#   - Resource keys are stable strings, never list indexes.
#   - placeholder_version increments are destructive and reviewed explicitly.
