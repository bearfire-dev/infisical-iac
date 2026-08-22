#!/usr/bin/env bash
# Usage: scripts/terraform-plan.sh <root-spec> [extra terraform plan args]
# Produces a binary plan in the root (git-ignored) and a sanitized text summary
# on stdout. Never upload the binary plan as a public artifact.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

spec="${1:-}"; [[ -n "$spec" ]] || die "usage: terraform-plan.sh <root-spec> [args]"
shift
dir="$(resolve_root "$spec")"
"$REPO_ROOT/scripts/terraform-init.sh" "$spec"

plan_file="$dir/plan.out"
log "terraform plan: $spec"
set +e
terraform -chdir="$dir" plan -input=false -lock-timeout=120s -out=plan.out -detailed-exitcode "$@"
rc=$?
set -e
# 0 = no changes, 2 = changes, 1 = error
[[ $rc -ne 1 ]] || die "terraform plan failed for $spec"

log "plan summary for $spec (exit $rc)"
terraform -chdir="$dir" show -no-color plan.out | grep -Ev '(secret|token|password|credential)s?[^=]*= *"' || true
echo "::notice::plan exit code for $spec: $rc"
exit 0
