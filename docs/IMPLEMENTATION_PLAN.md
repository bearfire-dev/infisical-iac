# Implementation Plan: `bearfire-dev/infisical-iac`

**Status:** Adopted v1 (2026-08-22)
**Repository:** `github.com/bearfire-dev/infisical-iac`
**License:** MIT
**Purpose:** Central, declarative control plane for Infisical projects, secret objects, identities, permissions, App Connections, and Secret Syncs across Bearfire projects.

This is the design of record. Operational how-tos live in the sibling docs; when they disagree, fix the doc, not the invariant.

---

## 1. Executive decision

Implement a **single central repository with multiple isolated Terraform roots and states**.

```text
One repository
├── one bootstrap root/state
├── one global root/state
├── one shared project module
└── one root/state per Infisical project
```

The repository remains the organization-wide source of truth, but a routine change to one project cannot produce a Terraform plan against every other project.

The normal secret lifecycle:

```text
1. Define a project, folders, and secret names in this repository.
2. Terraform creates the Infisical resources and placeholder secret values.
3. A human replaces placeholders with real values in Infisical.
4. Infisical Secret Syncs automatically propagate the values to:
   - GitHub Actions secrets
   - Cloudflare Worker secrets
   - Railway variables
5. Application changes depending on those secrets may then merge.
```

There is no staging state machine, custom secret-entry CLI, or application-side Infisical administration requirement in v1.

## 2. Final architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ bearfire-dev/infisical-iac                                      │
│ bootstrap/       Root identity, OIDC, state infrastructure      │
│ global/          Shared App Connections and organization config │
│ modules/         Reusable Infisical project implementation      │
│ projects/*       One root and state per Infisical project       │
└──────────┬───────────────────────────────┬───────────────────────┘
           │ GitHub OIDC                   │ Terraform apply
           ▼                               ▼
┌─────────────────────┐         ┌──────────────────────────────────┐
│ Infisical identities │         │ Infisical                       │
│ plan: read only     │         │ projects / environments / folders│
│ apply: privileged   │────────►│ secret objects + placeholders    │
└─────────────────────┘         │ identities / permissions         │
                                │ App Connections / Secret Syncs   │
                                └──────────────┬───────────────────┘
                                      automatic delivery
                           ┌───────────────────┼──────────────────┐
                           ▼                   ▼                  ▼
                    GitHub Secrets       Cloudflare          Railway
                                         Worker secrets      variables
```

### State topology

```text
Alchemy state                      Cloudflare-managed (CloudflareStateStore)

bearfire-infisical-global-state    (sensitive)
├── bootstrap/terraform.tfstate
└── global/terraform.tfstate

bearfire-infisical-project-state
├── projects/sigla-writer/terraform.tfstate
├── projects/vex-machina/terraform.tfstate
└── projects/<future-project>/terraform.tfstate

bearfire-infisical-state-backups   timestamped immutable copies
```

The repository is centralized. Terraform failure domains are not.

## 3. Architectural invariants

Hard requirements, not preferences.

### 3.1 Source of truth
* Git defines which Infisical resources and secret objects should exist.
* Infisical is authoritative for current secret values.
* Destination systems receive values from Infisical.
* Application repositories do not manually own deployment secrets.
* Direct configuration in destination systems is drift unless explicitly exempted.

### 3.2 Secret values
* Actual secret values are never committed to Git and never passed through Terraform variables.
* Secret object creation uses the write-only placeholder mechanism (`value_wo`).
* Normal rotation happens in Infisical and requires no Terraform change.
* Incrementing `placeholder_version` is destructive: it replaces the live value with the placeholder.

### 3.3 State
* Every Infisical project has its own root and state.
* Shared App Connections live only in global state.
* Project roots never read global state (`terraform_remote_state` is forbidden); they read `global/connections.lock.json`.
* Backend credentials never appear in committed backend configuration.
* Raw plan files are never uploaded as repository artifacts.
* Global state is sensitive: the provider persists App Connection credentials in it.
* Project state must not contain current application secret values.

### 3.4 Delivery
* Secret Sync source folders are dedicated delivery boundaries.
* Infisical owns all matching destination secrets.
* A platform change merges before application code that depends on it.
* Placeholder presence blocks dependent application deployment.
* Removal and rename operations require explicit destructive-change review.

### 3.5 GitHub
* The control-plane repository has no long-lived GitHub Actions secrets.
* GitHub Actions authenticates to Infisical through OIDC.
* Non-secret identifiers are stored as GitHub Actions variables.
* Untrusted pull requests never receive the plan or apply identity.

## 4. Scope

**Included:** projects, environments, folders, static secret objects with placeholder values, metadata/tags/reminders, org and project machine identities, OIDC auth, memberships/permissions, GitHub/Cloudflare App Connections (native), Railway connection (bridge), GitHub/Cloudflare Workers (native) and Railway (bridge) Secret Syncs, state provisioning/recovery, CI plan/apply, required-secret validation, sync-health validation, migration.

**Not included:** storing real values in Git; managing application infrastructure; generating or rotating third-party credentials automatically; replacing app-owned Alchemy/Railway configuration; running Terraform from application repositories; treating the Infisical UI as configuration source of truth; privileged plans for external pull requests.

## 5. Repository layout

See `README.md` → Layout. Every directory listed there maps to a section of this plan.

## 6. Terraform roots and state boundaries

* **bootstrap/terraform** — platform-bootstrap project, placeholder objects for backend and connection credentials, plan/apply identities, GitHub OIDC auth, memberships. Rarely changed; never auto-applied from ordinary PRs.
* **global** — GitHub and Cloudflare App Connections (native), Railway connection (bridge), shared tag catalogue, exported `connections_lock` output. Must not create application projects or application secret objects.
* **projects/<slug>** — exactly one Infisical project: environments, folders, secret objects, project identities, role assignments, syncs. Reads IDs from `global/connections.lock.json`; never global state.

### Why connection IDs are committed
App Connection IDs are stable identifiers, not credentials. Committing the generated lock file avoids giving every project workflow read access to sensitive global state. After a global apply, `pnpm connections:lock` regenerates it and CI opens a follow-up PR when it changes.

## 7. Terraform state infrastructure

* Alchemy (`bootstrap/alchemy`) creates three private R2 buckets and keeps its own state in Cloudflare, never inside a bucket it creates.
* Committed roots contain only `backend "s3" {}`; `pnpm backend-config <root>` generates the partial config at runtime (`region = "auto"`, R2 endpoint, `use_lockfile = true`, path-style, skip_* flags). Credentials arrive via `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
* Locking: verify R2 S3-lockfile support with the pinned Terraform before production; CI additionally uses `concurrency: infisical-<root>` with `cancel-in-progress: false`.
* Backups: before every apply, copy the state object to the backup bucket under a timestamped immutable key (`projects/<slug>/<ISO>.tfstate`). A scheduled workflow snapshots all states. Never log state contents.

## 8. Project configuration format

`projects/<slug>/project.yaml` (schema: `schemas/project.schema.json`). Secret sets map 1:1 to Infisical folders because Secret Syncs operate on an environment + folder path. Do not mix secrets with different destination ownership in one set.

Secret fields: `required_in` (must reference declared environments), `comment`, `reminder_days`, `tags`, `placeholder_version` (default 1; never increased for rotation; increasing requires a reset review).

The project root wrapper (`main.tf`) is identical for every project and only decodes YAML + lock file into the shared module.

## 9. Shared project module

* Expands configuration into deterministic maps keyed by stable strings (`<env>:<path>:<NAME>`); indexes are never identities.
* Creates the project (`should_create_default_envs = false`, delete protection on), one environment per declaration, one folder per (environment, set) with ≥1 required secret, one write-only placeholder secret per slot, project tags, control-plane memberships, optional project identities with OIDC auth, and syncs.
* Placeholder constant everywhere: `__REPLACE_IN_INFISICAL__`.
* Sync defaults: auto-sync on, `overwrite-destination`, deletions managed by Infisical, `key_schema` unset. A project may relax deletion handling only during a documented migration.
* No `ignore_changes` workarounds until provider acceptance proves them safe.

## 10. Normal secret lifecycle

* **Net-new project:** create root → PR → CI validates/plans only that root → merge → Terraform creates everything with placeholders → replace placeholders in Infisical → `pnpm secrets:check` + `pnpm sync:status` → merge app changes. Transient placeholder delivery to a net-new destination is accepted.
* **New secret:** platform PR → apply → replace placeholder → verify → application PR that references `Depends on bearfire-dev/infisical-iac#<n>`.
* **Rotation:** change the value in Infisical; no Terraform change; never touch `placeholder_version`.
* **Rename:** add new → populate → deploy consumers → confirm old unused → remove old in a separate destructive PR.
* **Removal:** separate PR, `destructive-change` label, plan review, production approval, consumer check; apply surfaces objects and destination keys that will be deleted.

## 11. Required-secret validation
`pnpm secrets:check <slug> [--env <env>] | --all` — reads declared slots, authenticates, reads only required paths, compares to the placeholder, prints names and statuses (never values), exits nonzero on any missing/placeholder value. Must pass before dependent application deployment.

## 12. Sync-health validation
`pnpm sync:status <slug> | --all` — for each declared sync: exists, source env/folder match, auto-sync matches, last sync succeeded, connection exists, destination matches declaration. Never retrieves destination values.

## 13. Bootstrap design
Manual root of trust is limited to: creating/selecting the Infisical org, a human admin session, Alchemy's Cloudflare auth, the bootstrap apply, and entering initial credential values. Sequence and exact commands: `docs/BOOTSTRAP.md`. Identities: **plan** (read-only, bound to the `terraform-plan` GitHub environment) and **apply** (privileged, bound to the `production` environment on `main`). Subject binding uses immutable `repository_id` / `repository_owner_id` claims plus the `sub` glob.

## 14. Global App Connections
* GitHub: native resource, PAT auth (provider 0.19.24 supports only `pat`); PAT lives in platform-bootstrap, fetched at apply time, rotated on schedule, persisted in sensitive global state by the provider. Migrate to a GitHub App connection when it can be managed headlessly.
* Cloudflare: native resource, API token scoped to Workers operations.
* Railway: no native resource in 0.19.24 → API bridge. The project-facing schema (`type: railway`, `connection: railway`) is unchanged when native support arrives.

## 15. Railway API bridge
`tools/infisical-api-bridge` + `modules/railway-sync-bridge`. A `terraform_data` records the desired non-secret configuration and its hash; provisioners call `pnpm infisical:reconcile railway-sync upsert|delete`. Upsert is idempotent by stable name. Delete is guarded by `INFISICAL_BRIDGE_ALLOW_DELETE=1`. Drift is detected by API query in `drift.yml`. Migration to native: add native resource → import → no-op plan → remove bridge resource → project YAML unchanged.

## 16. Provider compatibility gate
Pinned: Terraform `>= 1.11.0, < 2.0.0` (CI uses 1.13.3), provider `infisical/infisical = 0.19.24`, lockfiles committed per root. `pnpm provider:acceptance` runs the write-only suite (`scripts/provider-acceptance.sh`) against a throwaway project; results are recorded in `docs/PROVIDER_COMPATIBILITY.md`. Failure policy: stop rollout, document, test known-good version, never mask with broad `ignore_changes`. Upgrades only via dedicated PRs with changelog review, acceptance results, all-root plans, state backup, rollback notes; Dependabot may open them but never auto-merges.

## 17. CI/CD design
* `ci.yml` — unprivileged: lint, typecheck, tests, schema validation, `terraform fmt/validate` (no backend), tflint, actionlint, shellcheck, secret scanning, placeholder-version and literal-secret static checks. External PRs stop here.
* `plan.yml` — trusted branches only; plan identity; changed roots only; sanitized summary as PR comment; no raw plan upload. Changed-root rules: project → that project; global → global; bootstrap → bootstrap; modules/schemas/tools/scripts → every project; docs → none.
* `apply.yml` — push to main; apply identity; snapshot → fresh plan → apply saved plan → `secrets:check` → `sync:status` → summary. Order: global, then projects. Bootstrap only on explicit dispatch.
* Destructive changes (deletions, sync/connection removal, placeholder increments) require the `destructive-change` label, production approval, plan summary, and snapshot.
* `drift.yml` — scheduled plans + bridge queries → GitHub issue; never auto-apply.
* `state-backup.yml` — scheduled snapshots + retention; never artifacts.

## 18. Pull-request SOP
See `docs/PR_SOP.md`: platform PR → merge/apply → replace placeholders → verify → application PR with a "Secret readiness" checklist. Module changes plan all roots; new connections follow global-first flow (connection PR → apply → lock PR → project PRs).

## 19. Migration plan
Inventory (no values) → pilot on a throwaway repo then one low-risk app → import existing projects/environments/secrets with write-only import → create syncs with the safest initial behavior → verify → mark Infisical authoritative → remove manual destination management. Never create a placeholder that overwrites a known-good production destination.

## 20. Tooling commands
See `README.md` → Commands. Direct `terraform` is supported for diagnosis; normal operation uses the wrappers so backend config and auth are consistent.

## 21. Security model
Git may contain names, paths, destination identifiers, connection/identity IDs. Git must not contain values, tokens, state, `.env`, or plan files. Infisical holds all values and control-plane credentials. Global state is sensitive and isolated; project state holds identities and placeholder versions only. GitHub holds non-secret variables only. A public repository exposes infrastructure metadata and secret names; confidential topology cannot be declared here without redaction or private visibility (`SECURITY.md`).

## 22. Documentation requirements
`README.md` (operating guide), `AGENTS.md` (agent-executable rules), `SECURITY.md`, `docs/OPERATIONS.md`, `docs/PROVIDER_COMPATIBILITY.md`, plus the runbooks in `docs/`.

## 23. Implementation phases

| Phase | Deliverables | Exit criteria |
|---|---|---|
| 0 Compatibility proof | throwaway project, pinned versions, acceptance suite, `value_wo`/R2 lock/OIDC verified, capability matrix | stable no-op plans; manual values survive applies; no values in state; unsupported resources assigned to bridge |
| 1 Repository and state bootstrap | public MIT repo, base docs, tooling skeleton, Alchemy stack, buckets, branch protection, CODEOWNERS | test states initialize against R2; snapshots restore |
| 2 Bootstrap identity | platform-bootstrap project, plan/apply identities, OIDC, GitHub variables | secretless workflow auth; backend credentials fetched from Infisical |
| 3 Global root | GitHub/Cloudflare connections, Railway bridge, tags, lock file | stable global plan; projects need no global-state access |
| 4 Project module | schema, module, generator, tests | example project created from YAML; placeholder replacement survives applies |
| 5 Secret delivery | GitHub/Cloudflare/Railway syncs, sync-status tooling | Infisical value change updates all three destination types |
| 6 CI/CD | all workflows, changed-root detection, destructive gate | project-only changes touch one root; module changes plan all; external PRs get no identity |
| 7 Pilot migration | throwaway + one low-risk app, import runbook, recovery test | pilot uses Infisical-managed values; manual copies removed |
| 8 Organization migration | remaining roots, inventory complete, manual GitHub secrets removed | all apps isolated; Infisical authoritative; control plane secretless |

## 24. Acceptance criteria
The implementation is complete when every bullet in §3 holds in practice, every phase exit criterion in §23 is met, `secrets:check` and `sync:status` are in routine use, rotation needs no Terraform change, external PRs cannot obtain identities, and state recovery has been tested, not merely documented.
