# AGENTS.md — operating rules for agents working in `bearfire-dev/infisical-iac`

This repository is the **control plane** for Infisical across Bearfire: it declares which Infisical projects, environments, folders, secret *objects*, identities, App Connections, and Secret Syncs exist. It never holds secret *values*. Read this file fully before changing anything. `CLAUDE.md` is a symlink to this file.

The design of record is `docs/IMPLEMENTATION_PLAN.md`. When a doc and an invariant below disagree, the invariant wins and the doc is wrong.

---

## 0. Hard rules (non-negotiable)

1. **Never commit a secret value.** Not in YAML, HCL, JSON, Markdown, tests, fixtures, or commit messages. The only value Terraform ever writes is the literal `__REPLACE_IN_INFISICAL__`.
2. **Never increment `placeholder_version`** unless the task is explicitly a *placeholder reset* reviewed as a destructive change. Incrementing it overwrites a live value in Infisical with the placeholder.
3. **Never pass a real value through Terraform** (`value`, `TF_VAR_*`, tfvars). Connection credentials for `global/` are the one sanctioned exception and are injected at apply time from the `platform-bootstrap` Infisical project, never committed.
4. **One Infisical project = one root under `projects/<slug>/` = one state.** Never add a second project to a root; never read another root's state; never use `terraform_remote_state`.
5. **Project roots read `global/connections.lock.json`, never global state.** Global state is sensitive (the provider persists connection credentials in it).
6. **Platform PR before application PR.** Secrets are declared and populated here before any app code that reads them merges. App PRs link `Depends on bearfire-dev/infisical-iac#<n>`.
7. **Shared-module, schema, tooling, or script changes require plans for every project root.** Review the aggregate; applies still run per root.
8. **Never run `terraform apply` from an untrusted PR, from a fork, or locally against production roots** unless a human operator has explicitly asked for a local bootstrap/break-glass apply per `docs/BOOTSTRAP.md` / `docs/OPERATIONS.md`.
9. **Destructive changes need explicit review**: deleting a project, environment, folder, secret object, sync, or connection; renaming a slug or path (which is delete + create); incrementing `placeholder_version`. Put them in their own PR with the `destructive-change` label and explain the blast radius in the PR body.
10. **Never commit Terraform state, plan files, `backend.generated.hcl`, `.env`, or tokens.** `.gitignore` covers these; do not weaken it.
11. **Never add broad `ignore_changes`** to mask provider behavior. Record provider issues in `docs/PROVIDER_COMPATIBILITY.md` instead.
12. **Never change the pinned provider/Terraform versions** outside a dedicated upgrade PR that follows `docs/PROVIDER_COMPATIBILITY.md`.
13. **Never print secret values** in tooling, logs, CI summaries, or issue bodies. Print names and statuses only.

---

## 1. Two kinds of work — know which one you are doing

### A. Managing a *project* (the common case)

Scope: exactly one directory `projects/<slug>/`, and normally only its `project.yaml`.

```text
projects/<slug>/
├── backend.tf             identical everywhere; do not edit
├── main.tf                identical everywhere; do not edit
├── versions.tf            identical everywhere; do not edit
├── .terraform.lock.hcl    committed; regenerated only by upgrade PRs
└── project.yaml           THE ONLY FILE YOU NORMALLY TOUCH
```

Workflows:

| Task | Do |
|---|---|
| New project | `pnpm project:new <slug> --name "Display Name"`, edit `projects/<slug>/project.yaml`, `pnpm validate --project <slug>`, open PR. See `docs/ADDING_A_PROJECT.md`. |
| Add a secret | Add `NAME: { required_in: [..], comment: .. }` under the right `secret_sets.<set>.secrets`. Pick the set by *destination ownership* (`/runtime` vs `/ci` etc.). See `docs/ADDING_A_SECRET.md`. |
| Rotate a value | **No change here.** Rotation happens in Infisical. Do not touch `placeholder_version`. |
| Rename a secret | Add the new name → populate → migrate consumers → remove the old name in a separate destructive PR. Never a one-step rename. |
| Remove a secret/sync | Separate PR, `destructive-change` label, confirm no consumer references it. See `docs/DELETING_A_SECRET.md`. |
| Add a sync | Add under `syncs:`; `type` ∈ `github` / `cloudflare-workers` / `railway`; `connection` must match; source `environment` + `secret_set` must exist. The destination folder is then **owned by Infisical**. |
| Check readiness | `pnpm secrets:check <slug>` and `pnpm sync:status <slug>` (needs an Infisical session; see §4). |

`project.yaml` rules: slugs/paths are identities (renaming recreates); secret names are `SCREAMING_SNAKE_CASE`; `required_in` only lists declared environments; one folder per secret set, single level, never `/`; no nesting; no values, ever. The schema is `schemas/project.schema.json` and `pnpm validate` enforces it plus cross-checks.

### B. Managing the *repository / platform* (rare, higher blast radius)

Scope: anything outside `projects/<slug>/project.yaml`. Each area has its own rules:

| Area | Owner of truth | Rules |
|---|---|---|
| `modules/infisical-project/` | shared module consumed by every project | Keep resource keys stable strings. Any change → plan **all** project roots (`pnpm plan --all` in CI via `changed-roots`). Add tests under `modules/infisical-project/tests/` and keep the acceptance fixture current. |
| `modules/railway-sync-bridge/` + `tools/infisical-api-bridge/` | temporary bridge until provider 0.19.x ships native Railway resources | Keep the `project.yaml` contract unchanged. Upsert by stable name; delete guarded by `INFISICAL_BRIDGE_ALLOW_DELETE=1`. Remove the bridge via import + `moved` when native support lands. |
| `schemas/project.schema.json` | config contract | Additive changes only within `schema_version: 1`. Breaking changes bump `schema_version` and need a migration note in `CHANGELOG.md`. |
| `global/` | org-wide App Connections, shared conventions | Never create application projects or application secrets here. After apply, `pnpm connections:lock` regenerates `global/connections.lock.json`; commit that in a follow-up PR (CI opens it). New connection flow: global PR → apply → lock PR → project PRs. |
| `bootstrap/` | identities, OIDC trust, platform-bootstrap project, R2 buckets (Alchemy) | Human-driven. Never auto-applied from a merge; only via `bootstrap.yml` dispatch or a local operator run per `docs/BOOTSTRAP.md`. |
| `tools/cli/`, `scripts/` | wrappers that keep backend config + auth consistent | Changes count as "affect every project" for plan purposes. Keep outputs value-free. Tests in `tools/**/__tests__`. |
| `.github/workflows/` | CI/plan/apply/drift/backup | `ci.yml` is unprivileged. Only `plan.yml`/`apply.yml`/`drift.yml`/`state-backup.yml` may request `id-token: write`, and only within the `terraform-plan`/`production` environments. Never add GitHub Secrets. |
| `docs/` | runbooks | Keep commands real and tested; update `CHANGELOG.md` for behavior changes. |

Do not mix A and B in one PR. A module change and a project change are separate PRs, module first.

---

## 2. Repository map

```text
bootstrap/terraform   root: platform-bootstrap project, plan/apply identities, GitHub OIDC   (state: global bucket, sensitive)
bootstrap/alchemy     Alchemy stack creating the three private R2 state buckets
global/               root: App Connections (GitHub, Cloudflare native; Railway via bridge), connections.lock.json  (state: global bucket, sensitive)
modules/infisical-project   shared module: project, envs, folders, write-only placeholder secrets, identities, syncs
modules/railway-sync-bridge terraform_data + provisioner calling the API bridge
projects/_template    copied by `pnpm project:new`
projects/<slug>/      one root + state per Infisical project                      (state: project bucket)
schemas/              JSON Schema for project.yaml
tools/cli/src         pnpm commands (validate, plan/apply wrappers, secrets:check, sync:status, connections:lock, state:snapshot, plan-guard)
tools/infisical-api-bridge   Railway connection/sync reconciliation over the Infisical REST API
scripts/              bash wrappers: terraform-init/plan/apply, provider-acceptance, local-auth
docs/                 runbooks; IMPLEMENTATION_PLAN.md is the design of record
.github/              CI, trusted plan, protected apply, drift, state backup, CODEOWNERS
```

State buckets (R2, private): `bearfire-infisical-global-state` (bootstrap + global), `bearfire-infisical-project-state` (`projects/<slug>/terraform.tfstate`), `bearfire-infisical-state-backups`.

---

## 3. Commands

```bash
pnpm install                     # once; node >= 22, pnpm via corepack/packageManager
pnpm validate                    # schema + cross-checks + static secret/placeholder checks (no credentials needed)
pnpm validate --project <slug>
pnpm lint && pnpm typecheck && pnpm test
terraform -chdir=projects/<slug> init -backend=false && terraform -chdir=projects/<slug> validate

pnpm project:new <slug> --name "Name"
pnpm project:list
pnpm changed-roots --json        # which roots a diff touches (BASE_SHA/HEAD_SHA env)

# Require an Infisical session + backend credentials (see §4); normally CI does these:
pnpm plan --project <slug> | pnpm plan --global | pnpm plan --all
pnpm apply --project <slug> | pnpm apply --global     # CI only, except documented break-glass
pnpm secrets:check <slug> [--env prod] | --all
pnpm sync:status <slug> | --all
pnpm connections:lock | pnpm connections:check
pnpm state:snapshot --project <slug> | --global | --all
pnpm state:unlock --project <slug> <lock-id>
pnpm provider:acceptance         # throwaway project; records results in docs/PROVIDER_COMPATIBILITY.md
```

Use the wrappers; they generate the backend config and pick the right credential class. Direct `terraform` is fine for `init -backend=false` / `validate` / diagnosis.

---

## 4. Authentication contract (never hardcode any of it)

The Terraform provider and the tools read the environment:

```text
INFISICAL_HOST                      default https://app.infisical.com
# CI (GitHub OIDC):
INFISICAL_AUTH_METHOD=oidc  INFISICAL_MACHINE_IDENTITY_ID  INFISICAL_AUTH_JWT
# local operator:
INFISICAL_TOKEN                     short-lived; never persist to disk
# backend (derived by scripts/_lib.sh from the class-specific vars fetched from platform-bootstrap):
TF_GLOBAL_R2_*  TF_PROJECT_R2_*  TF_BACKUP_R2_*  →  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
CLOUDFLARE_ACCOUNT_ID               non-secret; R2 endpoint
```

GitHub holds **variables only** (`INFISICAL_*_IDENTITY_ID`, `CLOUDFLARE_ACCOUNT_ID`, …) and **no secrets**. If a task seems to need a GitHub Secret, the design is being violated — stop and re-read `docs/IMPLEMENTATION_PLAN.md` §13.

---

## 5. Before you open a PR — checklist

- [ ] `pnpm validate && pnpm lint && pnpm typecheck && pnpm test` pass locally.
- [ ] `terraform fmt -recursive -check` passes; touched roots pass `terraform validate` with `-backend=false`.
- [ ] No secret values, tokens, state, plan files, or generated backend config in the diff (`git diff --cached | grep -iE 'secret|token|key'` and actually read the hits).
- [ ] `placeholder_version` unchanged (or the PR is an explicitly labelled reset).
- [ ] Destructive? Own PR + `destructive-change` label + blast radius described.
- [ ] Module/schema/tooling change? Expect and review plans for every project root.
- [ ] Global change? Expect a follow-up `connections.lock.json` PR.
- [ ] Docs/`CHANGELOG.md` updated when behavior changes.

PR body pattern for application repos that consume new secrets:

```text
Depends on bearfire-dev/infisical-iac#123

Secret readiness:
- [x] Required Infisical objects created
- [x] Placeholder values replaced
- [x] Secret Syncs succeeded
```

---

## 6. Things that look like bugs but are design

- A freshly created secret shows `__REPLACE_IN_INFISICAL__` in Infisical and (for net-new destinations) in the destination. Correct: a human must replace it; `pnpm secrets:check` fails until then.
- Terraform plans show no diff after a human changed a value in Infisical. Correct: `value_wo` is write-only; Terraform never reads values.
- A Railway sync has no native Terraform resource. Correct: it is bridged (§1B) until the provider ships one.
- `global/connections.lock.json` has zero-UUIDs and `"status": "unbootstrapped"`. Correct until bootstrap + global apply + `pnpm connections:lock` have run.
- The apply workflow refused a plan. It contained deletions/replacements and the PR lacked `destructive-change` + production approval.
