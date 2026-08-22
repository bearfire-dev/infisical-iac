# Contributing

Read `AGENTS.md` (rules that apply to humans and agents) and `docs/PR_SOP.md` before opening a PR.

## Setup

```bash
nvm use            # .nvmrc → Node 24
corepack enable && pnpm install --frozen-lockfile
terraform version  # 1.13.x
pnpm validate && pnpm lint && pnpm typecheck && pnpm test
```

Privileged commands (`pnpm plan`, `pnpm apply`, `secrets:check`, `sync:status`) need `INFISICAL_TOKEN` and `source scripts/local-auth.sh <global|project>`. Most contributions need none of them: CI plans for you.

## What goes where

| Change | Location | Plans |
|---|---|---|
| A project's secrets, envs, syncs | `projects/<slug>/project.yaml` | that project |
| New project | `pnpm project:new <slug>` | that project |
| Module behaviour | `modules/infisical-project` | every project |
| Schema | `schemas/project.schema.json` + `tools` validator + tests | every project |
| App Connections, tag catalogue | `global/` | global |
| Identities, OIDC, bootstrap placeholders | `bootstrap/terraform` | bootstrap (manual apply only) |
| Tooling | `tools/`, `scripts/` | every project |
| Docs | `docs/`, `*.md` | nothing |

## Rules

- Never commit values, tokens, state, plans, `.tfvars`. `__REPLACE_IN_INFISICAL__` is the only value Terraform writes.
- Never increment `placeholder_version` for rotation.
- Resource keys are stable strings; no list indexes.
- Project roots never read global state.
- Destructive plans need the `destructive-change` label.
- Keep the project `main.tf` wrapper identical across projects.
- Terraform formatted (`terraform fmt -recursive`), Biome clean (`pnpm format`).
- Tests for tooling changes (`vitest`), schema examples for schema changes.
- Update `CHANGELOG.md` under Unreleased.

## Commit / PR style

Conventional commits (`feat(projects): add sigla-writer`, `fix(module): ...`, `chore(global): ...`). One root per PR where possible. Fill the PR template.

## Reviews

CODEOWNERS enforce review on `bootstrap/`, `global/`, `modules/`, `.github/`. Reviewers read the plan comment, not just the diff.
