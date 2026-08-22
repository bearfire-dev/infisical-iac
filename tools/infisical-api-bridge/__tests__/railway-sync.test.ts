// Bridge body mapping and idempotency comparison for Railway syncs/connections.
import { describe, expect, it } from "vitest";
import type { SecretSync } from "../../cli/src/lib/infisical.js";
import { resolveMethod } from "../src/railway-connection.js";
import { type RailwaySyncSpec, syncMatches, toApiBody } from "../src/railway-sync.js";

const spec: RailwaySyncSpec = {
  name: "prod-runtime-to-railway",
  description: "desc",
  projectId: "proj",
  environment: "prod",
  secretPath: "/runtime",
  connectionId: "conn",
  autoSyncEnabled: true,
  syncOptions: {
    initialSyncBehavior: "overwrite-destination",
    disableSecretDeletion: false,
    keySchema: null,
  },
  destinationConfig: { projectId: "rp", environmentId: "re", serviceId: "rs" },
};

const remote = (): SecretSync => ({
  id: "sync-1",
  name: spec.name,
  destination: "railway",
  projectId: "proj",
  connectionId: "conn",
  description: "desc",
  isAutoSyncEnabled: true,
  environment: { id: "e", slug: "prod", name: "Production" },
  folder: { id: "f", path: "/runtime" },
  syncOptions: { initialSyncBehavior: "overwrite-destination", disableSecretDeletion: false },
  destinationConfig: {
    projectId: "rp",
    projectName: "rp",
    environmentId: "re",
    environmentName: "re",
    serviceId: "rs",
    serviceName: "rs",
  },
});

describe("toApiBody", () => {
  it("maps autoSyncEnabled to isAutoSyncEnabled and fills display names", () => {
    const body = toApiBody(spec);
    expect(body.isAutoSyncEnabled).toBe(true);
    expect(body).not.toHaveProperty("autoSyncEnabled");
    expect(body.destinationConfig).toEqual({
      projectId: "rp",
      projectName: "rp",
      environmentId: "re",
      environmentName: "re",
      serviceId: "rs",
      serviceName: "rs",
    });
    expect(body.syncOptions).not.toHaveProperty("keySchema");
  });
});

describe("syncMatches", () => {
  it("is true when remote equals desired", () => {
    expect(syncMatches(spec, remote())).toBe(true);
  });
  it("is false on any non-secret drift", () => {
    const r = remote();
    r.isAutoSyncEnabled = false;
    expect(syncMatches(spec, r)).toBe(false);
    const r2 = remote();
    r2.destinationConfig = { ...r2.destinationConfig, serviceId: "other" };
    expect(syncMatches(spec, r2)).toBe(false);
  });
});

describe("resolveMethod", () => {
  it("maps the Terraform 'api-token' label to the documented enum", () => {
    expect(resolveMethod("api-token", {})).toBe("account-token");
    expect(resolveMethod(undefined, {})).toBe("account-token");
    expect(resolveMethod("team-token", {})).toBe("team-token");
    expect(resolveMethod("api-token", { RAILWAY_CONNECTION_METHOD: "project-token" })).toBe(
      "project-token",
    );
  });
});
