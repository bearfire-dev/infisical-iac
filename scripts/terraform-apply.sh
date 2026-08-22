#!/usr/bin/env bash
# Usage: scripts/terraform-apply.sh <root-spec>
# Snapshots the current state, recomputes a fresh plan, and applies exactly that plan.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

spec="${1:-}"; [[ -n "$spec" ]] || die "usage: terraform-apply.sh <root-spec>"
dir="$(resolve_root "$spec")"
"$REPO_ROOT/scripts/terraform-init.sh" "$spec"

log "snapshotting state before apply: $spec"
pnpm --silent state:snapshot "$spec" || die "state snapshot failed; refusing to apply"

log "fresh plan: $spec"
set +e
terraform -chdir="$dir" plan -input=false -lock-timeout=120s -out=plan.out -detailed-exitcode
rc=$?
set -e
[[ $rc -ne 1 ]] || die "terraform plan failed for $spec"
if [[ $rc -eq 0 ]]; then log "no changes for $spec"; exit 0; fi

if [[ "${INFISICAL_IAC_DESTRUCTIVE_APPROVED:-0}" != "1" ]]; then
  if terraform -chdir="$dir" show -json plan.out | pnpm --silent tsx "$REPO_ROOT/tools/cli/src/plan-guard.ts"; then :; else
    die "plan for $spec contains destructive changes; requires destructive-change label and production approval"
  fi
fi

log "terraform apply: $spec"
terraform -chdir="$dir" apply -input=false -lock-timeout=120s plan.out
rm -f "$dir/plan.out"
