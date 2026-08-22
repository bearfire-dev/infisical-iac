/**
 * Alchemy stack: Terraform state infrastructure for bearfire-dev/infisical-iac.
 *
 * Creates three PRIVATE R2 buckets:
 *   bearfire-infisical-global-state    sensitive: bootstrap + global state
 *   bearfire-infisical-project-state   one key per Infisical project
 *   bearfire-infisical-state-backups   timestamped immutable snapshots
 *
 * Alchemy's own state is kept in Cloudflare (CloudflareStateStore), never inside
 * a bucket this stack creates. Run locally with a human Cloudflare session:
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... pnpm bootstrap:state
 *
 * Destroy is deliberately not wired to a root-level script; see docs/STATE_RECOVERY.md.
 */
import alchemy from "alchemy";
import { R2Bucket } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";

const app = await alchemy("bearfire-infisical-iac-state", {
  stage: process.env.ALCHEMY_STAGE ?? "prod",
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  stateStore: (scope) => new CloudflareStateStore(scope),
});

const common = {
  // Never delete state buckets on `destroy`; recovery is manual by design.
  delete: false,
  adopt: true,
} as const;

export const globalState = await R2Bucket("global-state", {
  name: "bearfire-infisical-global-state",
  ...common,
});

export const projectState = await R2Bucket("project-state", {
  name: "bearfire-infisical-project-state",
  ...common,
});

export const stateBackups = await R2Bucket("state-backups", {
  name: "bearfire-infisical-state-backups",
  ...common,
});

console.log(
  JSON.stringify(
    {
      globalState: globalState.name,
      projectState: projectState.name,
      stateBackups: stateBackups.name,
    },
    null,
    2,
  ),
);

await app.finalize();
