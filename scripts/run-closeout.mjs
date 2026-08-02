import {
  CLOSEOUT_FIXES,
  CLOSEOUT_GATES,
  formatCloseoutFixSummary,
  formatCloseoutSummary,
  runCloseoutFixes,
  runCloseoutGates,
} from "./lib/closeout-gates.mjs";

const args = process.argv.slice(2);
const allowedArgs = new Set(["--fix", "--fail-fast"]);
if (args.some((arg) => !allowedArgs.has(arg)) || new Set(args).size !== args.length) {
  throw new Error("Usage: node scripts/run-closeout.mjs [--fix] [--fail-fast]");
}
const fixArtifacts = args.includes("--fix");
const failFast = args.includes("--fail-fast");

if (fixArtifacts) {
  const fixResult = runCloseoutFixes(CLOSEOUT_FIXES, {
    onFixStart(fix) {
      console.log(`\nRegenerating deterministic artifact: ${fix.label} (${fix.command})`);
    },
  });
  console.log(`\n${formatCloseoutFixSummary(fixResult)}`);
  if (fixResult.status !== 0) {
    process.exitCode = fixResult.status;
  }
}

if (!process.exitCode) {
  const result = runCloseoutGates(CLOSEOUT_GATES, {
    failFast,
    onGateStart(gate) {
      console.log(`\nRunning closeout gate: ${gate.label} (${gate.command})`);
    },
  });
  console.log(`\n${formatCloseoutSummary(result)}`);
  process.exitCode = result.status;
}
