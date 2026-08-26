# infisical-iac

Declarative control plane for [Infisical](https://infisical.com) across Bearfire projects: Terraform declares projects, environments, folders, secret **objects**, identities, App Connections, and Secret Syncs. Humans enter secret **values** in Infisical. Infisical delivers them to GitHub Actions, Cloudflare Workers, and Railway.

```text
Git (this repo)       →  what should exist            (projects, folders, secret names, syncs)
Infisical             →  the values                   (entered by humans, rotated in place)
Secret Syncs          →  delivery                     (GitHub Secrets, Worker secrets, Railway variables)
```

No secret value ever lives in this repository, in Terraform variables, or in GitHub Actions secrets.

> **Agents:** read [`AGENTS.md`](AGENTS.md) first. It separates *managing a project* (edit one `project.yaml`) from *managing the platform* (modules, global, bootstrap, CI).

## How it works

1. Declare a project in `projects/<slug>/project.yaml` — environments, secret sets (= Infisical folders), secret names, and syncs.
2. CI validates and plans **only that root**. After merge, the apply workflow creates each secret with a unique write-only placeholder.
3. Replace placeholders in the Infisical UI.
4. Infisical Secret Syncs push the real values to the declared destinations automatically.
5. `pnpm secrets:check <slug>` and `pnpm sync:status <slug>` go green → merge the application change that reads the secret.

Rotation is step 3 only. No Terraform change, ever.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ bearfire-dev/infisical-iac                                  │
│  bootstrap/   identities, GitHub OIDC trust, R2 buckets     │  state: global bucket (sensitive)
│  global/      App Connections (GitHub, Cloudflare, Railway) │  state: global bucket (sensitive)
│  modules/     shared project module + Railway bridge        │
│  projects/*   one root + one state per Infisical project    │  state: project bucket
└───────────────┬─────────────────────────────┬───────────────┘
      GitHub OIDC (no secrets)          terraform apply
                ▼                             ▼
   plan identity / apply identity  ───►  Infisical  ───►  GitHub · Cloudflare Workers · Railway
```

One repository, many isolated Terraform states: a change to one project cannot plan or mutate another. Full design: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md); narrative: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Layout

```text
bootstrap/terraform/   platform-bootstrap project, plan/apply identities, OIDC auth
bootstrap/alchemy/     Alchemy stack: three private R2 state buckets
global/                App Connections + connections.lock.json (non-secret IDs consumed by projects)
modules/               infisical-project (shared), railway-sync-bridge (until native provider support)
projects/_template/    copied by `pnpm project:new`
projects/<slug>/       backend.tf · main.tf · versions.tf · .terraform.lock.hcl · project.yaml
schemas/               project.schema.json
tools/cli/             pnpm commands
tools/infisical-api-bridge/  Railway reconciliation over the Infisical REST API
scripts/               terraform-init/plan/apply wrappers, provider acceptance, local auth
docs/                  runbooks
.github/               ci · plan · apply · bootstrap · drift · state-backup
```

## Example `project.yaml`

```yaml
schema_version: 1
project: { name: Sigla Writer, slug: sigla-writer }
environments:
  dev:  { name: Development, position: 1 }
  prod: { name: Production,  position: 2 }
secret_sets:
  runtime:
    path: /runtime
    secrets:
      DATABASE_URL:       { required_in: [dev, prod], comment: Primary database }
      BETTER_AUTH_SECRET: { required_in: [dev, prod] }
  ci:
    path: /ci
    secrets:
      CLOUDFLARE_API_TOKEN: { required_in: [prod], reminder_days: 90 }
syncs:
  prod-runtime-to-cloudflare:
    type: cloudflare-workers
    connection: cloudflare
    source: { environment: prod, secret_set: runtime }
    destination: { script_id: sigla-writer }
  prod-ci-to-github:
    type: github
    connection: github
    source: { environment: prod, secret_set: ci }
    destination: { scope: repository, owner: bearfire-dev, repository: sigla-writer }
```

Secret sets are folders; a sync delivers one folder of one environment to one destination, and Infisical then owns that destination.

## Commands

```bash
pnpm install
pnpm validate                       # schema, cross-checks, no-values/no-placeholder-bump static checks
pnpm lint · pnpm typecheck · pnpm test

pnpm project:new <slug> --name "Name"
pnpm project:list

pnpm plan --project <slug> | --global | --all      # needs Infisical session + backend creds (CI does this)
pnpm apply --project <slug> | --global             # CI only (protected `production` environment)

pnpm secrets:check <slug> [--env prod] | --all     # are all required values populated?
pnpm sync:status <slug> | --all                    # did every Secret Sync succeed?

pnpm connections:lock | connections:check          # regenerate / verify global/connections.lock.json
pnpm state:snapshot --project <slug> | --global | --all
pnpm provider:acceptance                           # write-only secret acceptance suite on a throwaway project
```

## Runbooks

| Doc | When |
|---|---|
| [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md) | First-time setup: buckets, identities, OIDC, GitHub variables, global apply |
| [docs/ADDING_A_PROJECT.md](docs/ADDING_A_PROJECT.md) | New Infisical project |
| [docs/ADDING_A_SECRET.md](docs/ADDING_A_SECRET.md) | New secret object + populate + verify |
| [docs/DELETING_A_SECRET.md](docs/DELETING_A_SECRET.md) | Removal / rename (destructive flow) |
| [docs/PR_SOP.md](docs/PR_SOP.md) | Platform-PR-before-app-PR procedure |
| [docs/MIGRATION.md](docs/MIGRATION.md) | Importing existing projects, secrets, and destination secrets |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | OIDC, rotation, sync failures, provider upgrades, bridge |
| [docs/STATE_RECOVERY.md](docs/STATE_RECOVERY.md) | Restore from backup bucket, unlock |
| [docs/PROVIDER_COMPATIBILITY.md](docs/PROVIDER_COMPATIBILITY.md) | Pinned versions, native vs bridged resources, acceptance results |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common failures |
| [SECURITY.md](SECURITY.md) | Public-metadata boundary, reporting, break-glass |

## Safety rules (short form)

- Real values never enter Git or Terraform. Terraform creates `replace_default_key_` placeholders with 256 random hexadecimal characters.
- `placeholder_version` is never bumped for rotation — bumping it overwrites the live value.
- One project per root per state. Project roots read `global/connections.lock.json`, never global state.
- Deletions, renames, sync/connection removals: separate PR + `destructive-change` label + production approval.
- Platform PR merges and is verified before the application PR that depends on it.
- The control-plane repository has zero GitHub Actions secrets; auth is GitHub OIDC → Infisical.

Pinned: Terraform `1.13.3` (`>= 1.11 < 2`), provider `infisical/infisical 0.19.24`. Railway resources are bridged until the provider ships native ones.

## Status

The control plane is active. `bearly-browser-sync` is the current application project. The provider acceptance suite passed on 2026-08-22.

## License

MIT — see [LICENSE](LICENSE).
