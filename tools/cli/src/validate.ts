// `pnpm validate [--project <slug>]` — schema + cross checks for every project,
// forbidden placeholder_version increments, secret-like literals in tracked
// files, and connections.lock.json shape.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  expandSlots,
  loadProjectConfig,
  type ProjectConfig,
  parseProjectYaml,
} from "./lib/config.js";
import { fileAtRef, refExists, resolveRange, trackedFiles } from "./lib/git.js";
import { annotateError, fail, heading, ok, warn } from "./lib/output.js";
import { findRepoRoot, listProjectSlugs, projectConfigPath } from "./lib/repo.js";
import { scanText, shouldScan } from "./lib/secret-scan.js";

const args = process.argv.slice(2);
const repoRoot = findRepoRoot();
const projectIdx = args.indexOf("--project");
const only = projectIdx >= 0 ? args[projectIdx + 1] : undefined;
if (projectIdx >= 0 && !only) {
  annotateError("--project requires a slug");
  process.exit(2);
}

let failures = 0;
let warnings = 0;
const report = (okay: boolean, msg: string, file?: string) => {
  if (okay) ok(msg);
  else {
    fail(msg);
    annotateError(msg, file);
    failures++;
  }
};

// 1. Project configs ---------------------------------------------------------
const slugs = only ? [only] : listProjectSlugs(repoRoot);
heading("Project configuration");
const configs = new Map<string, ProjectConfig>();
for (const slug of slugs) {
  const file = projectConfigPath(repoRoot, slug);
  const rel = relative(repoRoot, file);
  if (!existsSync(file)) {
    report(false, `${rel}: not found`, rel);
    continue;
  }
  const { config, errors } = loadProjectConfig(file, repoRoot);
  if (!config) {
    report(false, `${rel}: ${errors.length} error(s)`, rel);
    for (const e of errors) console.log(`    - ${e}`);
    continue;
  }
  if (config.project.slug !== slug) {
    report(
      false,
      `${rel}: project.slug '${config.project.slug}' must equal directory name '${slug}'`,
      rel,
    );
    continue;
  }
  configs.set(slug, config);
  report(true, `${rel}: valid (${expandSlots(config).length} secret objects)`);
}

// 2. placeholder_version increments ------------------------------------------
heading("Placeholder version guard");
const range = resolveRange();
if (!refExists(range.base, repoRoot)) {
  warn(`base ref '${range.base}' not found; skipping placeholder_version diff`);
  warnings++;
} else if (process.env.ALLOW_PLACEHOLDER_RESET === "1") {
  warn("ALLOW_PLACEHOLDER_RESET=1: placeholder_version increments are permitted in this run");
  warnings++;
} else {
  let bumps = 0;
  for (const [slug, config] of configs) {
    const rel = `projects/${slug}/project.yaml`;
    const baseText = fileAtRef(repoRoot, range.base, rel);
    if (baseText === null) continue;
    let baseConfig: ProjectConfig;
    try {
      baseConfig = parseProjectYaml(baseText) as ProjectConfig;
    } catch {
      continue;
    }
    const baseVersions = new Map(expandSlots(baseConfig).map((s) => [s.key, s.placeholderVersion]));
    for (const slot of expandSlots(config)) {
      const before = baseVersions.get(slot.key);
      if (before !== undefined && slot.placeholderVersion !== before) {
        report(
          false,
          `${rel}: placeholder_version for ${slot.key} changed ${before} -> ${slot.placeholderVersion} (overwrites the live value; set ALLOW_PLACEHOLDER_RESET=1 only for an approved reset)`,
          rel,
        );
        bumps++;
      }
    }
  }
  if (!bumps) ok(`no placeholder_version changes against ${range.base}`);
}

// 3. Secret-like literals ----------------------------------------------------
heading("Secret literal scan");
const files = trackedFiles(repoRoot)
  .filter(shouldScan)
  .filter((f) => existsSync(join(repoRoot, f)));
let findings = 0;
for (const file of files) {
  const text = readFileSync(join(repoRoot, file), "utf8");
  for (const f of scanText(text)) {
    findings++;
    fail(`${file}:${f.line}: ${f.rule} (${f.excerpt})`);
    annotateError(`possible secret literal (${f.rule})`, file, f.line);
  }
}
if (findings) failures += findings;
else ok(`no secret-like literals in ${files.length} file(s)`);

// 4. connections.lock.json ---------------------------------------------------
heading("connections.lock.json");
const lockPath = join(repoRoot, "global", "connections.lock.json");
try {
  const lock = JSON.parse(readFileSync(lockPath, "utf8")) as Record<string, unknown>;
  const problems: string[] = [];
  if (lock.schemaVersion !== 1) problems.push("schemaVersion must be 1");
  for (const key of ["organization", "identities", "github", "cloudflare", "railway"]) {
    if (typeof lock[key] !== "object" || lock[key] === null)
      problems.push(`missing object '${key}'`);
  }
  const ids = (lock.identities ?? {}) as Record<string, unknown>;
  for (const key of ["plan", "apply"]) {
    if (typeof ids[key] !== "object" || ids[key] === null)
      problems.push(`identities.${key} missing`);
  }
  if (problems.length)
    report(
      false,
      `global/connections.lock.json: ${problems.join("; ")}`,
      "global/connections.lock.json",
    );
  else if (lock.status === "unbootstrapped") {
    warn(
      "global/connections.lock.json: status is 'unbootstrapped' (IDs are zero UUIDs until `pnpm connections:lock` runs after the first global apply)",
    );
    warnings++;
  } else ok("global/connections.lock.json: shape ok");
} catch (err) {
  report(
    false,
    `global/connections.lock.json: ${(err as Error).message}`,
    "global/connections.lock.json",
  );
}

// Summary ---------------------------------------------------------------------
console.log("");
if (failures) {
  fail(`FAILED: ${failures} problem(s), ${warnings} warning(s)`);
  process.exit(1);
}
ok(`OK: ${configs.size} project(s) valid, ${warnings} warning(s)`);
