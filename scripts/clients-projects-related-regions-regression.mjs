import assert from "node:assert/strict";

import { createProjectTextReader, extractFunctionBody } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const clientsProjectsScript = readText("public/js/clients-projects.js");
const css = readText("public/css/longtail-forge.css");

assert.match(
  extractFunctionBody(clientsProjectsScript, "openClientDetailDialog"),
  /createRelatedProjectsRegion\(client\)/,
  "Client detail reads should mount the related Projects region",
);

const relatedRegionBody = extractFunctionBody(clientsProjectsScript, "createRelatedProjectsRegion");
assert.match(relatedRegionBody, /createRelatedProjectTableList\(client, relatedProjects, options\)/, "Related Project reads should use the shared table list by default");
assert.match(relatedRegionBody, /createCollapsibleIndexPanel\(\{[\s\S]*title:\s*"Projects"/, "Related Project reads should use a framework-owned collapsible region shell");
assert.doesNotMatch(relatedRegionBody, /document\.createElement\("details"\)/, "Related Project region should not hand-build a details shell");

const relatedTableBody = extractFunctionBody(clientsProjectsScript, "createRelatedProjectsDataTable");
assert.match(relatedTableBody, /createDataTable\(\{[\s\S]*Project[\s\S]*Status[\s\S]*Billing[\s\S]*Task Defaults[\s\S]*createRelatedProjectActionStrip/, "Related Project rows should render through a shared data table with module-shaped columns/actions");
assert.match(relatedTableBody, /hierarchy:\s*\{[\s\S]*depthField:\s*"depth"[\s\S]*parentField:\s*"parentProjectId"/, "Related Project table should preserve display-only hierarchy metadata");
assert.doesNotMatch(relatedTableBody, /document\.createElement\("table"\)|thead\.innerHTML/, "Related Project table should not hand-build table chrome");

assert.match(
  extractFunctionBody(clientsProjectsScript, "relatedProjectRow"),
  /formatProjectBillingSummary\(client, project\)[\s\S]*formatProjectTaskDefaultsSummary\(project\)/,
  "Clients/Projects should keep related-row billing and task-default shaping module-owned",
);
assert.match(
  extractFunctionBody(clientsProjectsScript, "createRelatedProjectActionStrip"),
  /createDetailActionStrip\(\{[\s\S]*openClientProjectModuleAction\("projects\.edit", \{ projectId: row\.project\.id \}\)/,
  "Related Project row actions should use framework placement with the module-owned Project editor action",
);

assert.match(
  extractFunctionBody(clientsProjectsScript, "createProjectClientShortcutActions"),
  /return createProjectClientContextRegion\(project\)/,
  "Project detail client shortcuts should route through the related context region",
);
const projectContextBody = extractFunctionBody(clientsProjectsScript, "createProjectClientContextRegion");
assert.match(projectContextBody, /createListShell\(\{[\s\S]*createDataTable\(\{[\s\S]*Context[\s\S]*Record[\s\S]*Actions/, "Project Client context should render through shared list and table shells");
assert.doesNotMatch(projectContextBody, /document\.createElement\("table"\)|document\.createElement\("div"\)/, "Project Client context should not hand-build related table chrome");
assert.match(
  extractFunctionBody(clientsProjectsScript, "createProjectClientContextRows"),
  /openClientProjectModuleAction\("clients\.add"[\s\S]*type:\s*"Client"[\s\S]*openClientProjectModuleAction\("clients\.edit"[\s\S]*type:\s*"Parent Project"[\s\S]*openClientProjectModuleAction\("projects\.edit"/,
  "Project context rows should keep Client and parent Project actions module-owned",
);

assert.match(css, /\.client-projects-related-context\s*\{[\s\S]*grid-column:\s*1 \/ -1/, "Related Project context should stay full-width in the Project editor grid");
assert.match(css, /\.client-projects-related-region/, "Related Project regions should have shared styling hooks");

console.log("Clients/Projects related regions regression passed.");
