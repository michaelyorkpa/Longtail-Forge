import { escapeRegExp } from "./test-support/source-scan.mjs";
import assert from "node:assert/strict";

import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const clientsHtml = readText("views/protected/clients.html");
const projectsHtml = readText("views/protected/projects.html");
const clientsProjectsScript = readText("public/js/clients-projects.js");
// 0.33.33.34 moved the module-action dependency table into this shared registry.
const moduleActionsScript = readText("public/js/shared/module-actions.js");

assert.match(clientsHtml, /clients-projects\.js/, "Clients host should load the action-registration adapter cache key");
assert.match(projectsHtml, /clients-projects\.js/, "Projects host should load the action-registration adapter cache key");
assert.match(moduleActionsScript, /src: "js\/clients-projects\.js"/, "The registry should lazy-load the action-registration adapter for module-triggered actions");

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
assert.doesNotMatch(clientsProjectsScript, /\bcreateUuid\b|crypto(?:\.|\?\.)randomUUID|10000000-1000-4000-8000-100000000000/, "Clients/Projects browser code should not generate persistent record IDs");
assert.match(
  clientsProjectsScript,
  /const client = \{\s*name:[\s\S]*createClientRecord\(client,[\s\S]*client_id: ""[\s\S]*async function createClientRecord[\s\S]*Object\.assign\(client, result\.client, \{ projects: initialProjects \}\)[\s\S]*viewState\.openClientId = result\.client\.id/,
  "Client create should omit browser identity and apply the canonical server record to refresh, focus, and action state",
);
assert.match(
  clientsProjectsScript,
  /const project = \{\s*client_id:[\s\S]*createProjectRecord\(targetClient, project,[\s\S]*project_id: ""[\s\S]*async function createProjectRecord[\s\S]*Object\.assign\(project, result\.project\)[\s\S]*project_id: result\.project\.id/,
  "Project create should omit browser identity and apply the canonical server record to optimistic and action state",
);
assert.match(
  clientsProjectsScript,
  // `0.33.33.38.2.1` moved the client behind a checked read. The contract is that the
  // optimistic project is replaced by the canonical server record, not how the
  // client was acquired, so the assertion names the call and the assignment.
  /const projectResult = await requireApi\(\)\.postJson\([\s\S]*Object\.assign\(initialProject, projectResult\.project\)/,
  "Nested Client/Project creation should replace the optimistic project with the canonical server record",
);
assert.doesNotMatch(clientsHtml, /data-client-modal|data-client-form|data-new-client-name/, "Clients host should not include static or compatibility Add Client form hooks");

console.log("Clients/Projects action registration regression passed.");
