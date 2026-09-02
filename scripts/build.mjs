import { chmodSync, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const output = resolve(root, "dist/missionctl");
mkdirSync(dirname(output), { recursive: true });
await build({
  entryPoints: [resolve(root, "src/cli.ts")],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  define: { __MISSIONCTL_VERSION__: JSON.stringify(packageJson.version) },
  alias: { yaml: resolve(root, "node_modules/yaml/browser/index.js") },
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
});
chmodSync(output, 0o755);

const builtAction = resolve(root, "dist/action-index.js");
await build({
  entryPoints: [resolve(root, "src/action.ts")],
  outfile: builtAction,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  define: { __MISSIONCTL_VERSION__: JSON.stringify(packageJson.version) },
  alias: { yaml: resolve(root, "node_modules/yaml/browser/index.js") },
  legalComments: "none",
});

if (process.argv.includes("--action")) {
  const actionOutput = resolve(root, "action/index.js");
  mkdirSync(dirname(actionOutput), { recursive: true });
  copyFileSync(builtAction, actionOutput);
}
