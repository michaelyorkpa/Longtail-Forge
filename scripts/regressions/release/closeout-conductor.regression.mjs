export const regressionMeta = Object.freeze({
  id: "release.closeout-conductor",
  area: "release",
  tier: "release-gate",
  tags: ["closeout", "commands", "release"],
  description: "Proves the closeout conductor aggregates every maintenance gate without replacing the full regression gate.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CLOSEOUT_GATES,
  formatCloseoutSummary,
  runCloseoutGates,
} from "../../lib/closeout-gates.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const commandSource = readFileSync("scripts/run-closeout.mjs", "utf8");
const expectedScripts = [
  "version:guard",
  "regressions:manifest:check",
  "modules:registry:check",
  "db:schema:check",
  "audit:params:check",
  "docs:check",
  "licensing:gates",
];

assert.equal(packageJson.scripts.closeout, "node scripts/run-closeout.mjs");
assert.deepEqual(CLOSEOUT_GATES.map((gate) => gate.script), expectedScripts);
assert.deepEqual(CLOSEOUT_GATES.map((gate) => gate.hard), [true, true, true, true, true, false, false]);
for (const script of expectedScripts) {
  assert.ok(packageJson.scripts[script], `${script} should remain independently runnable`);
}
assert.match(commandSource, /runCloseoutGates\(CLOSEOUT_GATES/);
assert.doesNotMatch(commandSource, /npm run check/, "the conductor should complement rather than invoke the full regression gate");

const passInvocations = [];
const passingResult = runCloseoutGates(CLOSEOUT_GATES, {
  runCommand(gate) {
    passInvocations.push(gate.command);
    return { status: 0 };
  },
});
assert.equal(passingResult.status, 0);
assert.deepEqual(passInvocations, expectedScripts.map((script) => `npm run ${script}`));
assert.ok(passingResult.results.every((result) => result.outcome === "pass"));

const hardFailureInvocations = [];
const hardFailureResult = runCloseoutGates(CLOSEOUT_GATES, {
  runCommand(gate) {
    hardFailureInvocations.push(gate.id);
    return { status: gate.id === "database-schema" ? 7 : 0 };
  },
});
assert.equal(hardFailureResult.status, 1, "one hard-gate failure should fail the conductor");
assert.equal(hardFailureResult.results.find((result) => result.id === "database-schema").outcome, "fail");
assert.deepEqual(hardFailureInvocations, CLOSEOUT_GATES.map((gate) => gate.id), "a hard failure should not stop later gates");

const warningResult = runCloseoutGates(CLOSEOUT_GATES, {
  runCommand(gate) {
    return { status: gate.hard ? 0 : 9 };
  },
});
assert.equal(warningResult.status, 0, "warning-only gate results should not hard-fail the conductor");
assert.deepEqual(
  warningResult.results.filter((result) => result.outcome === "warn").map((result) => result.id),
  ["documentation", "licensing"],
);

const summary = formatCloseoutSummary(hardFailureResult);
for (const gate of CLOSEOUT_GATES) {
  assert.match(summary, new RegExp(gate.label), `summary should list ${gate.label}`);
}
assert.match(summary, /\[FAIL\] Database schema \[hard\]/);
assert.match(formatCloseoutSummary(warningResult), /\[WARN\] Documentation ownership \[warning-only\]/);
assert.match(summary, /Full release regression gate remains: npm run check/);

console.log("Closeout conductor regression passed.");
