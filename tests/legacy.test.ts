import { existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { adoptLoop, evaluateAdoptableLoop, evaluateLoop } from "../src/loop/index.js";
import { FIXTURES, NOW, fixtureCopy, json, readText, run, tempRoot } from "./helpers.js";

interface Inspection {
  ok: boolean;
  path: string | null;
  classification: "loop" | "legacy-mission-control" | "legacy-untyped" | "none";
  preview: { headings: string[]; decisions: string[]; work_plan: string[]; fields: string[] } | null;
  issues: unknown[];
}

interface Adoption {
  ok: boolean;
  source: string;
  target: string;
  written: boolean;
  draft: string;
  issues: Array<{ code: string; severity: string; path: string }>;
}

describe("inspect", () => {
  it("classifies an untyped legacy loop and previews its unresolved content", () => {
    const root = resolve(FIXTURES, "legacy-untyped");
    const result = run(["inspect", "--root", root, "--json"]);

    expect(result.status).toBe(0);
    expect(json<Inspection>(result)).toEqual({
      ok: true,
      path: resolve(root, "LOOP.md"),
      classification: "legacy-untyped",
      preview: {
        headings: ["State (updated 2026-08-20)", "Decisions (append-only; do not re-litigate)", "Work plan (ADF per unit)", "Verification floors", "Boundaries — NEVER"],
        decisions: [
          "2026-08-19 — Keep the offset parameter accepted but ignored for one release. Why: two external callers. provisional",
          "2026-08-20 — Log a deprecation warning when offset is present. ratified",
        ],
        work_plan: ["Remove offset handling from the list endpoint.", "Update the two internal scripts."],
        fields: [],
      },
      issues: [],
    });
    expect(run(["inspect", "--root", root]).stdout).toBe(
      `${resolve(root, "LOOP.md")}: legacy-untyped\n` +
        "HEADINGS State (updated 2026-08-20) | Decisions (append-only; do not re-litigate) | Work plan (ADF per unit) | Verification floors | Boundaries — NEVER\n" +
        "DECISIONS 2\n" +
        "WORK PLAN 2\n" +
        "NEXT missionctl adopt --root <root> to draft a typed LOOP.md; add --write once the draft validates\n",
    );
  });

  it("classifies a mission_control legacy loop by its frontmatter fields", () => {
    const root = resolve(FIXTURES, "legacy-mission-control");
    const inspection = json<Inspection>(run(["inspect", "--root", root, "--json"]));

    expect(inspection.classification).toBe("legacy-mission-control");
    expect(inspection.preview?.fields).toEqual([
      "mission_control",
      "mission_id",
      "campaign_id",
      "objective",
      "status",
      "phase",
      "iteration",
      "iteration_budget",
      "targets",
      "attention",
      "next_action",
      "updated_at",
      "head",
      "review_capacity",
      "evidence",
    ]);
  });

  it("recognizes the legacy .claude/loop.md path and reports typed and absent loops", () => {
    const root = tempRoot("dot-claude");
    mkdirSync(resolve(root, ".claude"));
    writeFileSync(resolve(root, ".claude/loop.md"), "# Loop: old\n\n## Decisions\n\n1. 2026-01-01 — keep. ratified\n");
    expect(json<Inspection>(run(["inspect", "--root", root, "--json"]))).toMatchObject({
      path: resolve(root, ".claude/loop.md"),
      classification: "legacy-untyped",
    });

    expect(json<Inspection>(run(["inspect", "--root", resolve(FIXTURES, "standalone"), "--json"]))).toMatchObject({
      classification: "loop",
      preview: null,
      issues: [],
    });
    expect(json<Inspection>(run(["inspect", "--root", tempRoot("none"), "--json"]))).toEqual({
      ok: true,
      path: null,
      classification: "none",
      preview: null,
      issues: [],
    });
  });

  it("keeps legacy loops visible in the statusline", () => {
    expect(run(["statusline", "--root", resolve(FIXTURES, "legacy-untyped")])).toMatchObject({
      status: 0,
      stdout: "loop legacy-untyped · missionctl inspect\n",
      stderr: "",
    });
  });

  it("makes check fail visibly on legacy loops with an adoption path", () => {
    for (const [name, code] of [
      ["legacy-untyped", "legacy.untyped"],
      ["legacy-mission-control", "legacy.mission-control"],
    ] as const) {
      const result = run(["check", "--root", resolve(FIXTURES, name), "--json"]);
      expect(result.status).toBe(1);
      expect(json(result)).toEqual({
        ok: false,
        loop: { path: resolve(FIXTURES, name, "LOOP.md"), classification: name },
        issues: [
          {
            code,
            severity: "error",
            path: "",
            message: expect.stringContaining(name),
            repair: expect.stringContaining("missionctl adopt"),
          },
        ],
      });
    }
  });
});

describe("adopt", () => {
  it("drafts a typed loop from an untyped legacy loop and writes only on request", () => {
    const root = fixtureCopy("legacy-untyped");
    const source = resolve(root, "LOOP.md");
    const before = readText(source);

    const preview = run(["adopt", "--root", root, "--now", NOW, "--json"]);
    expect(preview.status).toBe(0);
    const adoption = json<Adoption>(preview);
    expect(adoption).toMatchObject({ ok: true, source, target: source, written: false, issues: [] });
    expect(adoption.draft).toBe(`---
loop: 1
id: legacy-widget-cleanup
objective: Remove the deprecated offset listing before the next release.
status: active
iteration: 0
iteration_budget: 8
updated_at: 2026-08-29T12:30:00Z
targets: {}
gates:
  - id: gate-1
    run: npm test
    green: all widget tests pass.
    state: unknown
  - id: gate-2
    run: npm run lint
    green: no lint errors.
    state: unknown
units:
  - id: U1
    title: Remove offset handling from the list endpoint.
    state: current
  - id: U2
    title: Update the two internal scripts.
    state: pending
decisions:
  - date: 2026-08-19
    call: "Keep the offset parameter accepted but ignored for one release. Why: two external callers."
    status: provisional
  - date: 2026-08-20
    call: Log a deprecation warning when offset is present.
    status: ratified
blockers: []
boundary:
  - Never push, open PRs, merge, or publish without per-artifact authorization.
  - Never delete customer data.
---
${before}`);
    expect(readText(source)).toBe(before);

    const written = run(["adopt", "--root", root, "--now", NOW, "--write", "--json"]);
    expect(written.status).toBe(0);
    expect(json<Adoption>(written)).toMatchObject({ ok: true, written: true, target: source });
    expect(readText(source)).toBe(adoption.draft);
    expect(readdirSync(root)).toEqual(["LOOP.md"]);
    expect(run(["check", "--root", root, "--json"]).status).toBe(0);
  });

  it("carries every legacy line into the draft body so unmatched content is never lost", () => {
    const root = tempRoot("lossy-adopt");
    const legacy = [
      "# Loop: risky — `feat/risky`",
      "",
      "Mission: land the risky thing. Then do a second thing that matters too.",
      "",
      "## Decisions",
      "",
      "1. 2026-08-19 — Keep the offset parameter. ratified — see PR #42 and INFRA-441 for context.",
      "",
      "## Verification floors",
      "",
      "- `npm test` → all tests pass.",
      "- Manual device check on iOS and Android before merge.",
      "- `npm run lint` → no lint errors.",
      "",
      "## Known pre-existing failures — do not chase",
      "",
      "- flaky-socket-test → red since 2026-07-01 (issue #17)",
      "",
      "## Boundaries",
      "",
      "- Never publish.",
      "",
    ].join("\n");
    writeFileSync(resolve(root, "LOOP.md"), legacy);

    const adoption = json<Adoption>(run(["adopt", "--root", root, "--now", NOW, "--json"]));
    expect(adoption.ok).toBe(true);
    expect(adoption.draft.endsWith(`---\n${legacy}`)).toBe(true);
    expect(adoption.draft).toContain("objective: Land the risky thing.\n");
    expect(adoption.draft).toContain('    call: "Keep the offset parameter. — see PR #42 and INFRA-441 for context."\n');
    expect(adoption.draft).toContain("  - id: gate-1\n    run: npm test\n    green: all tests pass.\n");
    expect(adoption.draft).toContain("  - id: gate-2\n    run: npm run lint\n    green: no lint errors.\n");
    const frontmatter = adoption.draft.slice(0, adoption.draft.indexOf("\n---\n"));
    expect(frontmatter).not.toContain("Manual device check");
    expect(frontmatter).not.toContain("gate-3");
    expect(adoption.draft.slice(adoption.draft.indexOf("\n---\n") + 5)).toBe(legacy);
  });

  it("moves a .claude/loop.md adoption to LOOP.md and removes the legacy file", () => {
    const root = tempRoot("dot-claude-adopt");
    mkdirSync(resolve(root, ".claude"));
    writeFileSync(
      resolve(root, ".claude/loop.md"),
      "# Loop: nested\n\nFinish the nested thing.\n\n## Verification floors\n\n- `make check` → green.\n\n## Boundaries\n\n- Never publish.\n",
    );

    const result = run(["adopt", "--root", root, "--now", NOW, "--write", "--json"]);
    expect(result.status).toBe(0);
    expect(json<Adoption>(result)).toMatchObject({ source: resolve(root, ".claude/loop.md"), target: resolve(root, "LOOP.md"), written: true });
    expect(existsSync(resolve(root, ".claude/loop.md"))).toBe(false);
    expect(readText(resolve(root, "LOOP.md"))).toContain("id: nested\nobjective: Finish the nested thing.\n");
    expect(run(["check", "--root", root, "--json"]).status).toBe(0);
  });

  it("refuses to write an invalid draft from a mission_control loop and leaves the file untouched", () => {
    const root = fixtureCopy("legacy-mission-control");
    const source = resolve(root, "LOOP.md");
    const before = readText(source);

    const result = run(["adopt", "--root", root, "--now", NOW, "--write", "--json"]);
    expect(result.status).toBe(1);
    const adoption = json<Adoption>(result);
    expect(adoption).toMatchObject({ ok: false, written: false, source, target: source });
    expect(adoption.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "loop.missing-field", path: "gates" }),
        expect.objectContaining({ code: "mission.missing", path: "mission.id" }),
      ]),
    );
    expect(adoption.draft).toContain("id: codex-slash-command\nobjective: Add one bounded mission command surface.\nstatus: done\nphase: BOUNDARY\niteration: 3\niteration_budget: 4\n");
    expect(adoption.draft).toContain("mission:\n  id: codex-mission-surface\ntargets:\n  mission:\n    - CONTRACT-001\n");
    expect(adoption.draft).toContain("units:\n  - id: U1\n    title: Review the Codex mission command branch.\n    state: current\n");
    expect(adoption.draft).toContain("legacy_mission_control:\n  attention: publish\n  head: codex123\n  review_capacity:\n    measure: command surfaces\n    limit: one command\n  evidence: []\n");
    expect(adoption.issues).toContainEqual(expect.objectContaining({ code: "loop.unknown-field", path: "legacy_mission_control", severity: "warning" }));
    expect(adoption.draft.endsWith(`---\n${before.slice(before.indexOf("\n---\n") + 5)}`)).toBe(true);
    expect(readText(source)).toBe(before);
  });

  it("never adopts more than one file or an already typed loop", () => {
    const typed = run(["adopt", "--root", resolve(FIXTURES, "standalone"), "--json"]);
    expect(typed.status).toBe(1);
    expect(json(typed)).toEqual({ ok: false, error: { code: "legacy.already-typed", message: expect.stringContaining("LOOP.md") } });

    const none = run(["adopt", "--root", tempRoot("adopt-none"), "--json"]);
    expect(none.status).toBe(1);
    expect(json(none)).toEqual({ ok: false, error: { code: "loop.not-found", message: expect.any(String) } });

    expect(run(["adopt", "--root", resolve(FIXTURES, "legacy-untyped"), "--root", resolve(FIXTURES, "legacy-mission-control")]).status).toBe(2);
  });
});

describe("adoption never overwrites", () => {
  it("refuses to write when a LOOP.md appears at the target after evaluation", () => {
    const root = tempRoot("adopt-race");
    mkdirSync(resolve(root, ".claude"));
    writeFileSync(resolve(root, ".claude/loop.md"), readText(resolve(FIXTURES, "legacy-untyped/LOOP.md")));
    const evaluation = evaluateLoop(root);
    writeFileSync(resolve(root, "LOOP.md"), "# not a loop\n");

    expect(() => adoptLoop(evaluation, new Date(NOW), true)).toThrow(expect.objectContaining({ code: "legacy.target-exists" }));
    expect(readText(resolve(root, "LOOP.md"))).toBe("# not a loop\n");
    expect(existsSync(resolve(root, ".claude/loop.md"))).toBe(true);
  });
});

describe("untyped frontmatter", () => {
  it("preserves unmapped frontmatter of an untyped loop under legacy_mission_control", () => {
    const root = tempRoot("untyped-frontmatter");
    const legacy = readText(resolve(FIXTURES, "legacy-untyped/LOOP.md"));
    writeFileSync(resolve(root, "LOOP.md"), `---\nnotes: keep me\nowner: allen\n---\n${legacy}`);

    const adoption = json<{ draft: string; issues: Array<{ code: string; path: string }> }>(run(["adopt", "--root", root, "--now", NOW, "--json"]));
    expect(adoption.draft).toContain("legacy_mission_control:\n  notes: keep me\n  owner: allen\n");
    expect(adoption.issues).toContainEqual(expect.objectContaining({ code: "loop.unknown-field", path: "legacy_mission_control" }));
    expect(adoption.draft.endsWith(`---\n${legacy}`)).toBe(true);
  });

  it("carries frontmatter that is not a YAML mapping into the body verbatim", () => {
    const root = tempRoot("untyped-broken-frontmatter");
    const legacy = readText(resolve(FIXTURES, "legacy-untyped/LOOP.md"));
    writeFileSync(resolve(root, "LOOP.md"), `---\nfoo: [\n---\n${legacy}`);

    const adoption = json<{ draft: string }>(run(["adopt", "--root", root, "--now", NOW, "--json"]));
    expect(adoption.draft.endsWith(`---\n${legacy}\n## Legacy frontmatter\n\n\`\`\`yaml\nfoo: [\n\`\`\`\n`)).toBe(true);
  });
});

describe("review round 7 findings", () => {
  it("preserves every mission_control field whose value cannot convert under legacy_mission_control", () => {
    const root = tempRoot("lossy-mission-control");
    const body = "\n# Fixture\r\n\r\nBody with CRLF.\r\n";
    writeFileSync(
      resolve(root, "LOOP.md"),
      [
        "---",
        "mission_control: 1",
        "mission_id: mc",
        "mission_source: { repository: https://example.invalid/mc.git }",
        "campaign_id: partial",
        "objective: Convert what converts.",
        "status: sprinting",
        "iteration: three",
        "iteration_budget: four",
        "targets: [A, 2]",
        "next_action: Do the thing.",
        "---",
      ].join("\n") + body,
    );

    const adoption = json<Adoption>(run(["adopt", "--root", root, "--now", NOW, "--json"]));
    expect(adoption.draft).toContain("id: partial\nobjective: Convert what converts.\nstatus: active\niteration: 0\niteration_budget: 8\n");
    expect(adoption.draft).toContain("mission:\n  id: mc\ntargets: {}\n");
    expect(adoption.draft).toContain("units:\n  - id: U1\n    title: Do the thing.\n    state: current\n");
    expect(adoption.draft).toContain(
      "legacy_mission_control:\n  mission_source:\n    repository: https://example.invalid/mc.git\n  status: sprinting\n  iteration: three\n  iteration_budget: four\n  targets:\n    - A\n    - 2\n",
    );
    expect(adoption.draft.endsWith(`---${body}`)).toBe(true);
  });

  it("fences mission_control frontmatter that is not a YAML mapping into the body instead of dropping it", () => {
    const root = tempRoot("broken-mission-control");
    writeFileSync(resolve(root, "LOOP.md"), "---\nmission_control: 1\nfoo: [\n---\n# Fixture\n");

    expect(json<Inspection>(run(["inspect", "--root", root, "--json"])).classification).toBe("legacy-mission-control");
    const adoption = json<Adoption>(run(["adopt", "--root", root, "--now", NOW, "--json"]));
    expect(adoption.draft.endsWith("---\n# Fixture\n\n## Legacy frontmatter\n\n```yaml\nmission_control: 1\nfoo: [\n```\n")).toBe(true);
  });

  it("treats a dangling symlink at the adoption target as existing rather than replacing it", () => {
    const root = tempRoot("adopt-dangling");
    mkdirSync(resolve(root, ".claude"));
    writeFileSync(resolve(root, ".claude/loop.md"), readText(resolve(FIXTURES, "legacy-untyped/LOOP.md")));
    symlinkSync(resolve(root, "missing-target"), resolve(root, "LOOP.md"));

    expect(() => adoptLoop(evaluateAdoptableLoop(root), new Date(NOW), true)).toThrow(expect.objectContaining({ code: "legacy.target-exists" }));
    expect(lstatSync(resolve(root, "LOOP.md")).isSymbolicLink()).toBe(true);
    expect(existsSync(resolve(root, ".claude/loop.md"))).toBe(true);
    expect(readdirSync(root).sort()).toEqual([".claude", "LOOP.md"]);
  });
});
