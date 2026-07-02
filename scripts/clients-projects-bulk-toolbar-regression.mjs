import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.21.5";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const workbenchHtml = readText("views/protected/workbench.html");
const clientProjectsModule = readText("src/modules/client-projects/module.js");
const manifestContract = readText("src/core/modules/manifest-contract.js");
const viewRenderer = readText("public/js/shared/view-renderer.js");
const clientsProjectsScript = readText("public/js/clients-projects.js");
const css = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Clients/Projects bulk-toolbar version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Clients/Projects bulk-toolbar version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Clients/Projects bulk-toolbar version");
assert.match(clientProjectsModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Clients/Projects module should report this slice");

assert.match(manifestContract, /const VIEW_TABLE_FIELDS = new Set\(\["columns", "secondaryRows", "rowActions", "emptyState", "overflow", "hierarchy", "selection"\]\)/, "Manifest validation should allow descriptor table selection and secondary-row metadata");
assert.match(manifestContract, /function validateTableSelectionDescriptor\(selection, prefix, errors\)[\s\S]*recordType[\s\S]*labelField/, "Manifest validation should keep table selection shape narrow");

assert.match(viewRenderer, /function regionsForPlacement\(regions, placement\)[\s\S]*region\.placement === placement/, "Renderer should route descriptor regions by explicit placement");
assert.match(viewRenderer, /descriptor\.layout === "table-page"[\s\S]*renderRegions\(regionsForPlacement\(descriptor\.regions, "before-table"\)[\s\S]*renderTableShell/, "Table-page regions with before-table placement should render before the table");
assert.match(viewRenderer, /function renderRowSelection\(selection, view, record\)[\s\S]*data-view-row-select[\s\S]*viewRowSelectType/, "Renderer should own selectable-row checkbox anatomy and expose stable row-selection hooks");

assert.match(clientProjectsModule, /id:\s*"client-projects\.clients"[\s\S]*selection:\s*\{[\s\S]*recordType:\s*"client"[\s\S]*regions:\s*\[[\s\S]*behavior:\s*"client-projects\.clients\.bulk"[\s\S]*placement:\s*"before-table"/, "Clients descriptor should declare selectable rows and a before-table bulk toolbar region");
assert.match(clientProjectsModule, /id:\s*"client-projects\.projects"[\s\S]*selection:\s*\{[\s\S]*recordType:\s*"project"[\s\S]*regions:\s*\[[\s\S]*behavior:\s*"client-projects\.projects\.bulk"[\s\S]*placement:\s*"before-table"/, "Projects descriptor should declare selectable rows and a before-table bulk toolbar region");

assert.match(clientsProjectsScript, /registerBehavior\("client-projects\.clients\.bulk", mountClientBulkToolbar\)/, "Clients bulk region should mount through a registered module-owned behavior");
assert.match(clientsProjectsScript, /registerBehavior\("client-projects\.projects\.bulk", mountProjectBulkToolbar\)/, "Projects bulk region should mount through a registered module-owned behavior");
assert.match(
  readFunctionBody(clientsProjectsScript, "createClientBulkToolbar"),
  /createBulkActionToolbar\(\{[\s\S]*label:\s*"Bulk Changes"[\s\S]*selectedCount:\s*getSelectedClientIds\(\)\.length[\s\S]*body:\s*createClientBulkControls\(\)/,
  "Client bulk chrome should use the shared bulk toolbar shell with module-owned controls",
);
assert.match(
  readFunctionBody(clientsProjectsScript, "createProjectBulkToolbar"),
  /createBulkActionToolbar\(\{[\s\S]*label:\s*"Bulk Changes"[\s\S]*selectedCount:\s*getSelectedProjectIds\(\)\.length[\s\S]*body:\s*controls/,
  "Project bulk chrome should use the shared bulk toolbar shell with module-owned controls",
);
assert.doesNotMatch(clientsProjectsScript, /function createClientInlineBulkControls/, "Client inline bulk compatibility should not reintroduce legacy toolbar chrome");
assert.doesNotMatch(clientsProjectsScript, /function createProjectInlineBulkControls/, "Project inline bulk compatibility should not reintroduce legacy toolbar chrome");
assert.match(readFunctionBody(clientsProjectsScript, "getSelectedClientIds"), /data-view-row-select-type="client"/, "Clients bulk selected IDs should include descriptor table selections");
assert.match(readFunctionBody(clientsProjectsScript, "getSelectedProjectIds"), /data-view-row-select-type="project"/, "Projects bulk selected IDs should include descriptor table selections");
assert.match(readFunctionBody(clientsProjectsScript, "syncClientProjectsBulkToolbar"), /bulkToolbar\.open = true[\s\S]*data-view-bulk-selection-count[\s\S]*select\.disabled = selectedCount === 0/, "Bulk toolbar state should auto-open on selection, update selected count, and enable controls");
assert.match(readFunctionBody(clientsProjectsScript, "createProjectBulkControls"), /createBulkClientSelect\(\)[\s\S]*shouldChangeClient:\s*true/, "Project bulk controls should keep module-owned Client reassignment semantics");
assert.match(readFunctionBody(clientsProjectsScript, "createBulkClientSelect"), /if \(!clientsEnabledForWorkspace\(\)\) \{[\s\S]*return null/, "Project Client reassignment should stay hidden outside Business workspaces");
assert.match(readFunctionBody(clientsProjectsScript, "applyBulkProjectUpdate"), /canChangeClient = clientsEnabledForWorkspace\(\) && shouldChangeClient[\s\S]*client_id:\s*canChangeClient \? nextClientId : project\.client_id/, "Project bulk payloads should not submit Client IDs outside Business workspaces");
assert.match(readFunctionBody(clientsProjectsScript, "applyBulkProjectUpdate"), /\/api\/projects\/\$\{encodeURIComponent\(project\.id\)\}/, "Project bulk updates should keep existing granular project routes");
assert.doesNotMatch(readFunctionBody(clientsProjectsScript, "applyBulkProjectUpdate"), /\/api\/projects\/bulk|\/api\/client-projects\/bulk/, "Project bulk updates should not invent a bulk route in this slice");
assert.match(readFunctionBody(clientsProjectsScript, "applyBulkClientUpdate"), /\/api\/clients\/\$\{encodeURIComponent\(client\.id\)\}/, "Client bulk updates should keep existing granular client routes");
assert.match(readFunctionBody(clientsProjectsScript, "formatBulkResultMessage"), /could not be updated/, "Bulk updates should keep partial-failure messaging in the module adapter");
assert.match(readFunctionBody(clientsProjectsScript, "refreshClientProjectsAfterBulkUpdate"), /refreshClientProjectData\(\)[\s\S]*refreshActiveClientProjectsReadSurface\(\)/, "Descriptor bulk saves should refresh both module data and active descriptor surfaces");

assert.match(css, /\.client-projects-bulk-region\s*\{[\s\S]*background:\s*transparent/, "Bulk descriptor region should stay visually neutral around the shared toolbar");
assert.match(css, /\.view-data-table \.view-row-select\s*\{[\s\S]*width:\s*16px[\s\S]*height:\s*16px/, "Shared table selection checkboxes should have stable dimensions");
assert.match(clientsHtml, /css\/longtail-forge\.css\?v=11[\s\S]*view-renderer\.js\?v=16[\s\S]*clients-projects\.js\?v=20/, "Clients host should cache-bust CSS, renderer, and adapter for bulk toolbar conversion");
assert.match(projectsHtml, /css\/longtail-forge\.css\?v=11[\s\S]*view-renderer\.js\?v=16[\s\S]*clients-projects\.js\?v=20/, "Projects host should cache-bust CSS, renderer, and adapter for bulk toolbar conversion");
assert.match(workbenchHtml, /clients-projects\.js\?v=20/, "Workbench should load the updated Clients/Projects adapter for module-triggered actions");
assert.match(regressionSuite, /scripts\/clients-projects-bulk-toolbar-regression\.mjs/, "Regression suite should include the Clients/Projects bulk toolbar regression");

console.log("Clients/Projects bulk toolbar regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readFunctionBody(source, functionName) {
  const markers = [`function ${functionName}(`, `async function ${functionName}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? -1;
  assert.notEqual(start, -1, `${functionName} function was not found`);

  const signatureStart = source.indexOf("(", start);
  assert.notEqual(signatureStart, -1, `${functionName} function signature was not found`);

  let signatureDepth = 0;
  let signatureEnd = -1;
  for (let index = signatureStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      signatureDepth += 1;
    } else if (char === ")") {
      signatureDepth -= 1;
      if (signatureDepth === 0) {
        signatureEnd = index;
        break;
      }
    }
  }
  assert.notEqual(signatureEnd, -1, `${functionName} function signature did not close`);

  const bodyStart = source.indexOf("{", signatureEnd);
  assert.notEqual(bodyStart, -1, `${functionName} function body was not found`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  throw new Error(`${functionName} function body did not close`);
}
