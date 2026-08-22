// Repository layout helpers: repo root discovery, project enumeration, root-spec
// parsing, and the R2 state bucket/key conventions shared by every command.
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const GLOBAL_STATE_BUCKET = "bearfire-infisical-global-state";
export const PROJECT_STATE_BUCKET = "bearfire-infisical-project-state";
export const BACKUP_STATE_BUCKET = "bearfire-infisical-state-backups";

export type RootKind = "bootstrap" | "global" | "project";
export type StateClass = "global" | "project";

export interface RootSpec {
  kind: RootKind;
  /** Project slug; only set for kind === "project". */
  slug?: string;
}

/** Walk upwards from `start` until a package.json is found. */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "projects"))) return dir;
    if (existsSync(join(dir, "package.json")) && !existsSync(join(dirname(dir), "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error("repository root not found (no package.json above cwd)");
    dir = parent;
  }
}

/** Slugs of every project root under projects/ (excluding _template). */
export function listProjectSlugs(repoRoot: string = findRepoRoot()): string[] {
  const dir = join(repoRoot, "projects");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => !name.startsWith("_") && !name.startsWith("."))
    .filter((name) => statSync(join(dir, name)).isDirectory())
    .filter((name) => existsSync(join(dir, name, "project.yaml")))
    .sort();
}

export function projectDir(repoRoot: string, slug: string): string {
  return join(repoRoot, "projects", slug);
}

export function projectConfigPath(repoRoot: string, slug: string): string {
  return join(projectDir(repoRoot, slug), "project.yaml");
}

/** Parse a root spec string: bootstrap | global | project:<slug> | projects/<slug>. */
export function parseRootSpec(spec: string): RootSpec {
  if (spec === "bootstrap") return { kind: "bootstrap" };
  if (spec === "global") return { kind: "global" };
  if (spec.startsWith("project:")) return { kind: "project", slug: spec.slice("project:".length) };
  if (spec.startsWith("projects/")) {
    return { kind: "project", slug: spec.slice("projects/".length).replace(/\/+$/, "") };
  }
  throw new Error(`unknown root spec '${spec}' (expected bootstrap | global | project:<slug>)`);
}

export function formatRootSpec(root: RootSpec): string {
  return root.kind === "project" ? `project:${root.slug}` : root.kind;
}

/** Short display name used in CI matrices: "global", "bootstrap", or the slug. */
export function rootName(root: RootSpec): string {
  return root.kind === "project" ? (root.slug ?? "") : root.kind;
}

export function rootDir(repoRoot: string, root: RootSpec): string {
  switch (root.kind) {
    case "bootstrap":
      return join(repoRoot, "bootstrap", "terraform");
    case "global":
      return join(repoRoot, "global");
    case "project":
      return projectDir(repoRoot, root.slug ?? "");
  }
}

export function stateClass(root: RootSpec): StateClass {
  return root.kind === "project" ? "project" : "global";
}

export function stateBucket(root: RootSpec): string {
  return root.kind === "project" ? PROJECT_STATE_BUCKET : GLOBAL_STATE_BUCKET;
}

export function stateKey(root: RootSpec): string {
  switch (root.kind) {
    case "bootstrap":
      return "bootstrap/terraform.tfstate";
    case "global":
      return "global/terraform.tfstate";
    case "project":
      return `projects/${root.slug}/terraform.tfstate`;
  }
}

export interface RootSelection {
  roots: RootSpec[];
  /** Positional args that were not consumed as root selectors. */
  rest: string[];
}

/**
 * Resolve root selection flags shared by several commands:
 *   --global | --bootstrap | --project <slug> | --all | <root-spec> | <slug>
 * `--all` expands to global + every project (bootstrap only when includeBootstrapInAll).
 */
export function selectRoots(
  args: string[],
  opts: { repoRoot?: string; includeBootstrapInAll?: boolean; allowBareSlug?: boolean } = {},
): RootSelection {
  const repoRoot = opts.repoRoot ?? findRepoRoot();
  const roots: RootSpec[] = [];
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? "";
    if (a === "--global") roots.push({ kind: "global" });
    else if (a === "--bootstrap") roots.push({ kind: "bootstrap" });
    else if (a === "--project") {
      const slug = args[++i];
      if (!slug) throw new Error("--project requires a slug");
      roots.push({ kind: "project", slug });
    } else if (a.startsWith("--project=")) {
      roots.push({ kind: "project", slug: a.slice("--project=".length) });
    } else if (a === "--all") {
      if (opts.includeBootstrapInAll) roots.push({ kind: "bootstrap" });
      roots.push({ kind: "global" });
      for (const slug of listProjectSlugs(repoRoot)) roots.push({ kind: "project", slug });
    } else if (
      a === "bootstrap" ||
      a === "global" ||
      a.startsWith("project:") ||
      a.startsWith("projects/")
    ) {
      roots.push(parseRootSpec(a));
    } else if (
      opts.allowBareSlug &&
      !a.startsWith("-") &&
      existsSync(projectConfigPath(repoRoot, a))
    ) {
      roots.push({ kind: "project", slug: a });
    } else {
      rest.push(a);
    }
  }
  // Deduplicate while preserving order.
  const seen = new Set<string>();
  const unique = roots.filter((r) => {
    const k = formatRootSpec(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { roots: unique, rest };
}

/** Deterministic ordering: bootstrap, then global, then projects alphabetically. */
export function sortRoots(roots: RootSpec[]): RootSpec[] {
  const rank = (r: RootSpec) => (r.kind === "bootstrap" ? 0 : r.kind === "global" ? 1 : 2);
  return [...roots].sort((a, b) => rank(a) - rank(b) || (a.slug ?? "").localeCompare(b.slug ?? ""));
}
