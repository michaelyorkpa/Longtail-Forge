export const regressionMeta = Object.freeze({
  id: "release.maintenance-release-rehearsal",
  area: "release",
  tier: "release-gate",
  tags: ["deployment", "docs", "maintenance", "proxy", "recovery"],
  description: "Pins the complete native-Linux maintenance release rehearsal, operator response matrix, documentation ownership, and historical staging retirement.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

const paths = {
  changelog: "CHANGELOG.md",
  decisions: "DECISIONS.md",
  developmentWorkflow: "docs/development/github-workflow.md",
  docsOwnership: "docs/docs-ownership.json",
  internetDeployment: "docs/internet-deployment.md",
  package: "package.json",
  previewDeployment: "docs/preview-deployment.md",
  privateReadiness: "docs/private-preview-readiness.md",
  proxySmoke: "scripts/reference-caddy-security-smoke.mjs",
  regressionSuite: "docs/regression-suite.md",
  roadmapArchive: "ROADMAP-ARCHIVE.md",
  releasing: "docs/releasing.md",
  rehearsal: "scripts/release/rehearse-maintenance-boundary.mjs",
  upgrading: "docs/upgrading.md",
  workflow: ".github/workflows/development-pr.yml",
};
const content = Object.fromEntries(
  Object.entries(paths).map(([key, value]) => [key, readFileSync(value, "utf8")]),
);
const packageJson = JSON.parse(content.package);

assert.equal(
  packageJson.scripts["maintenance:rehearse"],
  "node scripts/release/rehearse-maintenance-boundary.mjs",
);
assert.deepEqual(packageJson.allowScripts, {
  "better-sqlite3@13.0.1": true,
}, "clean installs should approve only the pinned native SQLite lifecycle");

for (const requirement of [
  /maintenance-host-assets\.regression\.mjs/,
  /reference-caddy-security-smoke\.mjs/,
  /"--topology",\s*"multi-proxy"/,
  /deploy-maintenance-curtain\.regression\.mjs/,
  /process\.platform !== "linux"/,
  /later stages were not run/,
  /without proxy reload/,
]) {
  assert.match(content.rehearsal, requirement);
}
assert.match(
  content.proxySmoke,
  /fs\.mkdir\(path\.join\(fixtureRoot, "files"\), \{ recursive: true, mode: 0o700 \}\)/,
  "the Linux production fixture must pre-create local Files storage as owner-only",
);
for (const nginxTempPath of ["client_body", "fastcgi", "proxy", "scgi", "uwsgi"]) {
  assert.match(
    content.proxySmoke,
    new RegExp(`${nginxTempPath}_temp_path`),
    `the unprivileged Nginx fixture should redirect ${nginxTempPath} temp state`,
  );
}

const plan = spawnSync(process.execPath, [paths.rehearsal, "--plan"], {
  encoding: "utf8",
  windowsHide: true,
});
assert.equal(plan.status, 0, plan.stderr);
for (const requirement of [
  /Required platform: native Linux/,
  /host-assets/,
  /direct-caddy/,
  /bounded-nginx-caddy/,
  /deploy-rollback-recovery/,
]) {
  assert.match(plan.stdout, requirement);
}

assert.match(content.workflow, /name: Complete maintenance release rehearsal/);
assert.match(content.workflow, /run: npm run maintenance:rehearse/);
assert.doesNotMatch(content.workflow, /run: npm run proxy:smoke:multi/);

for (const document of [
  content.internetDeployment,
  content.previewDeployment,
  content.releasing,
  content.upgrading,
  content.developmentWorkflow,
  content.privateReadiness,
]) {
  assert.match(document, /npm run maintenance:rehearse/);
  assert.match(document, /private operational record/i);
}

for (const owner of [
  /Normal application traffic[\s\S]*Node/,
  /Operator or deployment maintenance[\s\S]*private Caddy/,
  /Node down[\s\S]*private Caddy/,
  /Private Caddy or WireGuard transport down[\s\S]*public Nginx/i,
  /Public Nginx down[\s\S]*no HTTP response/i,
  /Failed deploy or rollback[\s\S]*deployment helper/i,
  /Verified recovery[\s\S]*selected Node release/i,
]) {
  assert.match(content.internetDeployment, owner);
}

assert.match(content.previewDeployment, /archive\/maintenance-mode\/.*historical.*must not be installed/i);
assert.match(content.previewDeployment, /Never run uninstall by deleting a marker tree/i);

assert.match(content.docsOwnership, /rehearse-maintenance-boundary/);
assert.match(content.docsOwnership, /maintenance-mode\//);
assert.match(content.docsOwnership, /2026-07-18-preview-real-ip-and-maintenance-mode/);
assert.match(content.regressionSuite, /415 discovered scripts/);
assert.match(content.regressionSuite, /53 required release-gate entries/);
assert.match(content.decisions, /As of 0\.33\.24\.7/);
assert.match(content.decisions, /As of 0\.33\.24\.8[\s\S]*operator markers are therefore `0664`[\s\S]*deployment markers are `0644`/);
assert.match(content.previewDeployment, /operator marker as `0664`[\s\S]*deployment marker as `0644`/);
assert.match(content.regressionSuite, /As of 0\.33\.24\.8[\s\S]*distinct-service-account marker read boundary/);
assert.match(content.decisions, /As of 0\.33\.24\.9[\s\S]*topic branch -> protected `nightly` pull request[\s\S]*manual full-main-SHA preview dispatch/);
assert.match(content.privateReadiness, /^## 0\.33\.24\.9 Maintenance Boundary Release Evidence$/m);
assert.match(content.privateReadiness, /technical completion does not authorize invitations/i);
assert.match(content.regressionSuite, /As of 0\.33\.24\.9[\s\S]*login-limit `429`[\s\S]*HSTS[\s\S]*`nosniff`/);
assert.match(content.roadmapArchive, /^## Version 0\.33\.24\.9 - Preview rollout, cross-host proof, and branch closeout$/m);
assert.match(content.changelog, /^## Version 0\.33\.24\.9 - 2026-07-30$/m);
assertRoadmapCursorAtLeast("0.33.25.1");

console.log("Maintenance release rehearsal and operator handoff regression passed.");
