import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FIXTURES, NOW, fixtureCopy, json, readText, replaceInFile, run, tempRoot, writeText } from "./helpers.js";

const STANDALONE = resolve(FIXTURES, "standalone");
const MISSION_LINKED = resolve(FIXTURES, "mission-linked");
const ALPHA = resolve(MISSION_LINKED, "campaigns/alpha");

interface Issue {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
  repair: string;
}

interface CheckOutput {
  ok: boolean;
  loop: { path: string; id?: string; status?: string; classification: string } | null;
  issues: Issue[];
}

const STANDALONE_CONTEXT = {
  loop: {
    path: resolve(STANDALONE, "LOOP.md"),
    id: "widget-pagination",
    status: "active",
    phase: "TDD",
    iteration: 3,
    iteration_budget: 8,
  },
  objective: "Ship cursor pagination for widget listing behind the existing API.",
  current_unit: { id: "U2", title: "List endpoint accepts cursor", targets: ["REQ-WIDGET-002"] },
  red_gates: [{ id: "unit", run: "npm test", green: "all widget tests pass", state: "red" }],
  red_gates_total: 1,
  decisions: [
    { date: "2026-08-28", call: "Cursors are opaque base64url strings.", status: "ratified" },
    { date: "2026-08-29", call: "Page size defaults to 50 and caps at 200.", status: "provisional" },
  ],
  blockers: [],
  boundary: ["publish", "merge-tracked-ref"],
  mission: null,
  warnings: [],
  truncated: false,
};

const STANDALONE_CONTEXT_TEXT =
  "LOOP widget-pagination [active] phase=TDD iteration=3/8\n" +
  "OBJECTIVE Ship cursor pagination for widget listing behind the existing API.\n" +
  "UNIT U2 List endpoint accepts cursor (REQ-WIDGET-002)\n" +
  "RED unit: npm test → all widget tests pass\n" +
  "DECISION 2026-08-28 ratified: Cursors are opaque base64url strings.\n" +
  "DECISION 2026-08-29 provisional: Page size defaults to 50 and caps at 200.\n" +
  "BLOCKERS none\n" +
  "BOUNDARY publish, merge-tracked-ref\n";

describe("standalone loop contract", () => {
  it("validates a standalone LOOP.md with nothing else present", () => {
    const result = run(["check", "--root", STANDALONE, "--now", NOW, "--json"]);

    expect(result.status).toBe(0);
    expect(json<CheckOutput>(result)).toEqual({
      ok: true,
      loop: { path: resolve(STANDALONE, "LOOP.md"), id: "widget-pagination", status: "active", classification: "loop" },
      issues: [],
    });
    expect(run(["check", "--root", STANDALONE, "--now", NOW])).toMatchObject({ status: 0, stdout: "missionctl check: ok\n", stderr: "" });
  });

  it("finds the loop from a nested working directory", () => {
    const nested = fixtureCopy("standalone");
    const deep = resolve(nested, "src/deep");
    mkdirSync(deep, { recursive: true });

    const result = run(["context", "--json", "--now", NOW], { cwd: deep });
    expect(result.status).toBe(0);
    expect(json<{ loop: { path: string } }>(result).loop.path).toBe(resolve(nested, "LOOP.md"));
  });

  it("projects the bounded context as stable JSON and text", () => {
    const structured = run(["context", "--root", STANDALONE, "--now", NOW, "--json"]);
    const text = run(["context", "--root", STANDALONE, "--now", NOW]);

    expect(structured.status).toBe(0);
    expect(json(structured)).toEqual(STANDALONE_CONTEXT);
    expect(text).toMatchObject({ status: 0, stdout: STANDALONE_CONTEXT_TEXT, stderr: "" });
  });

  it("renders the one-line statusline", () => {
    expect(run(["statusline", "--root", STANDALONE, "--now", NOW])).toMatchObject({
      status: 0,
      stdout: "active TDD · unit U2 · gates 1 red · 3/8\n",
      stderr: "",
    });
    expect(run(["statusline", "--root", resolve(FIXTURES, "sox-visual-pilot"), "--now", NOW]).stdout).toBe(
      "done BOUNDARY · unit none · gates 0 red · 3/6\n",
    );
  });

  it("creates no directory or file as a side effect of read-only commands", () => {
    const root = fixtureCopy("standalone");
    for (const command of [["check"], ["context"], ["statusline"], ["inspect"], ["compact", "prepare"]]) {
      expect(run([...command, "--root", root, "--now", NOW, "--json"]).status).toBe(0);
    }

    expect(readdirSync(root).sort()).toEqual(["BRIEF.md", "LOOP.md", "SPEC.md"]);
    expect(existsSync(resolve(root, ".mission"))).toBe(false);
  });

  it("reports absence distinctly from invalidity", () => {
    const empty = tempRoot("empty");

    expect(json(run(["check", "--root", empty, "--json"]))).toEqual({ ok: true, loop: null, issues: [] });
    expect(run(["check", "--root", empty]).stdout).toBe("missionctl check: no LOOP.md at or above root\n");
    for (const command of ["context", "statusline"]) {
      const result = run([command, "--root", empty, "--json"]);
      expect(result.status).toBe(1);
      expect(json(result)).toEqual({ ok: false, error: { code: "loop.not-found", message: expect.any(String) } });
    }
  });
});

describe("bounded projection", () => {
  it("caps lists, marks truncation, and still reports the true red gate count", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const gates = Array.from({ length: 12 }, (_, index) => `  - id: g${index}\n    run: cmd ${index}\n    green: ok\n    state: red`).join("\n");
    const unknown = Array.from({ length: 300 }, (_, index) => `extra_${index}: ${index}`).join("\n");
    replaceInFile(loop, /gates:\n[\s\S]*?(?=units:)/.exec(readText(loop))![0], `gates:\n${gates}\n`);
    replaceInFile(loop, "boundary:\n", `${unknown}\nboundary:\n`);

    const context = json<{ red_gates: unknown[]; red_gates_total: number; warnings: string[]; truncated: boolean }>(
      run(["context", "--root", root, "--now", NOW, "--json"]),
    );
    expect(context.red_gates).toHaveLength(8);
    expect(context.red_gates_total).toBe(12);
    expect(context.warnings).toHaveLength(8);
    expect(context.truncated).toBe(true);
    expect(run(["context", "--root", root, "--now", NOW]).stdout.length).toBeLessThan(4_096);
    expect(run(["statusline", "--root", root, "--now", NOW]).stdout).toBe("active TDD · unit U2 · gates 12 red · 3/8\n");
  });
});

describe("manual edits", () => {
  it("keeps a valid direct edit valid", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    replaceInFile(loop, "iteration: 3", "iteration: 4");
    replaceInFile(loop, "blockers: []", "blockers:\n  - summary: Cursor spec ambiguous for empty pages\n    proposed: Return an empty page with a null cursor");
    replaceInFile(loop, "## Notes", "## Notes (edited by hand)");

    const check = run(["check", "--root", root, "--now", NOW, "--json"]);
    expect(check.status).toBe(0);
    expect(json<CheckOutput>(check).issues).toEqual([]);
    expect(json<{ blockers: unknown[] }>(run(["context", "--root", root, "--now", NOW, "--json"])).blockers).toEqual([
      { summary: "Cursor spec ambiguous for empty pages", proposed: "Return an empty page with a null cursor" },
    ]);
  });

  it("fails an invalid direct edit visibly in check, context, and statusline with a repair path", () => {
    const root = fixtureCopy("standalone");
    replaceInFile(resolve(root, "LOOP.md"), "status: active", "status: sprinting");

    const check = run(["check", "--root", root, "--now", NOW, "--json"]);
    expect(check.status).toBe(1);
    const output = json<CheckOutput>(check);
    expect(output.ok).toBe(false);
    expect(output.issues).toEqual([
      {
        code: "loop.invalid-enum",
        severity: "error",
        path: "status",
        message: expect.stringContaining("sprinting"),
        repair: expect.stringContaining("planned, active, waiting, blocked, done, budget-exhausted, superseded"),
      },
    ]);
    expect(run(["check", "--root", root, "--now", NOW]).stdout).toBe(
      `${resolve(root, "LOOP.md")}: error loop.invalid-enum status: ${output.issues[0].message}\n  repair: ${output.issues[0].repair}\n`,
    );

    const context = run(["context", "--root", root, "--now", NOW, "--json"]);
    expect(context.status).toBe(1);
    expect(json(context)).toEqual({ ok: false, error: { code: "loop.invalid", message: expect.stringContaining("1 error") }, issues: output.issues });

    expect(run(["statusline", "--root", root, "--now", NOW])).toMatchObject({
      status: 0,
      stdout: "loop invalid · 1 issue · missionctl check\n",
      stderr: "",
    });
  });

  it("resolves targets against the nearest SPEC.md and BRIEF.md", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    replaceInFile(loop, "spec: [REQ-WIDGET-002]", "spec: [REQ-WIDGET-002, REQ-WIDGET-999]");
    replaceInFile(loop, "brief: [Correctness]", "brief: [Correctness, Velocity]");

    const output = json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"]));
    expect(output.issues).toEqual([
      expect.objectContaining({ code: "target.unknown-spec-requirement", path: "targets.spec[1]", message: expect.stringContaining("REQ-WIDGET-999") }),
      expect.objectContaining({ code: "target.unknown-brief-floor", path: "targets.brief[1]", message: expect.stringContaining("Velocity") }),
    ]);
  });

  it("reports missing standing docs when targets need them", () => {
    const root = fixtureCopy("standalone");
    for (const name of ["SPEC.md", "BRIEF.md"]) writeText(resolve(root, name), "");

    const output = json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"]));
    expect(output.issues.map((issue) => issue.code)).toEqual(["target.unknown-spec-requirement", "target.brief-missing-floors"]);
  });

  it("surfaces tolerant-read warnings without failing check", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    writeText(loop, readText(loop).replace("iteration: 3", 'iteration: "3"\nowner: allen').replaceAll("\n", "\r\n"));

    const check = run(["check", "--root", root, "--now", NOW, "--json"]);
    expect(check.status).toBe(0);
    expect(json<CheckOutput>(check).issues.map((issue) => `${issue.severity}:${issue.code}`)).toEqual([
      "warning:loop.coerced-field",
      "warning:loop.unknown-field",
    ]);
    expect(json<{ warnings: string[] }>(run(["context", "--root", root, "--now", NOW, "--json"])).warnings).toEqual([
      "loop.coerced-field iteration: coerced \"3\" to 3",
      "loop.unknown-field owner: unknown field is preserved but ignored",
    ]);
  });
});

describe("repair", () => {
  it("canonicalizes a tolerant read, preserves the body, and is idempotent", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const original = readText(loop);
    const body = original.slice(original.indexOf("\n---\n") + 5);
    writeText(loop, original.replace("iteration: 3", 'iteration: "3"\nowner: allen').replaceAll("\n", "\r\n"));

    const dry = run(["repair", "--root", root, "--now", NOW, "--dry-run", "--json"]);
    expect(dry.status).toBe(0);
    expect(json(dry)).toEqual({ ok: true, path: loop, written: false, changes: ["iteration: coerced \"3\" to 3", "normalized line endings", "canonical formatting"] });
    expect(readText(loop)).toContain("\r\n");

    const repaired = run(["repair", "--root", root, "--now", NOW, "--json"]);
    expect(repaired.status).toBe(0);
    expect(json(repaired)).toEqual({ ok: true, path: loop, written: true, changes: ["iteration: coerced \"3\" to 3", "normalized line endings", "canonical formatting"] });
    const text = readText(loop);
    // Canonical frontmatter is LF; the body is the driver's and keeps the CRLF it was written with.
    expect(text.slice(0, text.indexOf("\n---\n") + 5)).not.toContain("\r");
    expect(text.endsWith(body.replaceAll("\n", "\r\n"))).toBe(true);
    expect(text).toContain("owner: allen");
    expect(json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"])).issues).toEqual([
      expect.objectContaining({ code: "loop.unknown-field", severity: "warning" }),
    ]);

    expect(json(run(["repair", "--root", root, "--now", NOW, "--json"]))).toEqual({ ok: true, path: loop, written: false, changes: [] });
  });

  it("writes nothing while errors remain", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    replaceInFile(loop, "status: active", "status: sprinting");
    const before = readText(loop);

    const result = run(["repair", "--root", root, "--now", NOW, "--json"]);
    expect(result.status).toBe(1);
    expect(json(result)).toEqual({
      ok: false,
      path: loop,
      written: false,
      changes: [],
      issues: [expect.objectContaining({ code: "loop.invalid-enum" })],
    });
    expect(readText(loop)).toBe(before);
  });
});

describe("optional mission", () => {
  it("validates a mission-linked loop against the mission rubric", () => {
    const check = run(["check", "--root", ALPHA, "--now", NOW, "--json"]);
    expect(check.status).toBe(0);
    expect(json<CheckOutput>(check).issues).toEqual([]);

    const context = json<{ mission: unknown }>(run(["context", "--root", ALPHA, "--now", NOW, "--json"]));
    expect(context.mission).toEqual({ id: "regional-rollout", targets: ["REGION-002"], available: true });
    expect(run(["context", "--root", ALPHA, "--now", NOW]).stdout).toContain("MISSION regional-rollout targets=REGION-002\n");
  });

  it("rejects unknown mission targets and mismatched mission ids", () => {
    const root = fixtureCopy("mission-linked");
    const loop = resolve(root, "campaigns/alpha/LOOP.md");
    replaceInFile(loop, "mission: [REGION-002]", "mission: [REGION-002, REGION-404]");
    expect(json<CheckOutput>(run(["check", "--root", resolve(root, "campaigns/alpha"), "--json"])).issues).toEqual([
      expect.objectContaining({ code: "target.unknown-mission-rubric", path: "targets.mission[1]" }),
    ]);

    replaceInFile(loop, "mission: regional-rollout", "mission: other-mission");
    expect(json<CheckOutput>(run(["check", "--root", resolve(root, "campaigns/alpha"), "--json"])).issues).toEqual([
      expect.objectContaining({ code: "mission.id-mismatch", severity: "error", path: "mission.id" }),
    ]);
  });

  it("degrades an unavailable external mission source visibly without failing the loop", () => {
    const root = fixtureCopy("standalone");
    replaceInFile(
      resolve(root, "LOOP.md"),
      "targets:\n",
      "mission:\n  id: fleet-outcome\n  source:\n    repository: https://example.invalid/fleet.git\n    ref: main\n    path: .mission/mission.yaml\ntargets:\n  mission: [FLEET-001]\n",
    );

    const check = run(["check", "--root", root, "--now", NOW, "--json"]);
    expect(check.status).toBe(0);
    expect(json<CheckOutput>(check).issues).toEqual([
      expect.objectContaining({
        code: "mission.unavailable",
        severity: "warning",
        message: expect.stringContaining("https://example.invalid/fleet.git@main:.mission/mission.yaml"),
      }),
    ]);
    expect(json<{ mission: unknown }>(run(["context", "--root", root, "--now", NOW, "--json"])).mission).toEqual({
      id: "fleet-outcome",
      targets: ["FLEET-001"],
      available: false,
    });
  });

  it("fails a local mission link that cannot be found", () => {
    const root = fixtureCopy("standalone");
    replaceInFile(resolve(root, "LOOP.md"), "targets:\n", "mission: fleet-outcome\ntargets:\n");

    const check = run(["check", "--root", root, "--now", NOW, "--json"]);
    expect(check.status).toBe(1);
    expect(json<CheckOutput>(check).issues).toEqual([
      expect.objectContaining({ code: "mission.missing", severity: "error", path: "mission.id", repair: expect.stringContaining(".mission/mission.yaml") }),
    ]);
  });

  it("projects the mission with its discovered campaigns", () => {
    const result = run(["mission", "--root", MISSION_LINKED, "--now", NOW, "--json"]);

    expect(result.status).toBe(0);
    expect(json(result)).toEqual({
      ok: true,
      mission: {
        path: resolve(MISSION_LINKED, ".mission/mission.yaml"),
        id: "regional-rollout",
        title: "Regional rollout of the widget service",
        outcome: "Every region runs the widget service with cursor pagination and no offset callers.",
        achieved: false,
        rubric: [
          { id: "REGION-001", status: "met", evidence: "ci://rollout/canary/2026-08-27" },
          { id: "REGION-002", status: "open" },
          { id: "REGION-003", status: "open" },
        ],
        boundary: ["publish", "production-cutover"],
      },
      campaigns: [{ path: resolve(ALPHA, "LOOP.md"), id: "rollout-wave-two", status: "done", targets: ["REGION-002"] }],
      issues: [],
    });
    expect(run(["mission", "--root", MISSION_LINKED, "--now", NOW]).stdout).toBe(
      "MISSION regional-rollout [open] achieved=false\n" +
        "REGION-001\tmet\tci://rollout/canary/2026-08-27\n" +
        "REGION-002\topen\n" +
        "REGION-003\topen\n" +
        "CAMPAIGN rollout-wave-two [done] targets=REGION-002\n",
    );
  });

  it("discovers every campaign in a file-heavy source tree without spending the directory bound", () => {
    const root = fixtureCopy("mission-linked");
    const filler = resolve(root, "src");
    mkdirSync(filler);
    for (let index = 0; index < 1_100; index += 1) writeText(resolve(filler, `file-${index}.ts`), "");

    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(0);
    const output = json<{ ok: boolean; campaigns: Array<{ id: string }>; issues: Issue[] }>(result);
    expect(output.ok).toBe(true);
    expect(output.campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two"]);
    expect(output.issues).toEqual([]);
  });

  it("prunes a repo-local Zig global cache before its descendants spend the directory bound", () => {
    const root = fixtureCopy("mission-linked");
    const cache = resolve(root, ".zig-global-cache");
    mkdirSync(cache);
    for (let index = 0; index < 1_100; index += 1) mkdirSync(resolve(cache, `dir-${index}`));

    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(0);
    const output = json<{ ok: boolean; campaigns: Array<{ id: string }>; issues: Issue[] }>(result);
    expect(output.ok).toBe(true);
    expect(output.campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two"]);
    expect(output.issues).toEqual([]);
  });

  it("allows a directory-heavy repository below the explicit bound", () => {
    const root = fixtureCopy("mission-linked");
    const filler = resolve(root, "generated");
    mkdirSync(filler);
    for (let index = 0; index < 1_100; index += 1) mkdirSync(resolve(filler, `dir-${index}`));

    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(0);
    expect(json<{ campaigns: Array<{ id: string }> }>(result).campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two"]);
  });

  it("keeps discovered campaigns and fails visibly when discovery hits its directory bound", () => {
    const root = fixtureCopy("mission-linked");
    const filler = resolve(root, "zzz-filler");
    mkdirSync(filler);
    for (let index = 0; index < 10_001; index += 1) mkdirSync(resolve(filler, `dir-${index}`));

    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(1);
    const output = json<{ ok: boolean; campaigns: Array<{ id: string }>; issues: Issue[] }>(result);
    expect(output.ok).toBe(false);
    expect(output.campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two"]);
    expect(output.issues).toEqual([
      expect.objectContaining({
        code: "mission.discovery-bounded",
        severity: "error",
        message: expect.stringContaining("10000 directories"),
      }),
    ]);
  });

  it("ignores unrelated dangling symlinks while discovering and resolving real artifacts", () => {
    const root = fixtureCopy("mission-linked");
    const alpha = resolve(root, "campaigns/alpha");
    symlinkSync(resolve(root, "missing-file"), resolve(root, "dangling-file"));
    symlinkSync(resolve(alpha, "missing-directory"), resolve(alpha, "dangling-directory"));

    expect(run(["check", "--root", alpha, "--json"]).status).toBe(0);
    expect(json<{ classification: string }>(run(["inspect", "--root", alpha, "--json"])).classification).toBe("loop");
    const mission = run(["mission", "--root", root, "--json"]);
    expect(mission.status).toBe(0);
    expect(json<{ campaigns: Array<{ id: string }> }>(mission).campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two"]);
  });

  it("fails visibly instead of following a symbolic link at a discovered LOOP.md path", () => {
    const root = fixtureCopy("mission-linked");
    const beta = resolve(root, "campaigns/beta");
    mkdirSync(beta);
    symlinkSync(resolve(beta, "missing-loop"), resolve(beta, "LOOP.md"));

    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(1);
    const output = json<{ ok: boolean; campaigns: Array<{ id: string }>; issues: Issue[] }>(result);
    expect(output.ok).toBe(false);
    expect(output.campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two"]);
    expect(output.issues).toEqual([
      expect.objectContaining({ code: "mission.campaign-unreadable", severity: "error", path: resolve(beta, "LOOP.md") }),
    ]);
  });

  it("discovers an exact LOOP.md symlink when its target is a readable loop file", () => {
    const root = fixtureCopy("mission-linked");
    const beta = resolve(root, "campaigns/beta");
    mkdirSync(beta);
    writeText(resolve(beta, "linked-loop.md"), readText(resolve(ALPHA, "LOOP.md")).replace("id: rollout-wave-two", "id: rollout-wave-three"));
    symlinkSync(resolve(beta, "linked-loop.md"), resolve(beta, "LOOP.md"));

    expect(run(["check", "--root", beta, "--json"]).status).toBe(0);
    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(0);
    expect(json<{ campaigns: Array<{ id: string }> }>(result).campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two", "rollout-wave-three"]);
  });

  it.each(["LOOP.md", ".claude/loop.md"])("fails visibly when %s is a dangling symlink", (relative) => {
    const root = tempRoot("dangling-loop-contract");
    const contract = resolve(root, relative);
    mkdirSync(resolve(contract, ".."), { recursive: true });
    symlinkSync(resolve(root, "missing-loop"), contract);

    for (const command of ["check", "inspect"] as const) {
      const result = run([command, "--root", root, "--json"]);
      expect(result.status).toBe(1);
      expect(json<{ error: { code: string } }>(result).error.code).toBe("loop.unreadable");
    }
  });

  it("does not let a readable legacy loop mask a dangling typed loop contract", () => {
    const root = tempRoot("dangling-typed-with-legacy");
    mkdirSync(resolve(root, ".claude"));
    writeText(resolve(root, ".claude/loop.md"), readText(resolve(FIXTURES, "legacy-untyped/LOOP.md")));
    symlinkSync(resolve(root, "missing-loop"), resolve(root, "LOOP.md"));

    for (const command of ["check", "inspect"] as const) {
      const result = run([command, "--root", root, "--json"]);
      expect(result.status).toBe(1);
      expect(json<{ error: { code: string } }>(result).error.code).toBe("loop.unreadable");
    }
  });

  it("fails visibly when .mission/mission.yaml is a dangling symlink", () => {
    const root = tempRoot("dangling-mission-contract");
    mkdirSync(resolve(root, ".mission"));
    symlinkSync(resolve(root, "missing-mission"), resolve(root, ".mission/mission.yaml"));

    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(1);
    expect(json<{ issues: Issue[] }>(result).issues).toEqual([
      expect.objectContaining({ code: "mission.unreadable", severity: "error", path: "" }),
    ]);
  });

  it("reports malformed missions and the absence of a mission", () => {
    const root = fixtureCopy("mission-linked");
    replaceInFile(resolve(root, ".mission/mission.yaml"), "status: met", "status: met\n    evidence: ''");
    replaceInFile(resolve(root, ".mission/mission.yaml"), "    evidence: ci://rollout/canary/2026-08-27\n", "");
    const malformed = run(["mission", "--root", root, "--json"]);
    expect(malformed.status).toBe(1);
    expect(json<{ issues: Issue[] }>(malformed).issues).toEqual([
      expect.objectContaining({ code: "mission.missing-evidence", path: "rubric[0].evidence" }),
    ]);

    const none = run(["mission", "--root", tempRoot("no-mission"), "--json"]);
    expect(none.status).toBe(1);
    expect(json(none)).toEqual({ ok: false, error: { code: "mission.not-found", message: expect.any(String) } });
  });
});

describe("usage", () => {
  it("prints usage on no arguments and rejects unknown commands with exit 2", () => {
    expect(run([])).toMatchObject({ status: 2 });
    expect(run(["frobnicate"])).toMatchObject({ status: 2 });
    expect(run(["frobnicate", "--json"])).toMatchObject({ status: 2 });
    expect(json(run(["frobnicate", "--json"]))).toEqual({ ok: false, error: { code: "usage", message: expect.stringContaining("frobnicate") } });
  });
});

describe("review round 3 findings", () => {
  it("names a missing SPEC.md or BRIEF.md distinctly from an unknown id", () => {
    const root = fixtureCopy("standalone");
    for (const name of ["SPEC.md", "BRIEF.md"]) rmSync(resolve(root, name));

    const output = json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"]));
    expect(output.ok).toBe(false);
    expect(output.issues.map((issue) => issue.code)).toEqual(["target.spec-missing-doc", "target.brief-missing-doc"]);
  });

  it("rejects mission targets on a loop that links no mission", () => {
    const root = fixtureCopy("standalone");
    replaceInFile(resolve(root, "LOOP.md"), "targets:\n", "targets:\n  mission: [REGION-002]\n");

    const output = json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"]));
    expect(output.ok).toBe(false);
    expect(output.issues).toEqual([expect.objectContaining({ code: "target.mission-unlinked", path: "targets.mission", severity: "error" })]);
  });

  it("reports an unparseable or duplicated mission from both the mission and the linked loop", () => {
    const root = fixtureCopy("mission-linked");
    const mission = resolve(root, ".mission/mission.yaml");
    const alpha = resolve(root, "campaigns/alpha");

    writeText(mission, "mission: 1\n- not a mapping entry\n");
    expect(json<{ issues: Issue[] }>(run(["mission", "--root", root, "--json"])).issues).toEqual([expect.objectContaining({ code: "mission.parse-error", severity: "error" })]);
    const linked = json<CheckOutput>(run(["check", "--root", alpha, "--now", NOW, "--json"]));
    expect(linked.ok).toBe(false);
    expect(linked.issues).toEqual([expect.objectContaining({ code: "mission.invalid", path: "mission.id" })]);

    const duplicated = fixtureCopy("mission-linked");
    replaceInFile(resolve(duplicated, ".mission/mission.yaml"), "id: REGION-003", "id: REGION-002");
    expect(json<{ issues: Issue[] }>(run(["mission", "--root", duplicated, "--json"])).issues).toEqual([expect.objectContaining({ code: "mission.duplicate-id", path: "rubric[2].id" })]);
  });

  it("reports an invalid discovered campaign without hiding the valid ones", () => {
    const root = fixtureCopy("mission-linked");
    const beta = resolve(root, "campaigns/beta");
    mkdirSync(beta);
    writeText(resolve(beta, "LOOP.md"), "---\nloop: 1\nid: rollout-wave-three\nmission: regional-rollout\n---\n");

    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(0);
    const output = json<{ ok: boolean; campaigns: Array<{ id: string }>; issues: Issue[] }>(result);
    expect(output.ok).toBe(true);
    expect(output.campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two"]);
    expect(output.issues).toEqual([expect.objectContaining({ code: "mission.campaign-invalid", severity: "warning", path: resolve(beta, "LOOP.md") })]);
  });
});

describe("dogfood findings", () => {
  it("resolves a cross-repository mission source from a sibling checkout", () => {
    const parent = tempRoot("sibling");
    const consumer = resolve(parent, "consumer");
    const rollout = resolve(parent, "rollout");
    cpSync(resolve(FIXTURES, "standalone"), consumer, { recursive: true });
    mkdirSync(resolve(rollout, ".mission"), { recursive: true });
    writeText(resolve(rollout, ".mission/mission.yaml"), readText(resolve(MISSION_LINKED, ".mission/mission.yaml")));
    replaceInFile(
      resolve(consumer, "LOOP.md"),
      "targets:\n",
      "mission:\n  id: regional-rollout\n  source:\n    repository: git@github.com:alleneubank/rollout.git\n    ref: main\n    path: .mission/mission.yaml\ntargets:\n  mission: [REGION-002]\n",
    );

    const check = run(["check", "--root", consumer, "--now", NOW, "--json"]);
    expect(check.status).toBe(0);
    expect(json<CheckOutput>(check).issues).toEqual([]);
    expect(json<{ mission: unknown }>(run(["context", "--root", consumer, "--now", NOW, "--json"])).mission).toEqual({ id: "regional-rollout", targets: ["REGION-002"], available: true });

    replaceInFile(resolve(consumer, "LOOP.md"), "mission: [REGION-002]", "mission: [REGION-404]");
    expect(json<CheckOutput>(run(["check", "--root", consumer, "--now", NOW, "--json"])).issues).toEqual([
      expect.objectContaining({ code: "target.unknown-mission-rubric", path: "targets.mission[0]", message: expect.stringContaining(resolve(rollout, ".mission/mission.yaml")) }),
    ]);
  });

  it("does not claim or stat through a dangling cross-repository mission source during projection", () => {
    const parent = tempRoot("dangling-sibling-mission");
    const root = resolve(parent, "rollout");
    const sibling = resolve(parent, "elsewhere");
    cpSync(MISSION_LINKED, root, { recursive: true });
    mkdirSync(resolve(sibling, ".mission"), { recursive: true });
    symlinkSync(resolve(sibling, "missing-mission"), resolve(sibling, ".mission/mission.yaml"));
    replaceInFile(
      resolve(root, "campaigns/alpha/LOOP.md"),
      "mission: regional-rollout\n",
      "mission:\n  id: regional-rollout\n  source:\n    repository: https://example.invalid/elsewhere.git\n    ref: main\n    path: .mission/mission.yaml\n",
    );

    const result = run(["mission", "--root", root, "--json"]);
    expect(result.status).toBe(0);
    const output = json<{ ok: boolean; campaigns: unknown[]; issues: Issue[] }>(result);
    expect(output.ok).toBe(true);
    expect(output.campaigns).toEqual([]);
    expect(output.issues).toEqual([]);
  });

  it("warns when an unquoted # turns the tail of a free-text value into a comment", () => {
    const root = fixtureCopy("standalone");
    replaceInFile(resolve(root, "LOOP.md"), "title: Remove offset parameter", "title: Remove offset parameter; see PR #12 for callers");

    const check = run(["check", "--root", root, "--now", NOW, "--json"]);
    expect(check.status).toBe(0);
    expect(json<CheckOutput>(check).issues).toEqual([
      {
        code: "loop.comment-in-value",
        severity: "warning",
        path: "units[2].title",
        message: 'units[2].title ends at "Remove offset parameter; see PR"; "#12 for callers" was read as a YAML comment',
        repair: 'quote the value if the # belongs to it: title: "Remove offset parameter; see PR #12 for callers"',
      },
    ]);
    expect(run(["context", "--root", root, "--now", NOW]).stdout).toContain("WARNING loop.comment-in-value units[2].title");
  });
});

describe("review round 4 findings", () => {
  it("caps every projected string and keeps the statusline to one line", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const long = "x".repeat(20_000);
    replaceInFile(loop, "  - publish\n", `  - ${long}\n`);
    replaceInFile(loop, "  - id: U2\n", `  - id: ${"u".repeat(300)}\n`);

    const context = json<{ boundary: string[]; current_unit: { id: string }; truncated: boolean }>(run(["context", "--root", root, "--now", NOW, "--json"]));
    expect(context.boundary[0].length).toBe(240);
    expect(context.current_unit.id.length).toBe(240);
    expect(context.truncated).toBe(true);

    const statusline = run(["statusline", "--root", root, "--now", NOW]);
    expect(statusline.status).toBe(0);
    expect(statusline.stdout.endsWith("\n")).toBe(true);
    expect(statusline.stdout.slice(0, -1)).not.toContain("\n");
    expect(statusline.stdout.length).toBeLessThan(300);
  });

  it("keeps unknown nested fields through repair", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    replaceInFile(loop, "    run: npm test\n", "    run: npm test\n    timeout: 5\n");

    const check = json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"]));
    expect(check.issues).toEqual([expect.objectContaining({ code: "loop.unknown-field", severity: "warning", path: "gates[0].timeout" })]);

    expect(run(["repair", "--root", root, "--now", NOW, "--json"]).status).toBe(0);
    expect(readText(loop)).toContain("    state: red\n    timeout: 5\n");
  });

  it("never lets a local mission with the same id shadow an explicit source", () => {
    const root = fixtureCopy("mission-linked");
    const alpha = resolve(root, "campaigns/alpha");
    replaceInFile(
      resolve(alpha, "LOOP.md"),
      "mission: regional-rollout\n",
      "mission:\n  id: regional-rollout\n  source:\n    repository: https://example.invalid/elsewhere.git\n    ref: main\n    path: .mission/mission.yaml\n",
    );

    const check = run(["check", "--root", alpha, "--now", NOW, "--json"]);
    expect(check.status).toBe(0);
    expect(json<CheckOutput>(check).issues).toEqual([expect.objectContaining({ code: "mission.unavailable", severity: "warning" })]);
    expect(json<{ mission: { available: boolean } }>(run(["context", "--root", alpha, "--now", NOW, "--json"])).mission.available).toBe(false);
  });

  it("requires brief floors to live under ## Floors", () => {
    const root = fixtureCopy("standalone");
    writeText(resolve(root, "BRIEF.md"), "# Brief\n\n## Never\n\n- Correctness: never guess\n");

    const output = json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"]));
    expect(output.ok).toBe(false);
    expect(output.issues).toEqual([expect.objectContaining({ code: "target.brief-missing-floors", severity: "error", path: "targets.brief[0]" })]);
  });
});

describe("review round 5 findings", () => {
  it("honors --dry-run on apply and rejects flags a command does not support", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const done = readText(loop).replace("status: active", "status: done").replace(/state: (red|unknown)/g, "state: green");
    writeText(loop, done);
    const specBefore = readText(resolve(root, "SPEC.md"));
    const prepared = json<{ items: Array<{ id: string }>; source_sha256: string }>(run(["close", "prepare", "--root", root, "--now", NOW, "--json"]));
    const plan = {
      ...prepared,
      items: prepared.items.map((item) => ({
        ...item,
        disposition: item.id.startsWith("unit:") ? "complete" : item.id.startsWith("decision:") ? "route:spec" : "drop",
      })),
    };
    const planFile = resolve(root, "..", "close-dry-run.json");
    writeText(planFile, JSON.stringify(plan));

    const dry = run(["close", "apply", "--root", root, "--now", NOW, "--plan", planFile, "--dry-run", "--json"]);
    expect(dry.status).toBe(0);
    expect(json<{ ok: boolean; dry_run: boolean; would_delete: string[]; would_route: unknown[] }>(dry)).toMatchObject({ ok: true, dry_run: true, would_delete: [loop] });
    expect(json<{ would_route: unknown[] }>(dry).would_route).toHaveLength(2);
    expect(readText(loop)).toBe(done);
    expect(readText(resolve(root, "SPEC.md"))).toBe(specBefore);

    for (const args of [["check", "--dry-run"], ["adopt", "--dry-run"], ["repair", "--write"], ["context", "--plan", planFile]]) {
      const result = run([...args, "--root", root, "--json"]);
      expect(result.status).toBe(2);
      expect(json<{ error: { code: string } }>(result).error.code).toBe("usage");
    }
    expect(readText(loop)).toBe(done);
  });

  it("refuses to repair a loop while a # comment may have truncated a value", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    replaceInFile(loop, "title: Remove offset parameter", "title: Remove offset parameter; see PR #12 for callers");
    replaceInFile(loop, "iteration: 3", 'iteration: "3"');
    const before = readText(loop);

    const repair = run(["repair", "--root", root, "--now", NOW, "--json"]);
    expect(repair.status).toBe(1);
    expect(json<{ ok: boolean; written: boolean; issues: Issue[] }>(repair)).toMatchObject({ ok: false, written: false });
    expect(json<{ issues: Issue[] }>(repair).issues.map((issue) => issue.code)).toContain("loop.comment-in-value");
    expect(readText(loop)).toBe(before);
  });
});

describe("review round 6 findings", () => {
  it("does not claim a discovered loop whose explicit source is another repository", () => {
    const root = fixtureCopy("mission-linked");
    const beta = resolve(root, "campaigns/beta");
    mkdirSync(beta);
    writeText(
      resolve(beta, "LOOP.md"),
      readText(resolve(root, "campaigns/alpha/LOOP.md"))
        .replace("id: rollout-wave-two", "id: rollout-wave-elsewhere")
        .replace("mission: regional-rollout\n", "mission:\n  id: regional-rollout\n  source:\n    repository: https://example.invalid/elsewhere.git\n    ref: main\n    path: .mission/mission.yaml\n"),
    );

    const output = json<{ ok: boolean; campaigns: Array<{ id: string }>; issues: Issue[] }>(run(["mission", "--root", root, "--json"]));
    expect(output.ok).toBe(true);
    expect(output.campaigns.map((campaign) => campaign.id)).toEqual(["rollout-wave-two"]);
    expect(output.issues).toEqual([]);
  });

  it("reads brief floors only from an exact ## Floors heading outside fenced code", () => {
    const root = fixtureCopy("standalone");
    writeText(resolve(root, "BRIEF.md"), "# Brief\n\n## Floors\n\n```md\n- Correctness: example only\n```\n\n## Floors Appendix\n\n- Correctness: not a floor\n");

    const output = json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"]));
    expect(output.ok).toBe(false);
    expect(output.issues).toEqual([expect.objectContaining({ code: "target.unknown-brief-floor", path: "targets.brief[0]" })]);
  });
});

describe("review round 7 findings", () => {
  it("counts warnings alongside errors in the invalid-loop statusline", () => {
    const root = fixtureCopy("standalone");
    replaceInFile(resolve(root, "LOOP.md"), "status: active", "status: sprinting\nowner: allen");

    expect(json<CheckOutput>(run(["check", "--root", root, "--now", NOW, "--json"])).issues.map((issue) => issue.severity)).toEqual(["error", "warning"]);
    expect(run(["statusline", "--root", root, "--now", NOW]).stdout).toBe("loop invalid · 2 issues · missionctl check\n");
  });
});
