import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const clientsScript = await fs.readFile(path.join(root, "public/js/clients-projects.js"), "utf8");
const css = await fs.readFile(path.join(root, "public/css/longtail-forge.css"), "utf8");
const clientsHtml = await fs.readFile(path.join(root, "views/protected/clients.html"), "utf8");
const projectsHtml = await fs.readFile(path.join(root, "views/protected/projects.html"), "utf8");
const workbenchHtml = await fs.readFile(path.join(root, "views/protected/workbench.html"), "utf8");
const workbenchScript = await fs.readFile(path.join(root, "public/js/workbench.js"), "utf8");

assert.match(
  clientsScript,
  /requireView\(\)\.createModal\(\{\s*title: `Edit Client: \$\{client\.name\}`,\s*className: "client-detail-dialog detail-edit-dialog",\s*body: \[details\],\s*footer: \[closeActions\],/s,
  "Client detail modal should use the shared modal helper and footer.",
);
assert.match(
  clientsScript,
  /saveClientSettings\(client,\s*options\.saveRoot\s*\|\|\s*wrapper\.closest\("\.client-editor"\)/,
  "Footer-hosted Save Client should still read fields from the client editor root.",
);
assert.match(
  clientsScript,
  /actionTarget\.append\(saveButton,\s*editProjectsButton\)/,
  "Client page actions should append Save Client and Edit Projects into the supplied action target.",
);
assert.match(
  clientsScript,
  /modalView\.createModalForm\(\{\s*title: lockParentClient \? "Add Child Client" : "Add Client",\s*className: "client-add-dialog",\s*formClassName: "client-modal-form"[\s\S]*fields: lockParentClient \? \[nameField, parentField\] : \[nameField, parentField, tagContainer\]/,
  "Add Client and locked Add Child Client dialogs should share the modal form anatomy while exposing only their permitted fields.",
);
assert.match(clientsScript, /const nameField = modalView\.createField\([\s\S]*field: "name"[\s\S]*const parentField = modalView\.createField\([\s\S]*field: "parentClientId"/, "Add Client Name and Parent controls should use framework field primitives.");
assert.doesNotMatch(clientsScript, /formClassName: "entry-form client-modal-form"/, "Add Client should not compress its title, field body, and footer into the page entry-form grid.");
assert.match(clientsScript, /function showDialog[\s\S]*typeof view\?\.showModal === "function"[\s\S]*view\.showModal\(dialog\)/, "Clients/Projects dialogs should enter the shared modal stack so nested module dialogs preserve their parent.");
assert.match(clientsScript, /function createAddClientShortcutButton[\s\S]*openClientProjectModuleAction\("clients\.add"\)[\s\S]*result\?\.completed[\s\S]*onCreated\?\.\(clientId\)/, "Add Project should open the Clients-owned Add Client action and hand the created Client back to its parent form.");
assert.doesNotMatch(clientsScript, /window\.location\.href = "clients\.html\?addClient=true"/, "Add Project should not navigate away to create a Client.");
assert.match(clientsScript, /if \(canCreateProjectForClient\(""\)\) \{[\s\S]*select\.appendChild\(createOption\("", workspaceProjectsLabel\(\)\)\)/, "Add Project should label authorized workspace scope with the readable workspace name.");
assert.match(clientsScript, /createBillableCheckbox\(initialTargetClient\.isWorkspaceScope \? "no" : initialTargetClient\.billable\)/, "Add Project should default workspace projects to non-billable while retaining Client-owned defaults.");
assert.match(
  clientsScript,
  /requireView\(\)\.createModal\(\{\s*title: "Add Project",\s*className: "project-form-dialog",\s*body: \[form\],\s*footer: \[actions\],/s,
  "Add Project dialog should use the shared modal helper and footer.",
);
assert.match(
  clientsScript,
  /requireView\(\)\.createModal\(\{\s*title: `Edit Project: \$\{project\.name\}`,\s*size: "wide",\s*className: "project-edit-dialog",\s*body: \[projectEditor\],\s*footer: \[closeActions\],/s,
  "Edit Project should use the framework wide modal helper and shared footer without the narrow Add Project or padded detail-dialog classes.",
);
assert.match(clientsScript, /createProjectEditor\(client, project, \{[\s\S]*modalLayout: true,/, "Edit Project should request the modal-specific editor reflow without changing embedded Project editor rows.");
assert.match(clientsScript, /const identityFields = usesModalLayout\s*\? \[statusLabel, clientAssignmentLabel, parentProjectLabel\]/, "Edit Project should stack Status, Client, and Parent Project in that order.");
assert.match(clientsScript, /createProjectTaskDefaultsEditor\(project\.taskDefaults, \{[\s\S]*reminderPolicyEditor,[\s\S]*billingRoundingEditor,[\s\S]*\}\)/, "Project Defaults should receive both reminder and rounding editors.");
assert.match(clientsScript, /function createProjectTaskDefaultsEditor[\s\S]*moduleGroup\.appendChild\(reminderPolicyEditor\.element\)[\s\S]*moduleGroup\.appendChild\(billingRoundingEditor\.element\)/, "Task Reminder Defaults and Rounding should render inside the Task module defaults group in that order.");
assert.doesNotMatch(clientsScript, /billingSettings\.append\(billingRoundingEditor\.element\)/, "Project Rounding should no longer be nested inside the billing settings group.");
assert.match(clientsScript, /billingSummary\.textContent = "Project Billing Settings"[\s\S]*\.\.\.\(!usesSimplifiedBilling \? \[billingDetails\] : \[\]\)/, "Personal and Family Edit Project modals should collapse the now-empty Project Rounding grouping.");
assert.match(css, /\.project-edit-form\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*border-top:\s*0/, "Edit Project should render as an unboxed one-column modal form.");
assert.match(css, /\.project-edit-form \.project-edit-tags-field \.tag-picker\s*\{[\s\S]*padding:\s*0[\s\S]*border:\s*0/, "Edit Project tags should use the full-width unboxed treatment.");
assert.doesNotMatch(clientsScript, /function buildClientProjectDialogShells\(\)/, "Client page should not rebuild a duplicate Add Client shell.");
assert.doesNotMatch(clientsScript, /function openAddClientModal\(\)/, "Client page should use the canonical Add Client dialog action instead of a duplicate modal opener.");
assert.match(clientsScript, /function createModalAction/, "Converted dialogs should use shared modal action creation.");
assert.match(clientsScript, /surface-modal-footer-action/, "Converted dialog actions should use shared modal footer action classes.");
// Consolidated under views.current-static-contracts by 0.33.33.9.
for (const functionName of [
  "openClientDetailDialog",
  "openAddClientDialog",
  "openProjectDetailDialog",
  "openAddProjectDialog",
]) {
  assert.doesNotMatch(
    functionBlock(clientsScript, functionName),
    /document\.createElement\("dialog"\)/,
    `${functionName} should not directly create dialog elements.`,
  );
}
assert.doesNotMatch(clientsHtml, /<dialog data-client-modal>/, "Clients page should not keep the static Add Client dialog.");
assert.match(clientsHtml, /js\/shared\/view-builder\.js/);
assert.match(projectsHtml, /js\/shared\/view-builder\.js/);
assert.match(workbenchHtml, /js\/shared\/view-builder\.js/);
assert.match(clientsHtml, /clients-projects\.js/);
assert.match(projectsHtml, /clients-projects\.js/);
assert.match(workbenchScript, /src: "js\/clients-projects\.js"/);

console.log("Client modal footer actions regression passed.");

/** @param {string} source @param {string} functionName @returns {string} */
function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}
