import { createHash, randomBytes } from "node:crypto";
import { linkSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const IGNORED_DIRECTORIES = new Set([".git", ".hg", ".svn", ".rl", ".zig-cache", "node_modules", "target", "zig-out", "dist"]);
/** Upper bound on files visited while discovering campaigns below a mission; a workspace larger than this is not a mission root. */
export const DISCOVERY_FILES_MAX = 1_000;

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
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

export interface Discovery {
  paths: string[];
  /** True when the entry bound stopped the walk; `paths` holds what was found before it. */
  truncated: boolean;
}

/** Finds every file named `name` below `root`, sorted, skipping tool and dependency directories; never discards what it found when the bound trips. */
export function findBelow(root: string, name: string): Discovery {
  const paths: string[] = [];
  let visited = 0;
  let truncated = false;
  const visit = (directory: string): void => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (truncated) return;
      visited += 1;
      if (visited > DISCOVERY_FILES_MAX) {
        truncated = true;
        return;
      }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) visit(path);
      } else if (entry.isFile() && entry.name === name) {
        paths.push(path);
      }
    }
  };
  visit(resolve(root));
  return { paths, truncated };
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
