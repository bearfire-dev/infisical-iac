// `pnpm project:list` — table of projects with environment, slot, and sync counts.
import { expandSlots, loadProjectConfig } from "./lib/config.js";
import { findRepoRoot, listProjectSlugs, projectConfigPath } from "./lib/repo.js";

const repoRoot = findRepoRoot();
const rows: string[][] = [["slug", "envs", "secret objects", "syncs (github/cloudflare/railway)"]];

for (const slug of listProjectSlugs(repoRoot)) {
  const { config, errors } = loadProjectConfig(projectConfigPath(repoRoot, slug), repoRoot);
  if (!config) {
    rows.push([slug, "-", "-", `INVALID (${errors.length} error(s))`]);
    continue;
  }
  const syncs = Object.values(config.syncs ?? {});
  const count = (t: string) => syncs.filter((s) => s.type === t).length;
  rows.push([
    slug,
    String(Object.keys(config.environments).length),
    String(expandSlots(config).length),
    `${syncs.length} (${count("github")}/${count("cloudflare-workers")}/${count("railway")})`,
  ]);
}

const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length))) ?? [];
for (const [i, row] of rows.entries()) {
  console.log(row.map((c, j) => c.padEnd(widths[j] ?? 0)).join("  "));
  if (i === 0) console.log(widths.map((w) => "-".repeat(w)).join("  "));
}
