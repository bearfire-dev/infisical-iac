// Railway App Connection operations (no native Terraform resource in the pinned
// provider). The Railway token comes only from RAILWAY_API_TOKEN and is never
// logged or returned.
//
// Endpoints (docs checked 2026-08-22):
//   GET    /api/v1/app-connections/railway          -> { appConnections: [...] }
//   POST   /api/v1/app-connections/railway          { name, description, method, credentials:{apiToken} }
//   PATCH  /api/v1/app-connections/railway/:id      same fields, all optional
//   DELETE /api/v1/app-connections/railway/:id
// Note: the documented `method` enum is account-token | project-token | team-token.
// The Terraform input says "api-token" for readability; it is mapped to
// account-token here (override with RAILWAY_CONNECTION_METHOD if needed).
import type { AppConnection, InfisicalClient } from "../../cli/src/lib/infisical.js";

export interface RailwayConnectionSpec {
  name: string;
  description?: string | null;
  method?: string;
  /** Optional project scoping for project-level connections (newer API). */
  projectId?: string;
}

const BASE = "/api/v1/app-connections/railway";

export function resolveMethod(
  method: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.RAILWAY_CONNECTION_METHOD) return env.RAILWAY_CONNECTION_METHOD;
  if (!method || method === "api-token") return "account-token";
  return method;
}

export function railwayToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.RAILWAY_API_TOKEN;
  if (!token) throw new Error("RAILWAY_API_TOKEN is required to manage the Railway App Connection");
  return token;
}

export async function findRailwayConnectionByName(
  client: InfisicalClient,
  name: string,
): Promise<AppConnection | undefined> {
  const res = await client.request<{ appConnections: AppConnection[] }>("GET", BASE);
  return (res.appConnections ?? []).find((c) => c.name === name);
}

export async function createRailwayConnection(
  client: InfisicalClient,
  spec: RailwayConnectionSpec,
  apiToken: string,
): Promise<AppConnection> {
  const res = await client.request<{ appConnection: AppConnection }>("POST", BASE, {
    body: {
      name: spec.name,
      description: spec.description ?? undefined,
      method: resolveMethod(spec.method),
      credentials: { apiToken },
      ...(spec.projectId ? { projectId: spec.projectId } : {}),
    },
  });
  return res.appConnection;
}

export async function updateRailwayConnection(
  client: InfisicalClient,
  id: string,
  patch: { name?: string; description?: string | null; apiToken?: string; method?: string },
): Promise<AppConnection> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.apiToken !== undefined) {
    body.credentials = { apiToken: patch.apiToken };
    body.method = resolveMethod(patch.method);
  }
  const res = await client.request<{ appConnection: AppConnection }>("PATCH", `${BASE}/${id}`, {
    body,
  });
  return res.appConnection;
}

export async function deleteRailwayConnection(client: InfisicalClient, id: string): Promise<void> {
  await client.request("DELETE", `${BASE}/${id}`);
}
