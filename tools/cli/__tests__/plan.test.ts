// plan-guard classification over sample `terraform show -json` output.
import { describe, expect, it } from "vitest";
import { type PlanJson, renderMarkdownSummary, summarizePlan } from "../src/lib/plan.js";

const rc = (
  address: string,
  type: string,
  actions: string[],
  before?: Record<string, unknown>,
  after?: Record<string, unknown>,
) => ({
  address,
  type,
  change: { actions, before: before ?? null, after: after ?? null },
});

describe("summarizePlan", () => {
  it("passes a plan with only creates and safe updates", () => {
    const plan: PlanJson = {
      resource_changes: [
        rc('module.project.infisical_secret.slot["dev:/runtime:A"]', "infisical_secret", [
          "create",
        ]),
        rc(
          'module.project.infisical_secret.slot["dev:/runtime:B"]',
          "infisical_secret",
          ["update"],
          { value_wo_version: 1, metadata: {} },
          { value_wo_version: 1, metadata: { x: 1 } },
        ),
        rc('module.project.infisical_secret_tag.this["x"]', "infisical_secret_tag", ["delete"]),
        rc("module.project.infisical_project.this", "infisical_project", ["no-op"]),
      ],
    };
    const s = summarizePlan(plan);
    expect(s.destructive).toEqual([]);
    expect(s.counts).toMatchObject({ create: 1, update: 1, delete: 1, "no-op": 1 });
  });

  it("flags deletes and replaces of guarded types", () => {
    const plan: PlanJson = {
      resource_changes: [
        rc("module.project.infisical_project.this", "infisical_project", ["delete"]),
        rc('module.project.infisical_secret_folder.this["prod:/ci"]', "infisical_secret_folder", [
          "delete",
          "create",
        ]),
        rc(
          'module.project.infisical_secret_sync_github.this["x"]',
          "infisical_secret_sync_github",
          ["delete"],
        ),
        rc("infisical_app_connection_github.bearfire", "infisical_app_connection_github", [
          "create",
          "delete",
        ]),
        rc("module.railway.terraform_data.sync", "terraform_data", ["delete", "create"]),
        rc(
          'module.project.infisical_project_environment.this["dev"]',
          "infisical_project_environment",
          ["delete"],
        ),
      ],
    };
    const s = summarizePlan(plan);
    expect(s.destructive.map((d) => d.action)).toEqual([
      "delete",
      "replace",
      "delete",
      "replace",
      "replace",
      "delete",
    ]);
  });

  it("flags value_wo_version changes on infisical_secret updates", () => {
    const plan: PlanJson = {
      resource_changes: [
        rc(
          'infisical_secret.slot["prod:/runtime:DB"]',
          "infisical_secret",
          ["update"],
          { value_wo_version: 1 },
          { value_wo_version: 2 },
        ),
      ],
    };
    const s = summarizePlan(plan);
    expect(s.destructive).toHaveLength(1);
    expect(s.destructive[0]?.reason).toMatch(/value_wo_version/);
  });

  it("renders a markdown summary without attribute values", () => {
    const md = renderMarkdownSummary(
      summarizePlan({
        resource_changes: [
          rc(
            'infisical_secret.slot["prod:/runtime:DB"]',
            "infisical_secret",
            ["update"],
            { value_wo_version: 1, value_wo: "SHOULD_NOT_APPEAR" },
            { value_wo_version: 2 },
          ),
        ],
      }),
    );
    expect(md).toContain("Destructive changes detected");
    expect(md).toContain('infisical_secret.slot["prod:/runtime:DB"]');
    expect(md).not.toContain("SHOULD_NOT_APPEAR");
  });
});
