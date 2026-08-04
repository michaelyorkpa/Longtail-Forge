export const regressionMeta = Object.freeze({
  id: "permissions.scope-aware-admin-navigation",
  area: "permissions",
  tier: "focused",
  tags: ["app-shell", "clients", "navigation", "permissions", "projects"],
  description: "Pins any-scope Client/Project Settings navigation and server-shaped scoped project affordances.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const appShell = await read("src/services/app-shell.service.js");
const moduleSource = await read("src/modules/client-projects/module.js");
const serviceSource = await read("src/modules/client-projects/clients.service.js");
const browserSource = await read("public/js/clients-projects.js");
const permissionHarness = await read("scripts/permission-regression.mjs");

const hints = functionBlock(appShell, "readPermissionHints");
for (const permissionId of [
  "clients.manage",
  "projects.manage",
  "users.manage",
  "workspace_settings.manage",
  "audit_logs.view",
]) {
  assert.match(
    hints,
    new RegExp(`permissionsService\\.canInAnyScope\\(session, "${escapeRegExp(permissionId)}"`),
    `${permissionId} shell hints should use any-scope semantics`,
  );
}
assert.match(hints, /clientsManage: canManageClients/);
assert.match(appShell, /availableTools\.has\("clients_projects"\) && permissionHints\.clientsManage/);
assert.match(appShell, /if \(permissionHints\.workspaceSettingsManage\) \{[\s\S]*addSettingsModuleNavigation[\s\S]*moduleSettingsNavigation\.forEach/);

assert.match(moduleSource, /label: "Projects", href: "projects\.html", requiredPermissions: \["projects\.manage"\]/);
assert.match(moduleSource, /label: "Clients", href: "clients\.html", parent: "projects\.html", requiredPermissions: \["clients\.manage"\]/);
assert.match(moduleSource, /id: "clients"[\s\S]*requiredPermissions: \["clients\.manage"\]/);
assert.match(moduleSource, /id: "projects"[\s\S]*requiredPermissions: \["projects\.manage"\]/);
assert.match(moduleSource, /id: "edit-client"[\s\S]*visibleWhen: \{ field: "canManage", equals: true \}/);
assert.match(moduleSource, /id: "edit-project"[\s\S]*visibleWhen: \{ field: "canManage", equals: true \}/);

for (const capability of [
  "can_create_workspace_project",
  "can_manage_workspace_projects",
  "can_create_project",
  "can_manage_projects",
  "can_manage",
]) {
  assert.ok(serviceSource.includes(capability), `project read models should expose ${capability}`);
}
assert.match(serviceSource, /createPermissionEvaluator\(session, "projects\.manage", \{\s*operation: "create"/);
assert.match(serviceSource, /createPermissionEvaluator\(session, "projects\.manage", \{\s*operation: "update"/);

assert.match(browserSource, /function withoutUnavailableTopLevelActions\(surface\)/);
assert.match(browserSource, /surface\.id === "client-projects\.projects"[\s\S]*canCreateAnyProject\(\)/);
assert.match(browserSource, /function resolveProjectCreateTarget\(requestedClientId = ""\)/);
assert.match(browserSource, /realClient\.canCreateProject/);
assert.match(browserSource, /client\.id === project\.client_id \|\| client\.canManageProjects/);
assert.match(browserSource, /You do not have permission to edit that project\./);
assert.match(browserSource, /You do not have permission to edit that client\./);

for (const proof of [
  "client administrator receives scoped Client and Project navigation only",
  "project administrator receives Project navigation without Client or workspace administration",
  "role without management grants receives no Client or Project Settings links",
  "workspace administrator navigation remains complete",
  "client administrator receives only scoped Project Settings data",
  "project administrator receives no Client or workspace project-create target",
]) {
  assert.ok(permissionHarness.includes(proof), `permission harness should retain proof: ${proof}`);
}

console.log("Scope-aware admin navigation regression passed.");

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `Expected function ${functionName}`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
