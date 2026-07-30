import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const options = parseOptions(process.argv.slice(2));

const stages = [
  {
    id: "host-assets",
    label: "root-owned page, helper, and independent markers",
    args: ["scripts/regressions/release/maintenance-host-assets.regression.mjs"],
  },
  {
    id: "direct-caddy",
    label: "direct Caddy maintenance and upstream-failure routing",
    args: [
      "scripts/reference-caddy-security-smoke.mjs",
      ...(options.caddy ? ["--caddy", options.caddy] : []),
    ],
  },
  {
    id: "bounded-nginx-caddy",
    label: "real Nginx, private Caddy, and transport-failure routing",
    args: [
      "scripts/reference-caddy-security-smoke.mjs",
      "--topology",
      "multi-proxy",
      ...(options.caddy ? ["--caddy", options.caddy] : []),
      ...(options.nginx ? ["--nginx", options.nginx] : []),
      ...(options.openssl ? ["--openssl", options.openssl] : []),
    ],
  },
  {
    id: "deploy-rollback-recovery",
    label: "deploy, failed-candidate recovery, rollback, and stale-state recovery",
    args: ["scripts/regressions/release/deploy-maintenance-curtain.regression.mjs"],
  },
];

if (options.plan) {
  console.log("Longtail Forge maintenance release rehearsal plan");
  console.log("Required platform: native Linux");
  console.log("Required executables: Node.js, Caddy 2, Nginx, OpenSSL");
  for (const [index, stage] of stages.entries()) {
    console.log(`${index + 1}. ${stage.id}: ${stage.label}`);
  }
  process.exit(0);
}

if (process.platform !== "linux") {
  throw new Error(
    "The complete maintenance release rehearsal requires native Linux. Run with --plan to inspect it, or use the clean-Ubuntu pull-request job/Docker Linux rehearsal.",
  );
}

console.log("Starting the complete Longtail Forge maintenance release rehearsal.");
for (const stage of stages) {
  const started = performance.now();
  console.log(`\n[maintenance-rehearsal:${stage.id}] starting: ${stage.label}`);
  const result = spawnSync(process.execPath, stage.args, {
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  const seconds = (performance.now() - started) / 1000;
  if (result.status !== 0) {
    console.error(
      `[maintenance-rehearsal:${stage.id}] failed in ${seconds.toFixed(2)}s; later stages were not run.`,
    );
    process.exit(result.status ?? 1);
  }
  console.log(`[maintenance-rehearsal:${stage.id}] passed in ${seconds.toFixed(2)}s.`);
}

console.log(
  "\nMaintenance release rehearsal passed: marker toggles, direct and bounded proxy ownership, deploy recovery, rollback, and stale-state recovery all completed without proxy reload.",
);

function parseOptions(args) {
  const parsed = {
    plan: false,
    caddy: "",
    nginx: "",
    openssl: "",
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--plan") {
      parsed.plan = true;
      continue;
    }
    const key = {
      "--caddy": "caddy",
      "--nginx": "nginx",
      "--openssl": "openssl",
    }[argument];
    if (!key) {
      throw new Error(
        "Usage: node scripts/release/rehearse-maintenance-boundary.mjs [--plan] [--caddy <path>] [--nginx <path>] [--openssl <path>]",
      );
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires an executable path.`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}
