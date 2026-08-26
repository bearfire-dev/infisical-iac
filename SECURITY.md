# Security

## What this public repository contains, and what it must never contain

May contain (public metadata): project and environment names, folder paths, **secret names**, destination identifiers (repository names, Worker script IDs, Railway project/environment/service IDs), App Connection and machine identity IDs, organization ID/slug, sync configuration.

Must never contain: secret values, API tokens, PATs, Terraform state, plan files, `.tfvars` (except `*.example.tfvars`), `.env` files, generated backend config. Enforced by `.gitignore`, `ci.yml` static guards, and gitleaks.

If a topology is itself confidential (the fact that a secret named `X` exists for project `Y`), it cannot be declared here without redaction or moving the repository private. Decide before adding the project.

## Where sensitive material lives

| Material | Location | Access |
|---|---|---|
| Application secret values | Infisical projects | humans via Infisical RBAC; never Terraform |
| Control-plane credentials (R2 keys, GitHub PAT, Cloudflare token, Railway token) | Infisical `platform-bootstrap` | plan identity: `/terraform-backend` only in practice; apply identity: both folders; never GitHub Secrets |
| Global Terraform state (**contains App Connection credentials** as persisted by the provider) | `bearfire-infisical-global-state` (private R2) | `TF_GLOBAL_R2_*` only; project workflows never receive it |
| Project Terraform state (IDs, placeholder versions, random placeholder suffixes; no live values) | `bearfire-infisical-project-state` | `TF_PROJECT_R2_*` |
| State snapshots | `bearfire-infisical-state-backups` | `TF_BACKUP_R2_*` |
| GitHub | repository **variables** only (IDs, host, slugs) | public in practice |

The random placeholder suffix makes an unreplaced preshared key unguessable. Applications must still reject every value with the public placeholder prefix.

The control-plane repository holds no long-lived GitHub Actions secrets. The optional `GITLEAKS_LICENSE` is a scanner license key, not a credential to any managed system.

## Trust boundaries in CI

- Fork PRs: `ci.yml` only (no identity, `contents: read`).
- Same-repo PRs: `plan.yml` with the **plan** identity (read-only, `terraform-plan` environment).
- `main`: `apply.yml` with the **apply** identity behind the `production` environment (required reviewers, `main` only; OIDC binding additionally pins `ref`, `repository_id`, `repository_owner_id`).
- `bootstrap.yml`: manual dispatch, `bootstrap` environment, apply identity.
- Plans never upload `plan.out`; comments and summaries contain resource addresses and counts only.

## Reporting a vulnerability

Email security@bearfire.dev (or open a GitHub private vulnerability report on this repository). Do not open public issues for suspected credential exposure. Expect acknowledgement within 2 business days.

## Incident response: leaked bootstrap credential

Applies to any of the nine `platform-bootstrap` values, the Infisical identities, or a human token used for bootstrap.

1. **Revoke at the source first** (Cloudflare R2 token / GitHub PAT / Cloudflare API token / Railway token / Infisical token). The placeholder objects and reminders make the inventory explicit: `bootstrap/terraform/main.tf`.
2. Issue a replacement; update the value in Infisical (`platform-bootstrap/prod`). For `RAILWAY_API_TOKEN`, bump `railway_credential_version` and apply global; for the GitHub/Cloudflare tokens, apply global so the provider re-submits the connection credential.
3. If an **R2 state token** leaked: treat the corresponding state as read by an attacker. Global state ⇒ also rotate every App Connection credential it contains (step 1–2). Review R2 access logs if available.
4. If an **identity** is suspected compromised: in Infisical, revoke its access tokens and, if needed, delete/recreate the OIDC auth (bootstrap PR or local apply); GitHub OIDC tokens are short-lived and bound to environments, so also audit `production` deployment approvals and workflow runs.
5. Audit: Infisical audit log for the project/identity, GitHub Actions run history, destination systems for unexpected secret changes.
6. Record the incident (private issue or security channel), not in this repository.

## Break-glass

When CI cannot run (GitHub outage, identities broken): a human Infisical admin with a short-lived token performs the operation locally per [docs/OPERATIONS.md](docs/OPERATIONS.md) → Manual apply, using `scripts/local-auth.sh` so credentials never touch disk. Revoke the token afterwards. Two-person rule for anything destructive. The daily drift run confirms convergence.

## Supply chain

Actions are pinned by major tag and updated by Dependabot weekly; provider/Terraform upgrades go through `docs/PROVIDER_COMPATIBILITY.md` and are never auto-merged. `pnpm install --frozen-lockfile` everywhere.
