// `pnpm secrets:check [<slug>] [--env <env>] [--all]` — verify every declared
// required secret slot has been populated (is not the placeholder / missing).
// Values are compared in memory and never printed.
import { expandSlots, requireProjectConfig, type SecretSlot } from "./lib/config.js";
import { InfisicalClient } from "./lib/infisical.js";
import { die, fail, ok } from "./lib/output.js";
import { PLACEHOLDER } from "./lib/placeholder.js";
import { findRepoRoot, listProjectSlugs, projectConfigPath } from "./lib/repo.js";

const args = process.argv.slice(2);
const repoRoot = findRepoRoot();
const envIdx = args.indexOf("--env");
const onlyEnv = envIdx >= 0 ? args[envIdx + 1] : undefined;
const all = args.includes("--all");
const slugArg = args.find((a, i) => !a.startsWith("--") && (envIdx < 0 || i !== envIdx + 1));
const slugs = all ? listProjectSlugs(repoRoot) : slugArg ? [slugArg] : [];
if (!slugs.length) die("usage: secrets:check <slug> [--env <env>] | --all");

export type SlotState = "ok" | "placeholder" | "missing";

/** Pure comparison used by the command and tests: never returns values. */
export function classifySlots(
  slots: SecretSlot[],
  listed: Map<string, { key: string; value: string | undefined }[]>,
): Map<string, SlotState> {
  const out = new Map<string, SlotState>();
  for (const slot of slots) {
    const entries = listed.get(`${slot.environment}:${slot.path}`) ?? [];
    const hit = entries.find((e) => e.key === slot.name);
    if (!hit) out.set(slot.key, "missing");
    else if (hit.value === PLACEHOLDER || hit.value === "") out.set(slot.key, "placeholder");
    else out.set(slot.key, "ok");
  }
  return out;
}

async function main(): Promise<void> {
  const client = await InfisicalClient.fromEnv();
  let totalFailed = 0;

  for (const slug of slugs) {
    const config = requireProjectConfig(projectConfigPath(repoRoot, slug), repoRoot);
    const slots = expandSlots(config).filter((s) => !onlyEnv || s.environment === onlyEnv);
    const envs = [...new Set(slots.map((s) => s.environment))].sort();
    const listed = new Map<string, { key: string; value: string | undefined }[]>();
    for (const folder of new Set(slots.map((s) => `${s.environment}:${s.path}`))) {
      const [env, path] = folder.split(":") as [string, string];
      try {
        const secrets = await client.listSecrets({ slug: config.project.slug }, env, path);
        listed.set(
          folder,
          secrets.map((s) => ({ key: s.secretKey, value: s.secretValue })),
        );
      } catch (err) {
        listed.set(folder, []);
        fail(`${slug}/${env}${path}: cannot list secrets (${(err as Error).message})`);
      }
    }
    const states = classifySlots(slots, listed);

    for (const env of envs) {
      console.log(`\n${slug} / ${env}`);
      for (const slot of slots.filter((s) => s.environment === env)) {
        const state = states.get(slot.key) ?? "missing";
        if (state === "ok") ok(`${slot.path}/${slot.name}`);
        else {
          fail(`${slot.path}/${slot.name} — ${state}`);
          totalFailed++;
        }
      }
    }
  }

  console.log("");
  if (totalFailed) {
    console.log(`FAILED: ${totalFailed} required secret(s) have not been populated.`);
    process.exit(1);
  }
  console.log("OK");
}

main().catch((err) => die((err as Error).message));
