import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const separator = process.argv.indexOf("--");
if (separator !== 3 || process.argv.length < 5) {
  throw new Error("Usage: node scripts/run-timed-stage.mjs <stage-name> -- <command> [args...]");
}

const stage = process.argv[2];
const [command, ...args] = process.argv.slice(separator + 1);
const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
const started = performance.now();
console.log(`[stage:${stage}] included; starting ${command} ${args.join(" ")}`.trimEnd());
const result = spawnSync(executable, args, { env: process.env, stdio: "inherit", windowsHide: true });
const seconds = (performance.now() - started) / 1000;
const status = Number.isInteger(result.status) ? result.status : 1;
const outcome = status === 0 ? "passed" : "failed";
const line = `[stage:${stage}] ${outcome} in ${seconds.toFixed(2)}s`;
console.log(line);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- **${stage}**: ${outcome} in ${seconds.toFixed(2)}s\n`, "utf8");
  console.log(`::notice title=Stage timing::${stage} ${outcome} in ${seconds.toFixed(2)}s`);
}
process.exitCode = status;
