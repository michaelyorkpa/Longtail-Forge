export const regressionMeta = Object.freeze({
  id: "release.public-demo-release-candidate",
  area: "release",
  tier: "release-gate",
  tags: ["artifact", "container", "demo", "deployment", "security"],
  description: "Proves the redacted exact-demo deployment profile, complete operator runbook, aggregate candidate smoke, and non-demo/interest-capture boundaries.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";

const paths = Object.freeze({
  artifact: "scripts/build-runtime-artifact.mjs",
  candidate: "scripts/release/public-demo-release-candidate-smoke.mjs",
  candidateLibrary: "scripts/lib/public-demo-baseline-candidate.mjs",
  composeExample: "docs/public-demo-compose.env.example",
  decisions: "DECISIONS.md",
  manualRelease: ".github/workflows/manual-release.yml",
  package: "package.json",
  roleJourney: "scripts/sanitized-demo-role-journey.mjs",
  runbook: "docs/public-demo-operator-runbook.md",
});
const source = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, filePath]) => [key, await fs.readFile(filePath, "utf8")]),
));

for (const contract of [
  /^LONGTAIL_IMAGE=.*@sha256:REPLACE_WITH_REVIEWED_MANIFEST_DIGEST$/m,
  /^LONGTAIL_RESTART_POLICY=no$/m,
  /^LONGTAIL_DNS_SERVER=127\.0\.0\.1$/m,
  /^LONGTAIL_DATA_VOLUME=longtail-forge-public-demo-data$/m,
  /^LONGTAIL_DOCKER_NETWORK=longtail-forge-public-demo-internal$/m,
  /^LONGTAIL_ENV=production$/m,
  /^LONGTAIL_DEPLOYMENT_MODE=compose$/m,
  /^LONGTAIL_RELEASE_BRANCH=main$/m,
  /^DEMO_MODE=true$/m,
  /^LONGTAIL_PUBLIC_URL=https:\/\/demo\.longtailforge\.com$/m,
  /^LONGTAIL_STORAGE_PROVIDER=local$/m,
  /^LONGTAIL_WORKER_MODE=inline$/m,
  /^LONGTAIL_SUPPORT_VIEW_ENABLED=false$/m,
  /^LONGTAIL_FILE_SCANNER=clamd$/m,
  /^SUPER_ADMIN_USERNAME=role-super-admin@example\.test$/m,
  /^SUPER_ADMIN_DISPLAY_NAME=Role Fixture Super Administrator$/m,
]) assert.match(source.composeExample, contract);
assert.doesNotMatch(source.composeExample, /LONGTAIL_(?:S3|SMTP)|MAILCHIMP|POSTHOG|PLAUSIBLE|SENTRY_DSN/);

for (const phrase of [
  "private installation Super Administrator",
  "six shared visitor accounts",
  "DEMO_MODE=false",
  "operation lock",
  "maintenance curtain",
  "short\\s+unavailable window",
  "whole-instance backup",
  "336 records",
  "seven days",
  "incident",
  "last-known-good",
  "Do not publish the URL",
]) assert.match(source.runbook, new RegExp(phrase, "i"));
for (const capability of ["analytics", "feedback", "interest capture", "outbound", "Files ingress"]) {
  assert.match(source.runbook, new RegExp(capability, "i"));
}

const requiredContracts = [
  "public-demo-account-catalog.regression.mjs",
  "public-demo-role-journey.regression.mjs",
  "public-demo-identity-immutability.regression.mjs",
  "public-demo-files-ingress.regression.mjs",
  "public-demo-capability-enforcement.regression.mjs",
  "public-demo-budgets.regression.mjs",
  "public-demo-cross-role-content-safety.regression.mjs",
  "public-demo-perimeter.regression.mjs",
  "public-demo-baseline-candidate.regression.mjs",
  "public-demo-compose-reset.regression.mjs",
  "public-demo-reset-scheduler.regression.mjs",
  "public-demo-isolation.regression.mjs",
];
for (const contract of requiredContracts) {
  assert.match(source.candidate, new RegExp(contract.replaceAll(".", "\\.")));
}
assert.match(source.candidate, /scripts\/runtime-artifact-smoke\.mjs/);
assert.match(source.candidate, /scripts\/container-deployment-smoke\.mjs/);
assert.match(source.candidate, /credentialsPrinted: false/);
assert.match(source.roleJourney, /api\.get\("\/healthz"\)/);
assert.match(source.roleJourney, /api\.get\("\/readyz"\)/);
assert.match(source.roleJourney, /api\.get\("\/api\/app-info"\)/);

const list = spawnSync(process.execPath, [paths.candidate, "--list"], {
  encoding: "utf8",
  timeout: 30_000,
});
assert.equal(list.status, 0, /** @type {string} */ (list.stderr || list.stdout || list.error));
const summary = JSON.parse(list.stdout.slice(list.stdout.lastIndexOf("\n{") + 1));
assert.equal(summary.ok, true);
assert.equal(summary.executed, false);
assert.equal(summary.credentialsPrinted, false);
assert.equal(summary.contractScripts.length, requiredContracts.length);

assert.match(source.package, /"demo:release-candidate:smoke": "node scripts\/release\/public-demo-release-candidate-smoke\.mjs"/);
for (const releaseAsset of [paths.composeExample, paths.runbook]) {
  assert.match(source.artifact, new RegExp(releaseAsset.replaceAll(".", "\\.")));
  assert.match(source.manualRelease, new RegExp(releaseAsset.replaceAll(".", "\\.")));
}
assert.match(source.candidateLibrary, /PROTECTED_TABLE_PATTERN = \/\(analytics\|feedback\|interest\)\/i/);
assert.match(source.candidateLibrary, /contains analytics, feedback, or interest-capture persistence/);
console.log("Public-demo repository release candidate regression passed.");
