import { describe, expect, it } from "vitest";
import { type ConnectionsLock, renderConnectionsLock } from "../src/lib/connections-lock-format.js";

const lock: ConnectionsLock = {
  schemaVersion: 1,
  organization: { id: "organization-id", slug: "bearfire-dev" },
  identities: {
    plan: { id: "plan-id", name: "plan" },
    apply: { id: "apply-id", name: "apply" },
  },
  github: { id: "github-id", name: "github" },
  cloudflare: { id: "cloudflare-id", name: "cloudflare" },
  railway: { id: "railway-id", name: "railway" },
  tags: ["terraform-managed", "rotate-quarterly", "third-party"],
};

describe("renderConnectionsLock", () => {
  it("matches repository formatting and keeps a trailing newline", () => {
    const rendered = renderConnectionsLock(lock);

    expect(rendered).toContain(
      '  "tags": ["terraform-managed", "rotate-quarterly", "third-party"]',
    );
    expect(rendered).toMatch(/\n$/);
  });

  it("uses the stable control-plane key order", () => {
    const rendered = renderConnectionsLock({ ...lock, status: "unbootstrapped" });

    expect(Object.keys(JSON.parse(rendered))).toEqual([
      "schemaVersion",
      "status",
      "organization",
      "identities",
      "github",
      "cloudflare",
      "railway",
      "tags",
    ]);
  });
});
