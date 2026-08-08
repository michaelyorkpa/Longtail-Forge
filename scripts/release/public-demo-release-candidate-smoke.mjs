#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PUBLIC_DEMO_CONTRACT_SCRIPTS = Object.freeze([
  "scripts/regressions/framework/public-demo-account-catalog.regression.mjs",
  "scripts/regressions/permissions/public-demo-role-journey.regression.mjs",
  "scripts/regressions/framework/public-demo-identity-immutability.regression.mjs",
  "scripts/regressions/framework/public-demo-files-ingress.regression.mjs",
  "scripts/regressions/framework/public-demo-capability-enforcement.regression.mjs",
  "scripts/regressions/framework/public-demo-budgets.regression.mjs",
  "scripts/regressions/framework/public-demo-cross-role-content-safety.regression.mjs",
  "scripts/regressions/framework/public-demo-perimeter.regression.mjs",
  "scripts/regressions/database/public-demo-baseline-candidate.regression.mjs",
  "scripts/regressions/release/public-demo-compose-reset.regression.mjs",
  "scripts/regressions/release/public-demo-reset-scheduler.regression.mjs",
  "scripts/regressions/release/public-demo-isolation.regression.mjs",
]);

const options = parseArgs(process.argv.slice(2));
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const artifact = path.resolve(
  options.artifact || `dist/longtail-forge-${packageJson.version}.tgz`,
);

if (options.list) {
  printSummary({ artifact, executed: false });
  process.exit(0);
}

for (const script of PUBLIC_DEMO_CONTRACT_SCRIPTS) {
  runNode([script], `public-demo contract ${script}`);
}

if (!options.artifact) {
  runNode([
    "scripts/build-runtime-artifact.mjs",
    "--source-branch",
    options.sourceBranch,
  ], "runtime artifact build");
}
if (!fs.existsSync(artifact)) {
  throw new Error(`Candidate artifact does not exist: ${artifact}`);
}

runNode(["scripts/runtime-artifact-smoke.mjs", "--artifact", artifact], "runtime artifact smoke");

if (options.container) {
  runNode([
    "scripts/container-deployment-smoke.mjs",
    "--artifact",
    artifact,
    ...(options.pull ? ["--pull"] : []),
  ], "supported container lifecycle smoke");
}

printSummary({ artifact, executed: true });

function runNode(args, label) {
  console.log(`[public-demo candidate] ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LTF_REGRESSION_REPEAT: "1",
    },
    stdio: "inherit",
    timeout: 900_000,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function printSummary({ artifact, executed }) {
  console.log(JSON.stringify({
    artifact: path.relative(process.cwd(), artifact).replaceAll("\\", "/"),
    containerProof: options.container,
    contractScripts: PUBLIC_DEMO_CONTRACT_SCRIPTS,
    credentialsPrinted: false,
    executed,
    ok: true,
    sourceBranch: options.sourceBranch,
  }, null, 2));
}

function parseArgs(args) {
  const parsed = {
    artifact: "",
    container: false,
    list: false,
    pull: false,
    sourceBranch: "nightly",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--container", "--list", "--pull"].includes(argument)) {
      const key = argument.slice(2);
      parsed[key] = true;
      continue;
    }
    if (["--artifact", "--source-branch"].includes(argument)) {
      const value = String(args[index + 1] || "").trim();
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      if (argument === "--artifact") parsed.artifact = value;
      else parsed.sourceBranch = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown public-demo candidate smoke option: ${argument}.`);
  }
  if (!["main", "nightly"].includes(parsed.sourceBranch)) {
    throw new Error("--source-branch must be main or nightly.");
  }
  if (parsed.pull && !parsed.container) {
    throw new Error("--pull requires --container.");
  }
  return Object.freeze(parsed);
}

export { PUBLIC_DEMO_CONTRACT_SCRIPTS, parseArgs };
