#!/usr/bin/env bash
# Source this to prepare a LOCAL operator shell:
#   source scripts/local-auth.sh <global|project>
# Requires an authenticated `infisical` CLI session (infisical login) or
# INFISICAL_TOKEN. Fetches R2 backend credentials from platform-bootstrap into
# the environment for the requested state class. Nothing is written to disk.
class="${1:-project}"
slug="${INFISICAL_BOOTSTRAP_PROJECT_SLUG:-platform-bootstrap}"
env="${INFISICAL_BOOTSTRAP_ENV:-prod}"
prefix="TF_$(echo "$class" | tr '[:lower:]' '[:upper:]')"
for k in ACCESS_KEY_ID SECRET_ACCESS_KEY; do
  v="$(infisical secrets get "${prefix}_R2_${k}" --projectId "${INFISICAL_BOOTSTRAP_PROJECT_ID:?set INFISICAL_BOOTSTRAP_PROJECT_ID}" --env "$env" --path /terraform-backend --plain)"
  [[ "$v" != "__REPLACE_IN_INFISICAL__" ]] || { echo "${prefix}_R2_${k} is still a placeholder" >&2; return 1 2>/dev/null || exit 1; }
  export "${prefix}_R2_${k}=$v"
done
echo "exported ${prefix}_R2_* for class '$class' (project $slug/$env)" >&2
