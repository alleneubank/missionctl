export const MISSION_KINDS = [
  "delivery",
  "operations",
  "research",
  "maintenance",
  "administrative",
  "training",
] as const;
export type MissionKind = (typeof MISSION_KINDS)[number];

export const MISSION_STATES = ["draft", "active", "paused", "achieved", "abandoned"] as const;
export type MissionStatus = (typeof MISSION_STATES)[number];

export const CAMPAIGN_STATES = [
  "planned",
  "active",
  "waiting",
  "blocked",
  "done",
  "budget-exhausted",
  "superseded",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATES)[number];

export const ATTENTION_CLASSES = ["decide", "review", "publish", "watch", "recover", "none"] as const;
export type AttentionClass = (typeof ATTENTION_CLASSES)[number];

export const EVIDENCE_RESULTS = ["passing", "failing", "waived"] as const;
export type EvidenceResult = (typeof EVIDENCE_RESULTS)[number];
export type RubricState = "unknown" | EvidenceResult | "stale";

export const RESEARCH_RESULTS = ["confirmed", "refuted", "inconclusive"] as const;
export type ResearchResult = (typeof RESEARCH_RESULTS)[number];

export const REQUIRED_DIMENSIONS: Readonly<Record<MissionKind, readonly string[]>> = {
  delivery: ["contract-acceptance", "quality-bar", "integration-e2e", "operability", "landing-readiness"],
  operations: ["health", "safety", "reversibility", "observability", "post-change-observation"],
  research: [
    "question-resolution",
    "evidence-quality",
    "alternative-explanations",
    "reproducibility",
    "decision-usefulness",
  ],
  maintenance: ["bounded-inventory", "closure-evidence", "regression-prevention", "recurrence-reduction"],
  administrative: ["outcome-artifact", "dependency-deadline-state", "privacy-compliance", "required-approval"],
  training: ["recall", "application", "novel-transfer", "retention-performance"],
};

export interface RubricItem {
  id: string;
  dimension: string;
  criterion: string;
  measure: string;
  floor: string;
  evaluator: string;
  evidence_type: string;
  required?: boolean;
  freshness?: string;
}

export interface EvidenceRecord {
  rubric_id: string;
  campaign_id: string;
  evaluator: string;
  evidence_type: string;
  result: EvidenceResult;
  timestamp: string;
  commit?: string;
  artifact_ref?: string;
  freshness?: string;
  conclusion?: string;
}

export type CampaignEvidenceRecord = Omit<EvidenceRecord, "campaign_id">;

export interface MissionDocument {
  mission_control: 1;
  id: string;
  title: string;
  kind: MissionKind;
  status: MissionStatus;
  owner: string;
  rubric: RubricItem[];
  boundaries: string[];
  evidence: EvidenceRecord[];
}

export interface ExternalMissionSource {
  repository: string;
  ref: string;
  path: string;
}

export interface ReviewCapacity {
  measure: string;
  limit: string;
}

export interface CampaignDocument {
  mission_control: 1;
  mission_id: string;
  mission_source?: ExternalMissionSource;
  campaign_id: string;
  objective: string;
  status: CampaignStatus;
  phase: string;
  iteration: number;
  iteration_budget: number;
  targets: string[];
  attention: AttentionClass;
  next_action: string;
  expected_signal_by?: string;
  updated_at: string;
  head: string;
  review_capacity: ReviewCapacity;
  research_result?: ResearchResult;
  evidence: CampaignEvidenceRecord[];
}

export interface ParsedArtifact<T> {
  document: T;
  body: string;
  path: string;
}

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface RubricProjection {
  id: string;
  dimension: string;
  state: RubricState;
  required: boolean;
  evidence?: EvidenceRecord;
}

export interface MissionProjection {
  id: string;
  title: string;
  kind: MissionKind;
  status: MissionStatus;
  achieved: boolean;
  floor_state: RubricState;
  rubric: RubricProjection[];
  campaign_ids: string[];
}

export interface CurrentProjection {
  mission: {
    id: string;
    title: string;
    kind: MissionKind;
    status: MissionStatus;
    floor_state: RubricState;
    gaps: string[];
  };
  campaign: {
    id: string;
    status: CampaignStatus;
    phase: string;
    attention: AttentionClass;
    iteration: number;
    iteration_budget: number;
    targets: string[];
    next_action: string;
  };
  cues: string[];
}
