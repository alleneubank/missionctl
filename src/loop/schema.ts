import { findCommentTruncations, parseYamlMapping, splitFrontmatter } from "./frontmatter.js";
import {
  DECISION_STATES,
  GATE_STATES,
  LOOP_STATES,
  PHASES,
  UNIT_STATES,
  type Blocker,
  type Decision,
  type Extra,
  type Gate,
  type Issue,
  type LoopDocument,
  type MissionLinkDeclaration,
  type Severity,
  type Targets,
  type Unit,
} from "./types.js";

export const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER_STRING = /^-?\d+$/;

export function issue(code: string, severity: Severity, path: string, message: string, repair: string): Issue {
  return { code, severity, path, message, repair };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

/** Shape plus calendar validity: `2026-02-30T12:00:00Z` parses but names no instant. */
export function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export interface ParsedLoop {
  path: string;
  /** Present only when no error-severity issue was found. */
  document?: LoopDocument;
  fields: PartialLoopFields;
  body: string;
  issues: Issue[];
  /** Human-readable changes a canonical rewrite would apply (coercions, frontmatter line endings); the body is never among them. */
  coercions: string[];
  normalizedLineEndings: boolean;
  /** The frontmatter text exactly as read, for canonical-difference detection. */
  frontmatter: string | null;
}

/** Collects issues and typed values for one frontmatter mapping; tolerant on read, strict on what it accepts. */
class Reader {
  readonly issues: Issue[] = [];
  readonly coercions: string[] = [];

  missing(field: string, example: string): void {
    this.issues.push(issue("loop.missing-field", "error", field, `${field} is required`, `add ${field}: ${example}`));
  }

  invalid(path: string, message: string, repair: string): void {
    this.issues.push(issue("loop.invalid-field", "error", path, message, repair));
  }

  enumeration<T extends string>(path: string, value: unknown, allowed: readonly T[], required: boolean): T | undefined {
    if (value === undefined) {
      if (required) this.missing(path, allowed[0]);
      return undefined;
    }
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
    this.issues.push(
      issue("loop.invalid-enum", "error", path, `${path} ${JSON.stringify(value)} is not one of ${allowed.join(", ")}`, `set ${path} to one of ${allowed.join(", ")}`),
    );
    return undefined;
  }

  string(path: string, value: unknown, required: boolean, example = "<text>"): string | undefined {
    if (value === undefined) {
      if (required) this.missing(path, example);
      return undefined;
    }
    if (isNonEmptyString(value)) {
      if (CONTROL_CHARACTERS.test(value)) {
        this.invalid(path, `${path} must be a single line without control characters`, `write ${path} on one line; keep multi-line notes in the body`);
        return undefined;
      }
      return value;
    }
    this.invalid(path, `${path} must be a non-empty string`, `set ${path} to a non-empty string`);
    return undefined;
  }

  integer(path: string, value: unknown, options: { required: boolean; minimum: number; fallback?: number }): number | undefined {
    if (value === undefined) {
      if (options.required) this.missing(path, String(Math.max(options.minimum, 1)));
      return options.fallback;
    }
    let number = value;
    if (typeof value === "string" && INTEGER_STRING.test(value.trim())) {
      number = Number(value.trim());
      const note = `${path}: coerced ${JSON.stringify(value)} to ${String(number)}`;
      this.coercions.push(note);
      this.issues.push(issue("loop.coerced-field", "warning", path, `coerced ${JSON.stringify(value)} to ${String(number)}`, `write ${path}: ${String(number)} without quotes`));
    }
    if (typeof number === "number" && Number.isInteger(number) && number >= options.minimum) return number;
    this.invalid(path, `${path} must be an integer ≥ ${options.minimum}`, `set ${path} to an integer ≥ ${options.minimum}`);
    return undefined;
  }

  timestamp(path: string, value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (validTimestamp(value)) return value;
    this.invalid(path, `${path} must be an ISO-8601 UTC timestamp like 2026-01-31T12:00:00Z`, `set ${path} to an ISO-8601 UTC timestamp`);
    return undefined;
  }

  stringList(path: string, value: unknown, options: { required: boolean; nonEmpty: boolean }): string[] | undefined {
    if (value === undefined) {
      if (options.required) this.missing(path, "[<item>]");
      return options.required ? undefined : [];
    }
    if (Array.isArray(value) && value.every(isNonEmptyString) && (!options.nonEmpty || value.length > 0)) {
      const control = value.findIndex((entry) => CONTROL_CHARACTERS.test(entry));
      if (control !== -1) {
        this.invalid(`${path}[${control}]`, `${path}[${control}] must be a single line without control characters`, `write ${path}[${control}] on one line`);
        return undefined;
      }
      return [...value];
    }
    this.invalid(path, `${path} must be a ${options.nonEmpty ? "non-empty " : ""}list of non-empty strings`, `set ${path} to a ${options.nonEmpty ? "non-empty " : ""}list of strings`);
    return undefined;
  }

  list(path: string, value: unknown, options: { required: boolean; nonEmpty: boolean }): unknown[] | undefined {
    if (value === undefined) {
      if (options.required) this.missing(path, "[{...}]");
      return options.required ? undefined : [];
    }
    if (Array.isArray(value) && (!options.nonEmpty || value.length > 0)) return value;
    this.invalid(path, `${path} must be a ${options.nonEmpty ? "non-empty " : ""}list`, `set ${path} to a ${options.nonEmpty ? "non-empty " : ""}list of mappings`);
    return undefined;
  }

  mapping(path: string, value: unknown): Record<string, unknown> | undefined {
    if (isRecord(value)) return value;
    this.invalid(path, `${path} must be a mapping`, `rewrite ${path} as a mapping`);
    return undefined;
  }

  /** Unknown keys of a nested mapping are preserved (and warned about) exactly like unknown top-level fields. */
  extra(path: string, record: Record<string, unknown>, known: readonly string[]): { extra: Extra } | Record<string, never> {
    const extra: Extra = {};
    for (const key of Object.keys(record)) {
      if (known.includes(key)) continue;
      extra[key] = record[key];
      this.issues.push(issue("loop.unknown-field", "warning", `${path}.${key}`, "unknown field is preserved but ignored", `remove ${path}.${key} or move it into the body`));
    }
    return Object.keys(extra).length > 0 ? { extra } : {};
  }

  uniqueIds(path: string, items: ReadonlyArray<{ id?: string } | undefined>): void {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (!item?.id) return;
      if (seen.has(item.id)) this.issues.push(issue("loop.duplicate-id", "error", `${path}[${index}].id`, `duplicate id ${item.id}`, `give each ${path} entry a unique id`));
      seen.add(item.id);
    });
  }

}

const KNOWN_FIELDS = new Set([
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
]);

function readGate(reader: Reader, value: unknown, index: number): Gate | undefined {
  const path = `gates[${index}]`;
  const record = reader.mapping(path, value);
  if (!record) return undefined;
  const id = reader.string(`${path}.id`, record.id, true, "<gate-id>");
  const run = reader.string(`${path}.run`, record.run, true, "<command>");
  const green = reader.string(`${path}.green`, record.green, true, "<what green means>");
  const state = reader.enumeration(`${path}.state`, record.state, GATE_STATES, false) ?? (record.state === undefined ? "unknown" : undefined);
  const extra = reader.extra(path, record, ["id", "run", "green", "state"]);
  if (id === undefined || run === undefined || green === undefined || state === undefined) return undefined;
  return { id, run, green, state, ...extra };
}

function readUnit(reader: Reader, value: unknown, index: number): Unit | undefined {
  const path = `units[${index}]`;
  const record = reader.mapping(path, value);
  if (!record) return undefined;
  const id = reader.string(`${path}.id`, record.id, true, "<unit-id>");
  const title = reader.string(`${path}.title`, record.title, true, "<title>");
  const targets = record.targets === undefined ? undefined : reader.stringList(`${path}.targets`, record.targets, { required: false, nonEmpty: false });
  const state = reader.enumeration(`${path}.state`, record.state, UNIT_STATES, false) ?? (record.state === undefined ? "pending" : undefined);
  const extra = reader.extra(path, record, ["id", "title", "targets", "state"]);
  if (id === undefined || title === undefined || state === undefined) return undefined;
  return { id, title, ...(targets ? { targets } : {}), state, ...extra };
}

function readDecision(reader: Reader, value: unknown, index: number): Decision | undefined {
  const path = `decisions[${index}]`;
  const record = reader.mapping(path, value);
  if (!record) return undefined;
  const rawDate = record.date instanceof Date ? record.date.toISOString().slice(0, 10) : record.date;
  const date = reader.string(`${path}.date`, rawDate, true, "YYYY-MM-DD");
  if (date !== undefined && !validDate(date)) reader.invalid(`${path}.date`, `${path}.date must be a calendar date written YYYY-MM-DD`, `set ${path}.date to a real YYYY-MM-DD date`);
  const call = reader.string(`${path}.call`, record.call, true, "<the call>");
  const status = reader.enumeration(`${path}.status`, record.status, DECISION_STATES, true);
  const extra = reader.extra(path, record, ["date", "call", "status"]);
  if (date === undefined || !validDate(date) || call === undefined || status === undefined) return undefined;
  return { date, call, status, ...extra };
}

function readBlocker(reader: Reader, value: unknown, index: number): Blocker | undefined {
  const path = `blockers[${index}]`;
  const record = reader.mapping(path, value);
  if (!record) return undefined;
  const summary = reader.string(`${path}.summary`, record.summary, true, "<what is blocked and why>");
  const proposed = reader.string(`${path}.proposed`, record.proposed, false);
  const extra = reader.extra(path, record, ["summary", "proposed"]);
  if (summary === undefined) return undefined;
  return { summary, ...(proposed ? { proposed } : {}), ...extra };
}

function readMission(reader: Reader, value: unknown): MissionLinkDeclaration | undefined {
  if (value === undefined) return undefined;
  if (isNonEmptyString(value)) return { id: value };
  const record = reader.mapping("mission", value);
  if (!record) return undefined;
  const id = reader.string("mission.id", record.id, true, "<mission-id>");
  let source: MissionLinkDeclaration["source"];
  if (record.source !== undefined) {
    const sourceRecord = reader.mapping("mission.source", record.source);
    if (sourceRecord) {
      const repository = reader.string("mission.source.repository", sourceRecord.repository, true, "<url>");
      const ref = reader.string("mission.source.ref", sourceRecord.ref, true, "<ref>");
      const path = reader.string("mission.source.path", sourceRecord.path, true, ".mission/mission.yaml");
      const sourceExtra = reader.extra("mission.source", sourceRecord, ["repository", "ref", "path"]);
      if (repository && ref && path) source = { repository, ref, path, ...sourceExtra };
    }
  }
  const extra = reader.extra("mission", record, ["id", "source"]);
  if (id === undefined) return undefined;
  return { id, ...(source ? { source } : {}), ...extra };
}

function readTargets(reader: Reader, value: unknown): Targets | undefined {
  if (value === undefined) return {};
  const record = reader.mapping("targets", value);
  if (!record) return undefined;
  const targets: Targets = {};
  for (const key of ["spec", "brief", "mission"] as const) {
    if (record[key] === undefined) continue;
    const list = reader.stringList(`targets.${key}`, record[key], { required: false, nonEmpty: false });
    if (list) targets[key] = list;
  }
  for (const key of Object.keys(record)) {
    if (!["spec", "brief", "mission"].includes(key)) reader.invalid(`targets.${key}`, `targets.${key} is not a target kind`, "use targets.spec, targets.brief, or targets.mission");
  }
  return targets;
}

/** Fields that parsed even when the whole document did not; target resolution reports against these so one typo does not hide every other issue. */
export interface PartialLoopFields {
  id?: string;
  status?: string;
  targets: Targets;
  mission?: MissionLinkDeclaration;
}

export interface NormalizedLoop {
  document?: LoopDocument;
  fields: PartialLoopFields;
  issues: Issue[];
  coercions: string[];
}

export function normalizeLoop(raw: Record<string, unknown>): NormalizedLoop {
  const reader = new Reader();
  const extra: Record<string, unknown> = {};

  const loop = reader.integer("loop", raw.loop, { required: true, minimum: 1 });
  if (loop !== undefined && loop !== 1) reader.invalid("loop", `loop schema version ${String(loop)} is not supported`, "set loop: 1");
  const id = reader.string("id", raw.id, true, "<campaign-id>");
  const objective = reader.string("objective", raw.objective, true, "<one bounded outcome>");
  const status = reader.enumeration("status", raw.status, LOOP_STATES, true);
  const phase = reader.enumeration("phase", raw.phase, PHASES, false);
  const iteration = reader.integer("iteration", raw.iteration, { required: false, minimum: 0, fallback: 0 });
  const iterationBudget = reader.integer("iteration_budget", raw.iteration_budget, { required: true, minimum: 1 });
  const updatedAt = reader.timestamp("updated_at", raw.updated_at);
  const expectedSignalBy = reader.timestamp("expected_signal_by", raw.expected_signal_by);
  const mission = readMission(reader, raw.mission);
  const targets = readTargets(reader, raw.targets);
  const gateValues = reader.list("gates", raw.gates, { required: true, nonEmpty: true });
  const gates = gateValues?.map((value, index) => readGate(reader, value, index));
  const unitValues = reader.list("units", raw.units, { required: false, nonEmpty: false });
  const units = unitValues?.map((value, index) => readUnit(reader, value, index));
  const decisionValues = reader.list("decisions", raw.decisions, { required: false, nonEmpty: false });
  const decisions = decisionValues?.map((value, index) => readDecision(reader, value, index));
  const blockerValues = reader.list("blockers", raw.blockers, { required: false, nonEmpty: false });
  const blockers = blockerValues?.map((value, index) => readBlocker(reader, value, index));
  const boundary = reader.stringList("boundary", raw.boundary, { required: true, nonEmpty: true });
  if (gates) reader.uniqueIds("gates", gates);
  if (units) reader.uniqueIds("units", units);

  if (iteration !== undefined && iterationBudget !== undefined && iteration > iterationBudget) {
    reader.issues.push(issue("loop.iteration-over-budget", "error", "iteration", `iteration ${iteration} exceeds iteration_budget ${iterationBudget}`, "raise iteration_budget (the human's call) or set status: budget-exhausted with iteration at the cap"));
  }
  const currentUnits = (units ?? []).filter((unit) => unit?.state === "current");
  if (currentUnits.length > 1) {
    reader.issues.push(issue("loop.multiple-current-units", "error", "units", `${currentUnits.length} units are current; at most one may be`, "leave exactly one unit with state: current"));
  }
  if (status === "blocked" && (blockers ?? []).length === 0) {
    reader.issues.push(issue("loop.blocked-without-blockers", "error", "blockers", "a blocked loop must name at least one blocker", "add blockers: [{ summary, proposed }] or change status"));
  }
  if (status === "waiting" && expectedSignalBy === undefined) {
    reader.issues.push(issue("loop.missing-expected-signal", "error", "expected_signal_by", "a waiting loop must declare expected_signal_by", "add expected_signal_by: <ISO-8601 UTC timestamp>"));
  }
  if (status === "done") {
    (gates ?? []).forEach((gate, index) => {
      if (gate && gate.state !== "green") {
        reader.issues.push(issue("loop.done-with-red-gate", "error", `gates[${index}].state`, `gate ${gate.id} is ${gate.state}; a done loop needs every gate green`, `run the gate and record state: green, or change status`));
      }
    });
  }
  if (status === "active" && currentUnits.length === 0) {
    reader.issues.push(issue("loop.no-current-unit", "warning", "units", "an active loop has no current unit", "mark the unit in progress with state: current"));
  }
  if ((targets?.mission ?? []).length > 0 && mission === undefined) {
    reader.issues.push(issue("target.mission-unlinked", "error", "targets.mission", "targets.mission is declared without a mission link", "add mission: <mission-id> or remove targets.mission"));
  }
  for (const key of Object.keys(raw)) {
    if (KNOWN_FIELDS.has(key)) continue;
    extra[key] = raw[key];
    reader.issues.push(issue("loop.unknown-field", "warning", key, "unknown field is preserved but ignored", `remove ${key} or move it into the body`));
  }

  const fields: PartialLoopFields = { ...(id ? { id } : {}), ...(status ? { status } : {}), targets: targets ?? {}, ...(mission ? { mission } : {}) };
  const errors = reader.issues.some((entry) => entry.severity === "error");
  if (errors || id === undefined || objective === undefined || status === undefined || iteration === undefined || iterationBudget === undefined || !gates || !units || !decisions || !blockers || !boundary || !targets) {
    return { fields, issues: reader.issues, coercions: reader.coercions };
  }
  const document: LoopDocument = {
    loop: 1,
    id,
    objective,
    status,
    ...(phase ? { phase } : {}),
    iteration,
    iteration_budget: iterationBudget,
    ...(updatedAt ? { updated_at: updatedAt } : {}),
    ...(expectedSignalBy ? { expected_signal_by: expectedSignalBy } : {}),
    ...(mission ? { mission } : {}),
    targets,
    gates: gates as Gate[],
    units: units as Unit[],
    decisions: decisions as Decision[],
    blockers: blockers as Blocker[],
    boundary,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
  return { document, fields, issues: reader.issues, coercions: reader.coercions };
}

/** Parses and validates loop text; schema-level only, target resolution happens in `resolveLoop`. */
export function parseLoop(source: string, path: string): ParsedLoop {
  const split = splitFrontmatter(source);
  const base = { path, body: split.body, normalizedLineEndings: split.normalizedLineEndings, frontmatter: split.frontmatter, fields: { targets: {} } };
  if (split.frontmatter === null) {
    return { ...base, issues: [issue("loop.parse-error", "error", "", "LOOP.md must start with a YAML frontmatter block", "begin the file with --- and end the frontmatter with ---")], coercions: [] };
  }
  if (!split.closed) {
    return { ...base, issues: [issue("loop.parse-error", "error", "", "frontmatter is not closed", "end the frontmatter with a line containing only ---")], coercions: [] };
  }
  const parsed = parseYamlMapping(split.frontmatter);
  if (!parsed.ok) {
    return { ...base, issues: [issue("loop.parse-error", "error", "", `frontmatter is not valid YAML: ${parsed.message}`, "fix the YAML syntax in the frontmatter")], coercions: [] };
  }
  const normalized = normalizeLoop(parsed.value);
  const truncations = findCommentTruncations(split.frontmatter).map((hit) =>
    issue(
      "loop.comment-in-value",
      "warning",
      hit.path,
      `${hit.path} ends at ${JSON.stringify(hit.value)}; ${JSON.stringify(`#${hit.comment}`)} was read as a YAML comment`,
      `quote the value if the # belongs to it: ${hit.key}: ${JSON.stringify(`${hit.value} #${hit.comment}`)}`,
    ),
  );
  return { ...base, ...normalized, issues: [...normalized.issues, ...truncations] };
}
