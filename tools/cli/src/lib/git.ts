// Git helpers: changed files between a base and head ref, and file contents at a ref.
import { execFileSync } from "node:child_process";

export interface DiffRange {
  base: string;
  head: string;
}

/** Resolve BASE_SHA/HEAD_SHA from explicit args, env, or default origin/main...HEAD. */
export function resolveRange(base?: string, head?: string): DiffRange {
  return {
    base: base ?? process.env.BASE_SHA ?? "origin/main",
    head: head ?? process.env.HEAD_SHA ?? "HEAD",
  };
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export function refExists(ref: string, cwd: string): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Changed paths (relative to repo root) between base and head. Uses the
 * three-dot form so only commits on head since the merge base are considered.
 * Falls back to all tracked files if the base ref does not exist (e.g. a fresh
 * checkout without origin/main).
 */
export function changedFiles(cwd: string, range: DiffRange = resolveRange()): string[] {
  if (!refExists(range.base, cwd)) {
    return git(["ls-files"], cwd).split("\n").filter(Boolean);
  }
  const out = git(["diff", "--name-only", `${range.base}...${range.head}`], cwd);
  return out.split("\n").filter(Boolean);
}

/** File contents at a ref, or null when it does not exist there. */
export function fileAtRef(cwd: string, ref: string, path: string): string | null {
  try {
    return git(["show", `${ref}:${path}`], cwd);
  } catch {
    return null;
  }
}

/** Tracked files (git ls-files); empty array when not a git repository. */
export function trackedFiles(cwd: string): string[] {
  try {
    return git(["ls-files", "--cached", "--others", "--exclude-standard"], cwd)
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}
