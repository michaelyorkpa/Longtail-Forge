import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const clientsScript = await fs.readFile(path.join(root, "public/js/clients-projects.js"), "utf8");
const clientsHtml = await fs.readFile(path.join(root, "views/protected/clients.html"), "utf8");
const projectsHtml = await fs.readFile(path.join(root, "views/protected/projects.html"), "utf8");
const workbenchHtml = await fs.readFile(path.join(root, "views/protected/workbench.html"), "utf8");

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
  /modalView\.createModalForm\(\{\s*title: "Add Client",\s*className: "client-detail-dialog",\s*formClassName: "entry-form client-modal-form"/s,
  "Add Client dialog should use the shared modal form helper.",
);
assert.match(
  clientsScript,
  /requireView\(\)\.createModal\(\{\s*title: "Add Project",\s*className: "project-form-dialog",\s*body: \[form\],\s*footer: \[actions\],/s,
  "Add Project dialog should use the shared modal helper and footer.",
);
assert.match(
  clientsScript,
  /requireView\(\)\.createModal\(\{\s*title: `Edit Project: \$\{project\.name\}`,\s*className: "project-form-dialog detail-edit-dialog",\s*body: \[projectEditor\],\s*footer: \[closeActions\],/s,
  "Edit Project dialog should use the shared modal helper and footer.",
);
assert.match(clientsScript, /function buildClientProjectDialogShells\(\)/, "Client page Add Client shell should be helper-built at source.");
assert.match(clientsScript, /function createModalAction/, "Converted dialogs should use shared modal action creation.");
assert.match(clientsScript, /surface-modal-footer-action/, "Converted dialog actions should use shared modal footer action classes.");
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
assert.match(clientsHtml, /js\/shared\/view-builder\.js\?v=4/);
assert.match(projectsHtml, /js\/shared\/view-builder\.js\?v=4/);
assert.match(workbenchHtml, /js\/shared\/view-builder\.js\?v=4/);
assert.match(clientsHtml, /clients-projects\.js\?v=11/);
assert.match(projectsHtml, /clients-projects\.js\?v=11/);
assert.match(workbenchHtml, /clients-projects\.js\?v=11/);

console.log("Client modal footer actions regression passed.");

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}
