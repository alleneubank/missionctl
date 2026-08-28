import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FIXTURES, NOW, fixtureCopy, replaceInFile, run, tempRoot } from "./helpers.js";

function hook(cwd: string, input?: string, cacheRoot = tempRoot("claude-tmp")) {
  return {
    cacheRoot,
    result: run(["harness", "claude", "session-start", "--now", NOW], {
      input: input ?? JSON.stringify({ session_id: "session-fixture", cwd, hook_event_name: "SessionStart", source: "startup" }),
      env: { TMPDIR: cacheRoot },
    }),
  };
}

describe("Claude session-start harness", () => {
  it("injects the bounded context as additional context without writing files", () => {
    const { result, cacheRoot } = hook(resolve(FIXTURES, "standalone"));

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          "Campaign state from LOOP.md (read it before continuing; run `missionctl context` to refresh).\n" +
          "LOOP widget-pagination [active] phase=TDD iteration=3/8\n" +
          "OBJECTIVE Ship cursor pagination for widget listing behind the existing API.\n" +
          "UNIT U2 List endpoint accepts cursor (REQ-WIDGET-002)\n" +
          "RED unit: npm test → all widget tests pass\n" +
          "DECISION 2026-08-28 ratified: Cursors are opaque base64url strings.\n" +
          "DECISION 2026-08-29 provisional: Page size defaults to 50 and caps at 200.\n" +
          "BLOCKERS none\n" +
          "BOUNDARY publish, merge-tracked-ref",
      },
    });
    expect(readdirSync(cacheRoot)).toEqual([]);
  });

  it("names invalid state instead of hiding it", () => {
    const root = fixtureCopy("standalone");
    replaceInFile(resolve(root, "LOOP.md"), "status: active", "status: sprinting");

    const { result } = hook(root);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `LOOP.md at ${resolve(root, "LOOP.md")} is invalid (1 issue). Run \`missionctl check\` and repair it before continuing.`,
      },
    });
  });

  it("names legacy loops so they are adopted deliberately", () => {
    const { result } = hook(resolve(FIXTURES, "legacy-untyped"));

    expect(JSON.parse(result.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: `LOOP.md at ${resolve(FIXTURES, "legacy-untyped/LOOP.md")} is a legacy-untyped loop. Run \`missionctl inspect\` and adopt it deliberately before continuing.`,
      },
    });
  });

  it("never blocks a session when state or input is unavailable", () => {
    const empty = tempRoot("claude-empty");
    const cases = [hook(empty), hook(empty, "not-json"), hook(empty, "x".repeat(65_537)), hook(empty, JSON.stringify({ session_id: "s" }))];
    for (const { result, cacheRoot } of cases) {
      expect(result).toMatchObject({ status: 0, stdout: "{}\n", stderr: "" });
      expect(readdirSync(cacheRoot)).toEqual([]);
    }
  });
});

describe("review round 7 findings", () => {
  it("counts warnings alongside errors when naming invalid state", () => {
    const root = fixtureCopy("standalone");
    replaceInFile(resolve(root, "LOOP.md"), "status: active", "status: sprinting\nowner: allen");

    const { result } = hook(root);
    expect(JSON.parse(result.stdout).hookSpecificOutput.additionalContext).toBe(`LOOP.md at ${resolve(root, "LOOP.md")} is invalid (2 issues). Run \`missionctl check\` and repair it before continuing.`);
  });
});
