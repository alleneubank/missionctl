import { createHash } from "node:crypto";
import { existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { appendDecisions } from "../src/loop/lifecycle.js";
import { NOW, fixtureCopy, json, readText, replaceInFile, run } from "./helpers.js";

interface PlanItem {
  id: string;
  kind: string;
  summary: string;
  allowed: string[];
  proposed: string;
  disposition: string | null;
  reason: string | null;
  evidence?: string | null;
}

interface Plan {
  plan: 1;
  transition: "compact" | "close";
  loop_path: string;
  source_sha256: string;
  items: PlanItem[];
}

interface Refusal {
  ok: false;
  error: { code: string; message: string };
  issues: Array<{ code: string; path: string; message: string; repair: string }>;
}

function prepare(root: string, transition: "compact" | "close"): Plan {
  const result = run([transition, "prepare", "--root", root, "--now", NOW, "--json"]);
  expect(result.status).toBe(0);
  return json<Plan>(result);
}

function planPath(root: string, plan: Plan): string {
  const path = resolve(root, "..", `${plan.transition}-plan-${plan.source_sha256.slice(0, 8)}.json`);
  writeFileSync(path, JSON.stringify(plan));
  return path;
}

function decide(plan: Plan, dispositions: Record<string, Partial<PlanItem> | string>): Plan {
  return {
    ...plan,
    items: plan.items.map((item) => {
      const choice = dispositions[item.id];
      if (choice === undefined) return item;
      return typeof choice === "string" ? { ...item, disposition: choice } : { ...item, ...choice };
    }),
  };
}

describe("compact", () => {
  it("prepares a plan listing only disposable content with proposals", () => {
    const root = fixtureCopy("standalone");
    const plan = prepare(root, "compact");

    expect(plan).toMatchObject({ plan: 1, transition: "compact", loop_path: resolve(root, "LOOP.md") });
    expect(plan.source_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(plan.items).toEqual([
      { id: "unit:U1", kind: "unit", summary: "U1 Cursor encoding helper [done]", allowed: ["drop", "keep"], proposed: "drop", disposition: null, reason: null },
      {
        id: "decision:0",
        kind: "decision",
        summary: "2026-08-28 ratified: Cursors are opaque base64url strings.",
        allowed: ["keep", "route:spec", "route:brief", "drop"],
        proposed: "route:spec",
        disposition: null,
        reason: null,
      },
      {
        id: "decision:1",
        kind: "decision",
        summary: "2026-08-29 provisional: Page size defaults to 50 and caps at 200.",
        allowed: ["keep", "route:spec", "route:brief", "drop"],
        proposed: "keep",
        disposition: null,
        reason: null,
      },
      { id: "section:State", kind: "section", summary: "## State (1 line)", allowed: ["keep", "drop", "migrated"], proposed: "drop", disposition: null, reason: null },
      { id: "section:Notes", kind: "section", summary: "## Notes (1 line)", allowed: ["keep", "drop", "migrated"], proposed: "drop", disposition: null, reason: null },
    ]);
    expect(run(["compact", "prepare", "--root", root, "--now", NOW]).stdout).toContain("unit:U1\tdrop\tallowed=drop|keep\tU1 Cursor encoding helper [done]");
  });

  it("does not treat headings inside fenced code as sections", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    writeFileSync(loop, `${readText(loop)}\n## Snippet\n\n\`\`\`md\n## not a heading\n\`\`\`\n`);

    expect(prepare(root, "compact").items.map((item) => item.id)).toEqual(["unit:U1", "decision:0", "decision:1", "section:State", "section:Notes", "section:Snippet"]);
  });

  it("routes into a CRLF standing document without changing its line endings", () => {
    const root = fixtureCopy("standalone");
    const spec = resolve(root, "SPEC.md");
    const crlf = readText(spec).replaceAll("\n", "\r\n");
    writeFileSync(spec, crlf);
    const plan = decide(prepare(root, "compact"), { "unit:U1": "keep", "decision:0": "route:spec", "decision:1": "keep", "section:State": "keep", "section:Notes": "keep" });

    expect(run(["compact", "apply", "--root", root, "--plan", planPath(root, plan), "--now", NOW, "--json"]).status).toBe(0);
    expect(readText(spec)).toBe(
      crlf.replace(
        "- 2026-08-20 — Pagination uses cursors, not offsets. **ratified (human)**\r\n",
        "- 2026-08-20 — Pagination uses cursors, not offsets. **ratified (human)**\r\n- 2026-08-28 — Cursors are opaque base64url strings. **ratified (human)**\r\n",
      ),
    );
  });

  it("refuses a plan with unset, disallowed, or reason-less dispositions", () => {
    const root = fixtureCopy("standalone");
    const plan = prepare(root, "compact");

    const unset = run(["compact", "validate", "--root", root, "--plan", planPath(root, plan), "--json"]);
    expect(unset.status).toBe(1);
    expect(json<Refusal>(unset)).toEqual({
      ok: false,
      error: { code: "plan.invalid", message: expect.stringContaining("5 issue") },
      issues: plan.items.map((item) => expect.objectContaining({ code: "plan.missing-disposition", path: `items.${item.id}` })),
    });

    const bad = decide(plan, { "unit:U1": "route:spec", "decision:0": "keep", "decision:1": { disposition: "drop" }, "section:State": "keep", "section:Notes": "drop" });
    const refused = json<Refusal>(run(["compact", "validate", "--root", root, "--plan", planPath(root, bad), "--json"]));
    expect(refused.issues).toEqual([
      expect.objectContaining({ code: "plan.disposition-not-allowed", path: "items.unit:U1" }),
      expect.objectContaining({ code: "plan.missing-reason", path: "items.decision:1" }),
    ]);
    expect(readText(resolve(root, "LOOP.md"))).toBe(readText(resolve(root, "LOOP.md")));
  });

  it("refuses a stale source and an item set that no longer matches", () => {
    const root = fixtureCopy("standalone");
    const plan = decide(prepare(root, "compact"), { "unit:U1": "drop", "decision:0": "keep", "decision:1": "keep", "section:State": "keep", "section:Notes": "keep" });
    replaceInFile(resolve(root, "LOOP.md"), "iteration: 3", "iteration: 4");
    const before = readText(resolve(root, "LOOP.md"));

    const stale = run(["compact", "apply", "--root", root, "--plan", planPath(root, plan), "--json"]);
    expect(stale.status).toBe(1);
    expect(json<Refusal>(stale).issues).toEqual([expect.objectContaining({ code: "plan.stale-source", path: "source_sha256" })]);
    expect(readText(resolve(root, "LOOP.md"))).toBe(before);

    const fresh = prepare(root, "compact");
    const mismatched = { ...fresh, items: [...fresh.items.slice(1), { ...fresh.items[0], id: "unit:U9" }].map((item) => ({ ...item, disposition: item.allowed[0] })) };
    const refused = json<Refusal>(run(["compact", "validate", "--root", root, "--plan", planPath(root, mismatched), "--json"]));
    expect(refused.issues).toEqual([
      expect.objectContaining({ code: "plan.missing-item", path: "items.unit:U1" }),
      expect.objectContaining({ code: "plan.unknown-item", path: "items.unit:U9" }),
    ]);
  });

  it("applies dispositions atomically, routes decisions, and retains everything unresolved", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const specBefore = readText(resolve(root, "SPEC.md"));
    const briefBefore = readText(resolve(root, "BRIEF.md"));
    const plan = decide(prepare(root, "compact"), {
      "unit:U1": "drop",
      "decision:0": "route:spec",
      "decision:1": { disposition: "route:brief" },
      "section:State": "keep",
      "section:Notes": { disposition: "drop" },
    });
    const path = planPath(root, plan);

    const validated = run(["compact", "validate", "--root", root, "--plan", path, "--json"]);
    expect(validated.status).toBe(0);
    expect(json(validated)).toEqual({ ok: true, transition: "compact", loop_path: loop, items: 5 });
    expect(readText(resolve(root, "SPEC.md"))).toBe(specBefore);

    const applied = run(["compact", "apply", "--root", root, "--plan", path, "--now", NOW, "--json"]);
    expect(applied.status).toBe(0);
    expect(json(applied)).toEqual({
      ok: true,
      transition: "compact",
      loop_path: loop,
      written: [resolve(root, "SPEC.md"), resolve(root, "BRIEF.md"), loop],
      routed: [
        { id: "decision:0", to: resolve(root, "SPEC.md") },
        { id: "decision:1", to: resolve(root, "BRIEF.md") },
      ],
      dropped: ["unit:U1", "section:Notes"],
    });

    expect(readText(loop)).toBe(
      `---
loop: 1
id: widget-pagination
objective: Ship cursor pagination for widget listing behind the existing API.
status: active
phase: TDD
iteration: 3
iteration_budget: 8
updated_at: 2026-08-29T12:30:00Z
targets:
  spec:
    - REQ-WIDGET-002
  brief:
    - Correctness
gates:
  - id: unit
    run: npm test
    green: all widget tests pass
    state: red
  - id: typecheck
    run: npm run typecheck
    green: no type errors
    state: green
units:
  - id: U2
    title: List endpoint accepts cursor
    targets:
      - REQ-WIDGET-002
    state: current
  - id: U3
    title: Remove offset parameter
    state: pending
decisions: []
blockers: []
boundary:
  - publish
  - merge-tracked-ref
---

# Loop: widget pagination — \`feat/widget-pagination\`

## State

- U2 red: cursor decode rejects padded input; fix in \`src/list.ts\`.

`,
    );
    expect(readText(resolve(root, "SPEC.md"))).toBe(
      specBefore.replace(
        "- 2026-08-20 — Pagination uses cursors, not offsets. **ratified (human)**\n",
        "- 2026-08-20 — Pagination uses cursors, not offsets. **ratified (human)**\n- 2026-08-28 — Cursors are opaque base64url strings. **ratified (human)**\n",
      ),
    );
    expect(readText(resolve(root, "BRIEF.md"))).toBe(
      `${briefBefore}\n## Decisions\n\n- 2026-08-29 — Page size defaults to 50 and caps at 200. **provisional (driver)**\n`,
    );
    expect(readdirSync(root).sort()).toEqual(["BRIEF.md", "LOOP.md", "SPEC.md"]);
    expect(run(["check", "--root", root, "--now", NOW, "--json"]).status).toBe(0);

    const again = run(["compact", "apply", "--root", root, "--plan", path, "--now", NOW, "--json"]);
    expect(again.status).toBe(1);
    expect(json<Refusal>(again).issues).toEqual([expect.objectContaining({ code: "plan.stale-source" })]);
  });

  it("refuses to drop routed content before its destination exists", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    replaceInFile(loop, "  spec: [REQ-WIDGET-002]\n", "");
    unlinkSync(resolve(root, "SPEC.md"));
    const before = readText(loop);
    const plan = decide(prepare(root, "compact"), {
      "unit:U1": "keep",
      "decision:0": "route:spec",
      "decision:1": "keep",
      "section:State": "keep",
      "section:Notes": "keep",
    });

    const refused = run(["compact", "apply", "--root", root, "--plan", planPath(root, plan), "--now", NOW, "--json"]);
    expect(refused.status).toBe(1);
    expect(json<Refusal>(refused).issues).toEqual([
      expect.objectContaining({ code: "route.target-missing", path: "items.decision:0", message: expect.stringContaining("SPEC.md") }),
    ]);
    expect(readText(loop)).toBe(before);
    expect(readdirSync(root).sort()).toEqual(["BRIEF.md", "LOOP.md"]);
  });
});

describe("close", () => {
  it("refuses a non-terminal loop", () => {
    const root = fixtureCopy("standalone");

    const result = run(["close", "prepare", "--root", root, "--now", NOW, "--json"]);
    expect(result.status).toBe(1);
    expect(json(result)).toEqual({
      ok: false,
      error: { code: "close.not-terminal", message: expect.stringContaining("active") },
      issues: [expect.objectContaining({ code: "close.not-terminal", path: "status", repair: expect.stringContaining("done, budget-exhausted, superseded") })],
    });
    expect(existsSync(resolve(root, "LOOP.md"))).toBe(true);
  });

  it("lists every item needing disposition, including linked mission targets", () => {
    const root = fixtureCopy("mission-linked");
    const alpha = resolve(root, "campaigns/alpha");
    const plan = prepare(alpha, "close");

    expect(plan.items).toEqual([
      {
        id: "decision:0",
        kind: "decision",
        summary: "2026-08-28 ratified: Pause between regions is 30 minutes.",
        allowed: ["route:spec", "route:brief", "drop"],
        proposed: "route:spec",
        disposition: null,
        reason: null,
      },
      {
        id: "decision:1",
        kind: "decision",
        summary: "2026-08-29 provisional: Skip ap-south until its quota increase lands.",
        allowed: ["route:spec", "route:brief", "drop"],
        proposed: "route:spec",
        disposition: null,
        reason: null,
      },
      { id: "section:State", kind: "section", summary: "## State (1 line)", allowed: ["drop", "migrated"], proposed: "drop", disposition: null, reason: null },
      {
        id: "rubric:REGION-002",
        kind: "rubric",
        summary: "REGION-002 [open] All remaining regions run the new build.",
        allowed: ["met", "open", "waived"],
        proposed: "met",
        disposition: null,
        reason: null,
        evidence: null,
      },
    ]);
  });

  it("refuses while content still needs disposition, then dissolves the loop and updates the mission", () => {
    const root = fixtureCopy("mission-linked");
    const alpha = resolve(root, "campaigns/alpha");
    const loop = resolve(alpha, "LOOP.md");
    const plan = prepare(alpha, "close");

    const partial = decide(plan, { "decision:0": "route:spec", "decision:1": "route:brief", "section:State": "migrated", "rubric:REGION-002": "met" });
    const refused = run(["close", "apply", "--root", alpha, "--plan", planPath(alpha, partial), "--now", NOW, "--json"]);
    expect(refused.status).toBe(1);
    expect(json<Refusal>(refused).issues).toEqual([expect.objectContaining({ code: "plan.missing-evidence", path: "items.rubric:REGION-002" })]);
    expect(existsSync(loop)).toBe(true);

    const complete = decide(plan, {
      "decision:0": "route:spec",
      "decision:1": "route:brief",
      "section:State": "migrated",
      "rubric:REGION-002": { disposition: "met", evidence: "ci://rollout/wave-two/2026-08-29" },
    });
    const applied = run(["close", "apply", "--root", alpha, "--plan", planPath(alpha, complete), "--now", NOW, "--json"]);
    expect(applied.status).toBe(0);
    expect(json(applied)).toEqual({
      ok: true,
      transition: "close",
      loop_path: loop,
      written: [resolve(root, "SPEC.md"), resolve(root, "BRIEF.md"), resolve(root, ".mission/mission.yaml")],
      routed: [
        { id: "decision:0", to: resolve(root, "SPEC.md") },
        { id: "decision:1", to: resolve(root, "BRIEF.md") },
      ],
      dropped: ["section:State"],
      deleted: [loop],
    });
    expect(existsSync(loop)).toBe(false);
    expect(readdirSync(alpha)).toEqual([]);
    expect(readText(resolve(root, "SPEC.md"))).toBe(
      "# Rollout service\n\n## Requirements\n\n- REQ-ROLL-001 — Rollouts are staged per region.\n\n## Decisions\n\n- 2026-08-01 — Regions roll in alphabetical order. **ratified (human)**\n- 2026-08-28 — Pause between regions is 30 minutes. **ratified (human)**\n",
    );
    expect(readText(resolve(root, "BRIEF.md"))).toBe(
      "# BRIEF — rollout service\n\n## Floors\n\n- Safety: every rollout step is reversible.\n\n## Decisions\n\n- 2026-08-01 — Canary is one region. **ratified (human)**\n- 2026-08-29 — Skip ap-south until its quota increase lands. **provisional (driver)**\n",
    );
    expect(readText(resolve(root, ".mission/mission.yaml"))).toContain(
      "  - id: REGION-002\n    criterion: All remaining regions run the new build.\n    floor: Every region health green for 24 hours.\n    status: met\n    evidence: ci://rollout/wave-two/2026-08-29\n",
    );
    expect(json<{ mission: { rubric: unknown[] }; campaigns: unknown[] }>(run(["mission", "--root", root, "--json"]))).toMatchObject({
      mission: { rubric: [{ id: "REGION-001", status: "met" }, { id: "REGION-002", status: "met" }, { id: "REGION-003", status: "open" }] },
      campaigns: [],
    });
  });

  it("closes a standalone budget-exhausted loop with unfinished units only through explicit dispositions", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    replaceInFile(loop, "status: active", "status: budget-exhausted");
    const plan = prepare(root, "close");
    expect(plan.items.map((item) => [item.id, item.allowed])).toEqual([
      ["unit:U2", ["complete", "drop"]],
      ["unit:U3", ["complete", "drop"]],
      ["decision:0", ["route:spec", "route:brief", "drop"]],
      ["decision:1", ["route:spec", "route:brief", "drop"]],
      ["section:State", ["drop", "migrated"]],
      ["section:Notes", ["drop", "migrated"]],
    ]);

    const missingReason = decide(plan, { "unit:U2": "complete", "unit:U3": "drop", "decision:0": "route:spec", "decision:1": "drop", "section:State": "drop", "section:Notes": "drop" });
    expect(json<Refusal>(run(["close", "validate", "--root", root, "--plan", planPath(root, missingReason), "--json"])).issues).toEqual([
      expect.objectContaining({ code: "plan.missing-reason", path: "items.unit:U3" }),
      expect.objectContaining({ code: "plan.missing-reason", path: "items.decision:1" }),
    ]);

    const complete = decide(plan, {
      "unit:U2": "complete",
      "unit:U3": { disposition: "drop", reason: "offset removal moves to the next campaign" },
      "decision:0": "route:spec",
      "decision:1": { disposition: "drop", reason: "page size cap was reverted" },
      "section:State": "drop",
      "section:Notes": "drop",
    });
    const applied = run(["close", "apply", "--root", root, "--plan", planPath(root, complete), "--now", NOW, "--json"]);
    expect(applied.status).toBe(0);
    expect(json(applied)).toMatchObject({ ok: true, deleted: [loop], dropped: ["unit:U3", "decision:1", "section:State", "section:Notes"] });
    expect(existsSync(loop)).toBe(false);
    expect(readdirSync(root).sort()).toEqual(["BRIEF.md", "SPEC.md"]);
  });
});

describe("review round 3 findings", () => {
  it("refuses close validate and apply on a non-terminal loop even when the plan matches the file", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const active = readText(loop);
    writeFileSync(loop, active.replace("status: active", "status: done").replace(/state: (red|unknown)/g, "state: green"));
    const prepared = prepare(root, "close");
    writeFileSync(loop, active);

    const plan = decide(
      { ...prepared, source_sha256: createHash("sha256").update(active).digest("hex") },
      {
        "unit:U2": { disposition: "drop", reason: "superseded" },
        "unit:U3": { disposition: "drop", reason: "superseded" },
        "decision:0": "route:spec",
        "decision:1": "route:spec",
        "section:State": "drop",
        "section:Notes": "drop",
      },
    );
    const path = planPath(root, plan);
    const before = readText(resolve(root, "SPEC.md"));

    for (const step of ["validate", "apply"]) {
      const result = run(["close", step, "--root", root, "--now", NOW, "--plan", path, "--json"]);
      expect(result.status).toBe(1);
      expect(json<Refusal>(result).error.code).toBe("close.not-terminal");
    }
    expect(readText(loop)).toBe(active);
    expect(readText(resolve(root, "SPEC.md"))).toBe(before);
  });

  it("keeps every byte of a kept section when another section is dropped", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const original = readText(loop);
    writeFileSync(loop, `${original}\n## Keep\n\nkeep me\n\n\n## Toss\n\ntoss\n`);

    const plan = decide(prepare(root, "compact"), {
      "unit:U1": "keep",
      "decision:0": "keep",
      "decision:1": "keep",
      "section:State": "keep",
      "section:Notes": "keep",
      "section:Keep": "keep",
      "section:Toss": "drop",
    });
    expect(run(["compact", "apply", "--root", root, "--now", NOW, "--plan", planPath(root, plan), "--json"]).status).toBe(0);

    const after = readText(loop);
    const body = after.slice(after.indexOf("\n---\n") + 5);
    expect(body).toBe(`${original.slice(original.indexOf("\n---\n") + 5)}\n## Keep\n\nkeep me\n\n\n`);
  });

  it("lists a preserved legacy_mission_control block as a compact item and retires it by disposition", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    writeFileSync(loop, readText(loop).replace("boundary:\n", "legacy_mission_control:\n  attention: publish\n  head: codex123\nboundary:\n"));
    expect(json<{ issues: Array<{ code: string }> }>(run(["check", "--root", root, "--json"])).issues.map((issue) => issue.code)).toEqual(["loop.unknown-field"]);

    const prepared = prepare(root, "compact");
    expect(prepared.items).toContainEqual({
      id: "legacy:legacy_mission_control",
      kind: "legacy",
      summary: "legacy_mission_control (attention, head)",
      allowed: ["keep", "drop", "migrated"],
      proposed: "drop",
      disposition: null,
      reason: null,
    });

    const undecided = decide(prepared, { "unit:U1": "keep", "decision:0": "keep", "decision:1": "keep", "section:State": "keep", "section:Notes": "keep", "legacy:legacy_mission_control": "drop" });
    const refused = run(["compact", "validate", "--root", root, "--now", NOW, "--plan", planPath(root, undecided), "--json"]);
    expect(refused.status).toBe(1);
    expect(json<Refusal>(refused).issues).toEqual([expect.objectContaining({ code: "plan.missing-reason", path: "items.legacy:legacy_mission_control" })]);

    const plan = decide(undecided, { "legacy:legacy_mission_control": { disposition: "drop", reason: "attention and head have no loop: 1 equivalent" } });
    expect(run(["compact", "apply", "--root", root, "--now", NOW, "--plan", planPath(root, plan), "--json"]).status).toBe(0);
    expect(readText(loop)).not.toContain("legacy_mission_control");
    expect(json<{ issues: unknown[] }>(run(["check", "--root", root, "--json"])).issues).toEqual([]);
  });

  it("refuses a plan prepared for another transition or another loop", () => {
    const root = fixtureCopy("standalone");
    const plan = prepare(root, "compact");

    const transition = run(["compact", "validate", "--root", root, "--now", NOW, "--plan", planPath(root, { ...plan, transition: "close" }), "--json"]);
    expect(transition.status).toBe(1);
    expect(json<Refusal>(transition).issues).toEqual([expect.objectContaining({ code: "plan.transition-mismatch", path: "transition" })]);

    const other = run(["compact", "validate", "--root", root, "--now", NOW, "--plan", planPath(root, { ...plan, loop_path: resolve(root, "elsewhere", "LOOP.md") }), "--json"]);
    expect(other.status).toBe(1);
    expect(json<Refusal>(other).issues).toEqual([expect.objectContaining({ code: "plan.loop-mismatch", path: "loop_path" })]);
  });
});

describe("review round 4 findings", () => {
  it("routes into the real ## Decisions section, not one quoted inside a code fence", () => {
    const root = fixtureCopy("standalone");
    const spec = resolve(root, "SPEC.md");
    const original = readText(spec);
    const fenced = `# Spec\n\n\`\`\`md\n## Decisions\n\n- example entry\n\`\`\`\n\n${original.slice(original.indexOf("## "))}`;
    writeFileSync(spec, fenced);

    const plan = decide(prepare(root, "compact"), { "unit:U1": "keep", "decision:0": "route:spec", "decision:1": "keep", "section:State": "keep", "section:Notes": "keep" });
    expect(run(["compact", "apply", "--root", root, "--now", NOW, "--plan", planPath(root, plan), "--json"]).status).toBe(0);

    const after = readText(spec);
    const entry = "- 2026-08-28 — Cursors are opaque base64url strings. **ratified (human)**";
    expect(after.indexOf(entry)).toBeGreaterThan(after.indexOf("```\n\n"));
    expect(after.split(entry).length).toBe(2);
    expect(after.startsWith("# Spec\n\n```md\n## Decisions\n\n- example entry\n```\n\n")).toBe(true);
  });

  it("routes idempotently so a retried plan never duplicates an entry", () => {
    const entry = "- 2026-08-28 — Cursors are opaque base64url strings. **ratified (human)**";
    const source = "# Spec\n\n## Decisions\n\n- 2026-08-20 — Pagination uses cursors, not offsets. **ratified (human)**\n";
    const once = appendDecisions(source, [entry]);

    expect(once).toBe(`${source}${entry}\n`);
    expect(appendDecisions(once, [entry])).toBe(once);
  });

  it("gives every body section a unique id even when a heading spells a generated suffix", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    writeFileSync(loop, `${readText(loop)}\n## A\n\none\n\n## A\n\ntwo\n\n## A#2\n\nthree\n`);

    const ids = prepare(root, "compact").items.filter((item) => item.kind === "section").map((item) => item.id);
    expect(ids).toEqual(["section:State", "section:Notes", "section:A", "section:A#2", "section:A#2#2"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("closes a fence only with the marker that opened it", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    writeFileSync(loop, `${readText(loop)}\n## Real\n\n\`\`\`md\n~~~\n## Not a section\n~~~\n\`\`\`\n\n## After\n\ntext\n`);

    expect(prepare(root, "compact").items.filter((item) => item.kind === "section").map((item) => item.id)).toEqual(["section:State", "section:Notes", "section:Real", "section:After"]);
  });
});

describe("review round 5 findings", () => {
  it("does not close a fence on a line that carries trailing text", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    writeFileSync(loop, `${readText(loop)}\n## Real\n\n\`\`\`md\n\`\`\`not-a-closing-fence\n## Inside\n\`\`\`\n\n## After\n\ntext\n`);

    expect(prepare(root, "compact").items.filter((item) => item.kind === "section").map((item) => item.id)).toEqual(["section:State", "section:Notes", "section:Real", "section:After"]);
  });
});

describe("review round 6 findings", () => {
  it("creates an exact ## Decisions section instead of writing into ## Decisions Archive", () => {
    const root = fixtureCopy("standalone");
    const spec = resolve(root, "SPEC.md");
    const archived = readText(spec).replace("## Decisions", "## Decisions Archive");
    writeFileSync(spec, archived);

    const plan = decide(prepare(root, "compact"), { "unit:U1": "keep", "decision:0": "route:spec", "decision:1": "keep", "section:State": "keep", "section:Notes": "keep" });
    expect(run(["compact", "apply", "--root", root, "--now", NOW, "--plan", planPath(root, plan), "--json"]).status).toBe(0);

    const after = readText(spec);
    expect(after.startsWith(archived)).toBe(true);
    expect(after.slice(archived.length)).toBe("\n## Decisions\n\n- 2026-08-28 — Cursors are opaque base64url strings. **ratified (human)**\n");
  });
});

describe("review round 7 findings", () => {
  it("keeps a CRLF body byte-for-byte through compact while the frontmatter is rewritten LF", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const original = readText(loop);
    const crlf = original.replaceAll("\n", "\r\n");
    writeFileSync(loop, crlf);
    const crlfBody = crlf.slice(crlf.indexOf("\r\n---\r\n") + 7);

    const plan = decide(prepare(root, "compact"), { "unit:U1": "keep", "decision:0": "keep", "decision:1": "keep", "section:State": "keep", "section:Notes": "drop" });
    expect(run(["compact", "apply", "--root", root, "--now", NOW, "--plan", planPath(root, plan), "--json"]).status).toBe(0);

    const after = readText(loop);
    const fenceEnd = after.indexOf("\n---\n") + 5;
    expect(after.slice(0, fenceEnd)).not.toContain("\r");
    expect(after.slice(fenceEnd)).toBe(crlfBody.slice(0, crlfBody.indexOf("## Notes")));
  });

  it("lists the body preamble and the preserved legacy block at close so nothing is deleted without a disposition", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    replaceInFile(loop, "status: active", "status: budget-exhausted");
    replaceInFile(loop, "\nboundary:\n", "\nlegacy_mission_control:\n  head: abc123\nboundary:\n");
    replaceInFile(loop, "# Loop: widget pagination — `feat/widget-pagination`\n", "# Loop: widget pagination — `feat/widget-pagination`\n\nWorking notes that never got a heading.\n");

    const plan = prepare(root, "close");
    expect(plan.items.map((item) => [item.id, item.kind, item.allowed, item.proposed])).toEqual([
      ["unit:U2", "unit", ["complete", "drop"], "drop"],
      ["unit:U3", "unit", ["complete", "drop"], "drop"],
      ["decision:0", "decision", ["route:spec", "route:brief", "drop"], "route:spec"],
      ["decision:1", "decision", ["route:spec", "route:brief", "drop"], "route:spec"],
      ["preamble", "preamble", ["drop", "migrated"], "drop"],
      ["section:State", "section", ["drop", "migrated"], "drop"],
      ["section:Notes", "section", ["drop", "migrated"], "drop"],
      ["legacy:legacy_mission_control", "legacy", ["drop", "migrated"], "drop"],
    ]);
    expect(plan.items.find((item) => item.id === "preamble")?.summary).toBe("preamble (1 line)");

    const dispositions = {
      "unit:U2": "complete",
      "unit:U3": { disposition: "drop", reason: "moves to the next campaign" },
      "decision:0": "route:spec",
      "decision:1": "route:brief",
      "preamble": "drop",
      "section:State": "drop",
      "section:Notes": "drop",
    };
    const reasonless = decide(plan, { ...dispositions, "legacy:legacy_mission_control": "drop" });
    expect(json<Refusal>(run(["close", "validate", "--root", root, "--plan", planPath(root, reasonless), "--json"])).issues).toEqual([
      expect.objectContaining({ code: "plan.missing-reason", path: "items.legacy:legacy_mission_control" }),
    ]);
    expect(existsSync(loop)).toBe(true);

    const complete = decide(plan, { ...dispositions, "legacy:legacy_mission_control": { disposition: "drop", reason: "head is owned by git" } });
    const applied = run(["close", "apply", "--root", root, "--plan", planPath(root, complete), "--now", NOW, "--json"]);
    expect(applied.status).toBe(0);
    expect(json(applied)).toMatchObject({ ok: true, deleted: [loop], dropped: ["unit:U3", "preamble", "section:State", "section:Notes", "legacy:legacy_mission_control"] });
  });

  it("refuses a plan that names an item twice instead of letting the last disposition win", () => {
    const root = fixtureCopy("standalone");
    const loop = resolve(root, "LOOP.md");
    const before = readText(loop);
    const plan = decide(prepare(root, "compact"), { "unit:U1": "keep", "decision:0": "keep", "decision:1": "keep", "section:State": "keep", "section:Notes": "keep" });
    const duplicated = { ...plan, items: [...plan.items, { ...plan.items[0], disposition: "drop" }] };

    const refused = run(["compact", "apply", "--root", root, "--now", NOW, "--plan", planPath(root, duplicated), "--json"]);
    expect(refused.status).toBe(1);
    expect(json<Refusal>(refused).issues).toEqual([expect.objectContaining({ code: "plan.invalid", path: `items[${plan.items.length}]`, message: expect.stringContaining("unit:U1") })]);
    expect(readText(loop)).toBe(before);
  });
});
