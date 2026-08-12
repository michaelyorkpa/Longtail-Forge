export const regressionMeta = Object.freeze({
  id: "release.typescript-seam-branch-closeout",
  area: "release",
  tier: "release-gate",
  tags: ["closeout", "contracts", "docs", "release", "typecheck"],
  description: "Proves the complete 0.33.32 checked-seam branch is archived once, retains auditable correction evidence, and hands off every residual to an executable or explicit future owner.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

const [
  roadmap,
  archive,
  changelog,
  decisions,
  architecture,
  moduleDevelopment,
  regressionSuite,
  todo,
  manifest,
  honesty,
  seamInventory,
  renderedDescriptorSpec,
  playwrightConfig,
] = await Promise.all([
  read("ROADMAP.md"),
  read("ROADMAP-ARCHIVE.md"),
  read("CHANGELOG.md"),
  read("DECISIONS.md"),
  read("docs/architecture.md"),
  read("docs/module-development.md"),
  read("docs/regression-suite.md"),
  read("TODO.md"),
  readJson("scripts/regression-coverage-manifest.json"),
  readJson("scripts/typecheck-honesty-inventory.json"),
  readJson("scripts/typecheck-seam-inventory.json"),
  read("tests/e2e/client-projects-restricted-descriptor.spec.mjs"),
  read("playwright.config.js"),
]);

const FINAL_SLICE = ["0", "33", "32", "45"].join(".");
const EXPECTED_SLICES = [
  "0.33.32.1",
  "0.33.32.2",
  "0.33.32.2.1",
  "0.33.32.3",
  "0.33.32.4",
  "0.33.32.5",
  "0.33.32.6",
  "0.33.32.7",
  "0.33.32.8",
  "0.33.32.9",
  "0.33.32.10",
  "0.33.32.11",
  "0.33.32.12",
  "0.33.32.13",
  "0.33.32.14",
  "0.33.32.15",
  "0.33.32.16",
  "0.33.32.17",
  "0.33.32.18",
  "0.33.32.19",
  "0.33.32.20",
  "0.33.32.21",
  "0.33.32.22",
  "0.33.32.23",
  "0.33.32.24",
  "0.33.32.25",
  "0.33.32.26",
  "0.33.32.27",
  "0.33.32.28",
  "0.33.32.29",
  "0.33.32.30",
  "0.33.32.31",
  "0.33.32.32",
  "0.33.32.33",
  "0.33.32.34",
  "0.33.32.35",
  "0.33.32.36",
  "0.33.32.37",
  "0.33.32.38",
  "0.33.32.38.1",
  "0.33.32.39",
  "0.33.32.40",
  "0.33.32.41",
  "0.33.32.42",
  "0.33.32.43",
  "0.33.32.44",
  FINAL_SLICE,
];

assertRoadmapCursorAtLeast("0.33.33", "the completed TypeScript seam branch must hand off to the public-demo analytics branch");
assert.doesNotMatch(roadmap, /^## Version 0\.33\.32(?:\s|\.)/m, "the live roadmap must not retain completed 0.33.32 sections");
assert.match(archive, /^## Version 0\.33\.32 - TypeScript Seam Expansion$/m, "the archive must retain the branch-level contract");

const archivedSliceHeadings = archive
  .split(/\r?\n/)
  .map((line) => line.match(/^## Version (0\.33\.32(?:\.\d+)+(?:\.\d+)?)\b/)?.[1])
  .filter(Boolean);
for (const version of EXPECTED_SLICES) {
  assert.equal(
    archivedSliceHeadings.filter((candidate) => candidate === version).length,
    1,
    `${version} must appear exactly once as an archived slice`,
  );
  const section = readArchivedSlice(version);
  assert.doesNotMatch(section, /- \[ \]/, `${version} must not retain unchecked acceptance work`);
  assert.match(section, /Acceptance criteria:/, `${version} must retain acceptance criteria`);
}

assert.equal(seamInventory.checkedFiles.length, 150);
assert.equal(honesty.checkedProgram.optedInFiles, 150);
assert.equal(honesty.checkedProgram.errors, 0);
assert.ok(honesty.strictServerAndTestProbe.errors <= 864);
assert.ok(honesty.strictServerAndTestProbe.files <= 90);
assert.ok(honesty.strictPublicBrowserProbe.errors <= 11134);
assert.ok(honesty.strictPublicBrowserProbe.files <= 69);

const regressionIds = new Set(manifest.regressions.map((entry) => entry.id));
for (const id of [
  "database.backup-archive-portability",
  "framework.http-error-contract",
  "framework.session-revocation",
  "framework.typecheck-honesty-inventory",
  "framework.typecheck-seams",
  "jobs.job-worker-shutdown-rejection",
  "legacy.view.descriptor.declarative",
  "legacy.work.resume.state.api",
  "permissions.client-child-create-scope",
  "permissions.permission-resource-types",
  "time-tracking.active-timer-duration-consistency",
  "time-tracking.billing-dashboard-timezone-boundaries",
  "time-tracking.public-api-duration-persistence",
  "time-tracking.sourced-task-timer-bridge",
]) {
  assert.ok(regressionIds.has(id), `branch-completion behavior owner ${id} must remain registered`);
}

for (const evidence of [
  "077f9c8f",
  "primaryAction: null",
  "49af0cc4",
  "revokeAllForUser",
  "012152ed",
  "TypeError",
  "a361c0ed",
  "error.code = \"\"",
  "f61dd417",
  "absolute Windows drive-letter archive",
]) {
  assert.ok(readArchivedSlice(FINAL_SLICE).includes(evidence), `slice 45 must retain pre-fix evidence: ${evidence}`);
}

assert.match(renderedDescriptorSpec, /permission-restricted Clients and Projects descriptors render without unavailable primary actions/);
assert.match(renderedDescriptorSpec, /super-admin Clients and Projects descriptors retain their primary actions/);
assert.match(playwrightConfig, /name: "desktop"/);
assert.match(playwrightConfig, /name: "mobile"/);

for (const deferredOwner of [
  "Notes -> Lists -> Tasks -> Clients/Projects",
  "src/services/files.service.js",
  "checked element-lookup helper",
  "192 strict test-only errors",
  "JobExecutionRecord`/`JobHandlerContext` payload `any` terminals",
]) {
  assert.ok(todo.includes(deferredOwner), `TODO must retain the intentional TypeScript deferral: ${deferredOwner}`);
}

for (const source of [decisions, architecture, moduleDevelopment, regressionSuite]) {
  assert.match(source, /0\.33\.32\.45/, "each owning contract document must retain the final branch-closeout record");
}
assert.match(changelog, /^## Version 0\.33\.32\.45 - 2026-08-12$/m);

console.log("0.33.32 TypeScript seam branch closeout regression passed.");

function readArchivedSlice(version) {
  const heading = `## Version ${version} -`;
  const sectionStart = archive.indexOf(heading);
  assert.notEqual(sectionStart, -1, `${version} must have an archived section`);
  const nextSectionStart = archive.indexOf("\n## Version ", sectionStart + heading.length);
  return archive.slice(sectionStart, nextSectionStart === -1 ? undefined : nextSectionStart);
}

function read(path) {
  return fs.readFile(path, "utf8");
}

async function readJson(path) {
  return JSON.parse(await read(path));
}
