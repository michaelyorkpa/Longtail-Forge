import { performance } from "node:perf_hooks";
import { runNpmCommand } from "./changed-regression-runner.mjs";

const CLOSEOUT_COMMAND = "npm run closeout";
const FAST_CHECK_COMMAND = "npm run check:fast";
const TYPECHECK_COMMAND = "npm run typecheck";
const FULL_CHECK_COMMAND = "npm run check";
const FULL_REGRESSION_COMMAND = "npm run test:regressions";
const PERMISSION_REGRESSION_COMMAND = "npm run test:regressions:permissions";

function createSliceVerificationPlan(changedRegressionPlan) {
  if (!changedRegressionPlan || !Array.isArray(changedRegressionPlan.commands)) {
    throw new TypeError("A changed-regression plan is required.");
  }

  const fullCheckIncluded = changedRegressionPlan.mode === "full-check";
  const regressionCommands = fullCheckIncluded
    ? [FULL_REGRESSION_COMMAND]
    : changedRegressionPlan.commands;
  const permissionHarnessIncluded = regressionCommands.some((command) => (
    command === FULL_REGRESSION_COMMAND || command === PERMISSION_REGRESSION_COMMAND
  ));
  const stages = Object.freeze([
    stage("context", "Context/setup", null, true, "changed paths and routing plan collected"),
    stage("closeout", "Closeout gates", CLOSEOUT_COMMAND, true),
    stage("fast-checks", "Typecheck/unit/lint", FAST_CHECK_COMMAND, fullCheckIncluded, "not required by focused routing"),
    stage("strict-ledger", "Strict-ledger typecheck", TYPECHECK_COMMAND, !fullCheckIncluded, "covered by the full typecheck/unit/lint stage"),
    ...regressionCommands.map((command, index) => stage(`regressions-${index + 1}`, "Regression buckets", command, true)),
    ...(regressionCommands.length === 0 ? [stage("regressions", "Regression buckets", null, false, "no changed files selected")] : []),
    stage("browser", "Browser checks", null, false, "separate rendered gate"),
    stage("packaging", "Packaging", null, false, "not part of ordinary slice verification"),
  ]);

  return Object.freeze({
    areas: changedRegressionPlan.areas,
    commands: Object.freeze(stages.filter((item) => item.included && item.command).map((item) => item.command)),
    fullCheckIncluded,
    matches: changedRegressionPlan.matches,
    mode: changedRegressionPlan.mode,
    paths: changedRegressionPlan.paths,
    permissionHarnessIncluded,
    stages,
  });
}

function executeSliceVerificationPlan(plan, /** @type {{ contextSeconds?: number, runCommand?: (command: string) => { status?: number | null } }} */ { contextSeconds = 0, runCommand = runNpmCommand } = {}) {
  const results = [];
  let failed = false;
  let failureStatus = 0;
  for (const item of plan.stages) {
    if (!item.included || failed) {
      results.push(Object.freeze({ ...item, outcome: failed && item.included ? "skipped" : "skipped", seconds: 0, reason: failed && item.included ? "earlier stage failed" : item.reason }));
      continue;
    }
    if (!item.command) {
      results.push(Object.freeze({ ...item, outcome: "passed", seconds: contextSeconds }));
      continue;
    }
    const started = performance.now();
    let commandResult;
    try {
      commandResult = runCommand(item.command);
    } catch (error) {
      commandResult = { error, status: 1 };
    }
    const status = Number.isInteger(commandResult?.status) ? commandResult.status : 1;
    const outcome = status === 0 ? "passed" : "failed";
    results.push(Object.freeze({ ...item, outcome, seconds: (performance.now() - started) / 1000, status }));
    failed ||= status !== 0;
    if (status !== 0 && failureStatus === 0) failureStatus = status;
  }
  return Object.freeze({ executed: Object.freeze(results.filter((item) => item.command && item.outcome !== "skipped").map(({ command, status }) => ({ command, status }))), stages: Object.freeze(results), status: failureStatus });
}

function formatSliceVerificationPlan(plan) {
  const lines = [
    "Slice verification plan",
    `Changed files inspected: ${plan.paths.length}`,
    `Changed-regression mode: ${plan.mode}`,
    `Selected areas: ${plan.areas.length > 0 ? plan.areas.join(", ") : "none"}`,
  ];
  if (plan.matches.length > 0) {
    lines.push("Routing reasons:");
    for (const match of plan.matches) lines.push(`- ${match.path}: ${match.reason} -> ${match.areas.join(", ")}`);
  }
  lines.push("Stages scheduled:");
  for (const item of plan.stages) lines.push(`- ${item.label}: ${item.included ? item.command || "included" : `skipped (${item.reason})`}`);
  return lines.join("\n");
}

function formatSliceVerificationSummary(plan, result) {
  const lines = ["Slice verification timing summary", `Changed-regression mode: ${plan.mode}`];
  for (const item of result.stages) {
    lines.push(`- [${item.outcome.toUpperCase()}] ${item.label}: ${item.seconds.toFixed(2)}s${item.reason && item.outcome === "skipped" ? ` (${item.reason})` : ""}`);
  }
  lines.push(`Full-check escalation included: ${plan.fullCheckIncluded ? "yes" : "no"}`);
  lines.push(`Permission harness discovered through regression buckets: ${plan.permissionHarnessIncluded ? "yes" : "no"}`);
  lines.push(`Status: ${result.status === 0 ? "passed" : "failed"}`);
  if (result.status === 0) {
    lines.push("This result is valid only for the unchanged working-tree state inspected by this run.");
    lines.push("Do not run an equivalent local verification command again unless files change after this successful run.");
  } else {
    lines.push("Verification stopped at the first failed stage; later included stages are shown as skipped.");
  }
  return lines.join("\n");
}

function stage(id, label, command, included, reason = "") {
  return Object.freeze({ command, id, included, label, reason });
}

export {
  CLOSEOUT_COMMAND,
  FAST_CHECK_COMMAND,
  FULL_CHECK_COMMAND,
  FULL_REGRESSION_COMMAND,
  PERMISSION_REGRESSION_COMMAND,
  TYPECHECK_COMMAND,
  createSliceVerificationPlan,
  executeSliceVerificationPlan,
  formatSliceVerificationPlan,
  formatSliceVerificationSummary,
};
