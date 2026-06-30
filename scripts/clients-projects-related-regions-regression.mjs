import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.19.2";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const clientsProjectsScript = readText("public/js/clients-projects.js");
const css = readText("public/css/longtail-forge.css");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Clients/Projects related-region version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Clients/Projects related-region version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Clients/Projects related-region version");

assert.match(
  readFunctionBody(clientsProjectsScript, "openClientDetailDialog"),
  /createRelatedProjectsRegion\(client\)/,
  "Client detail reads should mount the related Projects region",
);

const relatedRegionBody = readFunctionBody(clientsProjectsScript, "createRelatedProjectsRegion");
assert.match(relatedRegionBody, /createRelatedProjectTableList\(client, relatedProjects, options\)/, "Related Project reads should use the shared table list by default");
assert.match(relatedRegionBody, /createCollapsibleIndexPanel\(\{[\s\S]*title:\s*"Projects"/, "Related Project reads should use a framework-owned collapsible region shell");
assert.doesNotMatch(relatedRegionBody, /document\.createElement\("details"\)/, "Related Project region should not hand-build a details shell");

const relatedTableBody = readFunctionBody(clientsProjectsScript, "createRelatedProjectsDataTable");
assert.match(relatedTableBody, /createDataTable\(\{[\s\S]*Project[\s\S]*Status[\s\S]*Billing[\s\S]*Task Defaults[\s\S]*createRelatedProjectActionStrip/, "Related Project rows should render through a shared data table with module-shaped columns/actions");
assert.match(relatedTableBody, /hierarchy:\s*\{[\s\S]*depthField:\s*"depth"[\s\S]*parentField:\s*"parentProjectId"/, "Related Project table should preserve display-only hierarchy metadata");
assert.doesNotMatch(relatedTableBody, /document\.createElement\("table"\)|thead\.innerHTML/, "Related Project table should not hand-build table chrome");

assert.match(
  readFunctionBody(clientsProjectsScript, "relatedProjectRow"),
  /formatProjectBillingSummary\(client, project\)[\s\S]*formatProjectTaskDefaultsSummary\(project\)/,
  "Clients/Projects should keep related-row billing and task-default shaping module-owned",
);
assert.match(
  readFunctionBody(clientsProjectsScript, "createRelatedProjectActionStrip"),
  /createDetailActionStrip\(\{[\s\S]*openClientProjectModuleAction\("projects\.edit", \{ projectId: row\.project\.id \}\)/,
  "Related Project row actions should use framework placement with the module-owned Project editor action",
);

assert.match(
  readFunctionBody(clientsProjectsScript, "createProjectClientShortcutActions"),
  /return createProjectClientContextRegion\(project\)/,
  "Project detail client shortcuts should route through the related context region",
);
const projectContextBody = readFunctionBody(clientsProjectsScript, "createProjectClientContextRegion");
assert.match(projectContextBody, /createListShell\(\{[\s\S]*createDataTable\(\{[\s\S]*Context[\s\S]*Record[\s\S]*Actions/, "Project Client context should render through shared list and table shells");
assert.doesNotMatch(projectContextBody, /document\.createElement\("table"\)|document\.createElement\("div"\)/, "Project Client context should not hand-build related table chrome");
assert.match(
  readFunctionBody(clientsProjectsScript, "createProjectClientContextRows"),
  /type:\s*"Client"[\s\S]*openClientProjectModuleAction\("clients\.edit"[\s\S]*openClientProjectModuleAction\("clients\.add"[\s\S]*type:\s*"Parent Project"[\s\S]*openClientProjectModuleAction\("projects\.edit"/,
  "Project context rows should keep Client and parent Project actions module-owned",
);

assert.match(css, /\.client-projects-related-context\s*\{[\s\S]*grid-column:\s*1 \/ -1/, "Related Project context should stay full-width in the Project editor grid");
assert.match(css, /\.client-projects-related-region/, "Related Project regions should have shared styling hooks");
assert.match(regressionSuite, /scripts\/clients-projects-related-regions-regression\.mjs/, "Regression suite should include the Clients/Projects related-region regression");

console.log("Clients/Projects related regions regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
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
