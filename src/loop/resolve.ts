import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { findUp, isFile } from "./fs.js";
import { classifyLoop } from "./frontmatter.js";
import { fencedLines } from "./lifecycle.js";
import { MISSION_FILE, findMissionPath, findSiblingMissionPath, loadMission } from "./mission.js";
import { issue, parseLoop, type ParsedLoop, type PartialLoopFields } from "./schema.js";
import type { Issue, LoopClassification, LoopDocument, MissionDocument } from "./types.js";

/** Candidate loop locations per directory, in precedence order; `.claude/loop.md` is the legacy path. */
export const LOOP_FILES = ["LOOP.md", ".claude/loop.md"] as const;

export interface MissionLink {
  id: string;
  targets: string[];
  available: boolean;
  path?: string;
  document?: MissionDocument;
}

export type LoopEvaluation =
  | { kind: "none"; root: string }
  | { kind: "legacy"; path: string; classification: Exclude<LoopClassification, "loop">; text: string; issue: Issue }
  | {
      kind: "loop";
      path: string;
      classification: "loop";
      text: string;
      parsed: ParsedLoop;
      document?: LoopDocument;
      body: string;
      issues: Issue[];
      mission: MissionLink | null;
      valid: boolean;
    };

export type ValidLoop = Extract<LoopEvaluation, { kind: "loop" }> & { document: LoopDocument; valid: true };

export function findLoopPath(root: string): string | undefined {
  return findUp(root, LOOP_FILES);
}

function tokenPresent(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, "m").test(text);
}

/** Floor names are the `- Name:` bullets under the exact `## Floors` heading, outside fenced code; without that heading the brief declares no floors. */
function briefFloors(text: string): string[] | undefined {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const fenced = fencedLines(lines);
  const start = lines.findIndex((line, index) => !fenced[index] && /^##\s+Floors\s*$/.test(line));
  if (start === -1) return undefined;
  const next = lines.findIndex((line, index) => index > start && !fenced[index] && /^#{1,2}\s/.test(line));
  const scope = lines.slice(start + 1, next === -1 ? undefined : next).filter((_, offset) => !fenced[start + 1 + offset]);
  return scope.flatMap((line) => {
    const match = /^-\s+([^:]+?)\s*:/.exec(line);
    return match ? [match[1]] : [];
  });
}

function resolveStandingTargets(document: PartialLoopFields, loopDirectory: string): Issue[] {
  const issues: Issue[] = [];
  const spec = document.targets.spec ?? [];
  if (spec.length > 0) {
    const specPath = findUp(loopDirectory, ["SPEC.md"]);
    const text = specPath ? readFileSync(specPath, "utf8") : undefined;
    spec.forEach((target, index) => {
      if (text === undefined) {
        issues.push(issue("target.spec-missing-doc", "error", `targets.spec[${index}]`, `no SPEC.md found at or above ${loopDirectory} for ${target}`, "add a colocated SPEC.md carrying the requirement or remove the target"));
      } else if (!tokenPresent(text, target)) {
        issues.push(issue("target.unknown-spec-requirement", "error", `targets.spec[${index}]`, `${target} is not in ${specPath}`, `add ${target} to SPEC.md or remove the target`));
      }
    });
  }
  const brief = document.targets.brief ?? [];
  if (brief.length > 0) {
    const briefPath = findUp(loopDirectory, ["BRIEF.md"]);
    const floors = briefPath ? briefFloors(readFileSync(briefPath, "utf8")) : undefined;
    brief.forEach((target, index) => {
      if (!briefPath) {
        issues.push(issue("target.brief-missing-doc", "error", `targets.brief[${index}]`, `no BRIEF.md found at or above ${loopDirectory} for ${target}`, "add a colocated BRIEF.md carrying the floor or remove the target"));
      } else if (floors === undefined) {
        issues.push(issue("target.brief-missing-floors", "error", `targets.brief[${index}]`, `${briefPath} has no ## Floors section for ${target}`, `add ## Floors with "- ${target}: ..." to BRIEF.md or remove the target`));
      } else if (!floors.includes(target)) {
        issues.push(issue("target.unknown-brief-floor", "error", `targets.brief[${index}]`, `${target} is not a floor in ${briefPath}`, `add "- ${target}: ..." under ## Floors in BRIEF.md or remove the target`));
      }
    });
  }
  return issues;
}

function resolveMission(document: PartialLoopFields, loopDirectory: string): { link: MissionLink | null; issues: Issue[] } {
  const declaration = document.mission;
  if (!declaration) return { link: null, issues: [] };
  const targets = [...(document.targets.mission ?? [])];
  const issues: Issue[] = [];
  // An explicit source names the only acceptable mission file; a local mission with the same id never stands in for it.
  let missionPath: string | undefined;
  if (declaration.source) {
    missionPath = findSiblingMissionPath(loopDirectory, declaration.source);
    if (!missionPath) {
      const source = `${declaration.source.repository}@${declaration.source.ref}:${declaration.source.path}`;
      issues.push(issue("mission.unavailable", "warning", "mission.source", `mission ${declaration.id} from ${source} is not available locally; mission targets are not validated`, `check out the source repository beside this one or accept unvalidated mission targets`));
      return { link: { id: declaration.id, targets, available: false }, issues };
    }
  } else {
    missionPath = findMissionPath(loopDirectory);
  }
  const parsed = missionPath ? loadMission(missionPath) : undefined;
  const local = parsed?.document?.id === declaration.id ? parsed : undefined;
  if (local?.document && missionPath) {
    const rubricIds = new Set(local.document.rubric.map((item) => item.id));
    targets.forEach((target, index) => {
      if (!rubricIds.has(target)) {
        issues.push(issue("target.unknown-mission-rubric", "error", `targets.mission[${index}]`, `${target} is not a rubric id in ${missionPath}`, `add ${target} to the mission rubric or remove the target`));
      }
    });
    return { link: { id: declaration.id, targets, available: true, path: missionPath, document: local.document }, issues };
  }
  if (parsed && !parsed.document) {
    issues.push(issue("mission.invalid", "error", "mission.id", `linked mission ${missionPath} does not validate (${parsed.issues.length} issues)`, `run missionctl mission --root ${dirname(dirname(missionPath ?? ""))} and repair it`));
  } else if (parsed?.document) {
    issues.push(issue("mission.id-mismatch", "error", "mission.id", `mission ${declaration.id} does not match ${parsed.document.id} in ${missionPath}`, `set mission: ${parsed.document.id} or link the intended mission by source`));
  } else {
    issues.push(issue("mission.missing", "error", "mission.id", `no ${MISSION_FILE} found at or above ${loopDirectory} for mission ${declaration.id}`, `create ${MISSION_FILE} with id ${declaration.id}, add mission.source for a cross-repository mission, or remove the mission link`));
  }
  return { link: { id: declaration.id, targets, available: false }, issues };
}

/** Parses loop text and resolves its targets against the standing docs around `path`; the file need not exist (drafts). */
export function resolveLoop(text: string, path: string): LoopEvaluation {
  const classification = classifyLoop(text);
  if (classification !== "loop") {
    const label = classification === "legacy-untyped" ? "untyped" : "mission-control";
    return {
      kind: "legacy",
      path,
      classification,
      text,
      issue: issue(`legacy.${label}`, "error", "", `${path} is a ${classification} loop, not a loop: 1 contract`, "run missionctl inspect to preview it, then missionctl adopt (add --write once the draft validates)"),
    };
  }
  const parsed = parseLoop(text, path);
  const issues = [...parsed.issues];
  const directory = dirname(path);
  issues.push(...resolveStandingTargets(parsed.fields, directory));
  const resolved = resolveMission(parsed.fields, directory);
  const mission = resolved.link;
  issues.push(...resolved.issues);
  const valid = parsed.document !== undefined && !issues.some((entry) => entry.severity === "error");
  return {
    kind: "loop",
    path,
    classification: "loop",
    text,
    parsed,
    ...(valid ? { document: parsed.document } : {}),
    body: parsed.body,
    issues,
    mission,
    valid,
  };
}

export function evaluateLoop(root: string): LoopEvaluation {
  const absolute = resolve(root);
  const path = findLoopPath(absolute);
  if (!path || !isFile(path)) return { kind: "none", root: absolute };
  return resolveLoop(readFileSync(path, "utf8"), path);
}

export function errorCount(issues: readonly Issue[]): number {
  return issues.filter((entry) => entry.severity === "error").length;
}

export function isValidLoop(evaluation: LoopEvaluation): evaluation is ValidLoop {
  return evaluation.kind === "loop" && evaluation.valid && evaluation.document !== undefined;
}
