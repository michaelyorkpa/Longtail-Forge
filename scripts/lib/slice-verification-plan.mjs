import { runNpmCommand } from "./changed-regression-runner.mjs";

const CLOSEOUT_COMMAND = "npm run closeout";
const FULL_CHECK_COMMAND = "npm run check";
const PERMISSION_HARNESS_COMMAND = "npm run test:permissions";

function createSliceVerificationPlan(changedRegressionPlan) {
  if (!changedRegressionPlan || !Array.isArray(changedRegressionPlan.commands)) {
    throw new TypeError("A changed-regression plan is required.");
  }

  const fullCheckIncluded = changedRegressionPlan.mode === "full-check";
  const permissionHarnessIncluded = changedRegressionPlan.areas.includes("permissions");
  const regressionCommands = fullCheckIncluded
    ? [FULL_CHECK_COMMAND]
    : changedRegressionPlan.commands;
  const commands = uniqueCommands([
    CLOSEOUT_COMMAND,
    ...regressionCommands,
    ...(permissionHarnessIncluded ? [PERMISSION_HARNESS_COMMAND] : []),
  ]);

  return Object.freeze({
    areas: changedRegressionPlan.areas,
    commands,
    fullCheckIncluded,
    matches: changedRegressionPlan.matches,
    mode: changedRegressionPlan.mode,
    paths: changedRegressionPlan.paths,
    permissionHarnessIncluded,
  });
}

function executeSliceVerificationPlan(plan, { runCommand = runNpmCommand } = {}) {
  const executed = [];

  for (const command of plan.commands) {
    let commandResult;
    try {
      commandResult = runCommand(command);
    } catch (error) {
      commandResult = { error, status: 1 };
    }
    const status = Number.isInteger(commandResult?.status) ? commandResult.status : 1;
    executed.push(Object.freeze({ command, status }));
    if (status !== 0) {
      return Object.freeze({ executed: Object.freeze(executed), status: status || 1 });
    }
  }

  return Object.freeze({ executed: Object.freeze(executed), status: 0 });
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
    for (const match of plan.matches) {
      lines.push(`- ${match.path}: ${match.reason} -> ${match.areas.join(", ")}`);
    }
  } else if (plan.mode === "fallback") {
    lines.push("Routing reasons:", "- No specific route matched; use the conservative full-regression fallback.");
  } else if (plan.mode === "empty") {
    lines.push("No changed files found; no regression command was added.");
  }

  lines.push("Commands scheduled:");
  plan.commands.forEach((command) => lines.push(`- ${command}`));
  return lines.join("\n");
}

function formatSliceVerificationSummary(plan, result) {
  const executedCommands = result.executed.map(({ command }) => command);
  const lines = [
    "Slice verification summary",
    `Changed-regression mode: ${plan.mode}`,
    "Commands actually executed:",
    ...(executedCommands.length > 0 ? executedCommands.map((command) => `- ${command}`) : ["- none"]),
    `Full-check escalation included: ${plan.fullCheckIncluded ? "yes" : "no"}`,
    `Permission harness included: ${plan.permissionHarnessIncluded ? "yes" : "no"}`,
    `Status: ${result.status === 0 ? "passed" : "failed"}`,
  ];

  if (result.status === 0) {
    lines.push("This result is valid only for the unchanged working-tree state inspected by this run.");
    lines.push("Do not run an equivalent local verification command again unless files change after this successful run.");
  } else {
    lines.push("Verification stopped at the first failed command; later expensive commands were not run.");
  }

  return lines.join("\n");
}

function uniqueCommands(commands) {
  return Object.freeze([...new Set(commands)]);
}

export {
  CLOSEOUT_COMMAND,
  FULL_CHECK_COMMAND,
  PERMISSION_HARNESS_COMMAND,
  createSliceVerificationPlan,
  executeSliceVerificationPlan,
  formatSliceVerificationPlan,
  formatSliceVerificationSummary,
};
