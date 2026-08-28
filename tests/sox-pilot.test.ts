import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FIXTURES, NOW, json, run } from "./helpers.js";

const ROOT = resolve(FIXTURES, "sox-visual-pilot");

describe("Sox visual pilot fixture", () => {
  it("is a valid terminal loop whose gates point at the committed device evidence", () => {
    const check = run(["check", "--root", ROOT, "--now", NOW, "--json"]);
    expect(check.status).toBe(0);
    expect(json<{ issues: unknown[] }>(check).issues).toEqual([]);

    const context = json<{ red_gates: unknown[]; boundary: string[] }>(run(["context", "--root", ROOT, "--now", NOW, "--json"]));
    expect(context.red_gates).toEqual([]);
    expect(context.boundary).toEqual(["publish", "merge-tracked-ref", "biometric-device-check"]);
  });

  it("preserves the device verdict and pixel-report contracts", () => {
    for (const platform of ["ios", "android"]) {
      const verdict = JSON.parse(readFileSync(resolve(ROOT, "evidence/device", platform, "verdict.json"), "utf8")) as {
        result: string;
        captured_at: string;
        frames: string[];
      };
      const pixels = JSON.parse(readFileSync(resolve(ROOT, "evidence/device", platform, "pack-pixels.json"), "utf8")) as {
        pass: boolean;
        required: string[];
        present: string[];
        failed: string[];
      };

      expect(verdict).toEqual(
        expect.objectContaining({
          result: "PASS",
          captured_at: expect.stringMatching(/^2026-08-26T/),
          frames: expect.arrayContaining(pixels.required.map((name) => `${name}.png`)),
        }),
      );
      expect(pixels).toEqual(expect.objectContaining({ pass: true, failed: [] }));
      expect(pixels.required).toHaveLength(11);
      expect([...pixels.required].sort()).toEqual([...pixels.present].sort());
    }
  });
});
