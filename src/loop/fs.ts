import { createHash, randomBytes } from "node:crypto";
import { linkSync, lstatSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const IGNORED_DIRECTORIES = new Set([".git", ".hg", ".svn", ".rl", ".zig-cache", ".zig-global-cache", "node_modules", "target", "zig-out", "dist"]);
/** Upper bound on directories entered while discovering campaigns below a mission. */
export const DISCOVERY_DIRECTORIES_MAX = 10_000;

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** True for any directory entry, including a dangling symlink; only absence is false. */
export function entryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    const code = errorCode(error);
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw error;
  }
}

/** Walks from `start` to the filesystem root and returns the first existing relative `names` entry, checked in order per directory. */
export function findUp(start: string, names: readonly string[]): string | undefined {
  let current = resolve(start);
  if (isFile(current)) current = dirname(current);
  // Bounded by path depth: every iteration moves strictly toward the root.
  while (true) {
    for (const name of names) {
      const candidate = join(current, name);
      if (isFile(candidate)) return candidate;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Like findUp, but an entry at an exact contract path is returned even when its symlink target is missing. */
export function findUpEntry(start: string, names: readonly string[]): string | undefined {
  let current = resolve(start);
  if (isFile(current)) current = dirname(current);
  // Bounded by path depth: every iteration moves strictly toward the root.
  while (true) {
    for (const name of names) {
      const candidate = join(current, name);
      if (entryExists(candidate)) return candidate;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export interface Discovery {
  paths: string[];
  /** Exact contract paths that are symbolic links; discovery never follows them. */
  unreadable: string[];
  /** True when the directory bound stopped the walk; `paths` holds what was found before it. */
  truncated: boolean;
}

/** Finds every file named `name` below `root`, sorted, without descending through symlinks or counting files against the entered-directory bound. */
export function findBelow(root: string, name: string): Discovery {
  const paths: string[] = [];
  const unreadable: string[] = [];
  let directoriesVisited = 0;
  let truncated = false;
  const visit = (directory: string): void => {
    directoriesVisited += 1;
    if (directoriesVisited > DISCOVERY_DIRECTORIES_MAX) {
      truncated = true;
      return;
    }
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (truncated) return;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) visit(path);
      } else if (entry.isFile() && entry.name === name) {
        paths.push(path);
      } else if (entry.isSymbolicLink() && entry.name === name) {
        if (isFile(path)) paths.push(path);
        else unreadable.push(path);
      }
    }
  };
  visit(resolve(root));
  return { paths, unreadable, truncated };
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

/**
 * Writes through a same-directory temporary file so a reader never observes a partial file. The default rename replaces whatever
 * is at `path`; `exclusive` links the temporary file into place instead, which fails with `EEXIST` on any existing entry — a
 * dangling symlink or an unreadable file included — so a never-overwrite contract holds by construction, not by a prior check.
 */
export function writeAtomic(path: string, text: string, options: { exclusive?: boolean } = {}): void {
  const directory = dirname(path);
  const pending = join(directory, `.${path.slice(directory.length + 1)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    writeFileSync(pending, text, { encoding: "utf8", flag: "wx" });
    if (options.exclusive) linkSync(pending, path);
    else renameSync(pending, path);
  } finally {
    // After a rename the temporary name is already gone; after a link (or a failure) it must go.
    rmSync(pending, { force: true });
  }
}
