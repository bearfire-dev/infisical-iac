// `pnpm project:new <slug> [--name "Display Name"]` — scaffold projects/<slug>
// from projects/_template and validate the result.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadProjectConfig } from "./lib/config.js";
import { die, info, ok } from "./lib/output.js";
import { findRepoRoot, projectConfigPath, projectDir } from "./lib/repo.js";

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const nameIdx = args.indexOf("--name");
if (!slug) die('usage: project:new <slug> [--name "Display Name"]');
if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug))
  die(`invalid slug '${slug}' (lowercase, digits, hyphens)`);
const name =
  nameIdx >= 0 && args[nameIdx + 1]
    ? (args[nameIdx + 1] as string)
    : slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

const repoRoot = findRepoRoot();
const template = join(repoRoot, "projects", "_template");
const target = projectDir(repoRoot, slug);
if (existsSync(target)) die(`projects/${slug} already exists; refusing to overwrite`);
if (!existsSync(template)) die("projects/_template is missing");

mkdirSync(target, { recursive: true });
for (const entry of readdirSync(template, { withFileTypes: true })) {
  if (entry.isDirectory()) continue; // never copy .terraform/
  const src = join(template, entry.name);
  const dst = join(target, entry.name);
  if (entry.name === ".terraform.lock.hcl") {
    copyFileSync(src, dst);
    continue;
  }
  const text = readFileSync(src, "utf8")
    .replaceAll("__PROJECT_SLUG__", slug)
    .replaceAll("__PROJECT_NAME__", name);
  writeFileSync(dst, text);
}

const { config, errors } = loadProjectConfig(projectConfigPath(repoRoot, slug), repoRoot);
if (!config) die(`generated project.yaml is invalid:\n  ${errors.join("\n  ")}`);

ok(`created projects/${slug} (${name})`);
info("Next steps:");
console.log(`  1. Edit projects/${slug}/project.yaml: declare secret sets, secrets, and syncs.`);
console.log("  2. Open a PR; CI validates and posts a plan for the new root.");
console.log("  3. Merge; the apply workflow creates the project with placeholder values.");
console.log(`  4. Replace placeholders in Infisical, then run: pnpm secrets:check ${slug}`);
