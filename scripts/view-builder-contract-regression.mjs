import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const roadmap = `${readText("ROADMAP.md")}\n${readText("ROADMAP-ARCHIVE.md")}`;
const decisions = readText("DECISIONS.md");
const changelog = readText("CHANGELOG.md");
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, "0.33.5.17.2", "package.json should report the current app version");
assert.equal(packageLock.version, "0.33.5.17.2", "package-lock root should report the current app version");
assert.equal(packageLock.packages[""].version, "0.33.5.17.2", "package-lock package entry should report the current app version");

for (const item of [
  "Inventory hard-coded view construction in current protected views and module browser scripts.",
  "Identify repeated patterns across Lists, Clients/Projects, Tasks, Notes, Files, Help, Workbench, Dashboard, and future Reporting.",
  "Document what the framework owns versus what modules own.",
  "Do not change module APIs, database schema, permissions, or business workflows in this slice.",
  "Add developer documentation explaining how modules adopt framework view primitives.",
]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] ${escapeRegExp(item)}`), `Roadmap item should be checked: ${item}`);
}

for (const primitive of [
  "Page header",
  "Status message",
  "Empty state",
  "Filter panel",
  "Collapsible selector/index panel",
  "Split list/detail workspace",
  "Data table with overflow wrapper",
  "Detail header",
  "Detail metadata/badge row",
  "Detail action strip",
  "Summary/info panel",
  "Modal shell",
  "Modal form",
  "Modal footer/action groups",
  "Field grid",
  "Inline item/action row",
]) {
  assert.match(roadmap, new RegExp(`- \\[x\\] ${escapeRegExp(primitive)}`), `Primitive should be checked in roadmap: ${primitive}`);
  assert.match(viewContract, new RegExp(escapeRegExp(primitive)), `Primitive should be documented: ${primitive}`);
}

for (const surface of [
  "Lists",
  "Clients/Projects",
  "Tasks",
  "Notes",
  "Files",
  "Help",
  "Workbench",
  "Dashboard",
  "Reporting",
  "Admin and Settings",
]) {
  assert.match(viewContract, new RegExp(`\\| ${escapeRegExp(surface)} \\|`), `Inventory should include ${surface}`);
}

assert.match(viewContract, /As of 0\.33\.5\.15\.6/, "View contract should report the current helper version");
assert.match(viewContract, /window\.LongtailForge\.view/, "View contract should define the framework namespace");
assert.match(viewContract, /no virtual DOM, state manager, component lifecycle, router, build step, or frontend framework/i, "View contract should keep the helper small");
assert.match(viewContract, /does not change module APIs, database schema, permissions, or business workflows/i, "View contract should preserve the implementation boundary");
assert.match(viewContract, /Modules own data loading, state decisions, validation, API calls, save payloads, route permissions, record labels, module-specific fields, and workflow behavior/, "View contract should keep module behavior ownership explicit");

assert.match(moduleContract, /Framework-owned view-building primitives live in `docs\/view-building-contract\.md`/, "Module contract should link the view-building contract");
assert.match(moduleContract, /LongtailForge\.view/, "Module contract should name the view helper namespace");
assert.match(moduleDevelopment, /## View-Building Helpers/, "Module development guide should include view-building helper guidance");
assert.match(moduleDevelopment, /docs\/view-building-contract\.md/, "Module development guide should link the view-building contract");
assert.match(moduleDevelopment, /LongtailForge\.view/, "Module development guide should name the view helper namespace");

assert.match(decisions, /## Version 0\.33\.5\.15\.1/, "Decisions should include the view-building contract version");
assert.match(decisions, /View-building helpers will live under `LongtailForge\.view`/, "Decisions should record the helper namespace");
assert.match(changelog, /## Version 0\.33\.5\.15\.1 - /, "Changelog should include the view-building contract version");
assert.match(regressionSuite, /scripts\/view-builder-contract-regression\.mjs/, "Regression suite should include the view-builder contract regression");

console.log("View builder contract regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
