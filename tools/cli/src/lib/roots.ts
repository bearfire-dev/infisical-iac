// Pure mapping from changed file paths to the Terraform roots that must be
// planned/applied. Used by changed-roots.ts and unit tests.
import { formatRootSpec, type RootSpec, rootName, sortRoots } from "./repo.js";

export interface ChangedRoots {
  bootstrap: boolean;
  global: boolean;
  projects: string[];
  matrix: { root: string; spec: string }[];
}

/** Paths that never affect any Terraform root. */
function isDocOnly(path: string): boolean {
  return (
    path.startsWith("docs/") ||
    path.startsWith(".github/") ||
    path === "LICENSE" ||
    path.endsWith(".md") ||
    path === ".editorconfig" ||
    path === ".gitignore" ||
    path === ".nvmrc"
  );
}

/** Paths that affect every project root (shared module/tooling). */
function isShared(path: string): boolean {
  return (
    path.startsWith("modules/") ||
    path.startsWith("schemas/") ||
    path.startsWith("tools/") ||
    path.startsWith("scripts/") ||
    path === "package.json" ||
    path === "pnpm-lock.yaml"
  );
}

export function computeChangedRoots(changed: string[], allProjects: string[]): ChangedRoots {
  let bootstrap = false;
  let global = false;
  const projects = new Set<string>();
  let shared = false;

  for (const raw of changed) {
    const path = raw.replace(/^\.\//, "");
    if (isDocOnly(path)) continue;
    if (path.startsWith("projects/")) {
      const slug = path.split("/")[1];
      if (slug && slug !== "_template" && allProjects.includes(slug)) projects.add(slug);
      continue;
    }
    if (path.startsWith("global/")) {
      global = true;
      continue;
    }
    if (path.startsWith("bootstrap/")) {
      bootstrap = true;
      continue;
    }
    if (isShared(path)) shared = true;
  }
  if (shared) for (const slug of allProjects) projects.add(slug);

  return build(bootstrap, global, [...projects]);
}

export function allRoots(allProjects: string[]): ChangedRoots {
  return build(true, true, allProjects);
}

function build(bootstrap: boolean, global: boolean, projects: string[]): ChangedRoots {
  const roots: RootSpec[] = [];
  if (bootstrap) roots.push({ kind: "bootstrap" });
  if (global) roots.push({ kind: "global" });
  for (const slug of projects) roots.push({ kind: "project", slug });
  const sorted = sortRoots(roots);
  return {
    bootstrap,
    global,
    projects: sorted.filter((r) => r.kind === "project").map((r) => r.slug ?? ""),
    // Bootstrap is reported but excluded from the matrix: workflows apply it only on explicit dispatch.
    matrix: sorted
      .filter((r) => r.kind !== "bootstrap")
      .map((r) => ({ root: rootName(r), spec: formatRootSpec(r) })),
  };
}
