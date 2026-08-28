import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyLoop, parseLoop, type Issue } from "../src/loop/index.js";
import { FIXTURES } from "./helpers.js";

const STANDALONE = readFileSync(resolve(FIXTURES, "standalone/LOOP.md"), "utf8");

const MINIMAL = `---
loop: 1
id: minimal
objective: Prove the smallest valid loop.
status: planned
iteration_budget: 2
gates:
  - id: check
    run: npm run check
    green: everything passes
boundary: [publish]
---
`;

function codes(issues: readonly Issue[]): string[] {
  return issues.map((issue) => `${issue.severity}:${issue.code}`);
}

function withFrontmatter(edit: (lines: string[]) => string[]): string {
  const [, frontmatter, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(STANDALONE)!;
  return `---\n${edit(frontmatter.split("\n")).join("\n")}\n---\n${body}`;
}

describe("loop classification", () => {
  it("distinguishes typed loops from both legacy shapes", () => {
    expect(classifyLoop(STANDALONE)).toBe("loop");
    expect(classifyLoop(readFileSync(resolve(FIXTURES, "legacy-mission-control/LOOP.md"), "utf8"))).toBe("legacy-mission-control");
    expect(classifyLoop(readFileSync(resolve(FIXTURES, "legacy-untyped/LOOP.md"), "utf8"))).toBe("legacy-untyped");
    expect(classifyLoop("---\ntitle: notes\n---\n# no schema\n")).toBe("legacy-untyped");
  });
});

describe("loop grammar", () => {
  it("accepts the standalone fixture and preserves its body byte-for-byte", () => {
    const read = parseLoop(STANDALONE, "LOOP.md");

    expect(read.issues).toEqual([]);
    expect(read.document).toMatchObject({
      loop: 1,
      id: "widget-pagination",
      status: "active",
      phase: "TDD",
      iteration: 3,
      iteration_budget: 8,
      targets: { spec: ["REQ-WIDGET-002"], brief: ["Correctness"] },
      boundary: ["publish", "merge-tracked-ref"],
    });
    expect(read.document?.units.map((unit) => [unit.id, unit.state])).toEqual([
      ["U1", "done"],
      ["U2", "current"],
      ["U3", "pending"],
    ]);
    expect(read.body).toBe(STANDALONE.slice(STANDALONE.indexOf("\n---\n") + 5));
  });

  it("accepts the minimal loop with defaults filled", () => {
    const read = parseLoop(MINIMAL, "LOOP.md");

    expect(read.issues).toEqual([]);
    expect(read.document).toEqual({
      loop: 1,
      id: "minimal",
      objective: "Prove the smallest valid loop.",
      status: "planned",
      iteration: 0,
      iteration_budget: 2,
      targets: {},
      gates: [{ id: "check", run: "npm run check", green: "everything passes", state: "unknown" }],
      units: [],
      decisions: [],
      blockers: [],
      boundary: ["publish"],
    });
  });

  it.each([
    ["loop", "loop.missing-field"],
    ["id", "loop.missing-field"],
    ["objective", "loop.missing-field"],
    ["status", "loop.missing-field"],
    ["iteration_budget", "loop.missing-field"],
    ["gates", "loop.missing-field"],
    ["boundary", "loop.missing-field"],
  ])("reports a missing %s with a repair hint", (field, code) => {
    const text = withFrontmatter((lines) => {
      const start = lines.findIndex((line) => line.startsWith(`${field}:`));
      let end = start + 1;
      while (end < lines.length && /^\s/.test(lines[end])) end += 1;
      return [...lines.slice(0, start), ...lines.slice(end)];
    });
    const read = parseLoop(text, "LOOP.md");

    expect(read.issues).toContainEqual(
      expect.objectContaining({ code, severity: "error", path: field, repair: expect.stringContaining(field) }),
    );
  });

  it.each([
    ["status: active", "status: sprinting", "loop.invalid-enum", "status"],
    ["phase: TDD", "phase: SHIP", "loop.invalid-enum", "phase"],
    ["    state: red", "    state: amber", "loop.invalid-enum", "gates[0].state"],
    ["    state: current", "    state: doing", "loop.invalid-enum", "units[1].state"],
    ["    status: ratified", "    status: final", "loop.invalid-enum", "decisions[0].status"],
    ["iteration: 3", "iteration: 9", "loop.iteration-over-budget", "iteration"],
    ["iteration: 3", "iteration: -1", "loop.invalid-field", "iteration"],
    ["iteration_budget: 8", "iteration_budget: 0", "loop.invalid-field", "iteration_budget"],
    ["updated_at: 2026-08-29T12:00:00Z", "updated_at: yesterday", "loop.invalid-field", "updated_at"],
    ["  - id: typecheck", "  - id: unit", "loop.duplicate-id", "gates[1].id"],
    ["  - id: U3", "  - id: U1", "loop.duplicate-id", "units[2].id"],
    ["    state: pending", "    state: current", "loop.multiple-current-units", "units"],
    ["status: active", "status: blocked", "loop.blocked-without-blockers", "blockers"],
    ["status: active", "status: waiting", "loop.missing-expected-signal", "expected_signal_by"],
    ["status: active", "status: done", "loop.done-with-red-gate", "gates[0].state"],
  ])("rejects the line %s rewritten as %s with %s at %s", (from, to, code, path) => {
    const text = withFrontmatter((lines) => lines.map((line) => (line === from ? to : line)));

    expect(text).not.toBe(STANDALONE);
    expect(parseLoop(text, "LOOP.md").issues).toContainEqual(expect.objectContaining({ code, severity: "error", path }));
  });

  it.each([
    ["gates", MINIMAL.replace(/^gates:[\s\S]*?(?=boundary:)/m, "gates: []\n")],
    ["boundary", MINIMAL.replace("boundary: [publish]", "boundary: []")],
  ])("rejects an empty %s list", (field, source) => {
    expect(parseLoop(source, "LOOP.md").issues).toContainEqual(
      expect.objectContaining({ code: "loop.invalid-field", severity: "error", path: field }),
    );
  });

  it("warns when an active loop has no current unit", () => {
    const text = withFrontmatter((lines) => lines.map((line) => (line === "    state: current" ? "    state: pending" : line)));

    expect(codes(parseLoop(text, "LOOP.md").issues)).toEqual(["warning:loop.no-current-unit"]);
  });

  it("accepts a closing fence at end of input without a trailing newline", () => {
    const read = parseLoop(MINIMAL.trimEnd(), "LOOP.md");

    expect(read.issues).toEqual([]);
    expect(read.body).toBe("");
  });

  it("reports frontmatter that is not YAML or not closed as a parse error", () => {
    expect(parseLoop("---\nloop: [1\n---\n", "LOOP.md").issues).toEqual([
      expect.objectContaining({ code: "loop.parse-error", severity: "error" }),
    ]);
    expect(parseLoop("---\nloop: 1\nid: x\n", "LOOP.md").issues).toEqual([
      expect.objectContaining({ code: "loop.parse-error", severity: "error" }),
    ]);
  });
});

describe("tolerant reads", () => {
  it("accepts CRLF, a BOM, coercible integers, unknown fields, and the short mission form", () => {
    const text = `﻿${MINIMAL.replace("iteration_budget: 2", 'iteration_budget: "2"\niteration: "1"\nmission: regional-rollout\nowner: allen')}# Body\n`.replaceAll(
      "\n",
      "\r\n",
    );
    const read = parseLoop(text, "LOOP.md");

    expect(codes(read.issues).sort()).toEqual([
      "warning:loop.coerced-field",
      "warning:loop.coerced-field",
      "warning:loop.unknown-field",
    ]);
    expect(read.document).toMatchObject({ iteration: 1, iteration_budget: 2, mission: { id: "regional-rollout" } });
    // The body is read as written: only the frontmatter's line endings are normalized.
    expect(read.body).toBe("# Body\r\n");
  });

  it("rejects non-integer strings instead of coercing them", () => {
    const read = parseLoop(MINIMAL.replace("iteration_budget: 2", 'iteration_budget: "two"'), "LOOP.md");

    expect(read.issues).toEqual([expect.objectContaining({ code: "loop.invalid-field", path: "iteration_budget" })]);
  });
});

describe("review round 4 findings", () => {
  it("rejects control characters and newlines in any string field", () => {
    const text = withFrontmatter((lines) => lines.map((line) => (line === "  - id: U1" ? '  - id: "U1\\nsecond line"' : line)));

    expect(parseLoop(text, "LOOP.md").issues).toEqual([
      expect.objectContaining({ code: "loop.invalid-field", severity: "error", path: "units[0].id", message: expect.stringContaining("single line") }),
    ]);
  });

  it("preserves and warns about unknown fields nested in gates, units, decisions, blockers, and the mission link", () => {
    const text = withFrontmatter((lines) =>
      lines.flatMap((line) => {
        if (line === "    run: npm test") return [line, "    timeout: 5"];
        if (line === "    title: Cursor encoding helper") return [line, "    owner: allen"];
        return [line];
      }),
    );
    const read = parseLoop(text, "LOOP.md");

    expect(codes(read.issues)).toEqual(["warning:loop.unknown-field", "warning:loop.unknown-field"]);
    expect(read.issues.map((issue) => issue.path)).toEqual(["gates[0].timeout", "units[0].owner"]);
    expect(read.document?.gates[0]).toEqual({ id: "unit", run: "npm test", green: "all widget tests pass", state: "red", extra: { timeout: 5 } });
    expect(read.document?.units[0]).toEqual({ id: "U1", title: "Cursor encoding helper", targets: ["REQ-WIDGET-002"], state: "done", extra: { owner: "allen" } });
  });

  it("rejects timestamps and dates that do not exist on the calendar", () => {
    const timestamp = withFrontmatter((lines) => lines.map((line) => (line.startsWith("updated_at:") ? "updated_at: 2026-02-30T12:00:00Z" : line)));
    expect(parseLoop(timestamp, "LOOP.md").issues).toEqual([expect.objectContaining({ code: "loop.invalid-field", path: "updated_at" })]);

    const date = withFrontmatter((lines) => lines.map((line) => (line === "  - date: 2026-08-28" ? "  - date: 2026-02-30" : line)));
    expect(parseLoop(date, "LOOP.md").issues).toEqual([expect.objectContaining({ code: "loop.invalid-field", path: "decisions[0].date" })]);
  });

  it("classifies by parsed YAML keys, not by regex on the raw text", () => {
    expect(classifyLoop(MINIMAL.replace("loop: 1", '"loop": 1'))).toBe("loop");
    expect(classifyLoop("---\n\"mission_control\": 1\n---\n")).toBe("legacy-mission-control");
    expect(classifyLoop("---\nnotes: |\n  loop: 1\n---\n")).toBe("legacy-untyped");
    expect(classifyLoop("---\nloop: [1\n---\n")).toBe("loop");
  });
});
