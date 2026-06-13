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
  /createClientPageActions\(client,\s*\{\s*actionTarget:\s*closeActions,\s*hostContext:\s*options\.hostContext,\s*saveRoot:\s*editor,/s,
  "Client detail modal should place Save Client and Edit Projects in the existing modal footer.",
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
assert.match(clientsHtml, /clients-projects\.js\?v=10/);
assert.match(projectsHtml, /clients-projects\.js\?v=10/);
assert.match(workbenchHtml, /clients-projects\.js\?v=10/);

console.log("Client modal footer actions regression passed.");
