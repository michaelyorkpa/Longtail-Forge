import { runPackageScript } from "./package-script-runner.mjs";

const CLOSEOUT_GATES = Object.freeze([
  gate("version-guard", "Version literal guard", "version:guard", true),
  gate("regression-manifest", "Regression manifest", "regressions:manifest:check", true),
  gate("regression-doc-inventory", "Regression documentation inventory", "regressions:inventory:check", true),
  gate("module-registry", "Bundled module catalog", "modules:registry:check", true),
  gate("database-schema", "Database schema", "db:schema:check", true),
  gate("parameter-binding", "Parameter binding", "audit:params:check", true),
  gate("documentation", "Documentation ownership", "docs:check", false),
  gate("licensing", "Licensing readiness", "licensing:gates", false),
]);

const CLOSEOUT_FIXES = Object.freeze([
  fix("regression-manifest", "Regression manifest", "regressions:manifest"),
  fix("regression-doc-inventory", "Regression documentation inventory", "regressions:inventory:write"),
  fix("module-registry", "Bundled module catalog", "modules:registry:generate"),
  fix("database-schema", "Database schema", "db:schema:refresh"),
]);

function runCloseoutGates(
  gates = CLOSEOUT_GATES,
  { failFast = false, onGateStart, runCommand = runNpmScript } = {},
) {
  const results = [];

  for (const gateDefinition of gates) {
    onGateStart?.(gateDefinition);
    let commandResult;
    try {
      commandResult = runCommand(gateDefinition);
    } catch (error) {
      commandResult = { error, status: 1 };
    }
    const exitCode = Number.isInteger(commandResult?.status) ? commandResult.status : 1;
    results.push(Object.freeze({
      ...gateDefinition,
      exitCode,
      outcome: exitCode === 0 ? "pass" : gateDefinition.hard ? "fail" : "warn",
    }));
    if (failFast && results.at(-1).outcome === "fail") {
      break;
    }
  }

  return Object.freeze({
    results: Object.freeze(results),
    status: results.some((result) => result.outcome === "fail") ? 1 : 0,
  });
}

function formatCloseoutSummary(result) {
  const lines = ["Closeout gate summary"];
  for (const gateResult of result.results) {
    const marker = gateResult.outcome === "pass" ? "PASS" : gateResult.outcome === "warn" ? "WARN" : "FAIL";
    const suffix = gateResult.exitCode === 0 ? "" : ` (exit ${gateResult.exitCode})`;
    const policy = gateResult.hard ? "hard" : "warning-only";
    lines.push(`[${marker}] ${gateResult.label} [${policy}]: ${gateResult.command}${suffix}`);
  }
  lines.push(result.status === 0 ? "Closeout gates completed without hard failures." : "Closeout gates failed one or more hard checks.");
  lines.push("Canonical ordinary final verification remains: npm run verify:slice");
  return lines.join("\n");
}

function runNpmScript(gateDefinition) {
  return runPackageScript(gateDefinition.script);
}

function runCloseoutFixes(fixes = CLOSEOUT_FIXES, { onFixStart, runCommand = runNpmScript } = {}) {
  const results = [];
  for (const fixDefinition of fixes) {
    onFixStart?.(fixDefinition);
    let commandResult;
    try {
      commandResult = runCommand(fixDefinition);
    } catch (error) {
      commandResult = { error, status: 1 };
    }
    const exitCode = Number.isInteger(commandResult?.status) ? commandResult.status : 1;
    results.push(Object.freeze({ ...fixDefinition, exitCode, outcome: exitCode === 0 ? "pass" : "fail" }));
    if (exitCode !== 0) {
      break;
    }
  }
  return Object.freeze({
    results: Object.freeze(results),
    status: results.some((result) => result.outcome === "fail") ? 1 : 0,
  });
}

function formatCloseoutFixSummary(result) {
  const lines = ["Closeout deterministic-fix summary"];
  for (const fixResult of result.results) {
    const marker = fixResult.outcome === "pass" ? "PASS" : "FAIL";
    const suffix = fixResult.exitCode === 0 ? "" : ` (exit ${fixResult.exitCode})`;
    lines.push(`[${marker}] ${fixResult.label}: ${fixResult.command}${suffix}`);
  }
  lines.push(result.status === 0
    ? "Reviewed deterministic artifacts regenerated; validation follows."
    : "Deterministic regeneration failed; validation was not started.");
  return lines.join("\n");
}

function gate(id, label, script, hard) {
  return Object.freeze({ command: `npm run ${script}`, hard, id, label, script });
}

function fix(id, label, script) {
  return Object.freeze({ command: `npm run ${script}`, id, label, script });
}

export {
  CLOSEOUT_FIXES,
  CLOSEOUT_GATES,
  formatCloseoutFixSummary,
  formatCloseoutSummary,
  runCloseoutFixes,
  runCloseoutGates,
};
