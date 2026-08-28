import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(ROOT, "dist/missionctl");
const PACKAGE = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as { version: string };

describe("release executable contract", () => {
  it("reports the package version through the executable entry point", () => {
    const result = spawnSync(CLI, ["--version"], { encoding: "utf8" });

    expect(result).toMatchObject({
      status: 0,
      stdout: `${PACKAGE.version}\n`,
      stderr: "",
    });
  });

  it("packages one root executable with a matching SHA-256 sidecar", () => {
    const packaged = spawnSync(resolve(ROOT, "packaging/package-release.sh"), [], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const archive = resolve(ROOT, `dist/release/missionctl-${PACKAGE.version}.tar.gz`);
    const checksum = readFileSync(`${archive}.sha256`, "utf8").split(/\s+/, 1)[0];
    const contents = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });

    expect(packaged).toMatchObject({ status: 0, stderr: "" });
    expect(contents).toMatchObject({ status: 0, stdout: "missionctl\n", stderr: "" });
    expect(checksum).toBe(createHash("sha256").update(readFileSync(archive)).digest("hex"));
  });
});
