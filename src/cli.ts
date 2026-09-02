import { main } from "./missionctl.js";

process.exitCode = main(process.argv.slice(2));
