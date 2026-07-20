export const regressionMeta = Object.freeze({
  id: "release.maintainability-closeout",
  area: "release",
  tier: "release-gate",
  tags: ["architecture", "closeout", "database", "docs", "modules", "startup", "views"],
  description: "Pins the 0.33.18 maintainability boundary evidence and its retained manifest, startup, loading, coverage, and roadmap proof owners.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const architecture = await read("docs/architecture.md");
const moduleDevelopment = await read("docs/module-development.md");
const uiLayout = await read("docs/ui-layout-guide.md");
const database = await read("docs/database.md");
const regressionSuite = await read("docs/regression-suite.md");
const roadmap = await read("ROADMAP.md");
const roadmapArchive = await read("ROADMAP-ARCHIVE.md");
const changelog = await read("CHANGELOG.md");
const policy = JSON.parse(await read("scripts/regression-coverage-exceptions.json"));
const bundledGate = await read("scripts/regressions/framework/bundled-module-registry.regression.mjs");
const startupGate = await read("scripts/regressions/database/startup-maintenance-lifecycle.regression.mjs");
const loadingGate = await read("scripts/regressions/views/dashboard-es-module-entry.regression.mjs");

assertRoadmapCursorAtLeast("0.33.19", "0.33.18 closeout should advance the live roadmap cursor");
assert.doesNotMatch(roadmap, /### Version 0\.33\.18\.8 - Maintainability closeout/);
assert.match(roadmapArchive, /## Version 0\.33\.18\.8 - Maintainability closeout/);
assert.match(changelog, /## Version 0\.33\.18\.8 - 2026-07-20/);

for (const phrase of [
  "0.33.18 Maintainability Boundary Evidence",
  "All eight repository-owned first-party modules consume the same entry and validation contract",
  "Tasks and Notes are the two real consumers",
  "Tasks and Time Tracking are the two real module consumers",
  "temporary Dashboard page-local compatibility mechanism",
  "Explicit framework-wide database/startup/data-integrity exception",
  "Explicit framework-wide release/tooling exception",
]) {
  assert.ok(architecture.includes(phrase), `architecture should retain closeout evidence: ${phrase}`);
}

assert.match(moduleDevelopment, /all eight bundled modules consume the canonical entry\/catalog contract[\s\S]*Tasks and Notes consume concern composition[\s\S]*Tasks and Time Tracking consume Dashboard contribution asset loading/);
assert.match(moduleDevelopment, /`LongtailForge\.esModuleBridge` remains Dashboard page-local compatibility machinery/);
assert.match(uiLayout, /Dashboard native entry and `LongtailForge\.esModuleBridge` are page-local transition machinery[\s\S]*Tasks and Time Tracking are the two real consumers/);
assert.match(database, /explicit Two-Module Rule exception[\s\S]*App bootstrap and separate-worker readiness are the two execution hosts/);
assert.match(regressionSuite, /through 0\.33\.18\.8[\s\S]*380 scripts and protects 41 release-gate entries/);
assert.match(regressionSuite, /Twenty obsolete current-package-document assertions/);

for (const gateId of [
  "database.startup-maintenance-lifecycle",
  "framework.bundled-module-registry",
  "framework.express-5-http-contract",
  "release.fast-check-pipeline",
  "release.maintainability-closeout",
  "views.dashboard-es-module-entry",
]) {
  assert.ok(policy.requiredReleaseGateIds.includes(gateId), `${gateId} should remain a required release gate`);
}

assert.match(bundledGate, /EXPECTED_INVENTORY_SHA256 = "df4f8e6f95dc595e7c0106adb3dcf79f90c38407f419875306184e780d5df3fc"/);
assert.match(bundledGate, /repository-file:/, "the frozen inventory should normalize repository file URLs across operating systems");
assert.match(bundledGate, /module and contribution inventory matches the pre-conversion baseline/);
assert.match(bundledGate, /module entry import is side-effect free and explicit app activation restores behavior/);
assert.match(startupGate, /fresh startup should preserve the declared dependency order/);
assert.match(startupGate, /completed versioned repairs should not repeat on later boots/);
assert.match(startupGate, /PRAGMA integrity_check/);
assert.match(loadingGate, /versioned local compatibility imports/);
assert.match(loadingGate, /loadedScripts\\\.set/);
assert.match(loadingGate, /aria-pressed/);
assert.match(loadingGate, /returnFocusTo: trigger/);

console.log("0.33.18 maintainability closeout regression passed.");

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}
