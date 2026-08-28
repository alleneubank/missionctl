import { readFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";

import { findUp, sha256, writeAtomic } from "./fs.js";
import { stringifyLoop } from "./frontmatter.js";
import { updateMissionText, type RubricUpdate } from "./mission.js";
import type { ValidLoop } from "./resolve.js";
import { isNonEmptyString, isRecord, issue } from "./schema.js";
import { CLOSABLE_STATES, MissionctlError, type Issue, type RubricStatus } from "./types.js";

export const TRANSITIONS = ["compact", "close"] as const;
export type Transition = (typeof TRANSITIONS)[number];

export type Disposition = "keep" | "drop" | "migrated" | "complete" | "route:spec" | "route:brief" | "met" | "open" | "waived";

/** Legacy frontmatter that adoption preserved because it has no typed home; retired only through a compact disposition. */
export const LEGACY_BLOCK = "legacy_mission_control";

/** The body preamble (everything before the first `## ` section) is one item: compact never drops it, and close never deletes it silently. */
export const PREAMBLE_ITEM = "preamble";

export interface PlanItem {
  id: string;
  kind: "unit" | "decision" | "blocker" | "preamble" | "section" | "rubric" | "legacy";
  summary: string;
  allowed: Disposition[];
  proposed: Disposition;
  disposition: Disposition | null;
  reason: string | null;
  /** Present only on rubric items; required when the disposition is `met`. */
  evidence?: string | null;
}

export interface Plan {
  plan: 1;
  transition: Transition;
  loop_path: string;
  source_sha256: string;
  items: PlanItem[];
}

export interface BodySection {
  heading: string;
  text: string;
}

export interface SplitBody {
  preamble: string;
  sections: BodySection[];
}

/** CommonMark fences: a fence closes only on the same marker character with at least the opening length. Returns, per line, whether it sits inside (or is part of) a fence. */
export function fencedLines(lines: readonly string[]): boolean[] {
  let open: { marker: string; length: number } | undefined;
  return lines.map((line) => {
    // Lines may keep their terminator (the body split is byte-preserving); the info string never includes it.
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.replace(/\r?\n$/, ""));
    if (fence) {
      const marker = fence[1][0];
      const rest = fence[2];
      if (!open) {
        // An opening backtick fence may not carry a backtick in its info string.
        if (marker === "~" || !rest.includes("`")) {
          open = { marker, length: fence[1].length };
          return true;
        }
      } else if (marker === open.marker && fence[1].length >= open.length && rest.trim().length === 0) {
        // A closing fence carries nothing but trailing whitespace; anything else is content.
        open = undefined;
        return true;
      }
    }
    return open !== undefined;
  });
}

/** Splits the body at `## ` headings, keeping every byte: the preamble (title and anything before the first section) is never disposable. */
export function splitBody(body: string): SplitBody {
  const lines = body.split(/(?<=\n)/);
  const fenced = fencedLines(lines);
  const sections: BodySection[] = [];
  const preamble: string[] = [];
  let current: { heading: string; lines: string[] } | undefined;
  for (const [index, line] of lines.entries()) {
    // A fenced code block may quote a heading; it opens and closes a section only outside fences.
    const heading = fenced[index] ? null : /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) sections.push({ heading: current.heading, text: current.lines.join("") });
      current = { heading: heading[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push({ heading: current.heading, text: current.lines.join("") });
  return { preamble: preamble.join(""), sections };
}

/** Ids are unique within one body even when a heading spells a generated suffix: the suffix keeps growing until it is free. */
function sectionId(section: BodySection, used: Set<string>): string {
  const base = `section:${section.heading}`;
  let id = base;
  // Bounded by the number of sections: each collision consumes one already-used id.
  for (let ordinal = 2; used.has(id); ordinal += 1) id = `${base}#${ordinal}`;
  used.add(id);
  return id;
}

function sectionSummary(section: BodySection): string {
  const lines = section.text.split("\n").slice(1).filter((line) => line.trim().length > 0).length;
  return `## ${section.heading} (${lines} line${lines === 1 ? "" : "s"})`;
}

function item(id: string, kind: PlanItem["kind"], summary: string, allowed: Disposition[], proposed: Disposition, rubric = false): PlanItem {
  return { id, kind, summary, allowed, proposed, disposition: null, reason: null, ...(rubric ? { evidence: null } : {}) };
}

/** Lines of the preamble that say something: blank lines and the `# ` title (which names the loop the close is dissolving) do not. */
function preambleContentLines(preamble: string): number {
  return preamble.split("\n").filter((line) => line.trim().length > 0 && !/^#\s/.test(line)).length;
}

export function planItems(loop: ValidLoop, transition: Transition): PlanItem[] {
  const document = loop.document;
  const items: PlanItem[] = [];
  document.units.forEach((unit) => {
    const summary = `${unit.id} ${unit.title} [${unit.state}]`;
    if (transition === "compact" && unit.state === "done") items.push(item(`unit:${unit.id}`, "unit", summary, ["drop", "keep"], "drop"));
    if (transition === "close" && unit.state !== "done") items.push(item(`unit:${unit.id}`, "unit", summary, ["complete", "drop"], document.status === "done" ? "complete" : "drop"));
  });
  document.decisions.forEach((decision, index) => {
    const summary = `${decision.date} ${decision.status}: ${decision.call}`;
    if (transition === "compact") {
      items.push(item(`decision:${index}`, "decision", summary, ["keep", "route:spec", "route:brief", "drop"], decision.status === "ratified" ? "route:spec" : "keep"));
    } else {
      items.push(item(`decision:${index}`, "decision", summary, ["route:spec", "route:brief", "drop"], "route:spec"));
    }
  });
  document.blockers.forEach((blocker, index) => {
    items.push(item(`blocker:${index}`, "blocker", blocker.summary, transition === "compact" ? ["keep", "drop"] : ["drop"], transition === "compact" ? "keep" : "drop"));
  });
  const split = splitBody(loop.body);
  const preambleLines = transition === "close" ? preambleContentLines(split.preamble) : 0;
  if (preambleLines > 0) {
    items.push(item(PREAMBLE_ITEM, "preamble", `preamble (${preambleLines} line${preambleLines === 1 ? "" : "s"})`, ["drop", "migrated"], "drop"));
  }
  const used = new Set<string>();
  for (const section of split.sections) {
    items.push(item(sectionId(section, used), "section", sectionSummary(section), transition === "compact" ? ["keep", "drop", "migrated"] : ["drop", "migrated"], "drop"));
  }
  const legacy = document.extra?.[LEGACY_BLOCK];
  if (isRecord(legacy)) {
    const allowed: Disposition[] = transition === "compact" ? ["keep", "drop", "migrated"] : ["drop", "migrated"];
    items.push(item(`legacy:${LEGACY_BLOCK}`, "legacy", `${LEGACY_BLOCK} (${Object.keys(legacy).join(", ")})`, allowed, "drop"));
  }
  if (transition === "close" && loop.mission?.available && loop.mission.document) {
    const rubric = new Map(loop.mission.document.rubric.map((entry) => [entry.id, entry]));
    for (const target of loop.mission.targets) {
      const entry = rubric.get(target);
      if (!entry) continue;
      items.push(item(`rubric:${target}`, "rubric", `${target} [${entry.status}] ${entry.criterion}`, ["met", "open", "waived"], document.status === "done" ? "met" : "open", true));
    }
  }
  return items;
}

/** Every close phase re-checks the live status: a plan that matches the file bytes proves nothing about whether the campaign ended. */
function assertClosable(loop: ValidLoop, transition: Transition): void {
  if (transition !== "close" || CLOSABLE_STATES.includes(loop.document.status)) return;
  const message = `status ${loop.document.status} is not terminal; close applies only to ${CLOSABLE_STATES.join(", ")}`;
  throw new MissionctlError("close.not-terminal", message, {
    issues: [issue("close.not-terminal", "error", "status", message, `set status to one of ${CLOSABLE_STATES.join(", ")} (with every gate green for done) or keep iterating`)],
  });
}

export function preparePlan(loop: ValidLoop, transition: Transition): Plan {
  assertClosable(loop, transition);
  return { plan: 1, transition, loop_path: loop.path, source_sha256: sha256(loop.text), items: planItems(loop, transition) };
}

/** Dropping a decision, blocker, or legacy block, abandoning an unfinished unit at close, or waiving a rubric floor owes a reviewable reason; dropping a done unit or a body section does not. */
function reasonRequired(entry: PlanItem, disposition: Disposition, transition: Transition): boolean {
  if (disposition === "waived") return true;
  if (disposition !== "drop") return false;
  if (entry.kind === "decision" || entry.kind === "blocker" || entry.kind === "legacy") return true;
  return entry.kind === "unit" && transition === "close";
}

function routeTarget(disposition: Disposition): "SPEC.md" | "BRIEF.md" | undefined {
  if (disposition === "route:spec") return "SPEC.md";
  if (disposition === "route:brief") return "BRIEF.md";
  return undefined;
}

export function readPlan(value: unknown): { plan?: Plan; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!isRecord(value)) return { issues: [issue("plan.invalid", "error", "", "plan must be a JSON object", "pass the JSON emitted by prepare with dispositions filled in")] };
  if (value.plan !== 1) issues.push(issue("plan.invalid", "error", "plan", "plan must be 1", "use the plan emitted by prepare"));
  if (!TRANSITIONS.includes(value.transition as Transition)) issues.push(issue("plan.invalid", "error", "transition", `transition must be ${TRANSITIONS.join(" or ")}`, "use the plan emitted by prepare"));
  if (!isNonEmptyString(value.loop_path)) issues.push(issue("plan.invalid", "error", "loop_path", "loop_path is required", "use the plan emitted by prepare"));
  if (!isNonEmptyString(value.source_sha256)) issues.push(issue("plan.invalid", "error", "source_sha256", "source_sha256 is required", "use the plan emitted by prepare"));
  if (!Array.isArray(value.items)) issues.push(issue("plan.invalid", "error", "items", "items must be a list", "use the plan emitted by prepare"));
  if (issues.length > 0) return { issues };
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  (value.items as unknown[]).forEach((entry, index) => {
    if (!isRecord(entry) || !isNonEmptyString(entry.id)) {
      issues.push(issue("plan.invalid", "error", `items[${index}]`, "item must be an object with an id", "use the plan emitted by prepare"));
      return;
    }
    // Two entries for one id would leave the disposition to whichever the reader met last; a plan that disagrees with itself is refused whole.
    if (seen.has(entry.id)) {
      issues.push(issue("plan.invalid", "error", `items[${index}]`, `${entry.id} appears more than once in the plan`, "keep one entry per item id"));
      return;
    }
    seen.add(entry.id);
    items.push({
      id: entry.id,
      kind: entry.kind as PlanItem["kind"],
      summary: typeof entry.summary === "string" ? entry.summary : "",
      allowed: Array.isArray(entry.allowed) ? (entry.allowed as Disposition[]) : [],
      proposed: entry.proposed as Disposition,
      disposition: isNonEmptyString(entry.disposition) ? (entry.disposition as Disposition) : null,
      reason: isNonEmptyString(entry.reason) ? entry.reason : null,
      ...("evidence" in entry ? { evidence: isNonEmptyString(entry.evidence) ? entry.evidence : null } : {}),
    });
  });
  if (issues.length > 0) return { issues };
  return { plan: { plan: 1, transition: value.transition as Transition, loop_path: value.loop_path as string, source_sha256: value.source_sha256 as string, items }, issues };
}

export interface ResolvedPlan {
  fresh: PlanItem[];
  decided: Map<string, PlanItem>;
  routes: Array<{ id: string; path: string }>;
}

/** Validates a filled plan against the live loop; every refusal is an issue so the driver can fix the plan without guessing. */
export function validatePlan(loop: ValidLoop, transition: Transition, plan: Plan): { issues: Issue[]; resolved?: ResolvedPlan } {
  assertClosable(loop, transition);
  const issues: Issue[] = [];
  if (plan.transition !== transition) {
    issues.push(issue("plan.transition-mismatch", "error", "transition", `plan is for ${plan.transition}, not ${transition}`, `run missionctl ${plan.transition} with this plan or prepare a ${transition} plan`));
  }
  if (plan.loop_path !== loop.path) {
    issues.push(issue("plan.loop-mismatch", "error", "loop_path", `plan targets ${plan.loop_path}, not ${loop.path}`, "prepare a plan for this loop"));
  }
  if (plan.source_sha256 !== sha256(loop.text)) {
    issues.push(issue("plan.stale-source", "error", "source_sha256", "LOOP.md changed since this plan was prepared", "run prepare again and re-apply your dispositions to the fresh plan"));
  }
  if (issues.length > 0) return { issues };

  const fresh = planItems(loop, transition);
  const freshById = new Map(fresh.map((entry) => [entry.id, entry]));
  const planById = new Map(plan.items.map((entry) => [entry.id, entry]));
  for (const entry of fresh) {
    if (!planById.has(entry.id)) issues.push(issue("plan.missing-item", "error", `items.${entry.id}`, `${entry.id} needs a disposition but is not in the plan`, "run prepare again and dispose every item"));
  }
  for (const entry of plan.items) {
    if (!freshById.has(entry.id)) issues.push(issue("plan.unknown-item", "error", `items.${entry.id}`, `${entry.id} is not in the current loop`, "run prepare again; the loop changed"));
  }
  if (issues.length > 0) return { issues };

  const decided = new Map<string, PlanItem>();
  const routes: Array<{ id: string; path: string }> = [];
  const directory = dirname(loop.path);
  for (const entry of fresh) {
    const chosen = planById.get(entry.id)!;
    const path = `items.${entry.id}`;
    if (chosen.disposition === null) {
      issues.push(issue("plan.missing-disposition", "error", path, `${entry.id} has no disposition`, `set disposition to one of ${entry.allowed.join(", ")} (proposed: ${entry.proposed})`));
      continue;
    }
    if (!entry.allowed.includes(chosen.disposition)) {
      issues.push(issue("plan.disposition-not-allowed", "error", path, `${chosen.disposition} is not allowed for ${entry.id}`, `set disposition to one of ${entry.allowed.join(", ")}`));
      continue;
    }
    if (reasonRequired(entry, chosen.disposition, transition) && chosen.reason === null) {
      issues.push(issue("plan.missing-reason", "error", path, `${chosen.disposition} on ${entry.id} needs a reason`, "add a one-line reason so the choice is reviewable"));
      continue;
    }
    if (entry.kind === "rubric" && chosen.disposition === "met" && !isNonEmptyString(chosen.evidence)) {
      issues.push(issue("plan.missing-evidence", "error", path, `${entry.id} cannot be met without evidence`, "set evidence to the verifier, CI, review, or release reference that proves the floor"));
      continue;
    }
    const target = routeTarget(chosen.disposition);
    if (target) {
      const targetPath = findUp(directory, [target]);
      if (!targetPath) {
        issues.push(issue("route.target-missing", "error", path, `no ${target} found at or above ${directory} to receive ${entry.id}`, `create ${target} with a ## Decisions section or choose another disposition`));
        continue;
      }
      routes.push({ id: entry.id, path: targetPath });
    }
    decided.set(entry.id, { ...entry, disposition: chosen.disposition, reason: chosen.reason, ...(entry.kind === "rubric" ? { evidence: chosen.evidence ?? null } : {}) });
  }
  if (issues.length > 0) return { issues };
  return { issues, resolved: { fresh, decided, routes } };
}

function decisionEntry(date: string, call: string, status: "provisional" | "ratified"): string {
  const punctuated = /[.!?]$/.test(call) ? call : `${call}.`;
  return `- ${date} — ${punctuated} **${status === "ratified" ? "ratified (human)" : "provisional (driver)"}**`;
}

/**
 * Appends entries at the end of the real `## Decisions` section (headings inside code fences do not count), creating it at the end of the
 * file when absent; nothing else moves. Entries already present verbatim are skipped, so a retried apply never duplicates a routed decision.
 */
export function appendDecisions(source: string, entries: readonly string[]): string {
  if (entries.length === 0) return source;
  const crlf = source.includes("\r\n");
  const appended = appendDecisionsLf(source.replaceAll("\r\n", "\n"), entries);
  if (appended === undefined) return source;
  return crlf ? appended.replaceAll("\n", "\r\n") : appended;
}

function appendDecisionsLf(text: string, entries: readonly string[]): string | undefined {
  const lines = text.split("\n");
  const fenced = fencedLines(lines);
  // Only the exact heading is the standing document's Decisions section; `## Decisions Archive` is someone else's.
  const heading = lines.findIndex((line, index) => !fenced[index] && /^##\s+Decisions\s*$/.test(line));
  if (heading === -1) {
    const base = text.length === 0 ? "" : text.endsWith("\n") ? text : `${text}\n`;
    return `${base}\n## Decisions\n\n${entries.join("\n")}\n`;
  }
  let end = lines.findIndex((line, index) => index > heading && !fenced[index] && /^#{1,2}\s/.test(line));
  if (end === -1) end = lines.length;
  const present = new Set(lines.slice(heading + 1, end).map((line) => line.trim()));
  const fresh = entries.filter((entry) => !present.has(entry.trim()));
  if (fresh.length === 0) return undefined;
  let last = end - 1;
  while (last > heading && lines[last].trim().length === 0) last -= 1;
  // An empty section gets a blank line between the heading and its first entry.
  const insertAt = last === heading ? heading + 1 : last + 1;
  const spacer = last === heading ? [""] : [];
  const rebuilt = [...lines.slice(0, insertAt), ...spacer, ...fresh, ...lines.slice(insertAt)];
  const joined = rebuilt.join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}

export interface ApplyResult {
  ok: true;
  dry_run?: false;
  transition: Transition;
  loop_path: string;
  written: string[];
  routed: Array<{ id: string; to: string }>;
  dropped: string[];
  deleted?: string[];
}

/** What `apply` would do, computed exactly like a real apply but with no file touched. */
export interface ApplyPreview {
  ok: true;
  dry_run: true;
  transition: Transition;
  loop_path: string;
  would_write: string[];
  would_route: Array<{ id: string; to: string }>;
  would_drop: string[];
  would_delete?: string[];
}

export function applyPlan(loop: ValidLoop, transition: Transition, plan: Plan, now: Date, options: { dryRun?: boolean } = {}): ApplyResult | ApplyPreview {
  const { issues, resolved } = validatePlan(loop, transition, plan);
  if (!resolved) throw new MissionctlError("plan.invalid", `${issues.length} issue${issues.length === 1 ? "" : "s"} in the plan`, { issues });
  const document = loop.document;
  const routed: Array<{ id: string; to: string }> = [];
  const dropped: string[] = [];
  // Every write is computed before any is performed, so a dry run sees exactly the real apply's effects.
  const writes: Array<{ path: string; text: string }> = [];

  // Standing documents first: a routed decision exists in its destination before it leaves the loop.
  const entriesByPath = new Map<string, string[]>();
  for (const route of resolved.routes) {
    const index = Number(route.id.slice("decision:".length));
    const decision = document.decisions[index];
    const list = entriesByPath.get(route.path) ?? [];
    list.push(decisionEntry(decision.date, decision.call, decision.status));
    entriesByPath.set(route.path, list);
    routed.push({ id: route.id, to: route.path });
  }
  for (const [path, entries] of entriesByPath) {
    writes.push({ path, text: appendDecisions(readFileSync(path, "utf8"), entries) });
  }

  const disposition = (id: string): PlanItem | undefined => resolved.decided.get(id);
  const removed = (id: string): boolean => {
    const chosen = disposition(id)?.disposition;
    return chosen === "drop" || chosen === "migrated";
  };
  for (const entry of resolved.fresh) {
    if (removed(entry.id)) dropped.push(entry.id);
  }

  if (transition === "close") {
    const updates: RubricUpdate[] = resolved.fresh
      .filter((entry) => entry.kind === "rubric")
      .map((entry) => {
        const chosen = disposition(entry.id)!;
        const status = chosen.disposition as RubricStatus;
        return {
          id: entry.id.slice("rubric:".length),
          status,
          ...(status === "met" ? { evidence: chosen.evidence ?? undefined } : {}),
          ...(status === "waived" ? { reason: chosen.reason ?? undefined } : {}),
        };
      });
    if (updates.length > 0 && loop.mission?.path) {
      writes.push({ path: loop.mission.path, text: updateMissionText(readFileSync(loop.mission.path, "utf8"), updates) });
    }
    return perform(loop, transition, writes, routed, dropped, options.dryRun === true, loop.path);
  }

  const units = document.units.filter((unit) => !removed(`unit:${unit.id}`));
  const decisions = document.decisions.filter((_, index) => disposition(`decision:${index}`)?.disposition === "keep");
  const blockers = document.blockers.filter((_, index) => !removed(`blocker:${index}`));
  const split = splitBody(loop.body);
  const used = new Set<string>();
  const kept = split.sections.filter((section) => !removed(sectionId(section, used)));
  // Kept sections are concatenated verbatim: a dropped neighbour never costs a kept section its own bytes.
  const body = kept.length === split.sections.length ? loop.body : [split.preamble, ...kept.map((section) => section.text)].join("");
  const extra = { ...document.extra };
  if (removed(`legacy:${LEGACY_BLOCK}`)) delete extra[LEGACY_BLOCK];
  const next = {
    ...document,
    units,
    decisions,
    blockers,
    updated_at: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    ...(Object.keys(extra).length > 0 ? { extra } : { extra: undefined }),
  };
  writes.push({ path: loop.path, text: stringifyLoop(next, body) });
  return perform(loop, transition, writes, routed, dropped, options.dryRun === true);
}

function perform(
  loop: ValidLoop,
  transition: Transition,
  writes: ReadonlyArray<{ path: string; text: string }>,
  routed: Array<{ id: string; to: string }>,
  dropped: string[],
  dryRun: boolean,
  deletePath?: string,
): ApplyResult | ApplyPreview {
  const paths = writes.map((write) => write.path);
  if (dryRun) {
    return { ok: true, dry_run: true, transition, loop_path: loop.path, would_write: paths, would_route: routed, would_drop: dropped, ...(deletePath ? { would_delete: [deletePath] } : {}) };
  }
  for (const write of writes) writeAtomic(write.path, write.text);
  if (deletePath) unlinkSync(deletePath);
  return { ok: true, transition, loop_path: loop.path, written: paths, routed, dropped, ...(deletePath ? { deleted: [deletePath] } : {}) };
}
