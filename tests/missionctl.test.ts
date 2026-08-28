import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(ROOT, "dist/missionctl");
const FIXTURE_ROOT = resolve(ROOT, "tests/fixtures/codex-delivery");
const NOW = "2026-08-28T20:00:00Z";

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: readonly string[], cwd = ROOT): CliResult {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function json(result: CliResult): unknown {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "missionctl-"));
  cpSync(resolve(FIXTURE_ROOT, "MISSION.md"), resolve(root, "MISSION.md"));
  cpSync(resolve(FIXTURE_ROOT, "LOOP.md"), resolve(root, "LOOP.md"));
  return root;
}

function missionOnlyRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "missionctl-mission-only-"));
  cpSync(resolve(FIXTURE_ROOT, "MISSION.md"), resolve(root, "MISSION.md"));
  return root;
}

function updateFrontmatter(path: string, update: (document: Record<string, unknown>) => void): void {
  const source = readFileSync(path, "utf8");
  const match = /^---\n([\s\S]*?)\n---/.exec(source);
  if (!match) {
    throw new Error(`missing YAML frontmatter: ${path}`);
  }
  const document = parse(match[1]) as Record<string, unknown>;
  update(document);
  writeFileSync(path, `---\n${stringify(document).trimEnd()}\n---${source.slice(match[0].length)}`);
}

const OPERATIONS_MISSION = `---
mission_control: 1
id: authentication-live-change
title: Authentication live change
kind: operations
status: active
owner: operator
rubric:
  - { id: HEALTH-001, dimension: health, criterion: health, measure: health, floor: health, evaluator: ops-harness, evidence_type: verifier-run }
  - { id: SAFETY-001, dimension: safety, criterion: safety, measure: safety, floor: safety, evaluator: ops-harness, evidence_type: verifier-run }
  - { id: REVERSE-001, dimension: reversibility, criterion: reversibility, measure: reversibility, floor: reversibility, evaluator: ops-harness, evidence_type: verifier-run }
  - { id: OBSERVE-001, dimension: observability, criterion: observability, measure: observability, floor: observability, evaluator: ops-harness, evidence_type: verifier-run }
  - { id: POST-001, dimension: post-change-observation, criterion: post-change-observation, measure: post-change-observation, floor: post-change-observation, evaluator: ops-harness, evidence_type: verifier-run }
boundaries: [publish, live-secret]
evidence: []
---

# Authentication live change
`;

const OPERATIONS_CAMPAIGN = `---
mission_control: 1
mission_id: authentication-live-change
campaign_id: authentication-cutover
objective: Prepare the bounded authentication cutover.
status: blocked
phase: PLAN
iteration: 2
iteration_budget: 4
targets: [HEALTH-001, SAFETY-001]
attention: decide
next_action: Obtain the named cutover disposition.
updated_at: 2026-08-28T17:30:00Z
head: abc123
review_capacity: { measure: change-set, limit: one cutover }
evidence: []
---

# Authentication cutover
`;

const SIBLING_CAMPAIGN = `---
mission_control: 1
mission_id: codex-mission-surface
campaign_id: sibling-quality-campaign
objective: Prove sibling campaign evidence contributes to an otherwise unknown enduring floor.
status: done
phase: E2E
iteration: 1
iteration_budget: 2
targets: [QUALITY-001]
attention: none
next_action: Preserve the evidence in the parent mission.
updated_at: 2026-08-28T17:30:00Z
head: sibling123
review_capacity: { measure: fixture, limit: one sibling campaign }
evidence:
  - rubric_id: QUALITY-001
    evaluator: codex-harness
    evidence_type: verifier-run
    result: passing
    timestamp: 2026-08-28T19:55:00Z
    artifact_ref: artifact://sibling-quality
---

# Sibling outcome campaign
`;

describe("missionctl public contract", () => {
  it("projects the current campaign and mission as stable JSON", () => {
    const result = run(["current", "--root", FIXTURE_ROOT, "--now", NOW, "--json"]);

    expect(result.status).toBe(0);
    expect(json(result)).toEqual({
      mission: {
        id: "codex-mission-surface",
        title: "Codex mission surface",
        kind: "delivery",
        status: "active",
        floor_state: "unknown",
        gaps: ["LAND-001"],
      },
      campaign: {
        id: "codex-slash-command",
        status: "done",
        phase: "BOUNDARY",
        attention: "publish",
        iteration: 3,
        iteration_budget: 4,
        targets: ["CONTRACT-001", "QUALITY-001", "E2E-001", "OPS-001", "LAND-001"],
        next_action: "Review the Codex mission command branch.",
      },
      cues: ["boundary-awaiting-disposition:publish"],
    });
  });

  it("prints stable current text without a fabricated score", () => {
    const result = run(["current", "--root", FIXTURE_ROOT, "--now", NOW]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      "MISSION delivery codex-mission-surface [active] floors=unknown\n" +
        "CAMPAIGN codex-slash-command [done] phase=BOUNDARY attention=publish iteration=3/4\n" +
        "GAPS LAND-001\n" +
        "CUES boundary-awaiting-disposition:publish\n" +
        "NEXT Review the Codex mission command branch.\n",
    );
    expect(result.stdout).not.toContain("score");
  });

  it("evaluates the enduring mission independently of campaign completion", () => {
    const result = run(["mission", "--root", FIXTURE_ROOT, "--now", NOW, "--json"]);
    const projection = json(result) as { achieved: boolean; rubric: Array<{ id: string; state: string }> };

    expect(result.status).toBe(0);
    expect(projection.achieved).toBe(false);
    expect(projection.rubric.map(({ id, state }) => [id, state])).toEqual([
      ["CONTRACT-001", "passing"],
      ["QUALITY-001", "passing"],
      ["E2E-001", "passing"],
      ["OPS-001", "passing"],
      ["LAND-001", "unknown"],
    ]);
  });

  it("evaluates a durable mission after its terminal charter dissolves", () => {
    const result = run(["mission", "--root", missionOnlyRoot(), "--now", NOW, "--json"]);

    expect(result.status).toBe(0);
    expect(json(result)).toEqual(
      expect.objectContaining({
        id: "codex-mission-surface",
        campaign_ids: ["codex-slash-command"],
      }),
    );
  });

  it("aggregates admissible evidence from sibling campaigns for the enduring mission", () => {
    const root = fixtureRoot();
    const sibling = resolve(root, "campaigns", "sibling-outcome");
    mkdirSync(sibling, { recursive: true });
    writeFileSync(resolve(sibling, "LOOP.md"), SIBLING_CAMPAIGN);

    const result = run(["mission", "--root", root, "--now", NOW, "--json"]);
    const projection = json(result) as {
      campaign_ids: string[];
      rubric: Array<{ id: string; state: string; evidence?: { campaign_id: string } }>;
    };

    expect(result.status).toBe(0);
    expect(projection.campaign_ids).toEqual(["codex-slash-command", "sibling-quality-campaign"]);
    expect(projection.rubric.find(({ id }) => id === "QUALITY-001")).toEqual(
      expect.objectContaining({
        state: "passing",
        evidence: expect.objectContaining({ campaign_id: "sibling-quality-campaign" }),
      }),
    );
  });

  it("groups the portfolio by attention then mission kind and isolates legacy loops", () => {
    const root = fixtureRoot();
    const operations = resolve(root, "operations");
    const legacy = resolve(root, "legacy");
    mkdirSync(operations);
    mkdirSync(legacy);
    writeFileSync(resolve(operations, "MISSION.md"), OPERATIONS_MISSION);
    writeFileSync(resolve(operations, "LOOP.md"), OPERATIONS_CAMPAIGN);
    writeFileSync(resolve(legacy, "LOOP.md"), "# Legacy campaign\n\nNo typed frontmatter.\n");

    const result = run(["portfolio", "--root", root, "--now", NOW, "--json"]);
    const projection = json(result) as {
      groups: Array<{ attention: string; kinds: Array<{ kind: string; missions: Array<{ id: string }> }> }>;
      legacy: Array<{ path: string }>;
    };

    expect(result.status).toBe(0);
    expect(projection.groups.map((group) => group.attention)).toEqual(["decide", "publish"]);
    expect(projection.groups[0].kinds[0]).toEqual({
      kind: "operations",
      missions: [expect.objectContaining({ id: "authentication-live-change" })],
    });
    expect(projection.groups[1].kinds[0]).toEqual({
      kind: "delivery",
      missions: [expect.objectContaining({ id: "codex-mission-surface" })],
    });
    expect(projection.legacy).toEqual([{ path: resolve(legacy, "LOOP.md"), reason: "untyped" }]);
    expect(result.stdout).not.toContain('"score"');
  });

  it("fails check visibly for invalid cross-references", () => {
    const root = fixtureRoot();
    const loop = readFileSync(resolve(root, "LOOP.md"), "utf8").replace("CONTRACT-001", "MISSING-999");
    writeFileSync(resolve(root, "LOOP.md"), loop);

    const result = run(["check", "--root", root, "--now", NOW, "--json"]);
    const output = json(result) as { ok: boolean; issues: Array<{ code: string }> };

    expect(result.status).toBe(1);
    expect(output.ok).toBe(false);
    expect(output.issues).toContainEqual(expect.objectContaining({ code: "campaign.unknown-target" }));
  });

  it("reports a malformed evidence collection instead of crashing the reducer", () => {
    const root = fixtureRoot();
    updateFrontmatter(resolve(root, "MISSION.md"), (mission) => {
      mission.evidence = "malformed";
    });

    const result = run(["check", "--root", root, "--now", NOW, "--json"]);
    const output = json(result) as { ok: boolean; issues: Array<{ code: string }> };

    expect(result.status).toBe(1);
    expect(output.ok).toBe(false);
    expect(output.issues).toContainEqual(expect.objectContaining({ code: "mission.invalid-evidence" }));
  });

  it("attributes mission and campaign validation issues to their exact artifacts", () => {
    const root = fixtureRoot();
    const missionPath = resolve(root, "MISSION.md");
    const campaignPath = resolve(root, "LOOP.md");
    const campaign = readFileSync(campaignPath, "utf8").replace("CONTRACT-001", "MISSING-999");
    updateFrontmatter(missionPath, (mission) => {
      mission.owner = "";
      mission.evidence = "malformed";
    });
    writeFileSync(campaignPath, campaign);

    const result = run(["current", "--root", root, "--now", NOW, "--json"]);
    const output = json(result) as { issues: Array<{ artifact_path: string; code: string }> };

    expect(result.status).toBe(1);
    expect(output.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifact_path: missionPath, code: "mission.missing-field" }),
        expect.objectContaining({ artifact_path: missionPath, code: "mission.invalid-evidence" }),
        expect.objectContaining({ artifact_path: campaignPath, code: "campaign.unknown-target" }),
      ]),
    );
  });

  it("fails check when required evidence has gone stale", () => {
    const root = fixtureRoot();
    updateFrontmatter(resolve(root, "MISSION.md"), (mission) => {
      mission.evidence = [
        {
          rubric_id: "CONTRACT-001",
          campaign_id: "old-contract-run",
          evaluator: "codex-harness",
          evidence_type: "verifier-run",
          result: "passing",
          timestamp: "2026-08-01T00:00:00Z",
          artifact_ref: "artifact://stale-eval",
        },
      ];
    });

    const result = run(["check", "--root", root, "--now", NOW, "--json"]);
    const output = json(result) as { issues: Array<{ code: string }> };

    expect(result.status).toBe(1);
    expect(output.issues).toContainEqual(expect.objectContaining({ code: "mission.stale-evidence" }));
  });

  it("degrades an unavailable external mission source visibly", () => {
    const root = mkdtempSync(join(tmpdir(), "missionctl-external-"));
    writeFileSync(
      resolve(root, "LOOP.md"),
      OPERATIONS_CAMPAIGN.replace(
        "mission_id: authentication-live-change",
        `mission_id: authentication-live-change
mission_source:
  repository: https://example.invalid/operations.git
  ref: main
  path: MISSION.md`,
      ),
    );

    const result = run(["portfolio", "--root", root, "--now", NOW, "--json"]);
    const output = json(result) as { issues: Array<{ code: string; message: string }> };

    expect(result.status).toBe(1);
    expect(output.issues).toContainEqual(
      expect.objectContaining({
        code: "campaign.external-source-unavailable",
        message: expect.stringContaining("https://example.invalid/operations.git@main:MISSION.md"),
      }),
    );
  });

  it("renders the compact statusline from the canonical projection", () => {
    const text = run(["statusline", "--root", FIXTURE_ROOT, "--now", NOW]);
    const structured = run(["statusline", "--root", FIXTURE_ROOT, "--now", NOW, "--json"]);

    expect(text.status).toBe(0);
    expect(text.stdout).toBe("delivery BOUNDARY · floors unknown · attention publish · iteration 3/4\n");
    expect(json(structured)).toEqual({
      mission_kind: "delivery",
      campaign_phase: "BOUNDARY",
      rubric_floor_state: "unknown",
      attention: "publish",
      iteration: 3,
      iteration_budget: 4,
    });
  });

  it("emits deterministic commander drills", () => {
    const result = run(["drill", "--json"]);

    expect(result.status).toBe(0);
    expect(json(result)).toEqual({
      scenarios: [
        expect.objectContaining({ id: "failing-targeted-floor", classification: "interior-work" }),
        expect.objectContaining({ id: "adjacent-untargeted-refactor", classification: "campaign-scope" }),
        expect.objectContaining({ id: "change-success-floor", classification: "mission-amendment" }),
        expect.objectContaining({ id: "publish-green-artifact", classification: "boundary" }),
      ],
    });
  });

  it("generates canonical lifecycle prompts from declared state", () => {
    const result = run(["prompt", "resume", "--root", FIXTURE_ROOT, "--now", NOW, "--json"]);
    const output = json(result) as { action: string; prompt: string };

    expect(result.status).toBe(0);
    expect(output.action).toBe("resume");
    expect(output.prompt).toContain("codex-mission-surface");
    expect(output.prompt).toContain("codex-slash-command");
    expect(output.prompt).toContain("Review the Codex mission command branch");
  });
});
