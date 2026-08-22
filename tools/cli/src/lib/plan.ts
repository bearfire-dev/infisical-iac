// Pure classification of `terraform show -json` plan output: which resource
// changes are destructive for this repository. Never returns attribute values.

export interface ResourceChange {
  address: string;
  type: string;
  change: {
    actions: string[];
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    after_unknown?: Record<string, unknown> | null;
  };
}

export interface PlanJson {
  resource_changes?: ResourceChange[];
}

export interface Destructive {
  address: string;
  type: string;
  action: string;
  reason: string;
}

export interface PlanSummary {
  counts: Record<"create" | "update" | "delete" | "replace" | "no-op" | "read", number>;
  destructive: Destructive[];
  changed: { address: string; action: string }[];
}

const GUARDED_TYPE_PREFIXES = [
  "infisical_project",
  "infisical_project_environment",
  "infisical_secret_folder",
  "infisical_secret",
  "infisical_secret_sync_",
  "infisical_app_connection_",
  "terraform_data",
];

function isGuardedType(type: string): boolean {
  return GUARDED_TYPE_PREFIXES.some((p) => (p.endsWith("_") ? type.startsWith(p) : type === p));
}

export function classifyAction(
  actions: string[],
): PlanSummary["counts"] extends Record<infer K, number> ? K : never {
  if (actions.includes("create") && actions.includes("delete")) return "replace";
  if (actions.includes("delete")) return "delete";
  if (actions.includes("create")) return "create";
  if (actions.includes("update")) return "update";
  if (actions.includes("read")) return "read";
  return "no-op";
}

export function summarizePlan(plan: PlanJson): PlanSummary {
  const counts: PlanSummary["counts"] = {
    create: 0,
    update: 0,
    delete: 0,
    replace: 0,
    "no-op": 0,
    read: 0,
  };
  const destructive: Destructive[] = [];
  const changed: PlanSummary["changed"] = [];

  for (const rc of plan.resource_changes ?? []) {
    const action = classifyAction(rc.change.actions);
    counts[action]++;
    if (action !== "no-op" && action !== "read") changed.push({ address: rc.address, action });

    if ((action === "delete" || action === "replace") && isGuardedType(rc.type)) {
      destructive.push({
        address: rc.address,
        type: rc.type,
        action,
        reason: `${action} of guarded resource type`,
      });
    } else if (action === "update" && rc.type === "infisical_secret") {
      const before = rc.change.before?.value_wo_version;
      const after = rc.change.after?.value_wo_version;
      if (before !== after) {
        destructive.push({
          address: rc.address,
          type: rc.type,
          action,
          reason: "value_wo_version changes: live value would be overwritten with the placeholder",
        });
      }
    }
  }
  return { counts, destructive, changed };
}

export function renderMarkdownSummary(summary: PlanSummary, title = "Terraform plan"): string {
  const lines: string[] = [`### ${title}`, ""];
  lines.push("| Action | Count |", "|---|---|");
  for (const k of ["create", "update", "replace", "delete"] as const) {
    lines.push(`| ${k} | ${summary.counts[k]} |`);
  }
  lines.push("");
  if (summary.changed.length) {
    lines.push("<details><summary>Changed resources</summary>", "");
    for (const c of summary.changed) lines.push(`- \`${c.action}\` ${c.address}`);
    lines.push("", "</details>", "");
  }
  if (summary.destructive.length) {
    lines.push(
      "**Destructive changes detected** (requires the `destructive-change` label and approval):",
      "",
    );
    for (const d of summary.destructive) lines.push(`- \`${d.action}\` ${d.address} — ${d.reason}`);
  } else {
    lines.push("No destructive changes.");
  }
  return `${lines.join("\n")}\n`;
}
