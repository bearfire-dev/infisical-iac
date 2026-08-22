// Backend config rendering and root-spec/state-key conventions.
import { describe, expect, it } from "vitest";
import { renderBackendConfig } from "../src/lib/backend.js";
import { parseRootSpec, stateBucket, stateKey } from "../src/lib/repo.js";

describe("renderBackendConfig", () => {
  it("renders the project backend", () => {
    const out = renderBackendConfig(parseRootSpec("project:sigla-writer"), "acct123");
    expect(out).toContain('bucket = "bearfire-infisical-project-state"');
    expect(out).toContain('key    = "projects/sigla-writer/terraform.tfstate"');
    expect(out).toContain('region = "auto"');
    expect(out).toContain('endpoints = { s3 = "https://acct123.r2.cloudflarestorage.com" }');
    for (const flag of [
      "skip_credentials_validation",
      "skip_metadata_api_check",
      "skip_region_validation",
      "skip_requesting_account_id",
      "skip_s3_checksum",
      "use_path_style",
      "use_lockfile",
    ]) {
      expect(out).toMatch(new RegExp(`${flag}\\s+= true`));
    }
    expect(out.endsWith("\n")).toBe(true);
  });

  it("maps bootstrap and global to the global bucket", () => {
    expect(stateBucket(parseRootSpec("bootstrap"))).toBe("bearfire-infisical-global-state");
    expect(stateKey(parseRootSpec("bootstrap"))).toBe("bootstrap/terraform.tfstate");
    expect(stateKey(parseRootSpec("global"))).toBe("global/terraform.tfstate");
    expect(stateKey(parseRootSpec("projects/vex-machina"))).toBe(
      "projects/vex-machina/terraform.tfstate",
    );
  });

  it("rejects unknown specs", () => {
    expect(() => parseRootSpec("nope")).toThrow(/unknown root spec/);
  });
});
