import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CLAUDE_HARNESS_EVENTS, runClaudeHarness, type ClaudeHarnessEvent } from "./harness/claude.js";
import {
  MissionctlError,
  adoptLoop,
  applyPlan,
  errorCount,
  evaluateAdoptableLoop,
  evaluateLoop,
  findMissionPath,
  inspectLoop,
  isValidLoop,
  preparePlan,
  projectContext,
  projectMission,
  readPlan,
  renderContext,
  renderStatusline,
  sha256,
  stringifyLoop,
  validatePlan,
  writeAtomic,
  type Issue,
  type LoopEvaluation,
  type Plan,
  type Transition,
  type ValidLoop,
} from "./loop/index.js";

declare const __MISSIONCTL_VERSION__: string;

const COMMANDS = ["check", "context", "statusline", "repair", "inspect", "adopt", "compact", "close", "mission", "harness"] as const;
type Command = (typeof COMMANDS)[number];
const PLAN_STEPS = ["prepare", "validate", "apply"] as const;
type PlanStep = (typeof PLAN_STEPS)[number];

interface Options {
  command: Command;
  root: string;
  now: Date;
  json: boolean;
  plan?: string;
  step?: PlanStep;
  dryRun: boolean;
  write: boolean;
  event?: ClaudeHarnessEvent;
}

interface CommandResult {
  exitCode: number;
  value: unknown;
  text: string;
}

function usage(): string {
  return [
    "usage: missionctl <command> [--root <path>] [--now <timestamp>] [--json]",
    "  check                        validate the LOOP.md at or above root",
    "  context                      bounded campaign projection for drivers and hooks",
    "  statusline                   one-line projection",
    "  repair [--dry-run]           rewrite a tolerantly readable loop in canonical form",
    "  compact|close apply [--dry-run]  preview the writes a plan would make without touching any file",
    "  inspect                      classify a loop (typed, legacy, none) and preview legacy content",
    "  adopt [--write]              draft a typed LOOP.md from a legacy loop",
    "  compact prepare|validate|apply [--plan <file|->]",
    "  close   prepare|validate|apply [--plan <file|->]",
    "  mission                      project .mission/mission.yaml and its campaigns",
    "  harness claude session-start hook adapter (reads hook JSON on stdin)",
    "  --version                    executable contract version",
  ].join("\n");
}

function parseOptions(argv: readonly string[]): Options {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) throw new MissionctlError("usage", usage(), { exitCode: 2 });
  const command = argv[0];
  if (!COMMANDS.includes(command as Command)) throw new MissionctlError("usage", `unknown command ${command}\n${usage()}`, { exitCode: 2 });
  const options: Options = { command: command as Command, root: process.cwd(), now: new Date(), json: false, dryRun: false, write: false };
  let rootSeen = false;
  let index = 1;
  if (command === "harness") {
    const adapter = argv[1];
    const event = argv[2];
    if (adapter !== "claude" || !CLAUDE_HARNESS_EVENTS.includes(event as ClaudeHarnessEvent)) {
      throw new MissionctlError("usage", `harness requires claude and one of ${CLAUDE_HARNESS_EVENTS.join(", ")}`, { exitCode: 2 });
    }
    options.event = event as ClaudeHarnessEvent;
    index = 3;
  } else if (command === "compact" || command === "close") {
    const step = argv[1];
    if (!PLAN_STEPS.includes(step as PlanStep)) throw new MissionctlError("usage", `${command} requires one of ${PLAN_STEPS.join(", ")}`, { exitCode: 2 });
    options.step = step as PlanStep;
    index = 2;
  }
  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined) throw new MissionctlError("usage", `${arg} requires a value`, { exitCode: 2 });
      index += 1;
      return value;
    };
    if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--write") options.write = true;
    else if (arg === "--root") {
      if (rootSeen) throw new MissionctlError("usage", "--root may be given once; missionctl operates on one loop per invocation", { exitCode: 2 });
      rootSeen = true;
      options.root = resolve(next());
    } else if (arg === "--now") {
      const value = next();
      if (!Number.isFinite(Date.parse(value))) throw new MissionctlError("usage", "--now requires a valid timestamp", { exitCode: 2 });
      options.now = new Date(value);
    } else if (arg === "--plan") options.plan = next();
    else throw new MissionctlError("usage", `unexpected argument ${arg}\n${usage()}`, { exitCode: 2 });
  }
  // A flag a command cannot honor is refused up front; silently ignoring --dry-run before a write is the worst possible default.
  const transition = command === "compact" || command === "close";
  if (options.dryRun && !(command === "repair" || (transition && options.step === "apply"))) {
    throw new MissionctlError("usage", "--dry-run applies to repair and to compact/close apply", { exitCode: 2 });
  }
  if (options.write && command !== "adopt") throw new MissionctlError("usage", "--write applies to adopt", { exitCode: 2 });
  if (options.plan !== undefined && !(transition && options.step !== "prepare")) {
    throw new MissionctlError("usage", "--plan applies to compact/close validate and apply", { exitCode: 2 });
  }
  return options;
}

function issueLines(artifact: string | null, issues: readonly Issue[]): string {
  return issues
    .map((entry) => `${artifact ? `${artifact}: ` : ""}${entry.severity} ${entry.code}${entry.path ? ` ${entry.path}` : ""}: ${entry.message}\n  repair: ${entry.repair}`)
    .join("\n");
}

function requireLoop(evaluation: LoopEvaluation): ValidLoop {
  if (evaluation.kind === "none") throw new MissionctlError("loop.not-found", `no LOOP.md or .claude/loop.md found at or above ${evaluation.root}`);
  if (evaluation.kind === "legacy") throw new MissionctlError(evaluation.issue.code, evaluation.issue.message, { issues: [evaluation.issue] });
  if (!isValidLoop(evaluation)) {
    const errors = errorCount(evaluation.issues);
    throw new MissionctlError("loop.invalid", `${evaluation.path} has ${errors} error${errors === 1 ? "" : "s"}`, { issues: evaluation.issues });
  }
  return evaluation;
}

function checkCommand(options: Options): CommandResult {
  const evaluation = evaluateLoop(options.root);
  if (evaluation.kind === "none") {
    return { exitCode: 0, value: { ok: true, loop: null, issues: [] }, text: "missionctl check: no LOOP.md at or above root\n" };
  }
  if (evaluation.kind === "legacy") {
    const value = { ok: false, loop: { path: evaluation.path, classification: evaluation.classification }, issues: [evaluation.issue] };
    return { exitCode: 1, value, text: `${issueLines(evaluation.path, value.issues)}\n` };
  }
  const errors = errorCount(evaluation.issues);
  const value = {
    ok: errors === 0,
    loop: {
      path: evaluation.path,
      ...(evaluation.parsed.document ? { id: evaluation.parsed.document.id, status: evaluation.parsed.document.status } : {}),
      classification: "loop" as const,
    },
    issues: evaluation.issues,
  };
  const warnings = evaluation.issues.length - errors;
  const summary = errors === 0 ? `missionctl check: ok${warnings > 0 ? ` (${warnings} warning${warnings === 1 ? "" : "s"})` : ""}\n` : "";
  const text = evaluation.issues.length === 0 ? summary : `${issueLines(evaluation.path, evaluation.issues)}\n${summary}`;
  return { exitCode: errors === 0 ? 0 : 1, value, text };
}

function contextCommand(options: Options, statusline: boolean): CommandResult {
  const evaluation = evaluateLoop(options.root);
  // The status bar is a render, not a check: degraded state stays visible there instead of hiding the segment.
  if (statusline && evaluation.kind === "legacy") {
    const text = `loop ${evaluation.classification} · missionctl inspect\n`;
    return { exitCode: 0, value: { ok: false, error: { code: evaluation.issue.code, message: text.trim() } }, text };
  }
  if (statusline && evaluation.kind === "loop" && !isValidLoop(evaluation)) {
    // Every issue counts: a warning next to an error is still something check will show.
    const issues = evaluation.issues.length;
    const text = `loop invalid · ${issues} issue${issues === 1 ? "" : "s"} · missionctl check\n`;
    return { exitCode: 0, value: { ok: false, error: { code: "loop.invalid", message: text.trim() } }, text };
  }
  const loop = requireLoop(evaluation);
  const context = projectContext(loop, options.now);
  return { exitCode: 0, value: context, text: statusline ? renderStatusline(context) : renderContext(context) };
}

function repairCommand(options: Options): CommandResult {
  const evaluation = evaluateLoop(options.root);
  if (evaluation.kind !== "loop") requireLoop(evaluation);
  if (evaluation.kind !== "loop") throw new Error("unreachable");
  const { parsed } = evaluation;
  const errors = errorCount(evaluation.issues);
  // A value that a `#` may have truncated is rewritten only by a human who knows what it said; canonicalizing it would delete the tail for good.
  const truncated = evaluation.issues.filter((entry) => entry.code === "loop.comment-in-value").length;
  if (!parsed.document || errors > 0 || truncated > 0) {
    const value = { ok: false, path: evaluation.path, written: false, changes: [], issues: evaluation.issues };
    const reason = errors > 0 ? `${errors} error${errors === 1 ? "" : "s"} need manual repair` : `${truncated} value${truncated === 1 ? "" : "s"} may be truncated by a # comment; quote ${truncated === 1 ? "it" : "them"}, then repair`;
    return { exitCode: 1, value, text: `${issueLines(evaluation.path, evaluation.issues)}\nmissionctl repair: ${reason}\n` };
  }
  const canonical = stringifyLoop(parsed.document, parsed.body);
  const changes = [...parsed.coercions];
  if (parsed.normalizedLineEndings) changes.push("normalized line endings");
  if (sha256(canonical) !== sha256(evaluation.text) && changes.length === parsed.coercions.length + (parsed.normalizedLineEndings ? 1 : 0)) {
    // Only the frontmatter is normalized; the body is compared as written.
    const lineEndingsOnly = parsed.normalizedLineEndings && canonical === `---
${parsed.frontmatter}
---
${parsed.body}`;
    if (!lineEndingsOnly) changes.push("canonical formatting");
  }
  const written = changes.length > 0 && !options.dryRun;
  if (written) writeAtomic(evaluation.path, canonical);
  const value = { ok: true, path: evaluation.path, written, changes };
  const text = changes.length === 0 ? "missionctl repair: already canonical\n" : `${changes.map((change) => `- ${change}`).join("\n")}\nmissionctl repair: ${written ? "written" : "dry run, nothing written"}\n`;
  return { exitCode: 0, value, text };
}

function inspectCommand(options: Options): CommandResult {
  const inspection = inspectLoop(evaluateLoop(options.root));
  if (inspection.path === null) return { exitCode: 0, value: inspection, text: "no LOOP.md or .claude/loop.md at or above root: none\n" };
  if (!inspection.preview) {
    const text = `${inspection.path}: loop${inspection.issues.length > 0 ? `\n${issueLines(inspection.path, inspection.issues)}` : ""}\n`;
    return { exitCode: 0, value: inspection, text };
  }
  const { preview } = inspection;
  const text =
    `${inspection.path}: ${inspection.classification}\n` +
    (preview.fields.length > 0 ? `FIELDS ${preview.fields.join(" ")}\n` : "") +
    `HEADINGS ${preview.headings.join(" | ") || "none"}\n` +
    `DECISIONS ${preview.decisions.length}\n` +
    `WORK PLAN ${preview.work_plan.length}\n` +
    "NEXT missionctl adopt --root <root> to draft a typed LOOP.md; add --write once the draft validates\n";
  return { exitCode: 0, value: inspection, text };
}

function adoptCommand(options: Options): CommandResult {
  const adoption = adoptLoop(evaluateAdoptableLoop(options.root), options.now, options.write);
  const text =
    `${adoption.source} → ${adoption.target}${adoption.written ? " (written)" : " (preview)"}\n` +
    (adoption.issues.length > 0 ? `${issueLines(adoption.target, adoption.issues)}\n` : "") +
    `${adoption.draft}`;
  return { exitCode: adoption.ok ? 0 : 1, value: adoption, text };
}

function loadPlan(options: Options): Plan {
  if (!options.plan) throw new MissionctlError("usage", `${options.command} ${options.step} requires --plan <file|->`, { exitCode: 2 });
  const source = options.plan === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(options.plan), "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new MissionctlError("plan.invalid", `plan is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const { plan, issues } = readPlan(value);
  if (!plan) throw new MissionctlError("plan.invalid", `${issues.length} issue${issues.length === 1 ? "" : "s"} in the plan`, { issues });
  return plan;
}

function planText(plan: Plan): string {
  const rows = plan.items.map((entry) => `${entry.id}\t${entry.proposed}\tallowed=${entry.allowed.join("|")}\t${entry.summary}`);
  return `${plan.transition} ${plan.loop_path} source=${plan.source_sha256.slice(0, 12)}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

function transitionCommand(options: Options): CommandResult {
  const transition = options.command as Transition;
  const loop = requireLoop(evaluateLoop(options.root));
  if (options.step === "prepare") {
    const plan = preparePlan(loop, transition);
    return { exitCode: 0, value: plan, text: planText(plan) };
  }
  const plan = loadPlan(options);
  if (options.step === "validate") {
    const { issues } = validatePlan(loop, transition, plan);
    if (issues.length > 0) throw new MissionctlError("plan.invalid", `${issues.length} issue${issues.length === 1 ? "" : "s"} in the plan`, { issues });
    const value = { ok: true, transition, loop_path: loop.path, items: plan.items.length };
    return { exitCode: 0, value, text: `missionctl ${transition} validate: ok (${plan.items.length} items)\n` };
  }
  const result = applyPlan(loop, transition, plan, options.now, { dryRun: options.dryRun });
  if (result.dry_run) {
    const lines = [
      ...result.would_write.map((path) => `WOULD WRITE ${path}`),
      ...result.would_route.map((route) => `WOULD ROUTE ${route.id} → ${route.to}`),
      ...result.would_drop.map((id) => `WOULD DROP ${id}`),
      ...(result.would_delete ?? []).map((path) => `WOULD DELETE ${path}`),
      `missionctl ${transition} apply: dry run, nothing written`,
    ];
    return { exitCode: 0, value: result, text: `${lines.join("\n")}\n` };
  }
  const lines = [
    ...result.written.map((path) => `WROTE ${path}`),
    ...result.routed.map((route) => `ROUTED ${route.id} → ${route.to}`),
    ...result.dropped.map((id) => `DROPPED ${id}`),
    ...(result.deleted ?? []).map((path) => `DELETED ${path}`),
  ];
  return { exitCode: 0, value: result, text: `${lines.join("\n")}\n` };
}

function missionCommand(options: Options): CommandResult {
  const path = findMissionPath(options.root);
  if (!path) throw new MissionctlError("mission.not-found", `no .mission/mission.yaml found at or above ${options.root}`);
  const projection = projectMission(path);
  if (!projection.mission) return { exitCode: 1, value: projection, text: `${issueLines(path, projection.issues)}\n` };
  const { mission } = projection;
  const text =
    `MISSION ${mission.id} [${mission.achieved ? "achieved" : "open"}] achieved=${String(mission.achieved)}\n` +
    mission.rubric.map((entry) => [entry.id, entry.status, entry.evidence ?? entry.reason].filter((part) => part !== undefined).join("\t")).join("\n") +
    "\n" +
    projection.campaigns.map((campaign) => `CAMPAIGN ${campaign.id} [${campaign.status}] targets=${campaign.targets.join(",") || "none"}\n`).join("") +
    (projection.issues.length > 0 ? `${issueLines(path, projection.issues)}\n` : "");
  return { exitCode: projection.ok ? 0 : 1, value: projection, text };
}

function execute(options: Options): CommandResult {
  switch (options.command) {
    case "check":
      return checkCommand(options);
    case "context":
      return contextCommand(options, false);
    case "statusline":
      return contextCommand(options, true);
    case "repair":
      return repairCommand(options);
    case "inspect":
      return inspectCommand(options);
    case "adopt":
      return adoptCommand(options);
    case "compact":
    case "close":
      return transitionCommand(options);
    case "mission":
      return missionCommand(options);
    case "harness": {
      const value = runClaudeHarness(options.event!, options.now);
      return { exitCode: 0, value, text: `${JSON.stringify(value)}\n` };
    }
    default: {
      const exhaustive: never = options.command;
      throw new Error(`unhandled command ${String(exhaustive)}`);
    }
  }
}

export function main(argv: readonly string[]): number {
  if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-V")) {
    process.stdout.write(`${__MISSIONCTL_VERSION__}\n`);
    return 0;
  }
  const json = argv.includes("--json");
  try {
    const options = parseOptions(argv);
    const result = execute(options);
    process.stdout.write(options.json && options.command !== "harness" ? `${JSON.stringify(result.value, null, 2)}\n` : result.text);
    return result.exitCode;
  } catch (error) {
    const failure = error instanceof MissionctlError ? error : new MissionctlError("internal", error instanceof Error ? error.message : String(error));
    if (json) {
      const value = { ok: false, error: { code: failure.code, message: failure.message }, ...(failure.issues.length > 0 ? { issues: failure.issues } : {}) };
      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    } else if (failure.code === "usage") {
      process.stdout.write(`${failure.message}\n`);
    } else {
      const single = failure.issues.length === 1 && failure.issues[0].message === failure.message ? failure.issues[0] : undefined;
      const lines = single ? `\n  repair: ${single.repair}` : failure.issues.length > 0 ? `\n${issueLines(null, failure.issues)}` : "";
      process.stderr.write(`missionctl: ${failure.code}: ${failure.message}${lines}\n`);
    }
    return failure.exitCode;
  }
}

process.exitCode = main(process.argv.slice(2));
