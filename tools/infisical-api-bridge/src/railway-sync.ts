// Railway Secret Sync operations, keyed by stable sync name within a project.
//
// Endpoints (docs checked 2026-08-22):
//   GET    /api/v1/secret-syncs/railway?projectId=  -> { secretSyncs: [...] }
//   POST   /api/v1/secret-syncs/railway             { name, projectId, environment, secretPath,
//            connectionId, isAutoSyncEnabled, syncOptions, destinationConfig, description }
//   PATCH  /api/v1/secret-syncs/railway/:id
//   DELETE /api/v1/secret-syncs/railway/:id
// Note: the API field is `isAutoSyncEnabled`; the Terraform bridge input uses
// `autoSyncEnabled` and is mapped here. destinationConfig.projectName and
// environmentName are documented as required on create: when the declaration
// omits them, the IDs are reused as display names.
import type { InfisicalClient, SecretSync } from "../../cli/src/lib/infisical.js";

export interface RailwaySyncSpec {
  name: string;
  description?: string | null;
  projectId: string;
  environment: string;
  secretPath: string;
  connectionId: string;
  autoSyncEnabled: boolean;
  syncOptions: {
    initialSyncBehavior: string;
    disableSecretDeletion: boolean;
    keySchema?: string | null;
  };
  destinationConfig: {
    projectId: string;
    projectName?: string | null;
    environmentId: string;
    environmentName?: string | null;
    serviceId?: string | null;
    serviceName?: string | null;
  };
}

const BASE = "/api/v1/secret-syncs/railway";

/** Request body shared by create and update (all non-secret). */
export function toApiBody(spec: RailwaySyncSpec): Record<string, unknown> {
  const dest = spec.destinationConfig;
  return {
    name: spec.name,
    description: spec.description ?? undefined,
    connectionId: spec.connectionId,
    environment: spec.environment,
    secretPath: spec.secretPath,
    isAutoSyncEnabled: spec.autoSyncEnabled,
    syncOptions: {
      initialSyncBehavior: spec.syncOptions.initialSyncBehavior,
      disableSecretDeletion: spec.syncOptions.disableSecretDeletion,
      ...(spec.syncOptions.keySchema ? { keySchema: spec.syncOptions.keySchema } : {}),
    },
    destinationConfig: {
      projectId: dest.projectId,
      projectName: dest.projectName ?? dest.projectId,
      environmentId: dest.environmentId,
      environmentName: dest.environmentName ?? dest.environmentId,
      ...(dest.serviceId
        ? { serviceId: dest.serviceId, serviceName: dest.serviceName ?? dest.serviceId }
        : {}),
    },
  };
}

/** True when the remote sync already matches the desired non-secret config. */
export function syncMatches(spec: RailwaySyncSpec, remote: SecretSync): boolean {
  const want = toApiBody(spec);
  const wantOpts = want.syncOptions as Record<string, unknown>;
  const wantDest = want.destinationConfig as Record<string, unknown>;
  const opts = remote.syncOptions ?? {};
  const dest = remote.destinationConfig ?? {};
  const eq = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  return (
    remote.connectionId === spec.connectionId &&
    remote.environment?.slug === spec.environment &&
    remote.folder?.path === spec.secretPath &&
    remote.isAutoSyncEnabled === spec.autoSyncEnabled &&
    eq(remote.description, want.description ?? null) &&
    Object.entries(wantOpts).every(([k, v]) => eq(opts[k], v)) &&
    Object.entries(wantDest).every(([k, v]) => eq(dest[k], v))
  );
}

export async function findRailwaySyncByName(
  client: InfisicalClient,
  projectId: string,
  name: string,
): Promise<SecretSync | undefined> {
  const res = await client.request<{ secretSyncs: SecretSync[] }>("GET", BASE, {
    query: { projectId },
  });
  return (res.secretSyncs ?? []).find((s) => s.name === name);
}

export async function createRailwaySync(
  client: InfisicalClient,
  spec: RailwaySyncSpec,
): Promise<SecretSync> {
  const res = await client.request<{ secretSync: SecretSync }>("POST", BASE, {
    body: { ...toApiBody(spec), projectId: spec.projectId },
  });
  return res.secretSync;
}

export async function updateRailwaySync(
  client: InfisicalClient,
  id: string,
  spec: RailwaySyncSpec,
): Promise<SecretSync> {
  const res = await client.request<{ secretSync: SecretSync }>("PATCH", `${BASE}/${id}`, {
    body: toApiBody(spec),
  });
  return res.secretSync;
}

export async function deleteRailwaySync(client: InfisicalClient, id: string): Promise<void> {
  await client.request("DELETE", `${BASE}/${id}`);
}
