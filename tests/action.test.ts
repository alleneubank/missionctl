import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { ROOT, run, tempRoot, writeText } from "./helpers.js";

interface JavaScriptAction {
  name: string;
  description: string;
  inputs: { exclude: { description: string; required: boolean; default: string } };
  runs: { using: string; main: string };
}

describe("reusable GitHub Action", () => {
  it("declares a Node 24 adapter over missionctl merge check", () => {
    const action = parse(readFileSync(resolve(ROOT, "action.yml"), "utf8")) as JavaScriptAction;

    expect(action).toMatchObject({
      name: "Missionctl merge check",
      inputs: { exclude: { required: false, default: "" } },
      runs: { using: "node24", main: "action/index.js" },
    });
  });

  it("ships the generated action-entry bundle", () => {
    expect(readFileSync(resolve(ROOT, "action/index.js"))).toEqual(readFileSync(resolve(ROOT, "dist/action-index.js")));
  });

  it("returns the exact CLI status and advice", () => {
    const root = tempRoot("action-parity");
    expect(spawnSync("git", ["-C", root, "init", "--quiet"])).toMatchObject({ status: 0 });
    writeText(resolve(root, "LOOP.md"), "tracked fixture\n");
    expect(spawnSync("git", ["-C", root, "add", "--", "LOOP.md"])).toMatchObject({ status: 0 });

    const cli = run(["merge", "check", "--root", root]);
    const action = spawnSync(process.execPath, [resolve(ROOT, "action/index.js")], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_WORKSPACE: root, INPUT_EXCLUDE: "" },
    });
    expect({ status: action.status, stdout: action.stdout, stderr: action.stderr }).toEqual(cli);
  });
});
