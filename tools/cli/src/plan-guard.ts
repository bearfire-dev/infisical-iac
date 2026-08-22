// `terraform show -json plan.out | tsx plan-guard.ts [--summary]`
// Exit 1 when the plan contains destructive changes to guarded resources.
// Prints addresses and actions only; never attribute values.
import { readFileSync } from "node:fs";
import { fail, ok } from "./lib/output.js";
import { type PlanJson, renderMarkdownSummary, summarizePlan } from "./lib/plan.js";

const summaryMode = process.argv.includes("--summary");
const titleIdx = process.argv.indexOf("--title");
const title = titleIdx >= 0 ? process.argv[titleIdx + 1] : undefined;

let plan: PlanJson;
try {
  plan = JSON.parse(readFileSync(0, "utf8")) as PlanJson;
} catch (err) {
  console.error(`plan-guard: cannot parse plan JSON from stdin: ${(err as Error).message}`);
  process.exit(2);
}

const summary = summarizePlan(plan);

if (summaryMode) {
  process.stdout.write(renderMarkdownSummary(summary, title));
} else if (summary.destructive.length) {
  fail(`${summary.destructive.length} destructive change(s):`);
  for (const d of summary.destructive)
    console.log(`  ${d.action.padEnd(8)} ${d.address} — ${d.reason}`);
} else {
  ok("no destructive changes");
}

process.exit(summary.destructive.length ? 1 : 0);
