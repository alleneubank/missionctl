import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ATTENTION_CLASSES,
  CAMPAIGN_STATES,
  MISSION_KINDS,
  MISSION_STATES,
  REQUIRED_DIMENSIONS,
  parseCampaignArtifact,
  parseMissionArtifact,
  validateCampaign,
  validateMission,
} from "../src/mission-control/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = resolve(ROOT, "tests/fixtures/codex-delivery");
const REPRESENTATIVE_FIXTURES = [
  ["codex-delivery", "delivery"],
  ["sox-visual", "delivery"],
  ["sox-visual-pilot", "delivery"],
  ["authentication-operations", "operations"],
  ["prototype-research", "research"],
  ["maintenance-inventory", "maintenance"],
  ["administrative-deadline", "administrative"],
  ["robotics-training", "training"],
] as const;

function fixtureArtifact(name: "MISSION.md" | "LOOP.md"): string {
  return readFileSync(resolve(FIXTURE_ROOT, name), "utf8");
}

describe("mission schema v1", () => {
  it("accepts the canonical delivery fixture and preserves its typed identity", () => {
    const parsed = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md");

    expect(parsed.document.id).toBe("codex-mission-surface");
    expect(parsed.document.kind).toBe("delivery");
    expect(parsed.document.rubric.map((item) => item.id)).toEqual([
      "CONTRACT-001",
      "QUALITY-001",
      "E2E-001",
      "OPS-001",
      "LAND-001",
    ]);
    expect(validateMission(parsed.document)).toEqual([]);
  });

  it.each(MISSION_KINDS)("requires the declared dimensions for %s missions", (kind) => {
    const parsed = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md");
    const rubric = REQUIRED_DIMENSIONS[kind].map((dimension, index) => ({
      id: `FIXTURE-${String(index + 1).padStart(3, "0")}`,
      dimension,
      criterion: `Criterion for ${dimension}`,
      measure: `Measure for ${dimension}`,
      floor: `Floor for ${dimension}`,
      evaluator: "fixture-harness",
      evidence_type: "verifier-run",
    }));
    const mission = { ...parsed.document, id: `fixture-${kind}`, kind, rubric, evidence: [] };

    expect(validateMission(mission)).toEqual([]);
    expect(validateMission({ ...mission, rubric: rubric.slice(1) })).toContainEqual(
      expect.objectContaining({
        code: "mission.required-dimension",
        path: "rubric",
        message: expect.stringContaining(REQUIRED_DIMENSIONS[kind][0]),
      }),
    );
  });

  it.each(REPRESENTATIVE_FIXTURES)("accepts the representative %s fixture as %s", (name, kind) => {
    const root = resolve(ROOT, "tests", "fixtures", name);
    const mission = parseMissionArtifact(readFileSync(resolve(root, "MISSION.md"), "utf8"), resolve(root, "MISSION.md"));
    const campaign = parseCampaignArtifact(readFileSync(resolve(root, "LOOP.md"), "utf8"), resolve(root, "LOOP.md"));

    expect(mission.document.kind).toBe(kind);
    expect(validateMission(mission.document)).toEqual([]);
    expect(validateCampaign(campaign.document, mission.document)).toEqual([]);
  });

  it("preserves the Sox pilot device verdict and pixel-report contracts", () => {
    const root = resolve(ROOT, "tests", "fixtures", "sox-visual-pilot", "evidence", "device");

    for (const platform of ["ios", "android"]) {
      const verdict = JSON.parse(readFileSync(resolve(root, platform, "verdict.json"), "utf8")) as {
        result: string;
        captured_at: string;
        frames: string[];
      };
      const pixels = JSON.parse(readFileSync(resolve(root, platform, "pack-pixels.json"), "utf8")) as {
        pass: boolean;
        required: string[];
        present: string[];
        failed: string[];
      };

      expect(verdict).toEqual(
        expect.objectContaining({
          result: "PASS",
          captured_at: expect.stringMatching(/^2026-08-26T/),
          frames: expect.arrayContaining(pixels.required.map((name) => `${name}.png`)),
        }),
      );
      expect(pixels).toEqual(
        expect.objectContaining({
          pass: true,
          failed: [],
        }),
      );
      expect(pixels.required).toHaveLength(11);
      expect([...pixels.required].sort()).toEqual([...pixels.present].sort());
    }
  });

  it.each(MISSION_STATES)("accepts mission state %s", (status) => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    expect(validateMission({ ...mission, status })).toEqual([]);
  });

  it("rejects duplicate rubric IDs and malformed freshness", () => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const duplicate = { ...mission.rubric[1], id: mission.rubric[0].id, freshness: "next-week" };
    const issues = validateMission({ ...mission, rubric: [mission.rubric[0], duplicate] });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "mission.duplicate-rubric-id" }),
        expect.objectContaining({ code: "mission.invalid-freshness" }),
      ]),
    );
  });

  it("rejects durable evidence that cannot satisfy its rubric contract", () => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const issues = validateMission({
      ...mission,
      evidence: [
        {
          rubric_id: "CONTRACT-001",
          campaign_id: "bad-evidence",
          evaluator: "codex-harness",
          evidence_type: "review-verdict",
          result: "passing",
          timestamp: "2026-08-28T17:00:00Z",
          artifact_ref: "artifact://bad",
        },
        {
          rubric_id: "UNKNOWN-999",
          campaign_id: "bad-reference",
          evaluator: "harness",
          evidence_type: "verifier-run",
          result: "passing",
          timestamp: "2026-08-28T17:00:00Z",
          artifact_ref: "artifact://missing",
        },
      ],
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "evidence.incompatible-type" }),
        expect.objectContaining({ code: "evidence.unknown-rubric-id" }),
      ]),
    );
  });
});

describe("campaign schema v1", () => {
  it("accepts the canonical campaign fixture and validates its mission links", () => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const campaign = parseCampaignArtifact(fixtureArtifact("LOOP.md"), "LOOP.md").document;

    expect(campaign.campaign_id).toBe("codex-slash-command");
    expect(validateCampaign(campaign, mission)).toEqual([]);
  });

  it.each(CAMPAIGN_STATES)("accepts campaign state %s with a valid attention class", (status) => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const campaign = parseCampaignArtifact(fixtureArtifact("LOOP.md"), "LOOP.md").document;
    const attention =
      status === "waiting"
        ? "watch"
        : status === "blocked"
          ? "decide"
          : status === "budget-exhausted"
            ? "recover"
            : "none";

    const expected_signal_by = status === "waiting" ? "2026-08-28T21:00:00Z" : campaign.expected_signal_by;
    expect(validateCampaign({ ...campaign, status, attention, expected_signal_by }, mission)).toEqual([]);
  });

  it.each([
    ["blocked", "decide"],
    ["active", "review"],
    ["done", "publish"],
    ["waiting", "watch"],
    ["active", "recover"],
    ["active", "none"],
  ] as const)("accepts the %s → %s attention transition", (status, attention) => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const campaign = parseCampaignArtifact(fixtureArtifact("LOOP.md"), "LOOP.md").document;

    const expected_signal_by = status === "waiting" ? "2026-08-28T21:00:00Z" : campaign.expected_signal_by;
    expect(validateCampaign({ ...campaign, status, attention, expected_signal_by }, mission)).toEqual([]);
  });

  it("keeps blocked and waiting semantically distinct", () => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const campaign = parseCampaignArtifact(fixtureArtifact("LOOP.md"), "LOOP.md").document;

    expect(validateCampaign({ ...campaign, status: "waiting", attention: "decide" }, mission)).toContainEqual(
      expect.objectContaining({ code: "campaign.attention-state-mismatch" }),
    );
    expect(validateCampaign({ ...campaign, status: "blocked", attention: "watch" }, mission)).toContainEqual(
      expect.objectContaining({ code: "campaign.attention-state-mismatch" }),
    );
  });

  const acceptedAttention = {
    planned: ["none", "review"],
    active: ["none", "review", "publish", "recover"],
    waiting: ["watch"],
    blocked: ["decide"],
    done: ["none", "review", "publish"],
    "budget-exhausted": ["recover"],
    superseded: ["none"],
  } as const;
  const illegalAttentionPairs = CAMPAIGN_STATES.flatMap((status) =>
    ATTENTION_CLASSES.filter((attention) => !(acceptedAttention[status] as readonly string[]).includes(attention)).map(
      (attention) => [status, attention] as const,
    ),
  );

  it.each(illegalAttentionPairs)("rejects the illegal %s → %s attention transition", (status, attention) => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const campaign = parseCampaignArtifact(fixtureArtifact("LOOP.md"), "LOOP.md").document;

    expect(validateCampaign({ ...campaign, status, attention }, mission)).toContainEqual(
      expect.objectContaining({ code: "campaign.attention-state-mismatch" }),
    );
  });

  it("rejects unknown target IDs, exhausted active budgets, and cross-mission links", () => {
    const mission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const campaign = parseCampaignArtifact(fixtureArtifact("LOOP.md"), "LOOP.md").document;
    const issues = validateCampaign(
      {
        ...campaign,
        mission_id: "some-other-mission",
        targets: ["MISSING-001"],
        iteration: 5,
        iteration_budget: 4,
      },
      mission,
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "campaign.mission-id-mismatch" }),
        expect.objectContaining({ code: "campaign.unknown-target" }),
        expect.objectContaining({ code: "campaign.iteration-over-budget" }),
      ]),
    );
  });

  it("requires research conclusions only on completed research campaigns", () => {
    const baseMission = parseMissionArtifact(fixtureArtifact("MISSION.md"), "MISSION.md").document;
    const campaign = parseCampaignArtifact(fixtureArtifact("LOOP.md"), "LOOP.md").document;
    const researchMission = {
      ...baseMission,
      id: "research-fixture",
      kind: "research" as const,
      rubric: REQUIRED_DIMENSIONS.research.map((dimension, index) => ({
        id: `RESEARCH-${String(index + 1).padStart(3, "0")}`,
        dimension,
        criterion: dimension,
        measure: dimension,
        floor: dimension,
        evaluator: "research-harness",
        evidence_type: "research-report",
      })),
    };
    const base = {
      ...campaign,
      mission_id: researchMission.id,
      targets: [researchMission.rubric[0].id],
      evidence: [],
    };

    expect(validateCampaign({ ...base, status: "done", research_result: "refuted" }, researchMission)).toEqual([]);
    expect(validateCampaign({ ...base, status: "active", research_result: "confirmed" }, researchMission)).toContainEqual(
      expect.objectContaining({ code: "campaign.premature-research-result" }),
    );
    expect(validateCampaign({ ...base, status: "done", research_result: undefined }, researchMission)).toContainEqual(
      expect.objectContaining({ code: "campaign.missing-research-result" }),
    );
  });
});
