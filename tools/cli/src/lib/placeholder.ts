export const PLACEHOLDER_PREFIX = "replace_default_key_";
export const PLACEHOLDER_HEX_LENGTH = 256;
export const LEGACY_PLACEHOLDER = "__REPLACE_IN_INFISICAL__";

export function isPlaceholder(value: unknown): boolean {
  return (
    value === LEGACY_PLACEHOLDER ||
    (typeof value === "string" && value.startsWith(PLACEHOLDER_PREFIX))
  );
}

export function isCanonicalPlaceholder(value: unknown): boolean {
  if (value === LEGACY_PLACEHOLDER) return true;
  if (typeof value !== "string" || !value.startsWith(PLACEHOLDER_PREFIX)) return false;

  const suffix = value.slice(PLACEHOLDER_PREFIX.length);
  return suffix.length === PLACEHOLDER_HEX_LENGTH && /^[0-9a-f]+$/i.test(suffix);
}

/** Markers used in project.yaml for IDs humans must fill in (never secrets). */
export const REPLACE_MARKER_PREFIX = "REPLACE_WITH_";
