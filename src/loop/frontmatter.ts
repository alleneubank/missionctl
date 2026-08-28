import { Scalar, isMap, isScalar, isSeq, parse, parseDocument, stringify } from "yaml";

import type { LoopClassification, LoopDocument } from "./types.js";

const BOM = "﻿";

export interface SplitResult {
  /** The frontmatter text with LF line endings, ready for the YAML parser; the fences are excluded. */
  frontmatter: string | null;
  /** Every byte after the closing fence, untouched: the body belongs to the driver, so no rewrite may change even its line endings. */
  body: string;
  /** True when the frontmatter used CRLF line endings or the file carried a byte-order mark; a canonical rewrite emits neither. */
  normalizedLineEndings: boolean;
  closed: boolean;
}

function isFenceLine(line: string, last: boolean): boolean {
  // A hand-edited file may end on the closing fence with no final newline; that is closed, with an empty body.
  return line === "---\n" || line === "---\r\n" || (last && line === "---");
}

export function splitFrontmatter(source: string): SplitResult {
  const text = source.startsWith(BOM) ? source.slice(BOM.length) : source;
  const lines = text.split(/(?<=\n)/);
  if (lines.length === 0 || !isFenceLine(lines[0], false)) return { frontmatter: null, body: text, normalizedLineEndings: text !== source, closed: true };
  // Bounded by the line count: the first bare fence after the opening one closes the frontmatter.
  let close = -1;
  for (let index = 1; index < lines.length && close === -1; index += 1) {
    if (isFenceLine(lines[index], index === lines.length - 1)) close = index;
  }
  const closed = close !== -1;
  const region = lines.slice(0, closed ? close + 1 : lines.length);
  const normalizedLineEndings = text !== source || region.some((line) => line.endsWith("\r\n"));
  const frontmatter = region
    .slice(1, closed ? -1 : undefined)
    .join("")
    .replaceAll("\r\n", "\n")
    .replace(/\n$/, "");
  // A frontmatter fence opened but never closed: the whole file is treated as the frontmatter that failed.
  return { frontmatter, body: closed ? lines.slice(close + 1).join("") : "", normalizedLineEndings, closed };
}

export function parseYamlMapping(source: string): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  let value: unknown;
  try {
    value = parse(source);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message.split("\n")[0] : String(error) };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "frontmatter must be a mapping" };
  return { ok: true, value: value as Record<string, unknown> };
}

/** Fields whose values are prose, where an unquoted ` #` silently truncates what the author wrote. */
const FREE_TEXT_KEYS = new Set(["objective", "title", "call", "summary", "proposed", "green", "run", "reason"]);

export interface CommentTruncation {
  path: string;
  key: string;
  value: string;
  comment: string;
}

/** Finds plain free-text scalars followed by a same-line `#` comment: YAML is right, but a hand-written title rarely means it. */
export function findCommentTruncations(frontmatter: string): CommentTruncation[] {
  const found: CommentTruncation[] = [];
  const document = parseDocument(frontmatter);
  if (document.errors.length > 0) return found;
  const walk = (node: unknown, path: string): void => {
    if (isMap(node)) {
      for (const pair of node.items) {
        const key = isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
        const childPath = path.length === 0 ? key : `${path}.${key}`;
        const value = pair.value;
        if (isScalar(value) && value.type === Scalar.PLAIN && typeof value.comment === "string" && FREE_TEXT_KEYS.has(key)) {
          found.push({ path: childPath, key, value: String(value.value), comment: value.comment });
        }
        walk(value, childPath);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, index) => walk(item, `${path}[${index}]`));
    }
  };
  walk(document.contents, "");
  return found;
}

/** Classification reads the parsed top-level keys; only frontmatter that is not YAML falls back to a raw-text guess so its parse error still reports as a loop. */
export function classifyLoop(source: string): LoopClassification {
  const { frontmatter } = splitFrontmatter(source);
  if (frontmatter === null) return "legacy-untyped";
  const parsed = parseYamlMapping(frontmatter);
  if (parsed.ok) {
    if ("loop" in parsed.value) return "loop";
    if ("mission_control" in parsed.value) return "legacy-mission-control";
    return "legacy-untyped";
  }
  if (/^loop\s*:/m.test(frontmatter)) return "loop";
  if (/^mission_control\s*:/m.test(frontmatter)) return "legacy-mission-control";
  return "legacy-untyped";
}

const CANONICAL_ORDER = [
  "loop",
  "id",
  "objective",
  "status",
  "phase",
  "iteration",
  "iteration_budget",
  "updated_at",
  "expected_signal_by",
  "mission",
  "targets",
  "gates",
  "units",
  "decisions",
  "blockers",
  "boundary",
] as const;

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

/** Known keys first, then the entry's preserved unknown keys, so a rewrite emits exactly what was read. */
function flatten<T extends { extra?: Record<string, unknown> }>(value: T): Record<string, unknown> {
  const { extra, ...known } = value;
  return { ...stripUndefined(known), ...(extra ?? {}) };
}

/** Serializes a loop in canonical key order; unknown fields follow the schema fields so a rewrite never loses them. */
export function stringifyLoop(document: LoopDocument, body: string): string {
  const ordered: Record<string, unknown> = {};
  for (const key of CANONICAL_ORDER) {
    const value = document[key];
    if (value === undefined) continue;
    if (key === "gates") ordered[key] = document.gates.map(flatten);
    else if (key === "units") ordered[key] = document.units.map(flatten);
    else if (key === "decisions") ordered[key] = document.decisions.map(flatten);
    else if (key === "blockers") ordered[key] = document.blockers.map(flatten);
    else if (key === "mission" && document.mission) {
      const { source, ...link } = document.mission;
      ordered[key] = flatten({ ...link, ...(source ? { source: flatten(source) } : {}) });
    }
    else if (key === "targets") ordered[key] = stripUndefined(document.targets);
    else ordered[key] = value;
  }
  for (const [key, value] of Object.entries(document.extra ?? {})) ordered[key] = value;
  return `---\n${stringify(ordered, { lineWidth: 0 })}---\n${body}`;
}
