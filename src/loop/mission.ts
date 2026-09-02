import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseDocument, type Document } from "yaml";

import { DISCOVERY_DIRECTORIES_MAX, entryExists, findBelow, findUpEntry, isFile } from "./fs.js";
import { classifyLoop } from "./frontmatter.js";
import { parseLoop } from "./schema.js";
import { isNonEmptyString, isRecord, issue } from "./schema.js";
import { RUBRIC_STATES, type Issue, type LoopStatus, type MissionDocument, type MissionSource, type RubricItem, type RubricStatus } from "./types.js";

export const MISSION_FILE = ".mission/mission.yaml";

export interface ParsedMission {
  path: string;
  document?: MissionDocument;
  issues: Issue[];
}

function readRubricItem(value: unknown, index: number, issues: Issue[]): RubricItem | undefined {
  const path = `rubric[${index}]`;
  if (!isRecord(value)) {
    issues.push(issue("mission.invalid-field", "error", path, `${path} must be a mapping`, `rewrite ${path} as { id, criterion, floor, status }`));
    return undefined;
  }
  let complete = true;
  for (const field of ["id", "criterion", "floor"] as const) {
    if (!isNonEmptyString(value[field])) {
      issues.push(issue("mission.missing-field", "error", `${path}.${field}`, `${path}.${field} is required`, `add ${path}.${field}`));
      complete = false;
    }
  }
  const status = value.status;
  if (typeof status !== "string" || !(RUBRIC_STATES as readonly string[]).includes(status)) {
    issues.push(issue("mission.invalid-enum", "error", `${path}.status`, `${path}.status must be one of ${RUBRIC_STATES.join(", ")}`, `set ${path}.status to open, met, or waived`));
    complete = false;
  }
  if (status === "met" && !isNonEmptyString(value.evidence)) {
    issues.push(issue("mission.missing-evidence", "error", `${path}.evidence`, `${path} is met without evidence`, `add ${path}.evidence: <verifier, CI, review, or release reference>`));
    complete = false;
  }
  if (status === "waived" && !isNonEmptyString(value.reason)) {
    issues.push(issue("mission.missing-reason", "error", `${path}.reason`, `${path} is waived without a reason`, `add ${path}.reason`));
    complete = false;
  }
  if (!complete) return undefined;
  return {
    id: value.id as string,
    criterion: value.criterion as string,
    floor: value.floor as string,
    status: status as RubricStatus,
    ...(isNonEmptyString(value.evidence) ? { evidence: value.evidence } : {}),
    ...(isNonEmptyString(value.reason) ? { reason: value.reason } : {}),
  };
}

export function parseMission(source: string, path: string): ParsedMission {
  const issues: Issue[] = [];
  let raw: unknown;
  // parseDocument never throws on syntax errors; it records them, and a document with errors is not a mission.
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    return { path, issues: [issue("mission.parse-error", "error", "", `mission.yaml is not valid YAML: ${document.errors[0].message.split("\n")[0]}`, "fix the YAML syntax")] };
  }
  try {
    raw = document.toJS() as unknown;
  } catch (error) {
    return { path, issues: [issue("mission.parse-error", "error", "", `mission.yaml is not valid YAML: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`, "fix the YAML syntax")] };
  }
  if (!isRecord(raw)) return { path, issues: [issue("mission.parse-error", "error", "", "mission.yaml must be a mapping", "rewrite mission.yaml as a mapping")] };
  if (raw.mission !== 1) issues.push(issue("mission.invalid-field", "error", "mission", "mission must be 1", "set mission: 1"));
  for (const field of ["id", "title", "outcome"] as const) {
    if (!isNonEmptyString(raw[field])) issues.push(issue("mission.missing-field", "error", field, `${field} is required`, `add ${field}: <text>`));
  }
  const rubricValues = Array.isArray(raw.rubric) && raw.rubric.length > 0 ? raw.rubric : undefined;
  if (!rubricValues) issues.push(issue("mission.invalid-field", "error", "rubric", "rubric must be a non-empty list", "add rubric: [{ id, criterion, floor, status }]"));
  const rubric = (rubricValues ?? []).map((value, index) => readRubricItem(value, index, issues));
  const seen = new Set<string>();
  rubric.forEach((item, index) => {
    if (!item) return;
    if (seen.has(item.id)) issues.push(issue("mission.duplicate-id", "error", `rubric[${index}].id`, `duplicate rubric id ${item.id}`, "give each rubric item a unique id"));
    seen.add(item.id);
  });
  const boundary = Array.isArray(raw.boundary) && raw.boundary.length > 0 && raw.boundary.every(isNonEmptyString) ? (raw.boundary as string[]) : undefined;
  if (!boundary) issues.push(issue("mission.invalid-field", "error", "boundary", "boundary must be a non-empty list of strings", "add boundary: [publish]"));
  if (issues.some((entry) => entry.severity === "error") || !boundary || rubric.some((item) => item === undefined)) return { path, issues };
  return {
    path,
    issues,
    document: {
      mission: 1,
      id: raw.id as string,
      title: raw.title as string,
      outcome: raw.outcome as string,
      rubric: rubric as RubricItem[],
      boundary,
    },
  };
}

/** A cross-repository mission is available when its repository is checked out beside one of the loop's ancestor directories; the ref is informational. */
export function findSiblingMissionPath(loopDirectory: string, source: Pick<MissionSource, "repository" | "path">): string | undefined {
  const name = basename(source.repository.replace(/[\\/]+$/, "").replace(/\.git$/, "").split(":").pop() ?? "");
  if (name.length === 0 || name === "." || name === "..") return undefined;
  let current = resolve(loopDirectory);
  // Bounded by path depth: every iteration moves strictly toward the root.
  while (true) {
    const parent = dirname(current);
    if (parent === current) return undefined;
    const candidate = join(parent, name, source.path);
    if (entryExists(candidate)) return candidate;
    current = parent;
  }
}

export function findMissionPath(start: string): string | undefined {
  return findUpEntry(start, [MISSION_FILE]);
}

export function loadMission(path: string): ParsedMission {
  if (!isFile(path)) {
    return {
      path,
      issues: [issue("mission.unreadable", "error", "", `${path} exists but is not a readable mission file`, `replace ${path} with a readable mission.yaml file`)],
    };
  }
  return parseMission(readFileSync(path, "utf8"), path);
}

export interface RubricUpdate {
  id: string;
  status: RubricStatus;
  evidence?: string;
  reason?: string;
}

/** Applies rubric updates through the YAML document model so comments and unrelated formatting survive. */
export function updateMissionText(source: string, updates: readonly RubricUpdate[]): string {
  const document: Document = parseDocument(source);
  const rubric = document.get("rubric", true);
  if (!rubric || typeof rubric !== "object" || !("items" in rubric) || !Array.isArray((rubric as { items: unknown[] }).items)) {
    throw new Error("mission.yaml rubric is not a sequence");
  }
  const items = (rubric as { items: unknown[] }).items;
  for (const update of updates) {
    const index = items.findIndex((_, position) => document.getIn(["rubric", position, "id"]) === update.id);
    if (index === -1) throw new Error(`rubric item ${update.id} not found`);
    document.setIn(["rubric", index, "status"], update.status);
    document.deleteIn(["rubric", index, "evidence"]);
    document.deleteIn(["rubric", index, "reason"]);
    if (update.evidence !== undefined) document.setIn(["rubric", index, "evidence"], update.evidence);
    if (update.reason !== undefined) document.setIn(["rubric", index, "reason"], update.reason);
  }
  return document.toString({ lineWidth: 0 });
}

export interface MissionCampaign {
  path: string;
  id: string;
  status: LoopStatus;
  targets: string[];
}

export interface MissionProjection {
  ok: boolean;
  mission: {
    path: string;
    id: string;
    title: string;
    outcome: string;
    achieved: boolean;
    rubric: Array<{ id: string; status: RubricStatus; evidence?: string; reason?: string }>;
    boundary: string[];
  } | null;
  campaigns: MissionCampaign[];
  issues: Issue[];
}

export function projectMission(missionPath: string): MissionProjection {
  const parsed = loadMission(missionPath);
  if (!parsed.document) return { ok: false, mission: null, campaigns: [], issues: parsed.issues };
  const mission = parsed.document;
  const issues = [...parsed.issues];
  const campaigns: MissionCampaign[] = [];
  const root = dirname(dirname(missionPath));
  const discovery = findBelow(root, "LOOP.md");
  if (discovery.truncated) {
    issues.push(
      issue(
        "mission.discovery-bounded",
        "error",
        "",
        `campaign discovery stopped after ${DISCOVERY_DIRECTORIES_MAX} directories under ${root}; the campaign list is incomplete`,
        "keep the mission root below the directory bound or move generated trees under an ignored path",
      ),
    );
  }
  for (const loopPath of discovery.unreadable) {
    issues.push(
      issue(
        "mission.campaign-unreadable",
        "error",
        loopPath,
        `${loopPath} is a symbolic link whose target is not a readable loop file`,
        `replace ${loopPath} with a readable LOOP.md file or remove the broken contract`,
      ),
    );
  }
  for (const loopPath of discovery.paths) {
    const text = readFileSync(loopPath, "utf8");
    if (classifyLoop(text) !== "loop") continue;
    const loop = parseLoop(text, loopPath);
    if (!loop.document) {
      issues.push(issue("mission.campaign-invalid", "warning", loopPath, `${loopPath} does not validate`, `run missionctl check --root ${dirname(loopPath)}`));
      continue;
    }
    const link = loop.document.mission;
    if (link?.id !== mission.id) continue;
    // A loop that names another repository's mission by source belongs to that mission, however it is called here.
    if (link.source) {
      const declared = findSiblingMissionPath(dirname(loopPath), link.source);
      if (!declared || !isFile(declared) || realpathSync(declared) !== realpathSync(missionPath)) continue;
    }
    campaigns.push({ path: loopPath, id: loop.document.id, status: loop.document.status, targets: [...(loop.document.targets.mission ?? [])] });
  }
  return {
    ok: !issues.some((entry) => entry.severity === "error"),
    mission: {
      path: missionPath,
      id: mission.id,
      title: mission.title,
      outcome: mission.outcome,
      achieved: mission.rubric.every((item) => item.status !== "open"),
      rubric: mission.rubric.map((item) => ({
        id: item.id,
        status: item.status,
        ...(item.evidence ? { evidence: item.evidence } : {}),
        ...(item.reason ? { reason: item.reason } : {}),
      })),
      boundary: [...mission.boundary],
    },
    campaigns,
    issues,
  };
}
