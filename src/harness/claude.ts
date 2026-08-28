import { readSync } from "node:fs";

import { evaluateLoop, isValidLoop, projectContext, renderContext } from "../loop/index.js";

export const CLAUDE_HARNESS_EVENTS = ["session-start"] as const;
export type ClaudeHarnessEvent = (typeof CLAUDE_HARNESS_EVENTS)[number];

const HOOK_INPUT_BYTES_MAX = 65_536;

function readHookInput(): string {
  const chunks: Buffer[] = [];
  let bytesTotal = 0;
  // Bounded by HOOK_INPUT_BYTES_MAX: the loop throws as soon as the input exceeds it.
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(4_096, HOOK_INPUT_BYTES_MAX - bytesTotal + 1));
    const bytesRead = readSync(0, chunk, 0, chunk.length, null);
    if (bytesRead === 0) break;
    bytesTotal += bytesRead;
    if (bytesTotal > HOOK_INPUT_BYTES_MAX) throw new Error(`hook input exceeds ${HOOK_INPUT_BYTES_MAX} bytes`);
    chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
  }
  return Buffer.concat(chunks, bytesTotal).toString("utf8");
}

function hookCwd(source: string): string {
  const value: unknown = JSON.parse(source);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("hook input must be an object");
  const cwd = (value as Record<string, unknown>).cwd;
  if (typeof cwd !== "string" || cwd.length === 0) throw new Error("hook input requires cwd");
  return cwd;
}

function sessionStartContext(cwd: string, now: Date): string | undefined {
  const evaluation = evaluateLoop(cwd);
  if (evaluation.kind === "none") return undefined;
  if (evaluation.kind === "legacy") {
    return `LOOP.md at ${evaluation.path} is a ${evaluation.classification} loop. Run \`missionctl inspect\` and adopt it deliberately before continuing.`;
  }
  if (!isValidLoop(evaluation)) {
    const issues = evaluation.issues.length;
    return `LOOP.md at ${evaluation.path} is invalid (${issues} issue${issues === 1 ? "" : "s"}). Run \`missionctl check\` and repair it before continuing.`;
  }
  return `Campaign state from LOOP.md (read it before continuing; run \`missionctl context\` to refresh).\n${renderContext(projectContext(evaluation, now)).trimEnd()}`;
}

/** Fail-open by contract: a session start is never blocked by missing, malformed, or unreadable state. */
export function runClaudeHarness(event: ClaudeHarnessEvent, now: Date): object {
  try {
    const cwd = hookCwd(readHookInput());
    const additionalContext = sessionStartContext(cwd, now);
    if (event === "session-start" && additionalContext !== undefined) {
      return { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } };
    }
  } catch {
    // Unreadable input or an internal failure degrades to no context rather than a blocked session.
  }
  return {};
}
