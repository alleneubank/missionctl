import type { ValidLoop } from "./resolve.js";
import type { Gate, LoopStatus, Phase } from "./types.js";

/** Caps that keep the projection small enough to inject into a session prompt. */
export const CONTEXT_LIMITS = { decisions: 8, blockers: 8, redGates: 8, warnings: 8, characters: 240 } as const;

export interface ContextProjection {
  loop: { path: string; id: string; status: LoopStatus; phase: Phase | null; iteration: number; iteration_budget: number };
  objective: string;
  current_unit: { id: string; title: string; targets: string[] } | null;
  red_gates: Gate[];
  /** Uncapped count, so consumers can see the total when `red_gates` is clipped. */
  red_gates_total: number;
  decisions: Array<{ date: string; call: string; status: string }>;
  blockers: Array<{ summary: string; proposed?: string }>;
  boundary: string[];
  mission: { id: string; targets: string[]; available: boolean } | null;
  warnings: string[];
  truncated: boolean;
}

function clip(text: string, state: { truncated: boolean }): string {
  if (text.length <= CONTEXT_LIMITS.characters) return text;
  state.truncated = true;
  return `${text.slice(0, CONTEXT_LIMITS.characters - 1)}…`;
}

function tail<T>(items: readonly T[], limit: number, state: { truncated: boolean }): T[] {
  if (items.length <= limit) return [...items];
  state.truncated = true;
  return items.slice(items.length - limit);
}

function head<T>(items: readonly T[], limit: number, state: { truncated: boolean }): T[] {
  if (items.length <= limit) return [...items];
  state.truncated = true;
  return items.slice(0, limit);
}

export function projectContext(loop: ValidLoop, now: Date): ContextProjection {
  const document = loop.document;
  const state = { truncated: false };
  const current = document.units.find((unit) => unit.state === "current");
  const redGates = document.gates.filter((gate) => gate.state !== "green");
  const warnings = loop.issues.filter((entry) => entry.severity === "warning").map((entry) => `${entry.code} ${entry.path}: ${entry.message}`);
  if (document.status === "waiting" && document.expected_signal_by !== undefined && Date.parse(document.expected_signal_by) < now.getTime()) {
    warnings.push(`loop.expected-signal-overdue expected_signal_by: ${document.expected_signal_by} has passed`);
  }
  const clipAll = (items: readonly string[]): string[] => items.map((item) => clip(item, state));
  // Every string crosses clip(): the projection is injected into prompts, so no field is trusted to be short.
  return {
    loop: {
      path: clip(loop.path, state),
      id: clip(document.id, state),
      status: document.status,
      phase: document.phase ?? null,
      iteration: document.iteration,
      iteration_budget: document.iteration_budget,
    },
    objective: clip(document.objective, state),
    current_unit: current ? { id: clip(current.id, state), title: clip(current.title, state), targets: clipAll(current.targets ?? []) } : null,
    red_gates: head(redGates, CONTEXT_LIMITS.redGates, state).map((gate) => ({ id: clip(gate.id, state), run: clip(gate.run, state), green: clip(gate.green, state), state: gate.state })),
    red_gates_total: redGates.length,
    decisions: tail(document.decisions, CONTEXT_LIMITS.decisions, state).map((decision) => ({ date: decision.date, call: clip(decision.call, state), status: decision.status })),
    blockers: head(document.blockers, CONTEXT_LIMITS.blockers, state).map((blocker) => ({
      summary: clip(blocker.summary, state),
      ...(blocker.proposed ? { proposed: clip(blocker.proposed, state) } : {}),
    })),
    boundary: clipAll(document.boundary),
    mission: loop.mission ? { id: clip(loop.mission.id, state), targets: clipAll(loop.mission.targets), available: loop.mission.available } : null,
    warnings: head(warnings, CONTEXT_LIMITS.warnings, state).map((warning) => clip(warning, state)),
    truncated: state.truncated,
  };
}

export function renderContext(context: ContextProjection): string {
  const lines = [
    `LOOP ${context.loop.id} [${context.loop.status}] phase=${context.loop.phase ?? "-"} iteration=${context.loop.iteration}/${context.loop.iteration_budget}`,
    `OBJECTIVE ${context.objective}`,
    context.current_unit
      ? `UNIT ${context.current_unit.id} ${context.current_unit.title}${context.current_unit.targets.length > 0 ? ` (${context.current_unit.targets.join(", ")})` : ""}`
      : "UNIT none",
    ...context.red_gates.map((gate) => `RED ${gate.id}: ${gate.run} → ${gate.green}`),
    ...context.decisions.map((decision) => `DECISION ${decision.date} ${decision.status}: ${decision.call}`),
    ...(context.blockers.length === 0 ? ["BLOCKERS none"] : context.blockers.map((blocker) => `BLOCKER ${blocker.summary}${blocker.proposed ? ` → ${blocker.proposed}` : ""}`)),
    `BOUNDARY ${context.boundary.join(", ")}`,
    ...(context.mission ? [`MISSION ${context.mission.id} targets=${context.mission.targets.join(",") || "none"}${context.mission.available ? "" : " (unavailable)"}`] : []),
    ...context.warnings.map((warning) => `WARNING ${warning}`),
    ...(context.truncated ? ["TRUNCATED yes"] : []),
  ];
  return `${lines.join("\n")}\n`;
}
