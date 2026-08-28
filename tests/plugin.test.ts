import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "./helpers.js";

const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string };

function json(path: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

describe("missionctl agent plugin", () => {
  it("publishes matching Claude and Codex plugin manifests", () => {
    expect(json("plugins/missionctl/.codex-plugin/plugin.json")).toEqual(expect.objectContaining({ name: "missionctl", version: PACKAGE.version }));
    expect(json("plugins/missionctl/.claude-plugin/plugin.json")).toEqual(expect.objectContaining({ name: "missionctl", version: PACKAGE.version }));
    expect(json(".claude-plugin/marketplace.json")).toEqual(
      expect.objectContaining({ plugins: [expect.objectContaining({ name: "missionctl", version: PACKAGE.version })] }),
    );
  });

  it("registers exactly one session-start hook", () => {
    expect(json("plugins/missionctl/hooks/hooks.json")).toEqual({
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                command: "missionctl harness claude session-start",
                timeout: 5,
              },
            ],
          },
        ],
      },
    });
  });
});
