## What

<!-- One paragraph. Which root(s) change: bootstrap / global / modules / projects/<slug> / tooling / docs -->

## Checklist

- [ ] No secret values, tokens, state, plan files, or `.env` content are committed (names and IDs only).
- [ ] `placeholder_version` is unchanged for every existing secret (incrementing it is destructive: it resets the live value).
- [ ] `pnpm validate && pnpm lint && pnpm typecheck && pnpm test` pass locally.
- [ ] The `plan` workflow comment for each changed root was read; the counts match intent.
- [ ] If the plan deletes/replaces anything (secret objects, folders, syncs, identities, connections), the `destructive-change` label is set and consumers were checked (`docs/DELETING_A_SECRET.md`).
- [ ] Global connection change: this PR → apply → merge the `chore/connections-lock` PR → then project PRs.
- [ ] Dependent application PR(s) reference this PR as `Depends on paperkeel/infisical-iac#<n>` and wait for `pnpm secrets:check <slug>` to pass.

## Depends on / blocks

<!-- e.g. Blocks paperkeel/sigla-writer#123 -->
