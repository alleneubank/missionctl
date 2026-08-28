import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  ArtifactParseError,
  buildPortfolio,
  discoverArtifacts,
  evaluateMission,
  loadCurrent,
  loadMission,
  missionForCampaign,
  projectCurrent,
  validateCampaign,
  validateMission,
  type CampaignDocument,
  type CurrentProjection,
  type LocatedIssue,
  type MissionProjection,
  type PortfolioProjection,
  type ValidationIssue,
} from "./mission-control/index.js";

declare const __MISSIONCTL_VERSION__: string;

const COMMANDS = ["current", "mission", "portfolio", "check", "drill", "statusline", "prompt"] as const;
type Command = (typeof COMMANDS)[number];
const PROMPT_ACTIONS = ["resume", "decision-review", "handoff", "landing"] as const;
type PromptAction = (typeof PROMPT_ACTIONS)[number];

interface Options {
  command: Command;
  root: string;
  now: Date;
  json: boolean;
  action?: PromptAction;
}

interface CommandResult {
  exitCode: number;
  value: unknown;
  text: string;
}

function usage(): string {
  return [
    "usage: missionctl <current|mission|portfolio|check|drill|statusline|prompt> [options]",
    "  --root <path>       artifact root (default: current directory)",
    "  --now <timestamp>   injected UTC clock for deterministic evaluation",
    "  --json              stable JSON output",
    "  --version           executable contract version",
    "  prompt actions: resume | decision-review | handoff | landing",
  ].join("\n");
}

function parseOptions(argv: readonly string[]): Options {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    throw new Error(usage());
  }
  const command = argv[0];
  if (!COMMANDS.includes(command as Command)) throw new Error(`unknown command ${command}\n${usage()}`);
  let root = process.cwd();
  let now = new Date();
  let json = false;
  let action: PromptAction | undefined;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a path");
      root = resolve(value);
      index += 1;
    } else if (arg === "--now") {
      const value = argv[index + 1];
      if (!value || !Number.isFinite(Date.parse(value))) throw new Error("--now requires a valid timestamp");
      now = new Date(value);
      index += 1;
    } else if (command === "prompt" && action === undefined && PROMPT_ACTIONS.includes(arg as PromptAction)) {
      action = arg as PromptAction;
    } else {
      throw new Error(`unexpected argument ${arg}`);
    }
  }
  if (command === "prompt" && !action) throw new Error(`prompt requires one of ${PROMPT_ACTIONS.join(", ")}`);
  return { command: command as Command, root, now, json, action };
}

function currentText(current: CurrentProjection): string {
  return (
    `MISSION ${current.mission.kind} ${current.mission.id} [${current.mission.status}] floors=${current.mission.floor_state}\n` +
    `CAMPAIGN ${current.campaign.id} [${current.campaign.status}] phase=${current.campaign.phase} attention=${current.campaign.attention} iteration=${current.campaign.iteration}/${current.campaign.iteration_budget}\n` +
    `GAPS ${current.mission.gaps.length > 0 ? current.mission.gaps.join(" ") : "none"}\n` +
    (current.cues.length > 0 ? `CUES ${current.cues.join(" ")}\n` : "") +
    `NEXT ${current.campaign.next_action}\n`
  );
}

function missionText(mission: MissionProjection, issues: readonly LocatedIssue[] = []): string {
  const rows = mission.rubric.map((item) => `${item.id}\t${item.state}\t${item.dimension}`).join("\n");
  const degraded =
    issues.length === 0
      ? ""
      : `DEGRADED\n${issues.map((entry) => `  ${entry.artifact_path}: ${entry.code}: ${entry.message}`).join("\n")}\n`;
  return (
    `MISSION ${mission.kind} ${mission.id} [${mission.status}] floors=${mission.floor_state} achieved=${String(mission.achieved)}\n` +
    `${rows}\n${degraded}`
  );
}

function portfolioText(portfolio: PortfolioProjection): string {
  const lines: string[] = [];
  for (const group of portfolio.groups) {
    lines.push(`ATTENTION ${group.attention}`);
    for (const kind of group.kinds) {
      lines.push(`  KIND ${kind.kind}`);
      for (const mission of kind.missions) {
        lines.push(`    ${mission.id} [${mission.status}] floors=${mission.floor_state} gaps=${mission.gaps.join(",") || "none"}`);
      }
    }
  }
  if (portfolio.legacy.length > 0) {
    lines.push("LEGACY UNTYPED");
    portfolio.legacy.forEach((entry) => lines.push(`  ${entry.path}`));
  }
  if (portfolio.issues.length > 0) {
    lines.push("DEGRADED");
    portfolio.issues.forEach((entry) => lines.push(`  ${entry.artifact_path}: ${entry.code}: ${entry.message}`));
  }
  return `${lines.join("\n")}\n`;
}

function currentCommand(options: Options): CommandResult {
  const { mission, campaign } = loadCurrent(options.root);
  const missionIssues = validateMission(mission.document);
  const campaignIssues = validateCampaign(campaign.document, mission.document);
  if (missionIssues.length + campaignIssues.length > 0) {
    return checkResult([
      ...locatedIssues(mission.path, missionIssues),
      ...locatedIssues(campaign.path, campaignIssues),
    ]);
  }
  const current = projectCurrent(mission.document, campaign.document, options.now);
  return { exitCode: 0, value: current, text: currentText(current) };
}

function missionCommand(options: Options): CommandResult {
  const mission = loadMission(options.root);
  const missionIssues = validateMission(mission.document);
  if (missionIssues.length > 0) return checkResult(locatedIssues(mission.path, missionIssues));

  const discovered = discoverArtifacts([dirname(mission.path)]);
  const issues: LocatedIssue[] = [...discovered.issues];
  const campaigns: CampaignDocument[] = [];
  for (const campaign of discovered.campaigns) {
    const parent = missionForCampaign(campaign, discovered.missions);
    if (parent?.path !== mission.path) continue;
    const campaignIssues = validateCampaign(campaign.document, mission.document);
    issues.push(...locatedIssues(campaign.path, campaignIssues));
    if (campaignIssues.length === 0) campaigns.push(campaign.document);
  }

  const projection = evaluateMission(mission.document, campaigns, options.now);
  const value = { ...projection, issues };
  return {
    exitCode: issues.length === 0 ? 0 : 1,
    value,
    text: missionText(projection, issues),
  };
}

function locatedIssues(artifactPath: string, issues: readonly ValidationIssue[]): LocatedIssue[] {
  return issues.map((entry) => ({ ...entry, artifact_path: artifactPath }));
}

function checkResult(issues: readonly LocatedIssue[]): CommandResult {
  const value = { ok: issues.length === 0, issues };
  const text =
    issues.length === 0
      ? "missionctl check: ok\n"
      : `${issues.map((entry) => `${entry.artifact_path}: ${entry.code}: ${entry.message}`).join("\n")}\n`;
  return { exitCode: issues.length === 0 ? 0 : 1, value, text };
}

function portfolioCommand(options: Options, checking: boolean): CommandResult {
  const portfolio = buildPortfolio([options.root], options.now);
  if (checking) {
    const value = { ok: portfolio.issues.length === 0, issues: portfolio.issues, legacy: portfolio.legacy };
    const text = portfolio.issues.length === 0 ? "missionctl check: ok\n" : portfolioText({ ...portfolio, groups: [], legacy: [] });
    return { exitCode: portfolio.issues.length === 0 ? 0 : 1, value, text };
  }
  return { exitCode: portfolio.issues.length === 0 ? 0 : 1, value: portfolio, text: portfolioText(portfolio) };
}

const DRILLS = {
  scenarios: [
    {
      id: "failing-targeted-floor",
      event: "A verifier for a targeted rubric floor is red and the next fix is reversible.",
      classification: "interior-work",
    },
    {
      id: "adjacent-untargeted-refactor",
      event: "A useful adjacent refactor advances no target and is not required by an invariant or safety.",
      classification: "campaign-scope",
    },
    {
      id: "change-success-floor",
      event: "New evidence shows the mission's strategic success floor itself should change.",
      classification: "mission-amendment",
    },
    {
      id: "publish-green-artifact",
      event: "Interior work is green and the named artifact is ready to publish.",
      classification: "boundary",
    },
  ],
} as const;

function drillText(): string {
  return `${DRILLS.scenarios.map((scenario) => `${scenario.id}\t${scenario.classification}\t${scenario.event}`).join("\n")}\n`;
}

function promptCommand(options: Options): CommandResult {
  const current = currentCommand(options);
  if (current.exitCode !== 0) return current;
  const projection = current.value as CurrentProjection;
  const action = options.action as PromptAction;
  const shared = `Mission ${projection.mission.id}; campaign ${projection.campaign.id}; phase ${projection.campaign.phase}; attention ${projection.campaign.attention}; red floors ${projection.mission.gaps.join(", ") || "none"}; cues ${projection.cues.join(", ") || "none"}.`;
  const instructions: Record<PromptAction, string> = {
    resume: `Resume the campaign from its committed MISSION.md and LOOP.md. ${shared} Execute the declared next action: ${projection.campaign.next_action}`,
    "decision-review": `Review the campaign's named decision batch against the mission rubric. ${shared} Record each human answer in Decisions before resuming interior work.`,
    handoff: `Prepare the terminal campaign handoff. ${shared} Cite verifier evidence and name every remaining boundary without duplicating the campaign journal.`,
    landing: `Prepare the named artifact for its publish boundary. ${shared} Restate the concrete artifact and ref before requesting authorization.`,
  };
  const value = { action, prompt: instructions[action] };
  return { exitCode: 0, value, text: `${value.prompt}\n` };
}

function execute(options: Options): CommandResult {
  switch (options.command) {
    case "current":
      return currentCommand(options);
    case "mission":
      return missionCommand(options);
    case "portfolio":
      return portfolioCommand(options, false);
    case "check":
      return portfolioCommand(options, true);
    case "drill":
      return { exitCode: 0, value: DRILLS, text: drillText() };
    case "statusline": {
      const result = currentCommand(options);
      if (result.exitCode !== 0) return result;
      const current = result.value as CurrentProjection;
      const value = {
        mission_kind: current.mission.kind,
        campaign_phase: current.campaign.phase,
        rubric_floor_state: current.mission.floor_state,
        attention: current.campaign.attention,
        iteration: current.campaign.iteration,
        iteration_budget: current.campaign.iteration_budget,
      };
      return {
        exitCode: 0,
        value,
        text: `${value.mission_kind} ${value.campaign_phase} · floors ${value.rubric_floor_state} · attention ${value.attention} · iteration ${value.iteration}/${value.iteration_budget}\n`,
      };
    }
    case "prompt":
      return promptCommand(options);
    default: {
      const exhaustive: never = options.command;
      throw new Error(`unhandled command ${exhaustive}`);
    }
  }
}

export function main(argv: readonly string[]): number {
  if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-V")) {
    process.stdout.write(`${__MISSIONCTL_VERSION__}\n`);
    return 0;
  }
  let options: Options | undefined;
  try {
    options = parseOptions(argv);
    const result = execute(options);
    process.stdout.write(options.json ? `${JSON.stringify(result.value, null, 2)}\n` : result.text);
    return result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options?.json) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
    } else if (error instanceof Error && error.message === usage()) {
      process.stdout.write(`${message}\n`);
    } else {
      process.stderr.write(`missionctl: ${message}\n`);
    }
    return error instanceof ArtifactParseError ? 1 : 2;
  }
}

process.exitCode = main(process.argv.slice(2));
