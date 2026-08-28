export const LOOP_STATES = ["planned", "active", "waiting", "blocked", "done", "budget-exhausted", "superseded"] as const;
export type LoopStatus = (typeof LOOP_STATES)[number];

/** Terminal states a loop may be closed from; `blocked` resumes and is never closed. */
export const CLOSABLE_STATES: readonly LoopStatus[] = ["done", "budget-exhausted", "superseded"];

export const PHASES = ["MISSION", "SPEC", "PLAN", "TDD", "DEV", "E2E", "BOUNDARY"] as const;
export type Phase = (typeof PHASES)[number];

export const GATE_STATES = ["unknown", "red", "green"] as const;
export type GateState = (typeof GATE_STATES)[number];

export const UNIT_STATES = ["pending", "current", "done", "deferred"] as const;
export type UnitState = (typeof UNIT_STATES)[number];

export const DECISION_STATES = ["provisional", "ratified"] as const;
export type DecisionStatus = (typeof DECISION_STATES)[number];

export const RUBRIC_STATES = ["open", "met", "waived"] as const;
export type RubricStatus = (typeof RUBRIC_STATES)[number];

/** Unknown keys inside a list entry or the mission link; preserved on rewrite, never interpreted. */
export type Extra = Record<string, unknown>;

export interface Gate {
  id: string;
  run: string;
  green: string;
  state: GateState;
  extra?: Extra;
}

export interface Unit {
  id: string;
  title: string;
  targets?: string[];
  state: UnitState;
  extra?: Extra;
}

export interface Decision {
  date: string;
  call: string;
  status: DecisionStatus;
  extra?: Extra;
}

export interface Blocker {
  summary: string;
  proposed?: string;
  extra?: Extra;
}

export interface MissionSource {
  repository: string;
  ref: string;
  path: string;
  extra?: Extra;
}

export interface MissionLinkDeclaration {
  id: string;
  source?: MissionSource;
  extra?: Extra;
}

export interface Targets {
  spec?: string[];
  brief?: string[];
  mission?: string[];
}

export interface LoopDocument {
  loop: 1;
  id: string;
  objective: string;
  status: LoopStatus;
  phase?: Phase;
  iteration: number;
  iteration_budget: number;
  updated_at?: string;
  expected_signal_by?: string;
  mission?: MissionLinkDeclaration;
  targets: Targets;
  gates: Gate[];
  units: Unit[];
  decisions: Decision[];
  blockers: Blocker[];
  boundary: string[];
  /** Fields the schema does not know; preserved on rewrite, never interpreted. */
  extra?: Record<string, unknown>;
}

export interface RubricItem {
  id: string;
  criterion: string;
  floor: string;
  status: RubricStatus;
  evidence?: string;
  reason?: string;
}

export interface MissionDocument {
  mission: 1;
  id: string;
  title: string;
  outcome: string;
  rubric: RubricItem[];
  boundary: string[];
}

export type Severity = "error" | "warning";

export interface Issue {
  code: string;
  severity: Severity;
  path: string;
  message: string;
  repair: string;
}

export type LoopClassification = "loop" | "legacy-mission-control" | "legacy-untyped";

export class MissionctlError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly issues: readonly Issue[];

  constructor(code: string, message: string, options: { exitCode?: number; issues?: readonly Issue[] } = {}) {
    super(message);
    this.name = "MissionctlError";
    this.code = code;
    this.exitCode = options.exitCode ?? 1;
    this.issues = options.issues ?? [];
  }
}
