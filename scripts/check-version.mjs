import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const expectIndex = process.argv.indexOf("--expect");
const expected = expectIndex === -1 ? undefined : process.argv[expectIndex + 1];

if (expectIndex !== -1 && !expected) {
  throw new Error("--expect requires a version");
}
if (expected && packageJson.version !== expected) {
  throw new Error(`package version ${packageJson.version} does not match ${expected}`);
}
process.stdout.write(`${packageJson.version}\n`);
