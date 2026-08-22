// Minimal Infisical REST client. Read-mostly; the API bridge layers writes on
// top of `request()`. Secret VALUES are never logged; only keys and metadata
// are surfaced by the typed helpers.
//
// Endpoint shapes were checked against https://infisical.com/docs/api-reference
// on 2026-08-22; see inline notes where the docs were ambiguous.

export interface InfisicalClientOptions {
  host?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export interface InfisicalProject {
  id: string;
  name: string;
  slug: string;
  orgId?: string;
  environments?: { id: string; name: string; slug: string }[];
}

export interface InfisicalSecretMeta {
  id: string;
  secretKey: string;
  secretPath?: string;
  environment?: string;
  /** Present only when the caller explicitly asks for values. */
  secretValue?: string;
}

export interface SecretSync {
  id: string;
  name: string;
  destination: string;
  projectId: string;
  connectionId: string;
  description?: string | null;
  isAutoSyncEnabled: boolean;
  syncStatus?: string | null;
  lastSyncMessage?: string | null;
  lastSyncedAt?: string | null;
  environment?: { id: string; slug: string; name: string } | null;
  folder?: { id: string; path: string } | null;
  connection?: { id: string; name: string; app: string } | null;
  syncOptions?: Record<string, unknown>;
  destinationConfig?: Record<string, unknown>;
}

export interface AppConnection {
  id: string;
  name: string;
  app: string;
  method: string;
  description?: string | null;
  projectId?: string | null;
}

export class InfisicalApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`Infisical API ${status} on ${path}: ${redact(body).slice(0, 400)}`);
  }
}

/** Remove obvious token-like substrings from free text before logging. */
export function redact(text: string): string {
  return text
    .replace(
      /"(secretValue|accessToken|apiToken|clientSecret|token|personal_access_token)"\s*:\s*"[^"]*"/g,
      '"$1":"[redacted]"',
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}

export function defaultHost(): string {
  return (process.env.INFISICAL_HOST ?? "https://app.infisical.com").replace(/\/+$/, "");
}

export function hasCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.INFISICAL_TOKEN ||
      (env.INFISICAL_MACHINE_IDENTITY_ID && env.INFISICAL_AUTH_JWT) ||
      (env.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID && env.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET),
  );
}

export class InfisicalClient {
  readonly host: string;
  private token: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: InfisicalClientOptions = {}) {
    this.host = (opts.host ?? defaultHost()).replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Resolve a bearer token in order: INFISICAL_TOKEN, OIDC login
   * (INFISICAL_AUTH_METHOD=oidc + INFISICAL_MACHINE_IDENTITY_ID + INFISICAL_AUTH_JWT),
   * universal auth (INFISICAL_UNIVERSAL_AUTH_CLIENT_ID/SECRET).
   */
  static async fromEnv(env: NodeJS.ProcessEnv = process.env): Promise<InfisicalClient> {
    const client = new InfisicalClient({ host: env.INFISICAL_HOST ?? defaultHost() });
    await client.authenticate(env);
    return client;
  }

  async authenticate(env: NodeJS.ProcessEnv = process.env): Promise<void> {
    if (this.token) return;
    if (env.INFISICAL_TOKEN) {
      this.token = env.INFISICAL_TOKEN;
      return;
    }
    const orgSlug = env.INFISICAL_ORG_SLUG;
    if (
      (env.INFISICAL_AUTH_METHOD === "oidc" || !env.INFISICAL_AUTH_METHOD) &&
      env.INFISICAL_MACHINE_IDENTITY_ID &&
      env.INFISICAL_AUTH_JWT
    ) {
      // Docs: POST /api/v1/auth/oidc-auth/login {identityId, jwt, organizationSlug?} -> {accessToken}
      const res = await this.request<{ accessToken: string }>(
        "POST",
        "/api/v1/auth/oidc-auth/login",
        {
          body: {
            identityId: env.INFISICAL_MACHINE_IDENTITY_ID,
            jwt: env.INFISICAL_AUTH_JWT,
            ...(orgSlug ? { organizationSlug: orgSlug } : {}),
          },
          auth: false,
        },
      );
      this.token = res.accessToken;
      return;
    }
    if (env.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID && env.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET) {
      // Docs: POST /api/v1/auth/universal-auth/login {clientId, clientSecret} -> {accessToken}
      const res = await this.request<{ accessToken: string }>(
        "POST",
        "/api/v1/auth/universal-auth/login",
        {
          body: {
            clientId: env.INFISICAL_UNIVERSAL_AUTH_CLIENT_ID,
            clientSecret: env.INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET,
            ...(orgSlug ? { organizationSlug: orgSlug } : {}),
          },
          auth: false,
        },
      );
      this.token = res.accessToken;
      return;
    }
    throw new Error(
      "no Infisical credentials: set INFISICAL_TOKEN, or INFISICAL_MACHINE_IDENTITY_ID + INFISICAL_AUTH_JWT (OIDC), or INFISICAL_UNIVERSAL_AUTH_CLIENT_ID/SECRET",
    );
  }

  /** Generic JSON request. Throws InfisicalApiError on non-2xx. */
  async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    path: string,
    opts: { query?: Record<string, string | undefined>; body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const url = new URL(this.host + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
    const headers: Record<string, string> = { Accept: "application/json" };
    if (opts.auth !== false) {
      if (!this.token) throw new Error("Infisical client is not authenticated");
      headers.Authorization = `Bearer ${this.token}`;
    }
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    const res = await this.fetchImpl(url, init);
    const text = await res.text();
    if (!res.ok) throw new InfisicalApiError(res.status, path, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  /**
   * Project lookup by slug. The documented path has moved between versions
   * (v1 /projects/slug/:slug on current docs; /api/v2/workspace/slug/:slug on
   * older deployments), so both are tried. Uncertainty noted.
   */
  async getProjectBySlug(slug: string): Promise<InfisicalProject> {
    const candidates = [
      `/api/v1/projects/slug/${encodeURIComponent(slug)}`,
      `/api/v2/workspace/slug/${encodeURIComponent(slug)}`,
    ];
    let lastErr: unknown;
    for (const path of candidates) {
      try {
        const res = await this.request<
          InfisicalProject | { project?: InfisicalProject; workspace?: InfisicalProject }
        >("GET", path);
        const p =
          (res as { project?: InfisicalProject }).project ??
          (res as { workspace?: InfisicalProject }).workspace ??
          (res as InfisicalProject);
        if (p?.id) return p;
      } catch (err) {
        lastErr = err;
        if (!(err instanceof InfisicalApiError && err.status === 404)) throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`project '${slug}' not found`);
  }

  /**
   * List secrets at one path. GET /api/v3/secrets/raw with workspaceId or
   * workspaceSlug + environment + secretPath. Values are returned by the API;
   * callers must only compare them and never print them.
   */
  async listSecrets(
    project: { id?: string; slug?: string },
    environment: string,
    secretPath: string,
  ): Promise<InfisicalSecretMeta[]> {
    const res = await this.request<{ secrets: InfisicalSecretMeta[] }>(
      "GET",
      "/api/v3/secrets/raw",
      {
        query: {
          workspaceId: project.id,
          workspaceSlug: project.id ? undefined : project.slug,
          environment,
          secretPath,
          viewSecretValue: "true",
          includeImports: "false",
          recursive: "false",
        },
      },
    );
    return res.secrets ?? [];
  }

  /** GET /api/v1/secret-syncs?projectId= -> { secretSyncs: [...] } */
  async listSecretSyncs(projectId: string): Promise<SecretSync[]> {
    const res = await this.request<{ secretSyncs: SecretSync[] }>("GET", "/api/v1/secret-syncs", {
      query: { projectId },
    });
    return res.secretSyncs ?? [];
  }

  /** GET /api/v1/secret-syncs/:destination/:id -> { secretSync } */
  async getSecretSync(destination: string, id: string): Promise<SecretSync> {
    const res = await this.request<{ secretSync: SecretSync }>(
      "GET",
      `/api/v1/secret-syncs/${destination}/${id}`,
    );
    return res.secretSync;
  }

  /** GET /api/v1/app-connections[/:app] -> { appConnections: [...] } */
  async listAppConnections(app?: string): Promise<AppConnection[]> {
    const path = app ? `/api/v1/app-connections/${app}` : "/api/v1/app-connections";
    const res = await this.request<{ appConnections: AppConnection[] }>("GET", path);
    return res.appConnections ?? [];
  }
}
