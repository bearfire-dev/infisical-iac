---
name: bearfire-infisical-iac
description: Set up Bearfire applications to use @paperkeel/env with paperkeel/infisical-iac, and manage Infisical-delivered variables. Use for project onboarding, additions, renames, rotations, removals, and application-only validation changes. Do not use for public configuration.
---

# Bearfire Infisical IaC

Maintain one environment contract across the application and the Bearfire control plane.

```text
Application schema -> Infisical declaration -> human value entry -> Secret Sync -> runtime validation
```

Use `@paperkeel/env` to validate names, types, and Infisical placeholders in the application.
Use `paperkeel/infisical-iac` to declare Infisical objects and delivery rules.
Keep live values in Infisical.

## Start the task

1. Read each applicable `AGENTS.md` file.
2. Classify the request as explanation, review, diagnosis, or implementation.
3. Make no changes for an explanation, review, or diagnosis request.
4. Determine whether the consumer already has an `infisical-iac` project root.
5. Identify the consumer, project slug, environments, folders, and destinations.
6. Read [consumer-env.md](references/consumer-env.md) before you change application code.
7. Read [control-plane.md](references/control-plane.md) before you set up or change Infisical topology.

Treat a key name, environment, folder, secret set, sync, or destination as Infisical topology.

## Obey the safety rules

### Protect values

- Never put a live value in Git, Terraform, tests, fixtures, commands, logs, or pull-request text.
- Never ask a person to paste a value into chat.
- Direct the person to enter or rotate the value in the Infisical dashboard.
- Use `secret("NAME")` only for a private server value.
- Never use `secret()` in a `client` or `shared` schema.
- Validate a managed non-secret value with a specific Zod schema.

### Protect topology

- Never increment `placeholder_version` for rotation.
- Never write an Infisical-owned destination key from application infrastructure.
- Never apply a production control-plane change from a local checkout.
- Keep each Infisical project in one `projects/<slug>/` root and state.
- Separate secret sets when their destination owners are different.

## Set up an application for Infisical IaC

Use this lifecycle when the application has no project root in `paperkeel/infisical-iac`.

1. Inventory the application environments, runtimes, deployments, and managed key names.
2. Identify the delivery destination for each key and environment.
3. Install `@paperkeel/env` and its peer dependencies in the consumer.
4. Add one typed environment module for each runtime boundary.
5. Add focused tests for types, invalid values, and placeholder rejection.
6. Create `projects/<slug>/` with `pnpm project:new` in the control-plane repository.
7. Declare the application environments in `project.yaml`.
8. Group the managed keys into secret sets by destination ownership.
9. Declare each required GitHub, Cloudflare Workers, or Railway sync.
10. Use the import-first migration when Infisical or a destination already has working values.
11. Validate both repository changes.
12. Prepare the platform change before the application change.
13. Open pull requests only when the user authorizes that external action.
14. Direct the operator to replace every placeholder after the protected platform apply.
15. Check value readiness and sync status when credentials are available.
16. Remove manual destination management only after Infisical delivery succeeds.

Do not add a project identity by default. Add one only when the application must read
Infisical directly instead of receiving values through a Secret Sync.

Do not use the net-new setup lifecycle for an existing production destination. Use the
documented import-first migration so that placeholders cannot overwrite working values.

## Select the lifecycle

### Add a variable or environment

1. Add the consumer schema and focused tests.
2. Declare the key in the correct secret set and environments.
3. Declare a sync only when no current sync owns the destination.
4. Validate both repository changes.
5. Prepare a separate platform change before the application change.

6. Open pull requests only when the user authorizes that external action.
7. Link the platform pull request from the application pull request.
8. Direct the operator to replace each placeholder after the platform apply.
9. Check value readiness and sync status when credentials are available.
10. Keep the application change blocked until both checks pass.

The platform change must merge and apply before the application change merges.
The application change can remain on a branch or in a draft pull request.

### Change application validation only

Change only the application schema and tests when the Infisical topology stays the same.
Do not create an empty control-plane change.

### Rotate a value

Change neither repository.
Direct the operator to rotate the value in Infisical.
Then check all declared syncs.

Use the control-plane operations guide for Railway control-plane credential rotation.

### Rename a variable

1. Add the new key through the addition lifecycle.
2. Wait until the operator populates and delivers the new key.
3. Migrate and deploy every consumer.
4. Make sure that no consumer uses the old key.
5. Remove the old key in a separate destructive platform change.

Never rename a variable with one delete-and-create change.

### Remove a variable or environment

1. Remove and deploy all consumer use.
2. Search each consumer for the old key.
3. Remove the declaration in a separate platform change.
4. Add the `destructive-change` label to an authorized pull request.
5. Describe each removed Infisical object and destination key.

## Give the operator a checklist

Use this format for each value that requires human entry:

```text
Human action required in Infisical
Project: <display name> (<slug>)
Environment: <environment list>
Folder: <path>
Keys:
- <KEY_NAME>
Action: Replace each replace_default_key_ value in the Infisical dashboard.
Readiness: pnpm secrets:check <slug>
Delivery: pnpm sync:status <slug>
Application PR: blocked until both checks pass
```

List names and statuses only.

## Report the result

- List each changed application file and its validation behavior.
- List each changed control-plane file, environment, folder, and destination.
- Give each pull-request URL when the task authorized pull-request creation.
- Give the exact operator checklist.
- List each local check and its result.
- List each readiness check that still needs credentials or human value entry.
