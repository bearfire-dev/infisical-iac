# Partial backend configuration. Bucket, key, endpoint, and flags are generated
# at runtime by `pnpm backend-config` into backend.generated.hcl (git-ignored).
# Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in the runner
# environment, fetched from the platform-bootstrap Infisical project.
terraform {
  backend "s3" {}
}
