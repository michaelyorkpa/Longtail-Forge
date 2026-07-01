import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appVersion = "0.33.5.20.2";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const workbenchHtml = readText("views/protected/workbench.html");
const clientsProjectsScript = readText("public/js/clients-projects.js");
const moduleActionsScript = readText("public/js/shared/module-actions.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

assert.equal(packageJson.version, appVersion, "package.json should report the Clients/Projects action registration version");
assert.equal(packageLock.version, appVersion, "package-lock root should report the Clients/Projects action registration version");
assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Clients/Projects action registration version");

assert.match(clientsHtml, /clients-projects\.js\?v=20/, "Clients host should load the action-registration adapter cache key");
assert.match(projectsHtml, /clients-projects\.js\?v=20/, "Projects host should load the action-registration adapter cache key");
assert.match(workbenchHtml, /clients-projects\.js\?v=20/, "Workbench should load the action-registration adapter cache key for module-triggered actions");

for (const [behaviorId, actionId] of [
  ["client-projects.clients.create", "clients.add"],
  ["client-projects.clients.edit", "clients.edit"],
  ["client-projects.projects.create", "projects.add"],
  ["client-projects.projects.edit", "projects.edit"],
]) {
  assert.match(
    clientsProjectsScript,
    new RegExp(`registerClientProjectsModuleActionBehavior\\("${escapeRegExp(behaviorId)}", "${escapeRegExp(actionId)}"\\)`),
    `${behaviorId} should route through ${actionId}`,
  );
}

assert.match(
  clientsProjectsScript,
  /function openClientProjectModuleAction\(actionId, params = \{\}, options = \{\}\)[\s\S]*moduleActions\.open\(actionId, params/,
  "Clients/Projects descriptor and query actions should dispatch through the shared module-action registry",
);
assert.match(
  clientsProjectsScript,
  /function openClientProjectActionFallback\(actionId, params = \{\}, hostContext = null\)[\s\S]*openAddClientAction\(params, hostContext\)[\s\S]*openEditProjectAction\(params, hostContext\)/,
  "Clients/Projects should keep module-owned dialog openers as the fallback implementation",
);
assert.match(
  clientsProjectsScript,
  /const clientProjectDialogApi = \{[\s\S]*openAddClient: openAddClientAction,[\s\S]*openEditProject: openEditProjectAction,[\s\S]*\};[\s\S]*window\.LongtailForge\.clientProjectDialog = clientProjectDialogApi/,
  "Clients/Projects should publish the module-owned dialog API consumed by module-actions",
);
assert.match(
  moduleActionsScript,
  /id: "projects\.add"[\s\S]*open: \(params, hostContext\) => namespace\.clientProjectDialog\.openAddProject\(params, hostContext\)[\s\S]*id: "clients\.edit"[\s\S]*open: \(params, hostContext\) => namespace\.clientProjectDialog\.openEditClient\(params, hostContext\)/,
  "Shared module-actions should own first-party Clients/Projects action metadata",
);

assert.match(clientsProjectsScript, /function openAddClientActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("clients\.add"/, "Add Client query opener should use the registered module action");
assert.match(clientsProjectsScript, /function openEditClientActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("clients\.edit"/, "Edit Client query opener should use the registered module action");
assert.match(clientsProjectsScript, /function openAddProjectActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("projects\.add"/, "Add Project query opener should use the registered module action");
assert.match(clientsProjectsScript, /function openEditProjectActionFromQuery\(\)[\s\S]*openClientProjectModuleAction\("projects\.edit"/, "Edit Project query opener should use the registered module action");

assert.doesNotMatch(clientsProjectsScript, /window\.LongtailForge\.moduleActions\?\.register/, "Clients/Projects adapter should not duplicate first-party module action registrations");
assert.doesNotMatch(clientsProjectsScript, /function buildClientProjectDialogShells\(\)/, "Clients/Projects adapter should not rebuild a page-level Add Client dialog shell");
assert.doesNotMatch(clientsProjectsScript, /function createAddClientPageDialogShell\(\)/, "Clients/Projects adapter should not keep a duplicate Add Client form shell");
assert.doesNotMatch(clientsProjectsScript, /function openAddClientModal\(\)/, "Clients/Projects adapter should not keep a duplicate Add Client modal opener");
assert.doesNotMatch(clientsProjectsScript, /async function addClient\(\)/, "Clients/Projects adapter should not keep the retired duplicate Add Client submit path");
assert.doesNotMatch(clientsHtml, /data-client-modal|data-client-form|data-new-client-name/, "Clients host should not include static or compatibility Add Client form hooks");

assert.match(regressionSuite, /scripts\/clients-projects-action-registration-regression\.mjs/, "Regression suite should include the Clients/Projects action registration regression");

console.log("Clients/Projects action registration regression passed.");

function readText(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
