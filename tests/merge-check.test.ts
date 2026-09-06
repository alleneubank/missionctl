import { mkdirSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { json, run, tempRoot, writeText } from "./helpers.js";

interface MergeIssue {
  code: "merge.branch-local-artifact";
  severity: "error";
  path: string;
  message: string;
  repair: string;
}

interface MergeCheckOutput {
  ok: boolean;
  repository: string;
  excludes: string[];
  issues: MergeIssue[];
}

function git(root: string, args: readonly string[]): void {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  expect(result, `git ${args.join(" ")} failed: ${result.stderr}`).toMatchObject({ status: 0 });
}

function repository(name: string): string {
  const root = tempRoot(`merge-${name}`);
  git(root, ["init", "--quiet"]);
  writeText(resolve(root, "README.md"), "# Fixture repository\n");
  git(root, ["add", "--", "README.md"]);
  return root;
}

function track(root: string, relative: string, text = "fixture\n"): void {
  mkdirSync(dirname(resolve(root, relative)), { recursive: true });
  writeText(resolve(root, relative), text);
  git(root, ["add", "--", relative]);
}

describe("shared-branch merge guard", () => {
  it("passes a tracked tree with no live control artifacts", () => {
    const root = repository("clean");

    expect(run(["merge", "check", "--root", root])).toEqual({
      status: 0,
      stdout: "missionctl merge check: ok\n",
      stderr: "",
    });
    expect(json<MergeCheckOutput>(run(["merge", "check", "--root", root, "--json"]))).toEqual({
      ok: true,
      repository: root,
      excludes: ["tests/fixtures"],
      issues: [],
    });
  });

  it("reports every tracked loop and mission with artifact-specific advice", () => {
    const root = repository("artifacts");
    track(root, "LOOP.md");
    track(root, "nested/LOOP.md");
    track(root, "services/api/.mission/mission.yaml");

    const result = run(["merge", "check", "--root", root, "--json"]);
    expect(result.status).toBe(1);
    expect(json<MergeCheckOutput>(result)).toEqual({
      ok: false,
      repository: root,
      excludes: ["tests/fixtures"],
      issues: [
        {
          code: "merge.branch-local-artifact",
          severity: "error",
          path: "LOOP.md",
          message:
            "LOOP.md is branch-local campaign state and must not enter the tree merged into a shared branch (any branch others build on, not only the default one)",
          repair:
            "finish the campaign, use missionctl close to route durable decisions and file each unfinished unit as a tracker issue, and remove LOOP.md before merging into a shared branch",
        },
        {
          code: "merge.branch-local-artifact",
          severity: "error",
          path: "nested/LOOP.md",
          message:
            "nested/LOOP.md is branch-local campaign state and must not enter the tree merged into a shared branch (any branch others build on, not only the default one)",
          repair:
            "finish the campaign, use missionctl close to route durable decisions and file each unfinished unit as a tracker issue, and remove nested/LOOP.md before merging into a shared branch",
        },
        {
          code: "merge.branch-local-artifact",
          severity: "error",
          path: "services/api/.mission/mission.yaml",
          message:
            "services/api/.mission/mission.yaml is branch-local mission state and must not enter the tree merged into a shared branch (any branch others build on, not only the default one)",
          repair:
            "after the final campaign, preserve only current standing law, file each unfinished rubric item as a tracker issue unless the user explicitly waives it, then remove services/api/.mission/mission.yaml before merging into a shared branch",
        },
      ],
    });
    expect(run(["merge", "check", "--root", root]).stdout).toContain("missionctl merge check: blocked (3 artifacts)\n");
  });

  it("ignores untracked state and the default fixture prefix", () => {
    const root = repository("ambient");
    writeText(resolve(root, "LOOP.md"), "untracked\n");
    track(root, "tests/fixtures/campaign/LOOP.md");
    track(root, "tests/fixtures/campaign/.mission/mission.yaml");

    expect(run(["merge", "check", "--root", root])).toMatchObject({ status: 0, stdout: "missionctl merge check: ok\n" });
  });

  it("adds repeatable exact-prefix exclusions without masking neighboring paths", () => {
    const root = repository("excludes");
    track(root, "docs/contracts/LOOP.md");
    track(root, "sample/.mission/mission.yaml");
    track(root, "tests/fixtures-old/LOOP.md");

    const guarded = json<MergeCheckOutput>(
      run(["merge", "check", "--root", root, "--exclude", "docs/contracts/", "--exclude", "sample", "--json"]),
    );
    expect(guarded.excludes).toEqual(["tests/fixtures", "docs/contracts", "sample"]);
    expect(guarded.issues.map((issue) => issue.path)).toEqual(["tests/fixtures-old/LOOP.md"]);
  });

  it.each(["", ".", "..", "../fixtures", "/tmp/fixtures", "fixtures/../campaign", "fixtures\nother"])(
    "refuses the unsafe exclusion %j",
    (exclude) => {
      const root = repository("unsafe-exclude");
      const result = run(["merge", "check", "--root", root, "--exclude", exclude, "--json"]);

      expect(result.status).toBe(2);
      expect(json<{ ok: false; error: { code: string; message: string } }>(result)).toEqual({
        ok: false,
        error: { code: "merge.invalid-exclude", message: expect.stringContaining(JSON.stringify(exclude)) },
      });
    },
  );

  it("fails closed outside a Git worktree and when Git is unavailable", () => {
    const root = tempRoot("merge-not-git");

    const notRepository = run(["merge", "check", "--root", root, "--json"]);
    expect(notRepository.status).toBe(1);
    expect(json<{ ok: false; error: { code: string } }>(notRepository).error.code).toBe("merge.not-git-repository");

    const unavailable = run(["merge", "check", "--root", root, "--json"], { env: { PATH: "" } });
    expect(unavailable.status).toBe(1);
    expect(json<{ ok: false; error: { code: string } }>(unavailable).error.code).toBe("merge.git-unavailable");
  });

  it("detects a tracked dangling symlink at an exact artifact path", () => {
    const root = repository("symlink");
    symlinkSync("missing-target", resolve(root, "LOOP.md"));
    git(root, ["add", "--", "LOOP.md"]);

    expect(json<MergeCheckOutput>(run(["merge", "check", "--root", root, "--json"])).issues.map((issue) => issue.path)).toEqual(["LOOP.md"]);
  });

  it("escapes control characters in human output while preserving JSON paths", () => {
    const root = repository("control-path");
    const relative = "nested\n::warning::not-an-annotation\nsegment/LOOP.md";
    track(root, relative);

    expect(json<MergeCheckOutput>(run(["merge", "check", "--root", root, "--json"])).issues[0].path).toBe(relative);
    const text = run(["merge", "check", "--root", root]).stdout;
    expect(text).toContain("nested\\n::warning::not-an-annotation\\nsegment/LOOP.md");
    expect(text).not.toContain("\n::warning::not-an-annotation\nsegment");
  });
});
