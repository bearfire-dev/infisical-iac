// Secret-like literal detection. Fixture values are synthetic patterns, not real credentials.
import { describe, expect, it } from "vitest";
import { PLACEHOLDER } from "../src/lib/placeholder.js";
import { scanText, shouldScan } from "../src/lib/secret-scan.js";

const fake = (prefix: string, n: number, ch = "A") => prefix + ch.repeat(n);

describe("scanText", () => {
  it("allows the placeholder and REPLACE_WITH markers", () => {
    const text = [
      `value_wo = "${PLACEHOLDER}"`,
      "project_id: REPLACE_WITH_RAILWAY_PROJECT_ID",
      "  token: $RAILWAY_API_TOKEN",
      "password = var.cloudflare_api_token",
    ].join("\n");
    expect(scanText(text)).toEqual([]);
  });

  it("flags AWS and GitHub tokens", () => {
    const f = scanText(
      `key: ${fake("AKIA", 16)}\ntoken: ${fake("ghp_", 36, "x")}\npat: ${fake("github_pat_", 60, "Z")}`,
    );
    expect(f.map((x) => x.rule)).toEqual(["aws-access-key", "github-token", "github-token"]);
    expect(f[0]?.line).toBe(1);
  });

  it("flags Cloudflare and Railway shaped assignments", () => {
    const f = scanText(
      `CLOUDFLARE_API_TOKEN = "${fake("", 40, "q")}"\nRAILWAY_TOKEN: 12345678-1234-1234-1234-123456789abc`,
    );
    expect(f.map((x) => x.rule)).toContain("cloudflare-token");
    expect(f.map((x) => x.rule)).toContain("railway-token");
  });

  it("flags generic secret assignments but never prints the full value", () => {
    const f = scanText(`secret: ${fake("", 32, "k")}`);
    expect(f).toHaveLength(1);
    expect(f[0]?.excerpt).not.toContain("k".repeat(10));
  });

  it("does not flag declared secret names or descriptions", () => {
    expect(
      scanText("STRIPE_SECRET_KEY:\n  required_in: [dev, prod]\n  comment: Stripe server API key"),
    ).toEqual([]);
  });
});

describe("shouldScan", () => {
  it("selects declarative files and skips lockfiles", () => {
    expect(shouldScan("projects/x/project.yaml")).toBe(true);
    expect(shouldScan("global/main.tf")).toBe(true);
    expect(shouldScan("pnpm-lock.yaml")).toBe(false);
    expect(shouldScan("projects/x/.terraform.lock.hcl")).toBe(false);
    expect(shouldScan("tools/cli/src/validate.ts")).toBe(false);
  });
});
