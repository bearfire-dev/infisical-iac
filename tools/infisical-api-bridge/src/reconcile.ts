// `pnpm infisical:reconcile <railway-connection|railway-sync> <upsert|delete>`
// Invoked by Terraform local-exec provisioners with the desired configuration
// in BRIDGE_CONFIG (JSON). Idempotent upsert by stable name; delete is guarded
// by INFISICAL_BRIDGE_ALLOW_DELETE=1. Prints only IDs and status, never tokens.
import { authenticatedClient } from "./auth.js";
import {
  createRailwayConnection,
  deleteRailwayConnection,
  findRailwayConnectionByName,
  type RailwayConnectionSpec,
  railwayToken,
  updateRailwayConnection,
} from "./railway-connection.js";
import {
  createRailwaySync,
  deleteRailwaySync,
  findRailwaySyncByName,
  type RailwaySyncSpec,
  syncMatches,
  updateRailwaySync,
} from "./railway-sync.js";

const [kind, action] = process.argv.slice(2);
if (
  !["railway-connection", "railway-sync"].includes(kind ?? "") ||
  !["upsert", "delete"].includes(action ?? "")
) {
  console.error(
    "usage: reconcile <railway-connection|railway-sync> <upsert|delete>  (config in BRIDGE_CONFIG)",
  );
  process.exit(2);
}

function loadConfig<T>(): T {
  const raw = process.env.BRIDGE_CONFIG;
  if (!raw) throw new Error("BRIDGE_CONFIG is required");
  const cfg = JSON.parse(raw) as T & { kind?: string };
  if (cfg.kind && cfg.kind !== kind)
    throw new Error(`BRIDGE_CONFIG.kind '${cfg.kind}' does not match '${kind}'`);
  return cfg;
}

function deleteAllowed(): boolean {
  return process.env.INFISICAL_BRIDGE_ALLOW_DELETE === "1";
}

async function reconcileConnection(): Promise<void> {
  const spec = loadConfig<RailwayConnectionSpec & { credentialVersion?: number }>();
  const client = await authenticatedClient();
  const existing = await findRailwayConnectionByName(client, spec.name);

  if (action === "delete") {
    if (!existing)
      return console.log(`railway-connection '${spec.name}': absent, nothing to delete`);
    if (!deleteAllowed()) {
      console.log(
        `railway-connection '${spec.name}' (${existing.id}): RETAINED (set INFISICAL_BRIDGE_ALLOW_DELETE=1 to delete)`,
      );
      return;
    }
    await deleteRailwayConnection(client, existing.id);
    return console.log(`railway-connection '${spec.name}' (${existing.id}): deleted`);
  }

  const token = railwayToken();
  if (!existing) {
    const created = await createRailwayConnection(client, spec, token);
    return console.log(`railway-connection '${spec.name}' (${created.id}): created`);
  }
  // The credential cannot be compared (never returned by the API); it is
  // re-submitted on every upsert so credentialVersion bumps take effect.
  await updateRailwayConnection(client, existing.id, {
    name: spec.name,
    description: spec.description ?? null,
    apiToken: token,
    ...(spec.method ? { method: spec.method } : {}),
  });
  console.log(
    `railway-connection '${spec.name}' (${existing.id}): updated (credential v${spec.credentialVersion ?? 1})`,
  );
}

async function reconcileSync(): Promise<void> {
  const spec = loadConfig<RailwaySyncSpec>();
  const client = await authenticatedClient();
  const existing = await findRailwaySyncByName(client, spec.projectId, spec.name);

  if (action === "delete") {
    if (!existing) return console.log(`railway-sync '${spec.name}': absent, nothing to delete`);
    if (!deleteAllowed()) {
      console.log(
        `railway-sync '${spec.name}' (${existing.id}): RETAINED (set INFISICAL_BRIDGE_ALLOW_DELETE=1 to delete)`,
      );
      return;
    }
    await deleteRailwaySync(client, existing.id);
    return console.log(`railway-sync '${spec.name}' (${existing.id}): deleted`);
  }

  if (!existing) {
    const created = await createRailwaySync(client, spec);
    return console.log(`railway-sync '${spec.name}' (${created.id}): created`);
  }
  if (syncMatches(spec, existing))
    return console.log(`railway-sync '${spec.name}' (${existing.id}): unchanged`);
  await updateRailwaySync(client, existing.id, spec);
  console.log(`railway-sync '${spec.name}' (${existing.id}): updated`);
}

(kind === "railway-connection" ? reconcileConnection() : reconcileSync()).catch((err) => {
  console.error(`reconcile ${kind} ${action} failed: ${(err as Error).message}`);
  process.exit(1);
});
