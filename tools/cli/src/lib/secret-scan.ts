// Detection of literal secret-like values in committed text (yaml/tf/json/md).
// Pure functions; used by validate.ts and unit tests.
import { PLACEHOLDER, REPLACE_MARKER_PREFIX } from "./placeholder.js";

export interface SecretFinding {
  line: number;
  rule: string;
  /** Short, redacted excerpt of the match (never the full value). */
  excerpt: string;
}

interface Rule {
  name: string;
  re: RegExp;
}

const RULES: Rule[] = [
  { name: "aws-access-key", re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g },
  {
    name: "github-token",
    re: /\b(ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|gh[ours]_[A-Za-z0-9]{36,})\b/g,
  },
  // Cloudflare API tokens are 40-char base62 strings with - and _ following a CLOUDFLARE*TOKEN-ish key.
  {
    name: "cloudflare-token",
    re: /CLOUDFLARE[A-Z_]*(TOKEN|KEY)\s*[:=]\s*["']?([A-Za-z0-9_-]{40})\b/gi,
  },
  // Railway tokens are UUIDs; flag when following a RAILWAY*-prefixed key.
  {
    name: "railway-token",
    re: /RAILWAY[A-Z_]*\s*[:=]\s*["']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi,
  },
  { name: "private-key", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  {
    name: "generic-assignment",
    re: /(secret|token|password)\s*[:=]\s*["']?([A-Za-z0-9/+_-]{20,})/gi,
  },
];

/** Values that look like secrets but are known-safe markers. */
export function isAllowlisted(value: string): boolean {
  if (value === PLACEHOLDER) return true;
  if (value.startsWith(REPLACE_MARKER_PREFIX)) return true;
  if (value.startsWith("__") && value.endsWith("__")) return true;
  if (/^\$\{?[A-Z_]+\}?$/.test(value)) return true; // ${VAR} / $VAR references
  if (/^(var|local|module|data|each|self)\./.test(value)) return true; // HCL references
  if (/^(true|false|null)$/.test(value)) return true;
  // Identifier-ish names used as keys or descriptions (all caps/underscore or kebab words).
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return true;
  // Kebab-case enum/slug values (e.g. import-prioritize-destination); digits-free and hyphenated.
  if (/^[a-z]+(-[a-z]+)+$/.test(value)) return true;
  return false;
}

/** Lines that are clearly documentation/code references rather than values. */
function lineIsSafe(line: string): boolean {
  const t = line.trim();
  return t.startsWith("#") && /(schema|pattern|regex|example)/i.test(t);
}

export function scanText(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split("\n");
  lines.forEach((line, idx) => {
    if (lineIsSafe(line)) return;
    const reported = new Set<string>();
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m: RegExpExecArray | null = rule.re.exec(line);
      while (m) {
        const value = m[2] ?? m[1] ?? m[0];
        // Specific token formats are always findings (unless a known marker);
        // the generic assignment rule also skips identifier-like values.
        const allowed =
          rule.name === "generic-assignment"
            ? isAllowlisted(value)
            : value === PLACEHOLDER || value.startsWith(REPLACE_MARKER_PREFIX);
        if (!allowed && !reported.has(value)) {
          reported.add(value);
          findings.push({
            line: idx + 1,
            rule: rule.name,
            excerpt: `${value.slice(0, 4)}…(${value.length} chars)`,
          });
        }
        m = rule.re.exec(line);
      }
    }
  });
  return findings;
}

/** File extensions that are scanned for literals. */
export const SCANNED_EXTENSIONS = [".yaml", ".yml", ".tf", ".tfvars", ".json", ".md", ".hcl"];

export function shouldScan(path: string): boolean {
  if (path.includes("node_modules/") || path.includes(".terraform/")) return false;
  if (path.endsWith("pnpm-lock.yaml") || path.endsWith(".terraform.lock.hcl")) return false;
  return SCANNED_EXTENSIONS.some((ext) => path.endsWith(ext));
}
