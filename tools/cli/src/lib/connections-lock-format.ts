const KEY_ORDER = [
  "schemaVersion",
  "status",
  "organization",
  "identities",
  "github",
  "cloudflare",
  "railway",
  "tags",
];

interface Ref {
  id: string;
  name: string;
}

export interface ConnectionsLock {
  schemaVersion: number;
  status?: string;
  organization: { id: string; slug: string };
  identities: { plan: Ref; apply: Ref };
  github: Ref;
  cloudflare: Ref;
  railway: Ref;
  tags: string[];
}

/** Stable key order, 2-space indent, compact tags, and trailing newline. */
export function renderConnectionsLock(lock: ConnectionsLock): string {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER)
    if (key in lock) ordered[key] = (lock as unknown as Record<string, unknown>)[key];
  const rendered = `${JSON.stringify(ordered, null, 2)}\n`;
  const compactTags = `[${lock.tags.map((tag) => JSON.stringify(tag)).join(", ")}]`;
  const expandedTags = JSON.stringify(lock.tags, null, 2).replaceAll("\n", "\n  ");
  return rendered.replace(`  "tags": ${expandedTags}`, `  "tags": ${compactTags}`);
}
