// Schema + cross-check validation of project.yaml documents.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expandSlots,
  type ProjectConfig,
  parseProjectYaml,
  validateConfigObject,
} from "../src/lib/config.js";
import { findRepoRoot } from "../src/lib/repo.js";

const repoRoot = findRepoRoot(import.meta.dirname);
const sigla = parseProjectYaml(
  readFileSync(join(import.meta.dirname, "fixtures", "example-project.yaml"), "utf8"),
) as ProjectConfig;

const clone = (): ProjectConfig => structuredClone(sigla);
const must = <T>(v: T | undefined): T => {
  if (v === undefined) throw new Error("fixture missing");
  return v;
};

describe("project.yaml validation", () => {
  it("accepts the example project fixture", () => {
    const r = validateConfigObject(sigla, repoRoot);
    expect(r.errors).toEqual([]);
    expect(r.config?.project.slug).toBe("sigla-writer");
  });

  it("rejects a lowercase secret name", () => {
    const doc = clone();
    must(doc.secret_sets.runtime).secrets.badName = { required_in: ["dev"] };
    const r = validateConfigObject(doc, repoRoot);
    expect(r.config).toBeNull();
    expect(r.errors.join("\n")).toMatch(/secret_sets\/runtime\/secrets/);
  });

  it("rejects required_in referencing an unknown environment", () => {
    const doc = clone();
    must(must(doc.secret_sets.runtime).secrets.DATABASE_URL).required_in = ["dev", "staging"];
    const r = validateConfigObject(doc, repoRoot);
    expect(r.errors.join("\n")).toMatch(/undeclared environment 'staging'/);
  });

  it("rejects the root path /", () => {
    const doc = clone();
    must(doc.secret_sets.runtime).path = "/";
    const r = validateConfigObject(doc, repoRoot);
    expect(r.errors.join("\n")).toMatch(/secret_sets\/runtime\/path/);
  });

  it("rejects duplicate set paths", () => {
    const doc = clone();
    must(doc.secret_sets.ci).path = "/runtime";
    const r = validateConfigObject(doc, repoRoot);
    expect(r.errors.join("\n")).toMatch(/already used/);
  });

  it("rejects a sync type/connection mismatch", () => {
    const doc = clone();
    must(must(doc.syncs)["prod-ci-to-github"]).connection = "railway";
    const r = validateConfigObject(doc, repoRoot);
    expect(r.config).toBeNull();
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("rejects a sync whose source secret_set does not exist", () => {
    const doc = clone();
    must(must(doc.syncs)["prod-ci-to-github"]).source.secret_set = "nope";
    const r = validateConfigObject(doc, repoRoot);
    expect(r.errors.join("\n")).toMatch(/secret_set 'nope'/);
  });
});

describe("expandSlots (mirror of locals.secret_slots)", () => {
  it("produces env:path:NAME keys per required_in", () => {
    const keys = expandSlots(sigla).map((s) => s.key);
    expect(keys).toContain("dev:/runtime:DATABASE_URL");
    expect(keys).toContain("prod:/ci:CLOUDFLARE_API_TOKEN");
    expect(keys).not.toContain("preview:/runtime:STRIPE_SECRET_KEY");
    // 3 + 3 + 2 + 1
    expect(keys).toHaveLength(9);
    expect(new Set(keys).size).toBe(9);
  });

  it("defaults placeholder_version to 1", () => {
    expect(expandSlots(sigla).every((s) => s.placeholderVersion === 1)).toBe(true);
  });
});
