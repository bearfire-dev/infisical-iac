// `pnpm plan|apply|state:unlock` — resolve roots and run the shell wrappers
// sequentially (bootstrap, then global, then projects).
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { die, heading } from "./lib/output.js";
import {
  findRepoRoot,
  formatRootSpec,
  type RootSpec,
  rootDir,
  selectRoots,
  sortRoots,
} from "./lib/repo.js";

const [command, ...args] = process.argv.slice(2);
if (command !== "plan" && command !== "apply" && command !== "unlock") {
  die(
    "usage: terraform.ts <plan|apply|unlock> [--global|--project <slug>|--all|--bootstrap|<root-spec>] [lock-id]",
  );
}

const repoRoot = findRepoRoot();
const env = { ...process.env, PATH: `${process.env.HOME}/.local/bin:${process.env.PATH ?? ""}` };
let selection: ReturnType<typeof selectRoots>;
try {
  selection = selectRoots(args, { repoRoot, allowBareSlug: true });
} catch (err) {
  die((err as Error).message);
}
const roots = sortRoots(selection.roots);
if (!roots.length) die("no roots selected (use --global, --project <slug>, --all, or a root spec)");
if (
  command === "apply" &&
  args.includes("--all") &&
  process.env.INFISICAL_IAC_ALLOW_APPLY_ALL !== "1"
) {
  die("refusing `apply --all` without INFISICAL_IAC_ALLOW_APPLY_ALL=1");
}

function run(cmd: string, cmdArgs: string[], cwd?: string): number {
  const res = spawnSync(cmd, cmdArgs, { stdio: "inherit", env, ...(cwd ? { cwd } : {}) });
  return res.status ?? 1;
}

function runRoot(root: RootSpec): number {
  const spec = formatRootSpec(root);
  heading(`== ${command} ${spec} ==`);
  if (command === "unlock") {
    const lockId = selection.rest.find((a) => !a.startsWith("-"));
    if (!lockId) die("unlock requires a lock id");
    const init = run("bash", [join(repoRoot, "scripts", "terraform-init.sh"), spec]);
    if (init !== 0) return init;
    return run("terraform", ["force-unlock", "-force", lockId], rootDir(repoRoot, root));
  }
  return run("bash", [join(repoRoot, "scripts", `terraform-${command}.sh`), spec]);
}

for (const root of roots) {
  const code = runRoot(root);
  if (code !== 0) die(`${command} failed for ${formatRootSpec(root)} (exit ${code})`, code);
}
