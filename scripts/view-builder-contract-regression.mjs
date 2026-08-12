import { escapeRegExp } from "./test-support/source-scan.mjs";
import assert from "node:assert/strict";

import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const changelog = readText("CHANGELOG.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");

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
  "Field factory",
  "Field grid",
  "Typed field-value collector",
  "Inline item/action row",
]) {
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

assert.match(changelog, /## Version 0\.33\.5\.15\.1 - /, "Changelog should include the view-building contract version");

console.log("View builder contract regression passed.");
