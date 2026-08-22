// Rendering of the partial S3 backend configuration for Cloudflare R2.
import { type RootSpec, stateBucket, stateKey } from "./repo.js";

export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/** Render backend.generated.hcl for a root. Credentials are NOT included. */
export function renderBackendConfig(root: RootSpec, accountId: string): string {
  return [
    `bucket = "${stateBucket(root)}"`,
    `key    = "${stateKey(root)}"`,
    `region = "auto"`,
    "",
    "skip_credentials_validation = true",
    "skip_metadata_api_check     = true",
    "skip_region_validation      = true",
    "skip_requesting_account_id  = true",
    "skip_s3_checksum            = true",
    "use_path_style              = true",
    "use_lockfile                = true",
    "",
    `endpoints = { s3 = "${r2Endpoint(accountId)}" }`,
    "",
  ].join("\n");
}
