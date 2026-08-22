// project.yaml loading, JSON-schema validation (draft 2020-12), and the
// cross-reference checks the schema cannot express. Also exposes the slot
// expansion helper mirroring modules/infisical-project/locals.tf.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse as parseYaml } from "yaml";
import { findRepoRoot } from "./repo.js";

export type SyncType = "github" | "cloudflare-workers" | "railway";
export type ConnectionName = "github" | "cloudflare" | "railway";

export interface SecretDecl {
  required_in: string[];
  comment?: string;
  reminder_days?: number;
  tags?: string[];
  placeholder_version?: number;
}

export interface SecretSetDecl {
  path: string;
  description?: string;
  secrets: Record<string, SecretDecl>;
}

export interface SyncDecl {
  type: SyncType;
  description?: string;
  source: { environment: string; secret_set: string };
  connection: ConnectionName;
  destination: Record<string, unknown>;
  auto_sync?: boolean;
  manage_deletions?: boolean;
  initial_sync_behavior?:
    | "overwrite-destination"
    | "import-prioritize-source"
    | "import-prioritize-destination";
  key_schema?: string;
}

export interface IdentityDecl {
  description?: string;
  role: "viewer" | "member" | "admin" | "no-access";
  oidc?: Record<string, unknown>;
}

export interface ProjectConfig {
  schema_version: 1;
  project: {
    name: string;
    slug: string;
    description?: string;
    delete_protection?: boolean;
    audit_log_retention_days?: number;
  };
  environments: Record<string, { name: string; position: number }>;
  secret_sets: Record<string, SecretSetDecl>;
  identities?: Record<string, IdentityDecl>;
  syncs?: Record<string, SyncDecl>;
}

export interface SecretSlot {
  /** "<env>:<path>:<NAME>" — identical to the Terraform for_each key. */
  key: string;
  name: string;
  environment: string;
  path: string;
  secretSet: string;
  placeholderVersion: number;
}

/** Mirror of local.secret_slots in modules/infisical-project/locals.tf. */
export function expandSlots(config: ProjectConfig): SecretSlot[] {
  const slots: SecretSlot[] = [];
  for (const [setKey, set] of Object.entries(config.secret_sets)) {
    for (const [name, secret] of Object.entries(set.secrets ?? {})) {
      for (const env of secret.required_in) {
        slots.push({
          key: `${env}:${set.path}:${name}`,
          name,
          environment: env,
          path: set.path,
          secretSet: setKey,
          placeholderVersion: secret.placeholder_version ?? 1,
        });
      }
    }
  }
  return slots;
}

export const SYNC_CONNECTION: Record<SyncType, ConnectionName> = {
  github: "github",
  "cloudflare-workers": "cloudflare",
  railway: "railway",
};

let validator: ValidateFunction | undefined;

export function loadSchema(repoRoot: string = findRepoRoot()): Record<string, unknown> {
  const raw = readFileSync(join(repoRoot, "schemas", "project.schema.json"), "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function getValidator(repoRoot?: string): ValidateFunction {
  if (validator) return validator;
  const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats.default(ajv);
  validator = ajv.compile(loadSchema(repoRoot));
  return validator;
}

function formatAjvError(e: ErrorObject): string {
  const where = e.instancePath || "/";
  const extra =
    e.keyword === "additionalProperties"
      ? ` (${String((e.params as { additionalProperty?: string }).additionalProperty)})`
      : "";
  return `${where}: ${e.message ?? e.keyword}${extra}`;
}

/** Cross-reference checks the JSON schema cannot express. Pure; returns messages. */
export function crossChecks(config: ProjectConfig): string[] {
  const errors: string[] = [];
  const envs = new Set(Object.keys(config.environments ?? {}));
  const sets = config.secret_sets ?? {};

  const paths = new Map<string, string>();
  for (const [setKey, set] of Object.entries(sets)) {
    const prev = paths.get(set.path);
    if (prev) errors.push(`secret_sets/${setKey}: path ${set.path} already used by set '${prev}'`);
    else paths.set(set.path, setKey);
    for (const [name, secret] of Object.entries(set.secrets ?? {})) {
      for (const env of secret.required_in ?? []) {
        if (!envs.has(env)) {
          errors.push(
            `secret_sets/${setKey}/secrets/${name}: required_in references undeclared environment '${env}'`,
          );
        }
      }
    }
  }

  for (const [syncKey, sync] of Object.entries(config.syncs ?? {})) {
    if (!envs.has(sync.source.environment)) {
      errors.push(
        `syncs/${syncKey}: source.environment '${sync.source.environment}' is not declared`,
      );
    }
    if (!(sync.source.secret_set in sets)) {
      errors.push(
        `syncs/${syncKey}: source.secret_set '${sync.source.secret_set}' is not declared`,
      );
    }
    const expected = SYNC_CONNECTION[sync.type];
    if (expected && sync.connection !== expected) {
      errors.push(
        `syncs/${syncKey}: type '${sync.type}' requires connection '${expected}', got '${sync.connection}'`,
      );
    }
  }

  return errors;
}

export interface ValidationResult {
  config: ProjectConfig | null;
  errors: string[];
}

/** Validate an already-parsed document (schema + cross checks). */
export function validateConfigObject(doc: unknown, repoRoot?: string): ValidationResult {
  const validate = getValidator(repoRoot);
  if (!validate(doc)) {
    return { config: null, errors: (validate.errors ?? []).map(formatAjvError) };
  }
  const config = doc as ProjectConfig;
  const errors = crossChecks(config);
  return { config: errors.length ? null : config, errors };
}

export function parseProjectYaml(text: string): unknown {
  return parseYaml(text);
}

/** Load and validate projects/<slug>/project.yaml (or an explicit file path). */
export function loadProjectConfig(file: string, repoRoot?: string): ValidationResult {
  let doc: unknown;
  try {
    doc = parseProjectYaml(readFileSync(file, "utf8"));
  } catch (err) {
    return { config: null, errors: [`cannot parse ${file}: ${(err as Error).message}`] };
  }
  return validateConfigObject(doc, repoRoot);
}

/** Load without failing: returns the config or throws a descriptive error. */
export function requireProjectConfig(file: string, repoRoot?: string): ProjectConfig {
  const result = loadProjectConfig(file, repoRoot);
  if (!result.config) throw new Error(`${file} is invalid:\n  ${result.errors.join("\n  ")}`);
  return result.config;
}
