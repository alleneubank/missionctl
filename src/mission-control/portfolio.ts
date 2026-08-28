import type {
  AttentionClass,
  CampaignDocument,
  MissionKind,
  MissionProjection,
  ValidationIssue,
} from "./types.js";
import { ATTENTION_CLASSES, MISSION_KINDS } from "./types.js";
import { evaluateMission } from "./reducer.js";
import {
  discoverArtifacts,
  missionForCampaign,
  type DiscoveryIssue,
  type LegacyCampaign,
  type LocatedArtifact,
} from "./filesystem.js";
import { validateCampaign, validateMission } from "./validation.js";
import type { MissionDocument } from "./types.js";

export interface LocatedIssue extends ValidationIssue {
  artifact_path: string;
}

export interface PortfolioCampaign {
  id: string;
  status: CampaignDocument["status"];
  phase: string;
  attention: AttentionClass;
  iteration: number;
  iteration_budget: number;
}

export interface PortfolioMission {
  id: string;
  title: string;
  status: MissionDocument["status"];
  floor_state: MissionProjection["floor_state"];
  gaps: string[];
  campaigns: PortfolioCampaign[];
}

export interface PortfolioProjection {
  groups: Array<{
    attention: AttentionClass;
    kinds: Array<{ kind: MissionKind; missions: PortfolioMission[] }>;
  }>;
  legacy: LegacyCampaign[];
  issues: LocatedIssue[];
}

function locatedIssues(path: string, issues: readonly ValidationIssue[]): LocatedIssue[] {
  return issues.map((entry) => ({ ...entry, artifact_path: path }));
}

function attentionFor(campaigns: readonly LocatedArtifact<CampaignDocument>[]): AttentionClass {
  const order = new Map(ATTENTION_CLASSES.map((attention, index) => [attention, index]));
  return [...campaigns]
    .sort((left, right) => (order.get(left.document.attention) ?? 999) - (order.get(right.document.attention) ?? 999))[0]
    ?.document.attention ?? "none";
}

export function buildPortfolio(roots: readonly string[], now: Date): PortfolioProjection {
  const discovered = discoverArtifacts(roots);
  const issues: LocatedIssue[] = [...(discovered.issues as DiscoveryIssue[])];
  const campaignsByMission = new Map<string, LocatedArtifact<CampaignDocument>[]>();
  const validMissionPaths = new Set<string>();

  for (const mission of discovered.missions) {
    const missionIssues = validateMission(mission.document);
    issues.push(...locatedIssues(mission.path, missionIssues));
    if (missionIssues.length === 0) validMissionPaths.add(mission.path);
  }
  for (const campaign of discovered.campaigns) {
    const mission = missionForCampaign(campaign, discovered.missions);
    if (!mission) {
      const source = campaign.document.mission_source;
      issues.push({
        artifact_path: campaign.path,
        path: "mission_id",
        code: source ? "campaign.external-source-unavailable" : "campaign.mission-unavailable",
        message: source
          ? `mission source ${source.repository}@${source.ref}:${source.path} is unavailable`
          : `mission ${campaign.document.mission_id} is unavailable`,
      });
      continue;
    }
    if (!validMissionPaths.has(mission.path)) continue;
    const campaignIssues = validateCampaign(campaign.document, mission.document);
    issues.push(...locatedIssues(campaign.path, campaignIssues));
    if (campaignIssues.length > 0) continue;
    const list = campaignsByMission.get(mission.path) ?? [];
    list.push(campaign);
    campaignsByMission.set(mission.path, list);
  }

  const bucket = new Map<AttentionClass, Map<MissionKind, PortfolioMission[]>>();
  for (const mission of discovered.missions) {
    if (!validMissionPaths.has(mission.path)) continue;
    const campaigns = campaignsByMission.get(mission.path) ?? [];
    const projection = evaluateMission(
      mission.document,
      campaigns.map((campaign) => campaign.document),
      now,
    );
    for (const rubric of projection.rubric) {
      if (rubric.required && rubric.state === "stale") {
        issues.push({
          artifact_path: mission.path,
          path: `rubric.${rubric.id}`,
          code: "mission.stale-evidence",
          message: `required rubric ${rubric.id} has stale evidence`,
        });
      }
    }
    if (mission.document.status === "achieved" && !projection.achieved) {
      issues.push({
        artifact_path: mission.path,
        path: "status",
        code: "mission.achievement-without-evidence",
        message: "achieved mission lacks current admissible evidence for every required floor",
      });
    }
    const attention = attentionFor(campaigns);
    const byKind = bucket.get(attention) ?? new Map<MissionKind, PortfolioMission[]>();
    const missions = byKind.get(mission.document.kind) ?? [];
    missions.push({
      id: mission.document.id,
      title: mission.document.title,
      status: mission.document.status,
      floor_state: projection.floor_state,
      gaps: projection.rubric
        .filter((item) => item.required && item.state !== "passing" && item.state !== "waived")
        .map((item) => item.id),
      campaigns: campaigns
        .map(({ document }) => ({
          id: document.campaign_id,
          status: document.status,
          phase: document.phase,
          attention: document.attention,
          iteration: document.iteration,
          iteration_budget: document.iteration_budget,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    });
    byKind.set(mission.document.kind, missions);
    bucket.set(attention, byKind);
  }

  const groups = ATTENTION_CLASSES.flatMap((attention) => {
    const byKind = bucket.get(attention);
    if (!byKind) return [];
    return [
      {
        attention,
        kinds: MISSION_KINDS.flatMap((kind) => {
          const missions = byKind.get(kind);
          if (!missions) return [];
          return [{ kind, missions: missions.sort((left, right) => left.id.localeCompare(right.id)) }];
        }),
      },
    ];
  });

  return { groups, legacy: discovered.legacy, issues };
}
