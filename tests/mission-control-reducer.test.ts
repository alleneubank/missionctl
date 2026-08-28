import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  evaluateMission,
  parseCampaignArtifact,
  parseMissionArtifact,
  projectCurrent,
} from "../src/mission-control/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = resolve(ROOT, "tests/fixtures/codex-delivery");
const NOW = new Date("2026-08-28T20:00:00Z");

function artifacts(options: { liveEvidence?: boolean } = {}) {
  const mission = parseMissionArtifact(readFileSync(resolve(FIXTURE_ROOT, "MISSION.md"), "utf8"), "MISSION.md").document;
  const campaign = parseCampaignArtifact(readFileSync(resolve(FIXTURE_ROOT, "LOOP.md"), "utf8"), "LOOP.md").document;
  return {
    mission: options.liveEvidence ? mission : { ...mission, evidence: [] },
    campaign: options.liveEvidence ? campaign : { ...campaign, evidence: [] },
  };
}

describe("mission evidence reducer", () => {
  it("starts every floor unknown when no admissible evidence exists", () => {
    const { mission } = artifacts();
    const projection = evaluateMission(mission, [], NOW);

    expect(projection.status).toBe("active");
    expect(projection.achieved).toBe(false);
    expect(projection.rubric.map(({ id, state }) => [id, state])).toEqual([
      ["CONTRACT-001", "unknown"],
      ["QUALITY-001", "unknown"],
      ["E2E-001", "unknown"],
      ["OPS-001", "unknown"],
      ["LAND-001", "unknown"],
    ]);
  });

  it("uses only the newest admissible evidence for the exact rubric ID", () => {
    const { mission } = artifacts();
    const projection = evaluateMission(
      {
        ...mission,
        evidence: [
          {
            rubric_id: "CONTRACT-001",
            campaign_id: "campaign-a",
            evaluator: "codex-harness",
            evidence_type: "verifier-run",
            result: "failing",
            timestamp: "2026-08-28T16:00:00Z",
            artifact_ref: "artifact://red",
          },
          {
            rubric_id: "CONTRACT-001",
            campaign_id: "campaign-b",
            evaluator: "codex-harness",
            evidence_type: "verifier-run",
            result: "passing",
            timestamp: "2026-08-28T17:00:00Z",
            artifact_ref: "artifact://green",
          },
        ],
      },
      [],
      NOW,
    );

    expect(projection.rubric[0]).toEqual(
      expect.objectContaining({
        id: "CONTRACT-001",
        state: "passing",
        evidence: expect.objectContaining({ campaign_id: "campaign-b" }),
      }),
    );
  });

  it("ignores newer incompatible passing evidence instead of overriding an admissible failure", () => {
    const { mission } = artifacts();
    const projection = evaluateMission(
      {
        ...mission,
        evidence: [
          {
            rubric_id: "CONTRACT-001",
            campaign_id: "admissible-red",
            evaluator: "codex-harness",
            evidence_type: "verifier-run",
            result: "failing",
            timestamp: "2026-08-28T16:00:00Z",
            artifact_ref: "artifact://admissible-red",
          },
          {
            rubric_id: "CONTRACT-001",
            campaign_id: "incompatible-green",
            evaluator: "self-review",
            evidence_type: "review-verdict",
            result: "passing",
            timestamp: "2026-08-28T17:00:00Z",
            artifact_ref: "artifact://incompatible-green",
          },
        ],
      },
      [],
      NOW,
    );

    expect(projection.rubric[0]).toEqual(
      expect.objectContaining({
        id: "CONTRACT-001",
        state: "failing",
        evidence: expect.objectContaining({ campaign_id: "admissible-red" }),
      }),
    );
  });

  it("marks expired evidence stale at the exact freshness boundary", () => {
    const { mission } = artifacts();
    const contract = mission.rubric.find((item) => item.id === "CONTRACT-001");
    expect(contract?.freshness).toBe("P7D");
    const evidence = {
      rubric_id: "CONTRACT-001",
      campaign_id: "contract-check",
      evaluator: "codex-harness",
      evidence_type: "verifier-run",
      result: "passing" as const,
      artifact_ref: "artifact://recall-eval",
    };

    const fresh = evaluateMission(
      { ...mission, evidence: [{ ...evidence, timestamp: "2026-08-21T20:00:00Z" }] },
      [],
      NOW,
    );
    const stale = evaluateMission(
      { ...mission, evidence: [{ ...evidence, timestamp: "2026-08-21T19:59:59Z" }] },
      [],
      NOW,
    );

    expect(fresh.rubric.find((item) => item.id === "CONTRACT-001")?.state).toBe("passing");
    expect(stale.rubric.find((item) => item.id === "CONTRACT-001")?.state).toBe("stale");
  });

  it("campaign evidence can update only declared targets", () => {
    const { mission, campaign } = artifacts();
    const projection = evaluateMission(
      mission,
      [
        {
          ...campaign,
          status: "done",
          targets: ["CONTRACT-001"],
          evidence: [
            {
              rubric_id: "CONTRACT-001",
              evaluator: "codex-harness",
              evidence_type: "verifier-run",
              result: "passing",
              timestamp: "2026-08-28T17:00:00Z",
              artifact_ref: "artifact://targeted",
            },
            {
              rubric_id: "QUALITY-001",
              evaluator: "codex-harness",
              evidence_type: "verifier-run",
              result: "passing",
              timestamp: "2026-08-28T17:00:00Z",
              artifact_ref: "artifact://untargeted",
            },
          ],
        },
      ],
      NOW,
    );

    expect(projection.rubric.find((item) => item.id === "CONTRACT-001")?.state).toBe("passing");
    expect(projection.rubric.find((item) => item.id === "QUALITY-001")?.state).toBe("unknown");
  });

  it("combines evidence from separate campaigns without combining journals", () => {
    const { mission, campaign } = artifacts();
    const makeCampaign = (campaign_id: string, rubric_id: string) => ({
      ...campaign,
      campaign_id,
      status: "done" as const,
      targets: [rubric_id],
      evidence: [
        {
          rubric_id,
          evaluator: "codex-harness",
          evidence_type: "verifier-run",
          result: "passing" as const,
          timestamp: "2026-08-28T17:00:00Z",
          artifact_ref: `artifact://${campaign_id}`,
        },
      ],
    });

    const projection = evaluateMission(
      mission,
      [makeCampaign("schema-campaign", "CONTRACT-001"), makeCampaign("quality-campaign", "QUALITY-001")],
      NOW,
    );

    expect(projection.rubric.slice(0, 2).map(({ state }) => state)).toEqual(["passing", "passing"]);
    expect(projection.campaign_ids).toEqual(["quality-campaign", "schema-campaign"]);
  });

  it("campaign completion never implies mission achievement", () => {
    const { mission, campaign } = artifacts();
    const projection = evaluateMission(mission, [{ ...campaign, status: "done" }], NOW);

    expect(projection.achieved).toBe(false);
    expect(projection.rubric.every((item) => item.state === "unknown")).toBe(true);
  });
});

describe("canonical current projection", () => {
  it("preserves the fields every consumer must render", () => {
    const { mission, campaign } = artifacts({ liveEvidence: true });
    const current = projectCurrent(mission, campaign, NOW);

    expect(current).toEqual({
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

  it("escalates stale evidence, overdue signals, and undisposed publish boundaries", () => {
    const { mission, campaign } = artifacts();
    const staleMission = {
      ...mission,
      evidence: [
        {
          rubric_id: "CONTRACT-001",
          campaign_id: "old-eval",
          evaluator: "codex-harness",
          evidence_type: "verifier-run",
          result: "passing" as const,
          timestamp: "2026-08-01T00:00:00Z",
          artifact_ref: "artifact://old-eval",
        },
      ],
    };
    const waiting = projectCurrent(
      staleMission,
      {
        ...campaign,
        status: "waiting",
        attention: "watch",
        expected_signal_by: "2026-08-28T17:59:59Z",
      },
      NOW,
    );
    const publishing = projectCurrent(
      staleMission,
      { ...campaign, attention: "publish" },
      NOW,
    );

    expect(waiting.cues).toEqual(["stale-evidence:CONTRACT-001", "expected-signal-overdue"]);
    expect(publishing.cues).toEqual([
      "stale-evidence:CONTRACT-001",
      "boundary-awaiting-disposition:publish",
    ]);
  });
});
