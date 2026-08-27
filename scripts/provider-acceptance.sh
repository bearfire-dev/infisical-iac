#!/usr/bin/env bash
# Provider compatibility gate (docs/PROVIDER_COMPATIBILITY.md, plan §16).
#
# Runs the write-only secret acceptance suite against a THROWAWAY Infisical
# project using the pinned provider. Requires a human or bootstrap token:
#   INFISICAL_HOST, INFISICAL_TOKEN, INFISICAL_ORG_ID,
#   INFISICAL_OPERATOR_USERNAME
# and local `terraform` + `infisical` CLI. Uses a local state file only.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"
require_env INFISICAL_TOKEN INFISICAL_ORG_ID INFISICAL_OPERATOR_USERNAME
command -v infisical >/dev/null || die "infisical CLI is required (https://infisical.com/docs/cli/overview)"

suite="$REPO_ROOT/modules/infisical-project/tests/acceptance"
work="$(mktemp -d)"
cleanup() {
  # Always try to remove the throwaway project so a failed run leaves nothing behind.
  terraform -chdir="$work" destroy -input=false -auto-approve >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT
cp -r "$suite"/. "$work"/
log "acceptance workdir: $work"

tf() { terraform -chdir="$work" "$@"; }
# Plan must be a no-op; on failure print the (value-free) diff so the provider behaviour is recorded.
expect_noop() {
  local out
  if out="$(tf plan -input=false -no-color -detailed-exitcode 2>&1)"; then return 0; fi
  { printf '%s\n' "$out" | grep -E '^\s*[~+-] |Plan:|will be|must be|Error' | grep -viE 'value' || true; } >&2
  die "$1"
}
export TF_VAR_suffix="${ACCEPTANCE_SUFFIX:-$(date +%s)}"
export TF_VAR_operator_username="$INFISICAL_OPERATOR_USERNAME"

step() { log "--- $*"; }

step "1. init + apply (20 write-only secrets)"
tf init -input=false >/dev/null
tf apply -input=false -auto-approve >/dev/null
project_id="$(tf output -raw project_id)"

step "2. placeholder must not be present in state"
if grep -Eq '(__REPLACE_IN_INFISICAL__|replace_default_key_)' "$work/terraform.tfstate"; then die "placeholder found in state: value_wo is not write-only"; fi

step "3. repeated plan must be a no-op"
expect_noop "plan not stable after apply"

step "4. replace one value through Infisical (not Terraform)"
infisical secrets set ACCEPT_SECRET_01="manually-entered-$(date +%s)" --projectId "$project_id" --env prod --path /runtime --token "$INFISICAL_TOKEN" --domain "${INFISICAL_HOST:-https://app.infisical.com}/api" >/dev/null

step "5. plan after manual change must be a no-op"
expect_noop "manual value caused a plan diff: provider would rewrite values"

step "6. unrelated metadata change must not touch values"
export TF_VAR_metadata_marker="changed" # stays exported so later plans compare against the same config
tf apply -input=false -auto-approve >/dev/null
val="$(infisical secrets get ACCEPT_SECRET_01 --projectId "$project_id" --env prod --path /runtime --plain --token "$INFISICAL_TOKEN" --domain "${INFISICAL_HOST:-https://app.infisical.com}/api")"
[[ "$val" == manually-entered-* ]] || die "manual value was overwritten by an unrelated apply"

step "7. write-only import must not leak value into state"
tf state rm 'infisical_secret.slot["ACCEPT_SECRET_01"]' >/dev/null
tf import -input=false 'infisical_secret.slot["ACCEPT_SECRET_01"]' "write-only:${project_id}:prod:/runtime:ACCEPT_SECRET_01" >/dev/null
if grep -q "manually-entered-" "$work/terraform.tfstate"; then die "imported value present in state"; fi
# Known provider behaviour (0.19.24): import reads secret_reminder as {note="", repeat_days=0}
# rather than null, so one reconciliation apply of declared non-value attributes is expected.
# That apply must not touch the value, and the plan after it must be a no-op.
tf apply -input=false -auto-approve >/dev/null
val="$(infisical secrets get ACCEPT_SECRET_01 --projectId "$project_id" --env prod --path /runtime --plain --token "$INFISICAL_TOKEN" --domain "${INFISICAL_HOST:-https://app.infisical.com}/api")"
[[ "$val" == manually-entered-* ]] || die "value changed by the post-import reconciliation apply"
expect_noop "plan not stable after write-only import + reconciliation apply"
if grep -q "manually-entered-" "$work/terraform.tfstate"; then die "value leaked into state after reconciliation apply"; fi

step "8. destroy"
tf destroy -input=false -auto-approve >/dev/null

log "ACCEPTANCE PASSED: terraform $(terraform version -json | python3 -c 'import sys,json;print(json.load(sys.stdin)["terraform_version"])'), provider infisical/infisical 0.19.24"
log "Record the result in docs/PROVIDER_COMPATIBILITY.md"
