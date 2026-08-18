import { suggestRegressionsForPaths } from "./regression-change-routing.mjs";
import { runPackageScript } from "./package-script-runner.mjs";

/**
 * @typedef {{ areas: readonly string[], fullCheck: boolean, path: string, reason: string }} ChangedRegressionMatch
 * @typedef {{ areas: readonly string[], commands: readonly string[], fallback: boolean, fullCheckRecommended: boolean, matches: readonly ChangedRegressionMatch[], paths: readonly string[], releaseGate: string }} RegressionSuggestion
 * @typedef {(filePaths: readonly string[], options: { versionBookkeepingPaths?: readonly string[] }) => RegressionSuggestion} SuggestRegressionsForPaths
 * @typedef {{ areas: readonly string[], commands: readonly string[], matches: readonly ChangedRegressionMatch[], mode: string, paths: readonly string[], releaseGate: string }} ChangedRegressionPlan
 * @typedef {{ command: string, status: number | null | undefined }} ExecutedChangedRegressionCommand
 */

/**
 * @param {readonly string[]} [filePaths]
 * @param {{ prechecked?: boolean, versionBookkeepingPaths?: readonly string[] }} [options]
 * @returns {ChangedRegressionPlan}
 */
function createChangedRegressionPlan(filePaths = [], { prechecked = false, versionBookkeepingPaths = [] } = {}) {
  const suggestion = /** @type {SuggestRegressionsForPaths} */ (suggestRegressionsForPaths)(filePaths, { versionBookkeepingPaths });
  let mode = "focused";
  let commands = suggestion.commands;

  if (suggestion.paths.length === 0) {
    mode = "empty";
    commands = [];
  } else if (suggestion.fullCheckRecommended) {
    mode = prechecked ? "full-regressions" : "full-check";
    commands = [prechecked ? "npm run test:regressions" : suggestion.releaseGate];
  } else if (suggestion.fallback) {
    mode = "fallback";
  }

  return Object.freeze({
    areas: suggestion.areas,
    commands: Object.freeze(commands),
    matches: suggestion.matches,
    mode,
    paths: suggestion.paths,
    releaseGate: suggestion.releaseGate,
  });
}

/**
 * @param {ChangedRegressionPlan} plan
 * @returns {string}
 */
function formatChangedRegressionPlan(plan) {
  if (plan.mode === "empty") {
    return [
      "Changed-area regression auto-run",
      "No changed files found. No regressions were run.",
      `Release closeout gate remains: ${plan.releaseGate}`,
    ].join("\n");
  }

  const lines = [
    "Changed-area regression auto-run",
    `Changed files inspected: ${plan.paths.length}`,
    `Selected areas: ${plan.areas.length > 0 ? plan.areas.join(", ") : "none (conservative fallback)"}`,
    "Routing reasons:",
  ];

  if (plan.matches.length === 0) {
    lines.push("- No specific route matched; run the full discovered regression registry.");
  } else {
    for (const match of plan.matches) {
      lines.push(`- ${match.path}: ${match.reason} -> ${match.areas.join(", ")}`);
    }
  }

  if (plan.mode === "full-check" || plan.mode === "full-regressions") {
    lines.push(plan.mode === "full-regressions"
      ? "Escalation: CI prechecks already passed; run the complete discovered regression registry without repeating them."
      : "Escalation: the selected boundary requires the full release gate.");
  }
  lines.push("Commands to run:");
  plan.commands.forEach((command) => lines.push(`- ${command}`));
  if (plan.mode !== "full-check") {
    lines.push(`Release closeout gate remains: ${plan.releaseGate}`);
  }
  return lines.join("\n");
}

/**
 * @param {ChangedRegressionPlan} plan
 * @param {{ runCommand?: (command: string) => { status?: number | null } }} [options]
 * @returns {{ executed: readonly ExecutedChangedRegressionCommand[], status: number }}
 */
function executeChangedRegressionPlan(plan, { runCommand = runNpmCommand } = {}) {
  /** @type {ExecutedChangedRegressionCommand[]} */
  const executed = [];

  for (const command of plan.commands) {
    const result = runCommand(command);
    executed.push(Object.freeze({ command, status: result.status }));
    if (result.status !== 0) {
      return Object.freeze({ executed: Object.freeze(executed), status: result.status || 1 });
    }
  }

  return Object.freeze({ executed: Object.freeze(executed), status: 0 });
}

/**
 * @param {string} command
 * @returns {{ status: number | null }}
 */
function runNpmCommand(command) {
  const match = /^npm run ([a-z0-9:-]+)$/.exec(command);
  if (!match) {
    throw new Error(`Unsupported changed-regression command: ${command}`);
  }
  return runPackageScript(match[1]);
}

export {
  createChangedRegressionPlan,
  executeChangedRegressionPlan,
  formatChangedRegressionPlan,
  runNpmCommand,
};
