#!/usr/bin/env bash
# Shared helpers for Terraform wrapper scripts. Source, do not execute.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\033[1;34m[infisical-iac]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[infisical-iac] error:\033[0m %s\n' "$*" >&2; exit 1; }

# Resolve a root spec (bootstrap | global | project:<slug> | projects/<slug>) to a directory.
resolve_root() {
  local spec="$1"
  case "$spec" in
    bootstrap) echo "$REPO_ROOT/bootstrap/terraform" ;;
    global) echo "$REPO_ROOT/global" ;;
    project:*) echo "$REPO_ROOT/projects/${spec#project:}" ;;
    projects/*) echo "$REPO_ROOT/$spec" ;;
    *) die "unknown root spec '$spec' (expected bootstrap | global | project:<slug>)" ;;
  esac
}

# Which credential class a root uses: global (sensitive) or project.
root_state_class() {
  case "$1" in
    bootstrap|global) echo "global" ;;
    *) echo "project" ;;
  esac
}

require_env() {
  local missing=0
  for v in "$@"; do
    if [[ -z "${!v:-}" ]]; then log "missing required environment variable: $v"; missing=1; fi
  done
  [[ $missing -eq 0 ]] || die "set the variables above (normally exported by the CI job or scripts/local-auth.sh)"
}

# Export AWS_* for the backend from the class-specific variables, if present.
export_backend_credentials() {
  local class="$1"
  case "$class" in
    global)
      if [[ -n "${TF_GLOBAL_R2_ACCESS_KEY_ID:-}" ]]; then
        export AWS_ACCESS_KEY_ID="$TF_GLOBAL_R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$TF_GLOBAL_R2_SECRET_ACCESS_KEY"
      fi ;;
    project)
      if [[ -n "${TF_PROJECT_R2_ACCESS_KEY_ID:-}" ]]; then
        export AWS_ACCESS_KEY_ID="$TF_PROJECT_R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$TF_PROJECT_R2_SECRET_ACCESS_KEY"
      fi ;;
  esac
  require_env AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY CLOUDFLARE_ACCOUNT_ID
}
