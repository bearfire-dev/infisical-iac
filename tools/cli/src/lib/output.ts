// Console output helpers: tty-aware check marks and GitHub Actions annotations.
import { isatty } from "node:tty";

const color = isatty(1) && !process.env.NO_COLOR;
const paint = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);

export const CHECK = "✓";
export const CROSS = "✗";

export function ok(message: string): void {
  console.log(`${paint("32", CHECK)} ${message}`);
}

export function fail(message: string): void {
  console.log(`${paint("31", CROSS)} ${message}`);
}

export function warn(message: string): void {
  console.log(`${paint("33", "!")} ${message}`);
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::warning::${message}`);
}

export function info(message: string): void {
  console.log(paint("34", message));
}

export function heading(message: string): void {
  console.log(paint("1", message));
}

/** Emit a GitHub Actions error annotation (and stderr line otherwise). */
export function annotateError(message: string, file?: string, line?: number): void {
  if (process.env.GITHUB_ACTIONS === "true") {
    const props = [file ? `file=${file}` : "", line ? `line=${line}` : ""].filter(Boolean);
    console.log(`::error${props.length ? ` ${props.join(",")}` : ""}::${message}`);
  } else {
    console.error(`error: ${file ? `${file}${line ? `:${line}` : ""}: ` : ""}${message}`);
  }
}

export function annotateNotice(message: string): void {
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::notice::${message}`);
  else console.log(message);
}

/** Print an error and exit; used by command entrypoints. */
export function die(message: string, code = 1): never {
  annotateError(message);
  process.exit(code);
}
