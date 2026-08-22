// Changed-file to Terraform-root mapping.
import { describe, expect, it } from "vitest";
import { allRoots, computeChangedRoots } from "../src/lib/roots.js";

const projects = ["sigla-writer", "vex-machina"];

describe("computeChangedRoots", () => {
  it("maps project files to that project only", () => {
    const r = computeChangedRoots(["projects/sigla-writer/project.yaml"], projects);
    expect(r).toEqual({
      bootstrap: false,
      global: false,
      projects: ["sigla-writer"],
      matrix: [{ root: "sigla-writer", spec: "project:sigla-writer" }],
    });
  });

  it("maps global and bootstrap", () => {
    const r = computeChangedRoots(
      ["global/connections.tf", "bootstrap/terraform/main.tf"],
      projects,
    );
    expect(r.global).toBe(true);
    expect(r.bootstrap).toBe(true);
    expect(r.projects).toEqual([]);
    // bootstrap is reported but never in the matrix
    expect(r.matrix).toEqual([{ root: "global", spec: "global" }]);
  });

  it("fans shared paths out to every project", () => {
    for (const f of [
      "modules/infisical-project/locals.tf",
      "schemas/project.schema.json",
      "tools/cli/src/x.ts",
      "scripts/_lib.sh",
      "package.json",
      "pnpm-lock.yaml",
    ]) {
      expect(computeChangedRoots([f], projects).projects).toEqual(projects);
    }
  });

  it("ignores docs, markdown, workflows, and LICENSE", () => {
    const r = computeChangedRoots(
      ["docs/RUNBOOK.md", "README.md", ".github/workflows/plan.yml", "LICENSE"],
      projects,
    );
    expect(r).toEqual({ bootstrap: false, global: false, projects: [], matrix: [] });
  });

  it("ignores the template and unknown project dirs", () => {
    expect(
      computeChangedRoots(["projects/_template/project.yaml", "projects/ghost/main.tf"], projects)
        .projects,
    ).toEqual([]);
  });

  it("--all lists everything, global first", () => {
    const r = allRoots(projects);
    expect(r.bootstrap).toBe(true);
    expect(r.matrix.map((m) => m.root)).toEqual(["global", ...projects]);
  });
});
