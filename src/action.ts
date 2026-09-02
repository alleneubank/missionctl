import { main } from "./missionctl.js";

const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
const excludes = (process.env.INPUT_EXCLUDE ?? "")
  .split(/\r?\n/u)
  .filter((exclude) => exclude.length > 0)
  .flatMap((exclude) => ["--exclude", exclude]);

process.exitCode = main(["merge", "check", "--root", root, ...excludes]);
