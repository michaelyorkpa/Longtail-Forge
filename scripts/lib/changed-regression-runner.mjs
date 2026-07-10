import { spawnSync } from "node:child_process";
import { suggestRegressionsForPaths } from "./regression-change-routing.mjs";

function createChangedRegressionPlan(filePaths = []) {
  const suggestion = suggestRegressionsForPaths(filePaths);
  let mode = "focused";
  let commands = suggestion.commands;

  if (suggestion.paths.length === 0) {
    mode = "empty";
    commands = [];
  } else if (suggestion.fullCheckRecommended) {
    mode = "full-check";
    commands = [suggestion.releaseGate];
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

  if (plan.mode === "full-check") {
    lines.push("Escalation: shared/framework, database, view, or release changes require the full release gate.");
  }
  lines.push("Commands to run:");
  plan.commands.forEach((command) => lines.push(`- ${command}`));
  if (plan.mode !== "full-check") {
    lines.push(`Release closeout gate remains: ${plan.releaseGate}`);
  }
  return lines.join("\n");
}

function executeChangedRegressionPlan(plan, { runCommand = runNpmCommand } = {}) {
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

function runNpmCommand(command) {
  const match = /^npm run ([a-z0-9:-]+)$/.exec(command);
  if (!match) {
    throw new Error(`Unsupported changed-regression command: ${command}`);
  }
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
      stdio: "inherit",
      windowsHide: true,
    });
  }
  return spawnSync("npm", ["run", match[1]], { stdio: "inherit" });
}

export {
  createChangedRegressionPlan,
  executeChangedRegressionPlan,
  formatChangedRegressionPlan,
};
