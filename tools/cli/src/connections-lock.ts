// `pnpm connections:lock` (write) / `pnpm connections:check` (check)
// Maintains global/connections.lock.json: non-secret App Connection and
// identity IDs consumed by project roots. No credentials are ever included.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRailwayConnectionByName } from "../../infisical-api-bridge/src/railway-connection.js";
import { type ConnectionsLock, renderConnectionsLock } from "./lib/connections-lock-format.js";
import { hasCredentials, InfisicalClient } from "./lib/infisical.js";
import { die, fail, ok, warn } from "./lib/output.js";
import { findRepoRoot } from "./lib/repo.js";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const repoRoot = findRepoRoot();
const lockPath = join(repoRoot, "global", "connections.lock.json");
const mode = process.argv[2];
const offline = process.argv.includes("--offline");

function readLock(): ConnectionsLock {
  return JSON.parse(readFileSync(lockPath, "utf8")) as ConnectionsLock;
}

async function write(): Promise<void> {
  const existing = readLock();
  const raw = execFileSync("terraform", ["-chdir=global", "output", "-json", "connections_lock"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}`,
      // The global root's S3 backend needs the sensitive-state credential class.
      // Mirrors scripts/_lib.sh export_backend_credentials so this works in the
      // apply job, where only TF_GLOBAL_R2_* are exported.
      AWS_ACCESS_KEY_ID:
        process.env.TF_GLOBAL_R2_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? "",
      AWS_SECRET_ACCESS_KEY:
        process.env.TF_GLOBAL_R2_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  });
  const next = JSON.parse(raw) as ConnectionsLock;

  let railwayId = existing.railway?.id ?? ZERO_UUID;
  if (hasCredentials()) {
    try {
      const client = await InfisicalClient.fromEnv();
      const conn = await findRailwayConnectionByName(client, next.railway.name);
      if (conn) railwayId = conn.id;
      else warn(`Railway connection '${next.railway.name}' not found; keeping existing id`);
    } catch (err) {
      warn(
        `could not resolve Railway connection id (${(err as Error).message}); keeping existing id`,
      );
    }
  } else warn("no Infisical credentials; keeping existing Railway connection id");
  next.railway = { id: railwayId, name: next.railway.name };
  const { status: _status, ...rest } = next;
  writeFileSync(lockPath, renderConnectionsLock(rest as ConnectionsLock));
  ok(
    `wrote global/connections.lock.json (railway id ${railwayId === ZERO_UUID ? "UNRESOLVED" : "resolved"})`,
  );
}

async function check(): Promise<void> {
  let failures = 0;
  let lock: ConnectionsLock;
  try {
    lock = readLock();
  } catch (err) {
    die(`cannot parse connections.lock.json: ${(err as Error).message}`);
  }
  const refs: [string, string][] = [
    ["organization", lock.organization?.id],
    ["identities.plan", lock.identities?.plan?.id],
    ["identities.apply", lock.identities?.apply?.id],
    ["github", lock.github?.id],
    ["cloudflare", lock.cloudflare?.id],
    ["railway", lock.railway?.id],
  ];
  if (lock.status === "unbootstrapped") {
    warn("lock is marked unbootstrapped; zero UUIDs are tolerated");
  } else {
    for (const [label, id] of refs) {
      if (!id || id === ZERO_UUID) {
        fail(`${label}: unresolved id`);
        failures++;
      } else ok(`${label}: ${id}`);
    }
  }
  if (!offline && hasCredentials() && lock.status !== "unbootstrapped") {
    const client = await InfisicalClient.fromEnv();
    const live = new Map((await client.listAppConnections()).map((c) => [c.id, c]));
    for (const key of ["github", "cloudflare", "railway"] as const) {
      const ref = lock[key];
      const conn = live.get(ref.id);
      if (!conn) {
        fail(`${key}: connection ${ref.id} no longer exists in Infisical`);
        failures++;
      } else if (conn.name !== ref.name) {
        fail(`${key}: connection ${ref.id} is named '${conn.name}', lock says '${ref.name}'`);
        failures++;
      } else ok(`${key}: connection '${conn.name}' exists`);
    }
  } else if (offline) warn("offline mode: skipped live App Connection existence check");
  else if (!hasCredentials()) warn("no Infisical credentials; skipped live existence check");
  if (failures) process.exit(1);
}

if (mode === "write") write().catch((err) => die((err as Error).message));
else if (mode === "check") check().catch((err) => die((err as Error).message));
else die("usage: connections-lock.ts <write|check>");
