# bootstrap/

Root of trust for `bearfire-dev/infisical-iac`. Step-by-step procedure: [docs/BOOTSTRAP.md](../docs/BOOTSTRAP.md).

| Directory | What | Run by |
|---|---|---|
| `alchemy/` | Alchemy stack creating the three private R2 buckets for Terraform state (`global-state`, `project-state`, `state-backups`). Alchemy state lives in Cloudflare. | `pnpm bootstrap:state` (human, local) |
| `terraform/` | Terraform root: `platform-bootstrap` Infisical project with 10 placeholder credential objects (`/terraform-backend`, `/connections`), the `plan` and `apply` machine identities, their GitHub OIDC bindings, and project memberships. State: `bearfire-infisical-global-state/bootstrap/terraform.tfstate`. | first apply locally (`scripts/terraform-apply.sh bootstrap`), afterwards `.github/workflows/bootstrap.yml` (manual dispatch) |

Never applied from an ordinary pull request merge. No secret values live here; `bootstrap.example.tfvars` holds only IDs.
