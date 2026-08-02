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
  CLOSEOUT_FIXES,
  CLOSEOUT_GATES,
  formatCloseoutFixSummary,
  formatCloseoutSummary,
  runCloseoutFixes,
  runCloseoutGates,
} from "../../lib/closeout-gates.mjs";
import {
  resolveDirectNodePackageScript,
  runPackageScript,
} from "../../lib/package-script-runner.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const commandSource = readFileSync("scripts/run-closeout.mjs", "utf8");
const expectedScripts = [
  "version:guard",
  "regressions:manifest:check",
  "regressions:inventory:check",
  "modules:registry:check",
  "db:schema:check",
  "audit:params:check",
  "docs:check",
  "licensing:gates",
];

assert.deepEqual(CLOSEOUT_GATES.map((gate) => gate.script), expectedScripts);
assert.deepEqual(CLOSEOUT_GATES.map((gate) => gate.hard), [true, true, true, true, true, true, false, false]);
for (const script of expectedScripts) {
  assert.ok(packageJson.scripts[script], `${script} should remain independently runnable`);
}
assert.match(commandSource, /runCloseoutGates\(CLOSEOUT_GATES/);
assert.match(commandSource, /--fix/);
assert.match(commandSource, /--fail-fast/);
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

const failFastInvocations = [];
const failFastResult = runCloseoutGates(CLOSEOUT_GATES, {
  failFast: true,
  runCommand(gate) {
    failFastInvocations.push(gate.id);
    return { status: gate.id === "regression-doc-inventory" ? 7 : 0 };
  },
});
assert.equal(failFastResult.status, 1);
assert.deepEqual(
  failFastInvocations,
  ["version-guard", "regression-manifest", "regression-doc-inventory"],
  "opt-in fail-fast should stop after the first hard failure",
);

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
assert.match(summary, /Canonical ordinary final verification remains: npm run verify:slice/);

assert.deepEqual(
  CLOSEOUT_FIXES.map((entry) => entry.script),
  ["regressions:manifest", "regressions:inventory:write", "modules:registry:generate", "db:schema:refresh"],
  "fix mode should enumerate only reviewed deterministic artifacts",
);
assert.ok(
  CLOSEOUT_FIXES.every((entry) => !/roadmap|changelog|decision|exception|docs:suggest/i.test(entry.script)),
  "fix mode should not edit judgment-bearing policy or arbitrary documentation",
);
const fixInvocations = [];
const fixResult = runCloseoutFixes(CLOSEOUT_FIXES, {
  runCommand(fixDefinition) {
    fixInvocations.push(fixDefinition.command);
    return { status: 0 };
  },
});
assert.equal(fixResult.status, 0);
assert.deepEqual(fixInvocations, CLOSEOUT_FIXES.map((entry) => entry.command));
assert.match(formatCloseoutFixSummary(fixResult), /Reviewed deterministic artifacts regenerated/);

const failedFixInvocations = [];
const failedFixResult = runCloseoutFixes(CLOSEOUT_FIXES, {
  runCommand(fixDefinition) {
    failedFixInvocations.push(fixDefinition.id);
    return { status: fixDefinition.id === "regression-doc-inventory" ? 4 : 0 };
  },
});
assert.equal(failedFixResult.status, 1);
assert.deepEqual(failedFixInvocations, ["regression-manifest", "regression-doc-inventory"]);

assert.deepEqual(
  resolveDirectNodePackageScript("focused", { focused: "node scripts/focused.mjs --check" }),
  { args: ["--check"], entryPoint: "scripts/focused.mjs" },
  "simple Node-backed public package scripts should be safe to invoke directly",
);
assert.equal(
  resolveDirectNodePackageScript("composed", { composed: "npm run first && npm run second" }),
  null,
  "composed package scripts should retain npm orchestration",
);

const directInvocations = [];
const directResult = runPackageScript("focused", {
  packageScripts: { focused: "node scripts/focused.mjs --check" },
  platform: "win32",
  spawnSyncImplementation(file, args, options) {
    directInvocations.push({ args, file, options });
    return { status: 0 };
  },
});
assert.equal(directResult.status, 0);
assert.equal(directInvocations[0].file, process.execPath, "Windows Node-backed gates should bypass cmd.exe and the npm shim");
assert.deepEqual(directInvocations[0].args, ["scripts/focused.mjs", "--check"]);
assert.equal(directInvocations[0].options.windowsHide, true);

const composedInvocations = [];
runPackageScript("composed", {
  packageScripts: { composed: "npm run first && npm run second" },
  platform: "win32",
  spawnSyncImplementation(file, args) {
    composedInvocations.push({ args, file });
    return { status: 0 };
  },
});
assert.equal(composedInvocations[0].file, process.env.ComSpec || "cmd.exe", "composed scripts should preserve the Windows npm fallback");
assert.deepEqual(composedInvocations[0].args, ["/d", "/s", "/c", "npm run composed"]);

console.log("Closeout conductor regression passed.");
