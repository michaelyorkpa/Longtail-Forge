import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listModules } from "../src/core/modules/registry.js";
import { listFrameworkViewSurfaces } from "../src/core/view-surfaces/framework-view-surfaces.js";

const appVersion = "0.33.5.21.0.5";
const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const listsModule = readText("src/modules/lists/module.js");
const notesModule = readText("src/modules/notes/module.js");
const tasksModule = readText("src/modules/tasks/module.js");
const clientProjectsModule = readText("src/modules/client-projects/module.js");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const declarativeGuide = readText("docs/declarative-view-surfaces.md");
const viewContract = readText("docs/view-building-contract.md");
const moduleContract = readText("docs/module-contract.md");
const moduleDevelopment = readText("docs/module-development.md");
const surfaceContract = readText("docs/ui-surface-contract.md");
const filesInventory = readText("docs/files-strict-guardrail-inventory.md");
const tasksInventory = readText("docs/tasks-strict-guardrail-inventory.md");
const clientsProjectsInventory = readText("docs/clients-projects-strict-guardrail-inventory.md");
const declarativeGuardrailRegression = readText("scripts/view-descriptor-declarative-guardrails.mjs");
const regressionSuite = readText("scripts/regression-suite.mjs");

const strictSurfaceIds = [
  "client-projects.clients",
  "client-projects.projects",
  "files.browse",
  "lists.workspace",
  "notes.workspace",
  "tasks.workspace",
];
const strictSurfaceIdsInCloseoutOrder = [
  "lists.workspace",
  "notes.workspace",
  "tasks.workspace",
  "files.browse",
  "client-projects.clients",
  "client-projects.projects",
];

assert.equal(packageJson.version, appVersion, "package.json should report the branch closeout version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the branch closeout version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the branch closeout version");
assert.match(listsModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Lists module should track the current app version");
assert.match(notesModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Notes module should track the current app version");
assert.match(tasksModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Tasks module should track the current app version");
assert.match(clientProjectsModule, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Clients/Projects module should track the current app version");

const surfaces = [
  ...listModules().flatMap((moduleDefinition) => moduleDefinition.viewSurfaces || []),
  ...listFrameworkViewSurfaces(),
];
for (const surfaceId of strictSurfaceIds) {
  assert.ok(surfaces.some((surface) => surface.id === surfaceId), `${surfaceId} should remain registered`);
  assert.match(
    declarativeGuardrailRegression,
    new RegExp(escapeRegExp(`"${surfaceId}"`)),
    `${surfaceId} should be named in the strict declarative guardrail regression`,
  );
}

assertMinimalHost("views/protected/lists.html", /<main class="wide-page lists-page" data-lists-host><\/main>/);
assertMinimalHost("views/protected/notes.html", /<main class="wide-page notes-page" data-notes-host><\/main>/);
assertMinimalHost("views/protected/tasks.html", /<main class="wide-page tasks-page" data-tasks-host><\/main>/);
assertMinimalHost("views/protected/files.html", /<main class="wide-page files-page" data-files-host><\/main>/);
assertMinimalHost("views/protected/clients.html", /<main class="wide-page client-projects-page clients-page" data-client-projects-host><\/main>/);
assertMinimalHost("views/protected/projects.html", /<main class="wide-page client-projects-page projects-page" data-client-projects-host><\/main>/);

assertHostScripts("views/protected/lists.html", [/view-builder\.js\?v=5/, /view-renderer\.js\?v=6/, /lists\.js\?v=13/]);
assertHostScripts("views/protected/notes.html", [/view-builder\.js\?v=11/, /view-renderer\.js\?v=12/, /notes\.js\?v=69/]);
assertHostScripts("views/protected/tasks.html", [/view-builder\.js\?v=16/, /view-renderer\.js\?v=13/, /task-dialog\.js\?v=21/, /tasks\.js\?v=21/]);
assertHostScripts("views/protected/files.html", [/view-builder\.js\?v=16/, /view-renderer\.js\?v=13/, /files\.js\?v=13/]);
assertHostScripts("views/protected/clients.html", [/view-builder\.js\?v=5/, /view-renderer\.js\?v=16/, /clients-projects\.js\?v=20/]);
assertHostScripts("views/protected/projects.html", [/view-builder\.js\?v=5/, /view-renderer\.js\?v=16/, /clients-projects\.js\?v=20/]);

assert.match(roadmap, /Completed 0\.33\.5\.18\.15 is archived/, "Roadmap should mark the branch closeout complete");
assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "Roadmap should archive the completed runtime/database branch");
assert.match(roadmap, /Completed 0\.33\.5\.20 bounded queries and small-office scale data work is archived/, "Roadmap should archive the completed bounded-query branch");
assert.match(roadmap, /The active roadmap continues with durable jobs and outbox foundation work\./, "Roadmap should hand off to the active jobs/outbox branch");
assert.doesNotMatch(roadmap, /## Clients\/Projects Pages \(0\.33\.5\.18\.13 - 0\.33\.5\.18\.14\)/, "Live roadmap should not keep the completed Clients/Projects branch open");
assert.doesNotMatch(roadmap, /## Version 0\.33\.5\.18\.15 - Cross-Surface Guardrails/, "Live roadmap should not keep the completed branch closeout checklist open");

assert.match(changelog, /## Version 0\.33\.5\.18\.15 - /, "Changelog should include the branch closeout version");
assert.match(changelog, /Strict declarative guardrails now close on `lists\.workspace`, `notes\.workspace`, `tasks\.workspace`, `files\.browse`, `client-projects\.clients`, and `client-projects\.projects`/, "Changelog should record the strict surface set");
assert.match(changelog, /Tags management and Developer Example descriptors as reported proofs[\s\S]*Admin\/Settings, Reporting, Dashboard, Workbench, pagination\/server-side paging, Inspector behavior, and non-view workflow changes remain deferred/, "Changelog should record reported and deferred surfaces");
assert.match(changelog, /no database schema, write payload, permission, public API, route, or workflow changes/, "Changelog should record the no-contract-change closeout boundary");
assert.match(changelog, /scripts\/view-conversion-branch-closeout-regression\.mjs/, "Changelog should name the closeout regression");

assert.match(declarativeGuide, /current `viewSurfaces` authoring contract as of 0\.33\.5\.18\.15/, "Declarative guide should report the closeout version");
assert.match(declarativeGuide, strictSurfaceRegex("Strict fail-on-violation guardrails cover"), "Declarative guide should record the strict surface set");
assert.match(declarativeGuide, /Tags management and Developer Example descriptors remain reported descriptor proofs[\s\S]*Admin\/Settings, Reporting, Dashboard, Workbench, pagination\/server-side paging, Inspector behavior/, "Declarative guide should record reported and deferred surfaces");
assert.match(declarativeGuide, /The closeout does not add database schema, write payload, permission, public API, or new workflow changes/, "Declarative guide should record the no-contract-change boundary");

assert.match(viewContract, /Updated through 0\.33\.5\.18\.15/, "View-building contract should report the closeout version");
assert.match(viewContract, /## Implementation Notes For 0\.33\.5\.18\.15/, "View-building contract should include branch closeout notes");
assert.match(viewContract, strictSurfaceRegex("Strict fail-on-violation guardrails cover"), "View-building contract should record the strict surface set");
assert.match(viewContract, /Future converted-surface work should start from this boundary/, "View-building contract should define future handoff");

assert.match(moduleContract, /As of 0\.33\.5\.18\.15, the view-conversion branch closeout records the final strict\/deferred surface boundary/, "Module contract should record branch closeout");
assert.match(moduleContract, strictSurfaceRegex("Strict declarative guardrails currently enforce"), "Module contract should record the strict surface set");
assert.match(moduleContract, /does not add schema, write payload, permission, public API, route, or workflow changes/, "Module contract should record no module contract changes");
assert.match(moduleDevelopment, strictSurfaceRegex("strict declarative guardrails enforce"), "Module development guide should point authors at the closeout strict set");
assert.match(surfaceContract, strictSurfaceRegex("the strict converted surface set is"), "Surface contract should record the final converted surface set");
assert.match(surfaceContract, /does not add schema, payload, permission, public API, route, or workflow changes/, "Surface contract should record no UI contract behavior changes");

assert.match(filesInventory, /0\.33\.5\.18\.15 branch closeout preserves this Files boundary/, "Files inventory should acknowledge the branch closeout without reopening Files scope");
assert.match(filesInventory, /does not reopen Files scope[\s\S]*route changes, schema changes, permission changes, payload changes, and workflow changes remain deferred/, "Files inventory should keep future Files work deferred");
assert.match(tasksInventory, /0\.33\.5\.18\.15 branch closeout preserves this Tasks boundary/, "Tasks inventory should acknowledge the branch closeout without reopening Tasks scope");
assert.match(tasksInventory, /does not reopen Tasks scope[\s\S]*route calls, permissions, and workflow meaning remain Tasks-owned/, "Tasks inventory should keep future Tasks work deferred");
assert.match(clientsProjectsInventory, /Current as of 0\.33\.5\.18\.15/, "Clients/Projects inventory should report the closeout version");
assert.match(clientsProjectsInventory, /0\.33\.5\.18\.15 Cross-Surface Closeout[\s\S]*Notes-style searchable tag filters with service-side tag text resolution/, "Clients/Projects inventory should preserve the accepted tag-search outcome");
assert.match(clientsProjectsInventory, /Admin\/Settings, Reporting, Dashboard, Workbench, pagination\/server-side paging, Inspector behavior, drag\/drop hierarchy editing, new payloads, and new workflow semantics remain out of this closeout/, "Clients/Projects inventory should keep deferred work explicit");

assert.match(regressionSuite, /scripts\/view-conversion-branch-closeout-regression\.mjs/, "Regression suite should include the branch closeout regression");

console.log("View conversion branch closeout regression passed.");

function strictSurfaceRegex(prefix) {
  return new RegExp(`${escapeRegExp(prefix)}[\\s\\S]*${strictSurfaceIdsInCloseoutOrder.map(escapeRegExp).join("[\\s\\S]*")}`);
}

function assertMinimalHost(path, hostPattern) {
  const html = readText(path);
  const body = html.slice(html.indexOf("<body"), html.indexOf("</body>"));
  assert.match(body, hostPattern, `${path} should expose the expected descriptor host`);
  assert.doesNotMatch(body, /<(section|form|table|dialog|details|button|h1|h2|ul|ol)\b/i, `${path} should not ship framework-owned protected view anatomy`);
}

function assertHostScripts(path, patterns) {
  const html = readText(path);
  let cursor = 0;
  for (const pattern of patterns) {
    const match = html.slice(cursor).match(pattern);
    assert.ok(match, `${path} should load ${pattern} after prior required scripts`);
    cursor += match.index + match[0].length;
  }
}

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
