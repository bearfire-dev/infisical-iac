# Pull request SOP

Plan §18. Two PR kinds: **platform** (this repo) and **application** (consumer repos). Platform merges first.

## Platform PR

1. Branch, change one root where possible. Module/schema/tool changes plan every project — say so in the description.
2. `pnpm validate && pnpm lint && pnpm typecheck && pnpm test`; `terraform fmt -recursive`.
3. Open the PR with the template. `ci.yml` runs for everyone; `plan.yml` runs for same-repo branches and posts one sticky comment per changed root.
4. Read every plan comment. Counts must match the intent stated in the PR. Attribute values are never shown; addresses and counts are.
5. Destructive plan (`destroy`/`replace`, placeholder increments, sync or connection removal): add `destructive-change`, re-run the plan check, get CODEOWNERS review with explicit mention of what is destroyed.
6. Merge. `apply.yml` waits for `production` approval; approver checks the run matches the PR. Job summary shows `secrets:check` / `sync:status`.
7. Populate placeholders in Infisical; re-run `pnpm secrets:check <slug>` until clean.
8. Comment on the PR: "populated and delivered", linking the apply run.

## Application PR

Description includes:

```text
Depends on paperkeel/infisical-iac#<n>

Secret readiness
- [ ] all referenced secrets populated: `pnpm secrets:check <slug>` exit 0
- [ ] delivered to <destination(s)>: `pnpm sync:status <slug>`
- [ ] no secret is read from a manually managed destination key
```

Merge only after the platform PR is applied and populated. Placeholder presence blocks dependent deployment.

## New App Connection (global-first)

1. PR A: `global/` connection resource (+ placeholder credential in `bootstrap/terraform` if new) → apply → populate credential in `platform-bootstrap`.
2. CI opens `chore/connections-lock`; merge it (PR B).
3. PR C+: projects reference the connection.

## Labels

| Label | Meaning |
|---|---|
| `destructive-change` | plan destroys/replaces; required for apply to set `INFISICAL_IAC_DESTRUCTIVE_APPROVED=1` |
| `provider-upgrade` | Terraform/provider bump; needs acceptance results |
| `drift` | issue opened by drift.yml |
| `automated` | PR opened by a workflow |

## Review checklist (reviewer)

- No values, tokens, `.tfstate`, `.tfvars` (except `*.example.tfvars`), `plan.out`.
- `placeholder_version` unchanged unless the PR is explicitly a reset.
- Resource keys are stable strings (no list indexes introduced in the module).
- Plan comment counts match; destroys enumerated in the description.
- Lock file not hand-edited (only `pnpm connections:lock` output).
