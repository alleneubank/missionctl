import { cpSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { expect } from "vitest";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = resolve(ROOT, "dist/missionctl");
export const FIXTURES = resolve(ROOT, "tests/fixtures");
export const NOW = "2026-08-29T12:30:00Z";

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function run(args: readonly string[], options: { cwd?: string; input?: string; env?: NodeJS.ProcessEnv } = {}): CliResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, ...options.env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function json<T = unknown>(result: CliResult): T {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout) as T;
}

export function fixtureCopy(name: string): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `missionctl-${name}-`)));
  cpSync(resolve(FIXTURES, name), root, { recursive: true });
  return root;
}

export function tempRoot(name: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `missionctl-${name}-`)));
}

export function readText(path: string): string {
  return readFileSync(path, "utf8");
}

export function writeText(path: string, text: string): void {
  writeFileSync(path, text);
}

export function replaceInFile(path: string, from: string, to: string): void {
  const text = readText(path);
  if (!text.includes(from)) throw new Error(`${path} does not contain ${JSON.stringify(from)}`);
  writeText(path, text.replace(from, to));
}
