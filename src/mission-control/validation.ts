import {
  ATTENTION_CLASSES,
  CAMPAIGN_STATES,
  EVIDENCE_RESULTS,
  MISSION_KINDS,
  MISSION_STATES,
  REQUIRED_DIMENSIONS,
  RESEARCH_RESULTS,
  type AttentionClass,
  type CampaignDocument,
  type EvidenceRecord,
  type MissionDocument,
  type MissionKind,
  type RubricItem,
  type ValidationIssue,
} from "./types.js";

const RUBRIC_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

export function durationMilliseconds(duration: string): number | undefined {
  const match = ISO_DURATION.exec(duration);
  if (!match || match.slice(1).every((part) => part === undefined)) return undefined;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  const milliseconds =
    Number(days) * 86_400_000 +
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000;
  return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function validateRubricItem(value: unknown, index: number): ValidationIssue[] {
  const path = `rubric[${index}]`;
  if (!isRecord(value)) return [issue("mission.invalid-rubric-item", path, "rubric item must be a mapping")];
  const issues: ValidationIssue[] = [];
  for (const field of ["id", "dimension", "criterion", "measure", "floor", "evaluator", "evidence_type"] as const) {
    if (!isNonEmptyString(value[field])) {
      issues.push(issue("mission.missing-rubric-field", `${path}.${field}`, `${field} must be a non-empty string`));
    }
  }
  if (isNonEmptyString(value.id) && !RUBRIC_ID.test(value.id)) {
    issues.push(issue("mission.invalid-rubric-id", `${path}.id`, `${value.id} is not an append-only rubric identifier`));
  }
  if (value.required !== undefined && typeof value.required !== "boolean") {
    issues.push(issue("mission.invalid-required", `${path}.required`, "required must be boolean when present"));
  }
  if (value.freshness !== undefined && (!isNonEmptyString(value.freshness) || durationMilliseconds(value.freshness) === undefined)) {
    issues.push(issue("mission.invalid-freshness", `${path}.freshness`, "freshness must be a positive ISO-8601 duration"));
  }
  return issues;
}

function validateEvidenceRecord(
  value: unknown,
  path: string,
  rubricById: ReadonlyMap<string, RubricItem>,
  requireCampaignId: boolean,
  targets?: ReadonlySet<string>,
): ValidationIssue[] {
  if (!isRecord(value)) return [issue("evidence.invalid-record", path, "evidence must be a mapping")];
  const issues: ValidationIssue[] = [];
  const rubricId = value.rubric_id;
  if (!isNonEmptyString(rubricId)) {
    issues.push(issue("evidence.missing-rubric-id", `${path}.rubric_id`, "rubric_id must be a non-empty string"));
  }
  const rubric = isNonEmptyString(rubricId) ? rubricById.get(rubricId) : undefined;
  if (isNonEmptyString(rubricId) && !rubric) {
    issues.push(issue("evidence.unknown-rubric-id", `${path}.rubric_id`, `unknown rubric ID ${rubricId}`));
  }
  if (isNonEmptyString(rubricId) && targets && !targets.has(rubricId)) {
    issues.push(issue("evidence.untargeted-rubric", `${path}.rubric_id`, `${rubricId} is not targeted by this campaign`));
  }
  if (requireCampaignId && !isNonEmptyString(value.campaign_id)) {
    issues.push(issue("evidence.missing-campaign-id", `${path}.campaign_id`, "campaign_id must be a non-empty string"));
  }
  if (!isNonEmptyString(value.evaluator)) {
    issues.push(issue("evidence.missing-evaluator", `${path}.evaluator`, "evaluator must be a non-empty string"));
  } else if (rubric && value.evaluator !== rubric.evaluator) {
    issues.push(
      issue("evidence.incompatible-evaluator", `${path}.evaluator`, `${value.evaluator} is not accepted by ${rubric.id}`),
    );
  }
  if (!isNonEmptyString(value.evidence_type)) {
    issues.push(issue("evidence.missing-type", `${path}.evidence_type`, "evidence_type must be a non-empty string"));
  } else if (rubric && value.evidence_type !== rubric.evidence_type) {
    issues.push(
      issue("evidence.incompatible-type", `${path}.evidence_type`, `${value.evidence_type} is not accepted by ${rubric.id}`),
    );
  }
  if (!EVIDENCE_RESULTS.includes(value.result as never)) {
    issues.push(issue("evidence.invalid-result", `${path}.result`, "result must be passing, failing, or waived"));
  }
  if (!validTimestamp(value.timestamp)) {
    issues.push(issue("evidence.invalid-timestamp", `${path}.timestamp`, "timestamp must be an ISO-8601 UTC timestamp"));
  }
  if (!isNonEmptyString(value.commit) && !isNonEmptyString(value.artifact_ref)) {
    issues.push(issue("evidence.missing-reference", path, "evidence requires a commit or artifact_ref"));
  }
  if (value.freshness !== undefined && (!isNonEmptyString(value.freshness) || durationMilliseconds(value.freshness) === undefined)) {
    issues.push(issue("evidence.invalid-freshness", `${path}.freshness`, "freshness must be a positive ISO-8601 duration"));
  }
  return issues;
}

export function validateMission(mission: MissionDocument): ValidationIssue[] {
  const value: unknown = mission;
  if (!isRecord(value)) return [issue("mission.invalid-document", "", "mission frontmatter must be a mapping")];
  const issues: ValidationIssue[] = [];
  if (value.mission_control !== 1) issues.push(issue("mission.unsupported-version", "mission_control", "mission_control must be 1"));
  for (const field of ["id", "title", "owner"] as const) {
    if (!isNonEmptyString(value[field])) issues.push(issue("mission.missing-field", field, `${field} must be a non-empty string`));
  }
  if (!MISSION_KINDS.includes(value.kind as never)) {
    issues.push(issue("mission.invalid-kind", "kind", `kind must be one of ${MISSION_KINDS.join(", ")}`));
  }
  if (!MISSION_STATES.includes(value.status as never)) {
    issues.push(issue("mission.invalid-status", "status", `status must be one of ${MISSION_STATES.join(", ")}`));
  }

  const rubricValues = Array.isArray(value.rubric) ? value.rubric : [];
  if (rubricValues.length === 0) issues.push(issue("mission.missing-rubric", "rubric", "rubric must contain at least one item"));
  rubricValues.forEach((item, index) => issues.push(...validateRubricItem(item, index)));
  const rubric = rubricValues.filter(isRecord) as unknown as RubricItem[];
  const ids = new Set<string>();
  rubric.forEach((item, index) => {
    if (!isNonEmptyString(item.id)) return;
    if (ids.has(item.id)) {
      issues.push(issue("mission.duplicate-rubric-id", `rubric[${index}].id`, `duplicate rubric ID ${item.id}`));
    }
    ids.add(item.id);
  });

  if (MISSION_KINDS.includes(value.kind as never)) {
    const kind = value.kind as MissionKind;
    const dimensions = new Set(rubric.map((item) => item.dimension).filter(isNonEmptyString));
    for (const required of REQUIRED_DIMENSIONS[kind]) {
      if (!dimensions.has(required)) {
        issues.push(issue("mission.required-dimension", "rubric", `${kind} mission requires dimension ${required}`));
      }
    }
  }
  if (!isStringArray(value.boundaries) || value.boundaries.length === 0) {
    issues.push(issue("mission.invalid-boundaries", "boundaries", "boundaries must contain at least one string"));
  }

  const rubricById = new Map(rubric.filter((item) => isNonEmptyString(item.id)).map((item) => [item.id, item]));
  if (!Array.isArray(value.evidence)) {
    issues.push(issue("mission.invalid-evidence", "evidence", "evidence must be an array"));
  } else {
    value.evidence.forEach((record, index) =>
      issues.push(...validateEvidenceRecord(record, `evidence[${index}]`, rubricById, true)),
    );
  }
  return issues;
}

const ATTENTION_BY_STATE: Readonly<Record<string, readonly AttentionClass[]>> = {
  planned: ["none", "review"],
  active: ["none", "review", "publish", "recover"],
  waiting: ["watch"],
  blocked: ["decide"],
  done: ["none", "review", "publish"],
  "budget-exhausted": ["recover"],
  superseded: ["none"],
};

export function validateCampaign(campaign: CampaignDocument, mission: MissionDocument): ValidationIssue[] {
  const value: unknown = campaign;
  if (!isRecord(value)) return [issue("campaign.invalid-document", "", "campaign frontmatter must be a mapping")];
  const issues: ValidationIssue[] = [];
  if (value.mission_control !== 1) issues.push(issue("campaign.unsupported-version", "mission_control", "mission_control must be 1"));
  for (const field of ["mission_id", "campaign_id", "objective", "phase", "next_action", "updated_at", "head"] as const) {
    if (!isNonEmptyString(value[field])) issues.push(issue("campaign.missing-field", field, `${field} must be a non-empty string`));
  }
  if (value.mission_id !== mission.id) {
    issues.push(issue("campaign.mission-id-mismatch", "mission_id", `${String(value.mission_id)} does not match ${mission.id}`));
  }
  if (!CAMPAIGN_STATES.includes(value.status as never)) {
    issues.push(issue("campaign.invalid-status", "status", `status must be one of ${CAMPAIGN_STATES.join(", ")}`));
  }
  if (!Number.isInteger(value.iteration) || Number(value.iteration) < 0) {
    issues.push(issue("campaign.invalid-iteration", "iteration", "iteration must be a non-negative integer"));
  }
  if (!Number.isInteger(value.iteration_budget) || Number(value.iteration_budget) <= 0) {
    issues.push(issue("campaign.invalid-budget", "iteration_budget", "iteration_budget must be a positive integer"));
  } else if (Number(value.iteration) > Number(value.iteration_budget)) {
    issues.push(issue("campaign.iteration-over-budget", "iteration", "iteration cannot exceed iteration_budget"));
  }

  const rubricById = new Map(mission.rubric.map((item) => [item.id, item]));
  const targets = isStringArray(value.targets) ? value.targets : [];
  if (targets.length === 0) issues.push(issue("campaign.invalid-targets", "targets", "targets must contain at least one rubric ID"));
  const seenTargets = new Set<string>();
  targets.forEach((target, index) => {
    if (seenTargets.has(target)) issues.push(issue("campaign.duplicate-target", `targets[${index}]`, `duplicate target ${target}`));
    seenTargets.add(target);
    if (!rubricById.has(target)) issues.push(issue("campaign.unknown-target", `targets[${index}]`, `unknown target ${target}`));
  });

  if (!ATTENTION_CLASSES.includes(value.attention as never)) {
    issues.push(issue("campaign.invalid-attention", "attention", `attention must be one of ${ATTENTION_CLASSES.join(", ")}`));
  } else if (CAMPAIGN_STATES.includes(value.status as never)) {
    const accepted = ATTENTION_BY_STATE[String(value.status)] ?? [];
    if (!accepted.includes(value.attention as AttentionClass)) {
      issues.push(
        issue(
          "campaign.attention-state-mismatch",
          "attention",
          `${String(value.status)} campaigns accept attention ${accepted.join(" or ")}`,
        ),
      );
    }
  }
  if (value.status === "waiting" && !validTimestamp(value.expected_signal_by)) {
    issues.push(
      issue("campaign.missing-expected-signal", "expected_signal_by", "waiting campaigns require expected_signal_by"),
    );
  } else if (value.expected_signal_by !== undefined && !validTimestamp(value.expected_signal_by)) {
    issues.push(issue("campaign.invalid-expected-signal", "expected_signal_by", "expected_signal_by must be an ISO UTC timestamp"));
  }
  if (!validTimestamp(value.updated_at)) {
    issues.push(issue("campaign.invalid-updated-at", "updated_at", "updated_at must be an ISO-8601 UTC timestamp"));
  }

  if (!isRecord(value.review_capacity) || !isNonEmptyString(value.review_capacity.measure) || !isNonEmptyString(value.review_capacity.limit)) {
    issues.push(
      issue("campaign.invalid-review-capacity", "review_capacity", "review_capacity requires non-empty measure and limit"),
    );
  }
  if (value.mission_source !== undefined) {
    if (
      !isRecord(value.mission_source) ||
      !isNonEmptyString(value.mission_source.repository) ||
      !isNonEmptyString(value.mission_source.ref) ||
      !isNonEmptyString(value.mission_source.path)
    ) {
      issues.push(
        issue(
          "campaign.invalid-mission-source",
          "mission_source",
          "mission_source requires repository, ref, and path",
        ),
      );
    }
  }

  if (!Array.isArray(value.evidence)) {
    issues.push(issue("campaign.invalid-evidence", "evidence", "evidence must be an array"));
  } else {
    value.evidence.forEach((record, index) =>
      issues.push(
        ...validateEvidenceRecord(record, `evidence[${index}]`, rubricById, false, new Set(targets)),
      ),
    );
  }

  if (mission.kind === "research" && value.status === "done" && !RESEARCH_RESULTS.includes(value.research_result as never)) {
    issues.push(
      issue("campaign.missing-research-result", "research_result", "done research campaigns require a conclusion"),
    );
  }
  if (value.research_result !== undefined && (mission.kind !== "research" || value.status !== "done")) {
    issues.push(
      issue(
        "campaign.premature-research-result",
        "research_result",
        "research_result is valid only for done research campaigns",
      ),
    );
  }
  return issues;
}

export function evidenceIsAdmissible(record: EvidenceRecord, rubric: RubricItem): boolean {
  return (
    record.rubric_id === rubric.id &&
    record.evaluator === rubric.evaluator &&
    record.evidence_type === rubric.evidence_type &&
    EVIDENCE_RESULTS.includes(record.result) &&
    validTimestamp(record.timestamp) &&
    (isNonEmptyString(record.commit) || isNonEmptyString(record.artifact_ref))
  );
}
