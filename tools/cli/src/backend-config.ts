// `pnpm backend-config <root-spec>` — print the partial S3/R2 backend HCL for a root.
import { renderBackendConfig } from "./lib/backend.js";
import { die } from "./lib/output.js";
import { parseRootSpec } from "./lib/repo.js";

const spec = process.argv[2];
if (!spec) die("usage: backend-config <bootstrap|global|project:<slug>>");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) die("CLOUDFLARE_ACCOUNT_ID is required to render the R2 backend endpoint");

try {
  process.stdout.write(renderBackendConfig(parseRootSpec(spec), accountId));
} catch (err) {
  die((err as Error).message);
}
