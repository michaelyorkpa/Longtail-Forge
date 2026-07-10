import {
  CLOSEOUT_GATES,
  formatCloseoutSummary,
  runCloseoutGates,
} from "./lib/closeout-gates.mjs";

if (process.argv.length > 2) {
  throw new Error("Usage: node scripts/run-closeout.mjs");
}

const result = runCloseoutGates(CLOSEOUT_GATES, {
  onGateStart(gate) {
    console.log(`\nRunning closeout gate: ${gate.label} (${gate.command})`);
  },
});

console.log(`\n${formatCloseoutSummary(result)}`);
process.exitCode = result.status;
