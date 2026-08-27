# Adding a project

One Infisical project = one directory under `projects/` = one Terraform state.

## 1. Scaffold

```bash
pnpm project:new <slug>            # copies projects/_template, sets slug
$EDITOR projects/<slug>/project.yaml
pnpm project:validate <slug>
```

Do not edit `projects/<slug>/main.tf`, `backend.tf`, or `versions.tf`; they are identical for every project. Extend the module if something is missing.

The standard wrapper grants the Bearfire operator permanent project admin access. This
membership permits direct Infisical CLI actions. Local authentication stays in the
operator's Infisical keyring.

## 2. Write project.yaml

Minimal example:

```yaml
schema_version: 1
project:
  name: Example App
  slug: example-app
environments:
  dev:  { name: Development, position: 1 }
  prod: { name: Production,  position: 2 }
secret_sets:
  runtime:
    path: /runtime
    description: Runtime application secrets
    secrets:
      DATABASE_URL:
        required_in: [dev, prod]
        comment: Primary database
syncs:
  prod-runtime-to-github:
    type: github
    connection: github
    source: { environment: prod, secret_set: runtime }
    destination: { scope: repository, owner: bearfire-dev, repository: example-app }
```

Rules:
- A secret set maps to one folder. Do not mix secrets with different destination ownership in one set.
- Sync `connection` must exist in `global/connections.lock.json` with a real ID (GitHub, Cloudflare, Railway). If the lock still has zeros for that connection, do global first ([PR_SOP.md](PR_SOP.md) → new connection).
- Railway destinations need `project_id`, `environment_id`, and usually `service_id` (Railway dashboard → project settings / `railway status --json`).
- Cloudflare destination `script_id` is the Worker name.

## 3. PR

```bash
git checkout -b feat/project-<slug>
git add projects/<slug>
git commit -m "feat(projects): add <slug>"
gh pr create --fill
```

`plan.yml` plans only `project:<slug>`. Expect creates only: project, environments,
folders, `N` secret objects, tags, two control-plane memberships, one operator
membership, and syncs. Any destroy on a new project is a bug.

## 4. Merge and populate

After merge `apply.yml` creates everything with placeholders and prints `secrets:check` in the job summary (expected: all placeholders). Then:

1. In Infisical, replace every placeholder in each environment.
2. `pnpm secrets:check <slug>` → exit 0.
3. `pnpm sync:status <slug>` → every sync exists, last sync succeeded.
4. Confirm in the destination (GitHub repo secrets / Worker settings / Railway variables) that keys exist.

Transient delivery of the placeholder to a brand-new destination is accepted; never point a new sync at a destination that already has known-good production values without reading [MIGRATION.md](MIGRATION.md).

## 5. Application side

The application PR that consumes the secrets references `Depends on bearfire-dev/infisical-iac#<n>` and merges only after `secrets:check` passes.

## Removing a project

Separate PR deleting `projects/<slug>` with the `destructive-change` label. Infisical project delete protection is on; the PR must first set `project.delete_protection: false`, apply, then delete. State objects remain in the backup bucket.
