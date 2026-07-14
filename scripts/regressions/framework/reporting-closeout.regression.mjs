export const regressionMeta = Object.freeze({
  id: "framework.reporting-closeout",
  area: "framework",
  tier: "focused",
  tags: ["guardrail", "navigation", "permissions", "reporting", "views"],
  description: "Locks framework Reporting permission/navigation ownership, minimal host anatomy, and first-party-module-neutral framework code.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const baseUrl = new URL("../../../", import.meta.url);
const readText = (path) => readFileSync(new URL(path, baseUrl), "utf8");
const permissionCatalog = readText("src/core/permissions/framework-permission-catalog.js");
const manifestContract = readText("src/core/modules/manifest-contract.js");
const modulesService = readText("src/core/modules/modules.service.js");
const appShell = readText("src/services/app-shell.service.js");
const reportingService = readText("src/services/reporting.service.js");
const reportingHost = readText("public/js/reporting.js");
const reportingHtml = readText("views/protected/reporting.html");
const stylesheet = readText("public/css/longtail-forge.css");
const timeTrackingModule = readText("src/modules/time-tracking/module.js");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const moduleContract = readText("docs/module-contract.md");
const viewContract = readText("docs/view-building-contract.md");

assert.match(permissionCatalog, /id: "reporting\.view"[\s\S]*moduleId: "framework"/);
for (const roleId of ["super_admin", "workspace_admin", "client_admin", "project_admin", "client_user", "project_user"]) {
  assert.match(permissionCatalog, new RegExp(`"${roleId}"`), `Framework Reporting defaults must preserve ${roleId}`);
}
assert.match(permissionCatalog, /key: "reporting"[\s\S]*moduleId: "framework"[\s\S]*operations: Object\.freeze\(\["read"\]\)/);
assert.match(manifestContract, /listFrameworkPermissionIds\(\)/, "Manifest validation must recognize framework permission IDs from their owner catalog");
assert.match(modulesService, /listPermissionEntries\(\)[\s\S]*listFrameworkPermissionEntries\(\)[\s\S]*listModulePermissionEntries\(\)/);
assert.match(modulesService, /ensurePermissionContracts\([\s\S]*listPermissionEntries\(\),[\s\S]*listRolePermissionDefaults\(\)/);

const timeTrackingPermissionSection = between(timeTrackingModule, "requiredPermissions: [", "resourceDefinitions: [");
assert.doesNotMatch(
  timeTrackingPermissionSection,
  /id: "reporting\.view"|moduleId: "time-tracking"[\s\S]*key: "reporting"/,
  "Time Tracking must not own the framework Reporting permission or resource",
);
assert.doesNotMatch(
  between(timeTrackingModule, "resourceDefinitions: [", "auditRecordTypes: ["),
  /key: "reporting"/,
  "Time Tracking resource definitions must not retain framework Reporting ownership",
);
assert.match(timeTrackingModule, /reporting: \[[\s\S]*requiredPermissions: \["reporting\.view"\]/, "Owning reports must still require framework Reporting access");

assert.match(appShell, /modulesService\.listReportingReports\(session\.workspace_id, session\)/);
assert.match(appShell, /addReportingNavigation\(reportingMenu\.items, reportingReports\)/);
assert.match(appShell, /href: `reporting\.html\?report=\$\{encodeURIComponent\(report\.reportKey\)\}`/);
assert.match(appShell, /requiredReportingReports: true/);
assert.doesNotMatch(functionBlock(appShell, "addReportingNavigation"), /time-tracking|project-time-billing|time-project-billing/);

assert.match(reportingHtml, /<main class="wide-page" data-reporting-host><\/main>/);
assert.equal((reportingHtml.match(/<main\b/g) || []).length, 1, "Reporting HTML must keep one minimal host");
assert.doesNotMatch(reportingHtml, /<h1|<form|<table|<section|<dialog|time-tracking-reporting/);
assert.doesNotMatch(stylesheet, /\.reporting-page\b/, "Reporting must not keep a one-off page layout class");

const directElementTags = [...reportingHost.matchAll(/document\.createElement\("([^"]+)"\)/g)].map((match) => match[1]);
assert.deepEqual(directElementTags, ["link", "script"], "Direct element creation is limited to permission-filtered renderer asset loading");
assert.doesNotMatch(reportingHost, /className:\s*"reporting-|surface-modal-footer|surface-page-header/);

for (const source of [reportingService, reportingHost]) {
  assert.doesNotMatch(
    source,
    /time-tracking|project-time-billing|time-project-billing|clientsService|timeEntriesService|time-tracking-reporting/,
    "Framework Reporting code must not name or import a first-party report implementation",
  );
}

assert.match(declarativeGuide, /\| Reporting \| reporting \| reporting\.html \| framework-built catalog host \| strict \|/);
assert.match(moduleContract, /As of 0\.33\.12\.7,[\s\S]*`reporting\.view` is defined by the framework permission catalog/);
assert.match(moduleContract, /0\.33\.12\.7 strict guardrail closes the Reporting conversion/);
assert.match(viewContract, /As of 0\.33\.12\.7,[\s\S]*Reporting row is a strict framework-host contract/);

console.log("Framework Reporting closeout regression passed.");

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing ${startMarker}`);
  assert.notEqual(end, -1, `Missing ${endMarker}`);
  return source.slice(start, end);
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `Missing function ${functionName}`);
  const nextFunction = source.slice(start + 1).search(/\nfunction\s+/);
  return source.slice(start, nextFunction === -1 ? source.length : start + 1 + nextFunction);
}
