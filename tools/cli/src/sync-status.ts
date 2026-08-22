// `pnpm sync:status [<slug>] [--all]` — compare declared syncs with the live
// Infisical Secret Syncs (existence, source, auto-sync, last status, connection).
import { requireProjectConfig, type SyncDecl } from "./lib/config.js";
import { InfisicalClient, type SecretSync } from "./lib/infisical.js";
import { die, fail, ok, warn } from "./lib/output.js";
import { findRepoRoot, listProjectSlugs, projectConfigPath } from "./lib/repo.js";

const args = process.argv.slice(2);
const repoRoot = findRepoRoot();
const all = args.includes("--all");
const slugArg = args.find((a) => !a.startsWith("--"));
const slugs = all ? listProjectSlugs(repoRoot) : slugArg ? [slugArg] : [];
if (!slugs.length) die("usage: sync:status <slug> | --all");

/** Pure comparison of a declared sync against the remote object. */
export function compareSync(
  declared: SyncDecl & { name: string; secretPath: string },
  remote: SecretSync | undefined,
  connectionIds: Set<string>,
): { okLines: string[]; failLines: string[] } {
  const okLines: string[] = [];
  const failLines: string[] = [];
  if (!remote) return { okLines, failLines: ["not found in Infisical (apply pending?)"] };
  okLines.push(`exists (id ${remote.id})`);

  const remoteEnv = remote.environment?.slug;
  const remotePath = remote.folder?.path;
  if (remoteEnv === declared.source.environment && remotePath === declared.secretPath) {
    okLines.push(`source ${remoteEnv}${remotePath}`);
  } else
    failLines.push(
      `source mismatch: remote ${remoteEnv ?? "?"}${remotePath ?? "?"}, declared ${declared.source.environment}${declared.secretPath}`,
    );

  const wantAuto = declared.auto_sync ?? true;
  if (remote.isAutoSyncEnabled === wantAuto)
    okLines.push(`auto-sync ${wantAuto ? "enabled" : "disabled"}`);
  else failLines.push(`auto-sync is ${remote.isAutoSyncEnabled} (declared ${wantAuto})`);

  const status = remote.syncStatus ?? "never";
  if (status === "succeeded")
    okLines.push(`last sync succeeded${remote.lastSyncedAt ? ` at ${remote.lastSyncedAt}` : ""}`);
  else if (status === "pending" || status === "running") okLines.push(`last sync ${status}`);
  else
    failLines.push(
      `last sync ${status}${remote.lastSyncMessage ? `: ${remote.lastSyncMessage}` : ""}`,
    );

  if (remote.connectionId && connectionIds.has(remote.connectionId))
    okLines.push(`connection ${remote.connection?.name ?? remote.connectionId}`);
  else failLines.push(`connection ${remote.connectionId ?? "?"} not found`);
  return { okLines, failLines };
}

async function main(): Promise<void> {
  const client = await InfisicalClient.fromEnv();
  const connectionIds = new Set((await client.listAppConnections()).map((c) => c.id));
  let failures = 0;

  for (const slug of slugs) {
    const config = requireProjectConfig(projectConfigPath(repoRoot, slug), repoRoot);
    const declared = Object.entries(config.syncs ?? {});
    if (!declared.length) {
      warn(`${slug}: no syncs declared`);
      continue;
    }
    const project = await client.getProjectBySlug(config.project.slug);
    const remote = await client.listSecretSyncs(project.id);

    for (const [name, sync] of declared) {
      const set = config.secret_sets[sync.source.secret_set];
      const match = remote.find((r) => r.name === name);
      const { okLines, failLines } = compareSync(
        { ...sync, name, secretPath: set?.path ?? "" },
        match,
        connectionIds,
      );
      console.log(`\n${slug} / ${name} (${sync.type})`);
      for (const l of okLines) ok(l);
      for (const l of failLines) fail(l);
      failures += failLines.length;
    }
  }
  console.log("");
  if (failures) {
    console.log(`FAILED: ${failures} sync problem(s).`);
    process.exit(1);
  }
  console.log("OK");
}

main().catch((err) => die((err as Error).message));
