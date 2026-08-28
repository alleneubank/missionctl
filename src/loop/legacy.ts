import { unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { errorCode, writeAtomic } from "./fs.js";
import { parseYamlMapping, splitFrontmatter, stringifyLoop } from "./frontmatter.js";
import { splitBody } from "./lifecycle.js";
import { resolveLoop, type LoopEvaluation } from "./resolve.js";
import { isNonEmptyString, isRecord } from "./schema.js";
import { LOOP_STATES, MissionctlError, PHASES, type Issue, type LoopClassification, type LoopDocument } from "./types.js";

/** Iteration cap a drafted loop receives when the legacy text names none; the human raises it if the campaign needs more. */
const DRAFT_ITERATION_BUDGET = 8;

export interface Inspection {
  ok: boolean;
  path: string | null;
  classification: LoopClassification | "none";
  preview: { headings: string[]; decisions: string[]; work_plan: string[]; fields: string[] } | null;
  issues: Issue[];
}

function bullets(text: string): string[] {
  return text
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const match = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/.exec(line);
      return match ? [match[1]] : [];
    });
}

function sectionsMatching(body: string, pattern: RegExp): string[] {
  return splitBody(body).sections.filter((section) => pattern.test(section.heading)).flatMap((section) => bullets(section.text));
}

export function inspectLoop(evaluation: LoopEvaluation): Inspection {
  if (evaluation.kind === "none") return { ok: true, path: null, classification: "none", preview: null, issues: [] };
  if (evaluation.kind === "loop") return { ok: evaluation.valid, path: evaluation.path, classification: "loop", preview: null, issues: evaluation.issues };
  const split = splitFrontmatter(evaluation.text);
  const fields = split.frontmatter === null ? [] : (() => {
    const parsed = parseYamlMapping(split.frontmatter);
    return parsed.ok ? Object.keys(parsed.value) : [];
  })();
  return {
    ok: true,
    path: evaluation.path,
    classification: evaluation.classification,
    preview: {
      headings: splitBody(split.body).sections.map((section) => section.heading),
      decisions: sectionsMatching(split.body, /^decisions\b/i),
      work_plan: sectionsMatching(split.body, /^work plan\b/i),
      fields,
    },
    issues: [],
  };
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function firstSentence(paragraph: string): string {
  const stripped = paragraph.replace(/^mission:\s*/i, "").replace(/\s+/g, " ").trim();
  const match = /^(.*?[.!?])(?:\s|$)/.exec(stripped);
  const sentence = (match ? match[1] : stripped).trim();
  return sentence.length === 0 ? sentence : sentence[0].toUpperCase() + sentence.slice(1);
}

/** Frontmatter that is not a YAML mapping has no field to preserve, so it rides the body verbatim in a fence, in the body's own line endings. */
function withLegacyFence(body: string, frontmatter: string): string {
  const lineEnding = body.includes("\r\n") ? "\r\n" : "\n";
  const block = ["", "## Legacy frontmatter", "", "```yaml", ...frontmatter.split("\n"), "```", ""].join(lineEnding);
  return `${body}${body.length === 0 || body.endsWith("\n") ? "" : lineEnding}${block}`;
}

function draftFromUntyped(text: string, fallbackId: string, now: Date): { document: Partial<LoopDocument> & Record<string, unknown>; body: string } {
  const { frontmatter, body: original } = splitFrontmatter(text);
  // Untyped frontmatter has no typed home either: a mapping is preserved under legacy_mission_control, anything else rides the body verbatim.
  let legacy: Record<string, unknown> | undefined;
  let body = original;
  if (frontmatter !== null && frontmatter.trim().length > 0) {
    const parsed = parseYamlMapping(frontmatter);
    if (parsed.ok) {
      if (Object.keys(parsed.value).length > 0) legacy = parsed.value;
    } else {
      body = withLegacyFence(original, frontmatter);
    }
  }
  const split = splitBody(body);
  const titleLine = split.preamble.split(/(?<=\n)/).find((line) => /^#\s+/.test(line));
  const titleMatch = titleLine ? /^#\s+(?:Loop:\s*)?(.+?)(?:\s+—\s+`.*`)?\s*$/.exec(titleLine) : undefined;
  const title = titleMatch?.[1] ?? fallbackId;
  const paragraphs = split.preamble
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !/^#\s/.test(paragraph));
  const objectiveParagraph = paragraphs[0];
  const objective = objectiveParagraph ? firstSentence(objectiveParagraph) : title;
  const budgetMatch = /hard cap\s+`?(\d+)`?/i.exec(body);
  const gates = sectionsMatching(body, /^verification floors\b/i)
    .flatMap((bullet) => {
      const match = /^`([^`]+)`\s*(?:→|->)\s*(.+)$/.exec(bullet);
      return match ? [{ run: match[1], green: match[2].trim() }] : [];
    })
    .map((gate, index) => ({ id: `gate-${index + 1}`, ...gate, state: "unknown" as const }));
  const units = sectionsMatching(body, /^work plan\b/i).map((bullet, index) => ({ id: `U${index + 1}`, title: bullet, state: index === 0 ? ("current" as const) : ("pending" as const) }));
  const decisions = sectionsMatching(body, /^decisions\b/i).map((bullet) => {
    const dated = /^(\d{4}-\d{2}-\d{2})\s*[—–-]\s*(.*)$/.exec(bullet);
    const rest = dated ? dated[2] : bullet;
    const status = /\bratified\b/i.test(rest) ? ("ratified" as const) : ("provisional" as const);
    // The status token leaves the call; everything else (rationale, references) stays so the draft loses nothing.
    const call = rest.replace(/\s*\b(?:ratified|provisional)\b\s*(?:\([^)]*\))?/i, " ").replace(/\s+/g, " ").trim();
    return { date: dated?.[1] ?? now.toISOString().slice(0, 10), call: call.length > 0 ? call : rest, status };
  });
  const boundary = sectionsMatching(body, /^boundar/i);
  // The body is carried verbatim: adoption adds frontmatter, and the driver retires converted sections through compact dispositions.
  return {
    document: {
      loop: 1,
      id: slug(title) || fallbackId,
      objective,
      status: "active",
      iteration: 0,
      iteration_budget: budgetMatch ? Number(budgetMatch[1]) : DRAFT_ITERATION_BUDGET,
      updated_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
      targets: {},
      ...(gates.length > 0 ? { gates } : {}),
      units,
      decisions,
      blockers: [],
      boundary,
      ...(legacy ? { extra: { legacy_mission_control: legacy } } : {}),
    },
    body,
  };
}

const string = (value: unknown): string | undefined => (isNonEmptyString(value) ? value : undefined);
const number = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);
const member =
  <T extends string>(allowed: readonly T[]) =>
  (value: unknown): T | undefined =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
const stringList = (value: unknown): string[] | undefined => (Array.isArray(value) && value.every(isNonEmptyString) ? value : undefined);
const missionSource = (value: unknown): { repository: string; ref: string; path: string } | undefined =>
  isRecord(value) && Object.keys(value).length === 3 && isNonEmptyString(value.repository) && isNonEmptyString(value.ref) && isNonEmptyString(value.path)
    ? { repository: value.repository, ref: value.ref, path: value.path }
    : undefined;

/**
 * A retired mission_control field leaves the frontmatter only when its value converted into the typed draft; a recognized key whose
 * value does not convert (a `status` outside the enum, a string budget, a partial `mission_source`) is preserved like an unknown one.
 */
function draftFromMissionControl(text: string, now: Date): { document: Partial<LoopDocument> & Record<string, unknown>; body: string } {
  const split = splitFrontmatter(text);
  const parsed = split.frontmatter === null ? undefined : parseYamlMapping(split.frontmatter);
  const raw: Record<string, unknown> = parsed?.ok ? parsed.value : {};
  const body = parsed === undefined || parsed.ok ? split.body : withLegacyFence(split.body, split.frontmatter!);
  const consumed = new Set<string>();
  const take = <T>(key: string, convert: (value: unknown) => T | undefined): T | undefined => {
    const value = convert(raw[key]);
    if (value !== undefined) consumed.add(key);
    return value;
  };
  take("mission_control", (value) => (value === 1 ? 1 : undefined));
  const id = take("campaign_id", string) ?? "adopted-campaign";
  const objective = take("objective", string) ?? "Restate the campaign objective.";
  const status = take("status", member(LOOP_STATES)) ?? "active";
  const phase = take("phase", member(PHASES));
  const iteration = take("iteration", number) ?? 0;
  const iterationBudget = take("iteration_budget", number) ?? DRAFT_ITERATION_BUDGET;
  const updatedAt = take("updated_at", string) ?? now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const missionId = take("mission_id", string);
  const source = missionId === undefined ? undefined : take("mission_source", missionSource);
  const targets = take("targets", stringList) ?? [];
  const nextAction = take("next_action", string);
  const unmapped = Object.fromEntries(Object.entries(raw).filter(([key]) => !consumed.has(key)));
  return {
    document: {
      loop: 1,
      id,
      objective,
      status,
      ...(phase ? { phase } : {}),
      iteration,
      iteration_budget: iterationBudget,
      updated_at: updatedAt,
      ...(missionId ? { mission: { id: missionId, ...(source ? { source } : {}) } } : {}),
      targets: targets.length > 0 ? { mission: targets } : {},
      units: nextAction ? [{ id: "U1", title: nextAction, state: "current" as const }] : [],
      decisions: [],
      blockers: [],
      ...(Object.keys(unmapped).length > 0 ? { extra: { legacy_mission_control: unmapped } } : {}),
    },
    body,
  };
}

export interface Adoption {
  ok: boolean;
  source: string;
  target: string;
  written: boolean;
  draft: string;
  issues: Issue[];
}

export function adoptionTarget(source: string): string {
  return basename(source) === "LOOP.md" ? source : join(dirname(dirname(source)), "LOOP.md");
}

export function draftAdoption(evaluation: LoopEvaluation, now: Date): { source: string; target: string; draft: string; evaluation: LoopEvaluation } {
  if (evaluation.kind === "none") throw new MissionctlError("loop.not-found", `no ${"LOOP.md"} or .claude/loop.md found at or above ${evaluation.root}`);
  if (evaluation.kind === "loop") throw new MissionctlError("legacy.already-typed", `${evaluation.path} is already a loop: 1 contract; edit it directly`);
  const target = adoptionTarget(evaluation.path);
  const fallbackId = slug(basename(dirname(target)));
  const { document, body } = evaluation.classification === "legacy-untyped" ? draftFromUntyped(evaluation.text, fallbackId, now) : draftFromMissionControl(evaluation.text, now);
  const draft = stringifyLoop(document as LoopDocument, body);
  return { source: evaluation.path, target, draft, evaluation: resolveLoop(draft, target) };
}

export function adoptLoop(evaluation: LoopEvaluation, now: Date, write: boolean): Adoption {
  const { source, target, draft, evaluation: drafted } = draftAdoption(evaluation, now);
  const issues = drafted.kind === "loop" ? drafted.issues : drafted.kind === "legacy" ? [drafted.issue] : [];
  const valid = drafted.kind === "loop" && drafted.valid;
  if (!write) return { ok: valid, source, target, written: false, draft, issues };
  if (!valid) return { ok: false, source, target, written: false, draft, issues };
  // Adopting in place replaces the legacy file itself; moving to LOOP.md must never replace anything already there.
  try {
    writeAtomic(target, draft, { exclusive: target !== source });
  } catch (error) {
    if (errorCode(error) === "EEXIST") throw new MissionctlError("legacy.target-exists", `${target} already exists; adoption never overwrites another loop`);
    throw error;
  }
  if (target !== source) unlinkSync(source);
  return { ok: true, source, target, written: true, draft, issues };
}
