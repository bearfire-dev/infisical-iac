#!/usr/bin/env bash
# Usage: scripts/terraform-init.sh <root-spec> [--no-backend]
# Generates the partial backend config for the root and runs `terraform init`.
source "$(dirname "${BASH_SOURCE[0]}")/_lib.sh"

spec="${1:-}"; [[ -n "$spec" ]] || die "usage: terraform-init.sh <bootstrap|global|project:<slug>> [--no-backend]"
dir="$(resolve_root "$spec")"; [[ -d "$dir" ]] || die "root directory not found: $dir"
class="$(root_state_class "$spec")"

if [[ "${2:-}" == "--no-backend" ]]; then
  log "init (no backend): $dir"
  terraform -chdir="$dir" init -backend=false -input=false >/dev/null
  exit 0
fi

export_backend_credentials "$class"
log "generating backend config for $spec"
pnpm --silent backend-config "$spec" > "$dir/backend.generated.hcl"
log "terraform init: $dir"
terraform -chdir="$dir" init -input=false -reconfigure -backend-config="backend.generated.hcl"
