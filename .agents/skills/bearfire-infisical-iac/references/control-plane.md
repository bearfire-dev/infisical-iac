# Control-plane workflow

Read this reference before you change Infisical objects, environments, folders, secret sets, syncs, or destinations.

Use `bearfire-dev/infisical-iac` as the canonical control-plane repository.

## Select a safe checkout

Use a clean checkout when one is available.
Preserve unrelated changes in an existing checkout.
Use a separate worktree or temporary clone when changes overlap.

Read the control-plane `AGENTS.md` and applicable runbooks before you edit files.
Never copy a live value from an application or dashboard.

## Find the project root

Run these commands:

```bash
pnpm project:list
rg -n "repository: <application-repository>" projects
```

Use destination declarations and repository documentation to identify the project slug.
Do not assume that the application repository name equals the project slug.

If the project does not exist, continue with the new application setup below.

Infer an environment or GitHub destination only when application configuration makes it explicit.
Ask for an unavailable Cloudflare script ID or Railway destination ID.

## Set up a new application project

Before you create the root, build a name-only inventory:

- Application repository owner and name.
- Infisical project display name and stable slug.
- Application environments and their deployment names.
- Runtime or deployment target for each environment.
- Managed key names and their consumer schema class.
- Destination scope and identifier for each secret set.
- Current destination owner and whether working values already exist.

Do not collect values. If working values already exist in Infisical or a destination, use
the migration runbook and import the resources. Do not use a normal create-and-overwrite
apply.

Run the scaffold command from the control-plane repository:

```bash
pnpm project:new <slug> --name "Display Name"
```

The command creates the standard Terraform wrapper and `project.yaml`. Edit only
`project.yaml` for normal onboarding. Keep `backend.tf`, `main.tf`, `versions.tf`, and the
provider lock file consistent with the template.

Declare every application environment that receives a managed value. An application
environment name and an Infisical slug can differ, but the sync destination must make the
mapping explicit.

Group keys by destination ownership. For example:

- Put GitHub build and deployment values in `/ci`.
- Put Cloudflare Worker or Railway runtime values in `/runtime`.
- Create another set when a destination must receive a different group of keys.
- Reuse one set across multiple syncs only when every destination can receive every key.

Start from this shape and keep only the environments, sets, and syncs that the application
needs:

```yaml
schema_version: 1
project:
  name: Example App
  slug: example-app
  description: Managed environment contract for bearfire-dev/example-app

environments:
  preview: { name: Preview, position: 1 }
  prod: { name: Production, position: 2 }

secret_sets:
  ci:
    path: /ci
    description: GitHub Actions deployment values
    secrets:
      CLOUDFLARE_API_TOKEN:
        required_in: [preview, prod]
        comment: Cloudflare deployment credential
        reminder_days: 90
  runtime:
    path: /runtime
    description: Application runtime values
    secrets:
      SESSION_SECRET:
        required_in: [preview, prod]
        comment: Server session signing secret

syncs:
  prod-ci-to-github-production:
    type: github
    connection: github
    source: { environment: prod, secret_set: ci }
    destination:
      scope: repository-environment
      owner: bearfire-dev
      repository: example-app
      repository_environment: production
  preview-ci-to-github-preview:
    type: github
    connection: github
    source: { environment: preview, secret_set: ci }
    destination:
      scope: repository-environment
      owner: bearfire-dev
      repository: example-app
      repository_environment: preview
```

Add Cloudflare Workers or Railway runtime syncs with the destination forms below. A GitHub
workflow secret is not a Worker runtime binding. Declare each delivery path separately.

Make sure that `global/connections.lock.json` contains a real ID for each selected
connection before you open the project pull request. Use the global-first workflow when a
connection is unavailable.

The first protected apply creates the Infisical project, environments, folders, secret
objects, control-plane memberships, and syncs. It creates placeholder values only. The
operator must replace each placeholder in every declared environment and folder.

After value entry, run `pnpm secrets:check <slug>` and `pnpm sync:status <slug>`. Confirm
that the destination keys exist. Then remove the previous destination writer and permit the
application change to merge.

## Select the secret set

Select the set from its destination owner.

- Use `/ci` for build and deployment values that GitHub Actions receives.
- Use `/runtime` for application values that Cloudflare Workers or Railway services receive.
- Preserve other names and paths that an existing project uses.

A folder sync sends every key from one environment and folder to one destination.
Do not add a key when a current destination must not receive it.
Create a separate set and sync for that key.

## Declare the key

Declare only the name and metadata.

```yaml
secret_sets:
  runtime:
    path: /runtime
    secrets:
      SESSION_SECRET:
        required_in: [preview, prod]
        comment: Server session signing secret
        reminder_days: 90
```

Use `SCREAMING_SNAKE_CASE`.
List only declared environments.
Omit `placeholder_version` so that it keeps its default value of `1`.

Infisical can also deliver a managed non-secret value.
State its non-secret status and delivery reason in the comment.

## Declare delivery

Reuse a sync only when it owns the full source folder and intended destination.
Otherwise, declare a new destination.

```yaml
syncs:
  prod-runtime-to-cloudflare:
    type: cloudflare-workers
    connection: cloudflare
    source: { environment: prod, secret_set: runtime }
    destination: { script_id: example-worker }
  prod-ci-to-github:
    type: github
    connection: github
    source: { environment: prod, secret_set: ci }
    destination:
      scope: repository-environment
      owner: bearfire-dev
      repository: example-app
      repository_environment: production
  prod-runtime-to-railway:
    type: railway
    connection: railway
    source: { environment: prod, secret_set: runtime }
    destination:
      project_id: <railway-project-id>
      environment_id: <railway-environment-id>
      service_id: <railway-service-id>
```

Make sure that `global/connections.lock.json` contains the connection ID.
Use the global-first workflow when the connection ID is absent.
Do not expand project work into global or bootstrap work without user authority.

Use the migration runbook for a destination that contains working values.
Set `initial_sync_behavior` to `import-prioritize-destination`.
Set `manage_deletions` to `false`.
Never overwrite a working destination with a placeholder.

## Validate the change

Run the repository checks.
At minimum, run these commands:

```bash
pnpm validate --project <slug>
pnpm lint
pnpm typecheck
pnpm test
terraform fmt -recursive -check
terraform -chdir=projects/<slug> init -backend=false
terraform -chdir=projects/<slug> validate
```

Examine each diff hit for `secret`, `token`, or `key`.
Permit names and metadata only.
Reject all values.
Make sure that `placeholder_version` did not change.

## Prepare the platform pull request

Keep the platform change separate from the application change.
Use a concise Conventional Commit when the user authorizes a commit.
Open a pull request only when the user authorizes that external action.

Include these identifiers in an authorized pull request:

- The consumer repository.
- Each added or changed key name.
- Each Infisical environment and folder.
- Each destination and ownership boundary.

Include these operational details:

- Each expected Terraform creation, update, or deletion.
- The required dashboard action after the apply.
- The application pull-request status.

Never include a value.
Add `destructive-change` only after you examine a destructive plan.
Do not apply the Terraform change locally.

After the protected workflow applies the change, direct the operator to replace each placeholder.
When credentials are available, run these commands:

```bash
pnpm secrets:check <slug>
pnpm sync:status <slug>
```

If credentials are unavailable, give the commands to the operator.
Keep the application change blocked until both commands pass.

## Link the application change

Add this text to an authorized application pull request:

```text
Depends on bearfire-dev/infisical-iac#<number>

Secret readiness:
- [ ] Required Infisical objects created
- [ ] Placeholder values replaced
- [ ] Secret Syncs succeeded
```

Merge and apply the platform change before you merge the application change.

## Handle renames and removals

For a rename, add and populate the new key before you migrate consumers.
Remove the old key in a later destructive pull request.

For a removal, deploy the consumer removal first.
Then remove the key in a separate platform pull request.
Add the `destructive-change` label.
Make sure that no consumer references the key before you open the pull request.
