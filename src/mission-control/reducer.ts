import type {
  CampaignDocument,
  CurrentProjection,
  EvidenceRecord,
  MissionDocument,
  MissionProjection,
  RubricProjection,
  RubricState,
} from "./types.js";
import { durationMilliseconds, evidenceIsAdmissible } from "./validation.js";

function campaignEvidence(campaign: CampaignDocument): EvidenceRecord[] {
  if (campaign.mission_control !== 1) return [];
  const targets = new Set(campaign.targets);
  return campaign.evidence
    .filter((record) => targets.has(record.rubric_id))
    .map((record) => ({ ...record, campaign_id: campaign.campaign_id }));
}

function evidenceOrder(left: EvidenceRecord, right: EvidenceRecord): number {
  const byTime = Date.parse(right.timestamp) - Date.parse(left.timestamp);
  if (byTime !== 0) return byTime;
  const byCampaign = right.campaign_id.localeCompare(left.campaign_id);
  if (byCampaign !== 0) return byCampaign;
  return (right.artifact_ref ?? right.commit ?? "").localeCompare(left.artifact_ref ?? left.commit ?? "");
}

function stateFromEvidence(record: EvidenceRecord, freshness: string | undefined, now: Date): RubricState {
  const duration = freshness === undefined ? undefined : durationMilliseconds(freshness);
  if (duration !== undefined && now.getTime() - Date.parse(record.timestamp) > duration) return "stale";
  return record.result;
}

function floorState(rubric: readonly RubricProjection[]): RubricState {
  const required = rubric.filter((item) => item.required);
  if (required.some((item) => item.state === "failing")) return "failing";
  if (required.some((item) => item.state === "stale")) return "stale";
  if (required.some((item) => item.state === "unknown")) return "unknown";
  if (required.length > 0 && required.every((item) => item.state === "waived")) return "waived";
  return "passing";
}

export function evaluateMission(
  mission: MissionDocument,
  campaigns: readonly CampaignDocument[],
  now: Date,
): MissionProjection {
  const applicableCampaigns = campaigns.filter((campaign) => campaign.mission_id === mission.id);
  const allEvidence = [...mission.evidence, ...applicableCampaigns.flatMap(campaignEvidence)];
  const rubric = mission.rubric.map<RubricProjection>((item) => {
    const evidence = allEvidence.filter((record) => evidenceIsAdmissible(record, item)).sort(evidenceOrder)[0];
    return {
      id: item.id,
      dimension: item.dimension,
      state: evidence ? stateFromEvidence(evidence, evidence.freshness ?? item.freshness, now) : "unknown",
      required: item.required !== false,
      ...(evidence ? { evidence } : {}),
    };
  });
  const state = floorState(rubric);
  return {
    id: mission.id,
    title: mission.title,
    kind: mission.kind,
    status: mission.status,
    achieved: rubric.filter((item) => item.required).every((item) => item.state === "passing" || item.state === "waived"),
    floor_state: state,
    rubric,
    campaign_ids: [
      ...new Set([
        ...mission.evidence.map((record) => record.campaign_id),
        ...applicableCampaigns.map((campaign) => campaign.campaign_id),
      ]),
    ].sort(),
  };
}

export function projectCurrent(
  mission: MissionDocument,
  campaign: CampaignDocument,
  now: Date,
): CurrentProjection {
  const projection = evaluateMission(mission, [campaign], now);
  const cues = projection.rubric
    .filter((item) => item.required && item.state === "stale")
    .map((item) => `stale-evidence:${item.id}`);
  if (
    campaign.status === "waiting" &&
    campaign.expected_signal_by !== undefined &&
    Date.parse(campaign.expected_signal_by) < now.getTime()
  ) {
    cues.push("expected-signal-overdue");
  }
  if (campaign.attention === "publish") cues.push("boundary-awaiting-disposition:publish");
  return {
    mission: {
      id: mission.id,
      title: mission.title,
      kind: mission.kind,
      status: mission.status,
      floor_state: projection.floor_state,
      gaps: projection.rubric
        .filter((item) => item.required && item.state !== "passing" && item.state !== "waived")
        .map((item) => item.id),
    },
    campaign: {
      id: campaign.campaign_id,
      status: campaign.status,
      phase: campaign.phase,
      attention: campaign.attention,
      iteration: campaign.iteration,
      iteration_budget: campaign.iteration_budget,
      targets: [...campaign.targets],
      next_action: campaign.next_action,
    },
    cues,
  };
}
