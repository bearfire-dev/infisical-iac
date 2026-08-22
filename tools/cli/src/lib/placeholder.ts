// Single source of truth for the placeholder value Terraform writes into every
// managed secret object. modules/infisical-project/variables.tf and secrets.tf
// hard-code the same literal; keep them in sync.
export const PLACEHOLDER = "__REPLACE_IN_INFISICAL__";

/** Markers used in project.yaml for IDs humans must fill in (never secrets). */
export const REPLACE_MARKER_PREFIX = "REPLACE_WITH_";
