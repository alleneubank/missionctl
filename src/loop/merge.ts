import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

import { errorCode } from "./fs.js";
import { MissionctlError, type Issue } from "./types.js";

const TRACKED_PATHS_MAX_BYTES = 64 * 1024 * 1024;
export const DEFAULT_MERGE_EXCLUDES = ["tests/fixtures"] as const;

export interface MergeCheck {
  ok: boolean;
  repository: string;
  excludes: string[];
  issues: Issue[];
}

function failGit(code: string, message: string, repair: string): never {
  const issue: Issue = { code, severity: "error", path: "", message, repair };
  throw new MissionctlError(code, message, { issues: [issue] });
}

function git(root: string, args: readonly string[], failureCode: string, failureMessage: string, repair: string): string {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: TRACKED_PATHS_MAX_BYTES,
  });
  if (result.error) {
    if (errorCode(result.error) === "ENOBUFS") {
      failGit(
        "merge.tracked-tree-bounded",
        `tracked-path output exceeded ${TRACKED_PATHS_MAX_BYTES} bytes`,
        "reduce the repository's tracked path count or raise the explicit missionctl bound before relying on this merge check",
      );
    }
    failGit("merge.git-unavailable", "the git executable is unavailable", "install Git and rerun missionctl merge check in the checked-out repository");
  }
  if (result.status !== 0 || typeof result.stdout !== "string") failGit(failureCode, failureMessage, repair);
  return result.stdout;
}

function normalizeExclude(value: string): string {
  const unsafe =
    value.length === 0 ||
    /[\u0000-\u001f\u007f]/u.test(value) ||
    isAbsolute(value) ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    value.startsWith("/");
  const slash = value.replaceAll("\\", "/");
  const segments = slash.split("/").filter((segment) => segment.length > 0);
  if (unsafe || segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    throw new MissionctlError(
      "merge.invalid-exclude",
      `--exclude must be a non-empty repository-relative path without dot, parent, or control segments; got ${JSON.stringify(value)}`,
      { exitCode: 2 },
    );
  }
  return segments.join("/");
}

function excluded(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function artifactKind(path: string): "loop" | "mission" | undefined {
  if (path === "LOOP.md" || path.endsWith("/LOOP.md")) return "loop";
  if (path === ".mission/mission.yaml" || path.endsWith("/.mission/mission.yaml")) return "mission";
  return undefined;
}

function displayPath(path: string): string {
  return /[\u0000-\u001f\u007f]/u.test(path) ? JSON.stringify(path) : path;
}

function artifactIssue(path: string, kind: "loop" | "mission"): Issue {
  const shown = displayPath(path);
  if (kind === "loop") {
    return {
      code: "merge.branch-local-artifact",
      severity: "error",
      path,
      message: `${shown} is branch-local campaign state and must not enter the tree merged into a shared branch (any branch others build on, not only the default one)`,
      repair: `finish the campaign, use missionctl close to route durable decisions and file each unfinished unit as a tracker issue, and remove ${shown} before merging into a shared branch`,
    };
  }
  return {
    code: "merge.branch-local-artifact",
    severity: "error",
    path,
    message: `${shown} is branch-local mission state and must not enter the tree merged into a shared branch (any branch others build on, not only the default one)`,
    repair: `after the final campaign, preserve only current standing law, file each unfinished rubric item as a tracker issue unless the user explicitly waives it, then remove ${shown} before merging into a shared branch`,
  };
}

export function checkMergeTree(root: string, additionalExcludes: readonly string[] = []): MergeCheck {
  const requestedExcludes = [...DEFAULT_MERGE_EXCLUDES, ...additionalExcludes].map(normalizeExclude);
  const excludes = [...new Set(requestedExcludes)];
  const requestedRoot = resolve(root);
  const topLevel = git(
    requestedRoot,
    ["rev-parse", "--show-toplevel"],
    "merge.not-git-repository",
    "the merge-check root is not inside a Git worktree",
    "check out the repository and rerun missionctl merge check, or pass --root <repository-path>",
  );
  const repository = resolve(topLevel.replace(/\r?\n$/u, ""));
  const tracked = git(
    repository,
    ["ls-files", "--cached", "--full-name", "-z"],
    "merge.index-unreadable",
    "the tracked Git tree could not be read",
    "repair the repository index, then rerun missionctl merge check",
  );
  const paths = [...new Set(tracked.split("\0").filter((path) => path.length > 0))].sort();
  const issues = paths.flatMap((path) => {
    if (excluded(path, excludes)) return [];
    const kind = artifactKind(path);
    return kind ? [artifactIssue(path, kind)] : [];
  });
  return { ok: issues.length === 0, repository, excludes, issues };
}
