# Adding a secret

Adds a secret *object* (name, environments, metadata). The *value* is entered in Infisical by a human afterwards.

## 1. Declare

```yaml
secret_sets:
  runtime:
    path: /runtime
    secrets:
      STRIPE_WEBHOOK_SECRET:
        required_in: [preview, prod]
        comment: Stripe webhook signing secret
        reminder_days: 90          # optional
        tags: [third-party]        # optional, must exist in global/tags.tf catalogue
```

Resource key becomes `prod:/runtime:STRIPE_WEBHOOK_SECRET`. Leave `placeholder_version` absent (defaults to 1).

```bash
pnpm project:validate <slug>
```

## 2. PR

Plan expectation for one new secret in two environments: `+2 infisical_secret.slot[...]`, possibly `+1 infisical_secret_folder` if it is the first secret of that set in an environment. No destroys, no sync replacement (syncs pick up new keys in the folder automatically).

## 3. After apply

`apply.yml` job summary shows `secrets:check` failing with the new names as `placeholder`. Then:

1. In Infisical, replace the value that starts with `replace_default_key_`.
2. `pnpm secrets:check <slug> --env prod` → exit 0.
3. `pnpm sync:status <slug>` → last sync succeeded (auto-sync pushes the new key within a minute; use "Trigger sync" in Infisical to hurry).
4. Destination has the key.

## 4. Application PR

```text
Depends on paperkeel/infisical-iac#<n>
Secret readiness:
- [ ] STRIPE_WEBHOOK_SECRET populated in preview, prod (`pnpm secrets:check <slug>`)
- [ ] delivered to <destination> (`pnpm sync:status <slug>`)
```

## Rotation

Change the value in Infisical. No Terraform change. Never touch `placeholder_version`.

## Resetting a value to placeholder (rare)

Incrementing `placeholder_version` rewrites the live value with the placeholder on the next apply and is treated as **destructive**: it needs the `destructive-change` label and production approval, and the sync will push the placeholder to the destination. Use only when a value must be deliberately invalidated.
