import { spawnSync } from "node:child_process";

const CLOSEOUT_GATES = Object.freeze([
  gate("version-guard", "Version literal guard", "version:guard", true),
  gate("regression-manifest", "Regression manifest", "regressions:manifest:check", true),
  gate("database-schema", "Database schema", "db:schema:check", true),
  gate("parameter-binding", "Parameter binding", "audit:params:check", true),
  gate("documentation", "Documentation ownership", "docs:check", false),
  gate("licensing", "Licensing readiness", "licensing:gates", false),
]);

function runCloseoutGates(gates = CLOSEOUT_GATES, { onGateStart, runCommand = runNpmScript } = {}) {
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
  lines.push("Full release regression gate remains: npm run check");
  return lines.join("\n");
}

function runNpmScript(gateDefinition) {
  const command = gateDefinition.command;
  if (process.platform === "win32") {
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
      stdio: "inherit",
      windowsHide: true,
    });
  }
  return spawnSync("npm", ["run", gateDefinition.script], { stdio: "inherit" });
}

function gate(id, label, script, hard) {
  return Object.freeze({ command: `npm run ${script}`, hard, id, label, script });
}

export {
  CLOSEOUT_GATES,
  formatCloseoutSummary,
  runCloseoutGates,
};
