// `pnpm changed-roots [--json] [--all] [--base <ref>] [--head <ref>]`
// Compute which Terraform roots are affected by the changed files.
import { changedFiles, resolveRange } from "./lib/git.js";
import { findRepoRoot, listProjectSlugs } from "./lib/repo.js";
import { allRoots, computeChangedRoots } from "./lib/roots.js";

const args = process.argv.slice(2);
const repoRoot = findRepoRoot();
const projects = listProjectSlugs(repoRoot);

let base: string | undefined;
let head: string | undefined;
let all = false;
let json = true;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--all") all = true;
  else if (a === "--json") json = true;
  else if (a === "--text") json = false;
  else if (a === "--base") base = args[++i];
  else if (a === "--head") head = args[++i];
}

const result = all
  ? allRoots(projects)
  : computeChangedRoots(changedFiles(repoRoot, resolveRange(base, head)), projects);

if (json) {
  console.log(JSON.stringify(result));
} else {
  if (result.bootstrap) console.log("bootstrap");
  if (result.global) console.log("global");
  for (const p of result.projects) console.log(`project:${p}`);
}
