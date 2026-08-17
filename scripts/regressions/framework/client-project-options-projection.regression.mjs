export const regressionMeta = Object.freeze({
  id: "framework.client-project-options-projection",
  area: "framework",
  tier: "focused",
  tags: ["client-projects", "options", "payload", "performance", "reminders"],
  description: "Proves the slim client-project options projection renders dropdowns identical to the full management payload at a fraction of its size, the management shape keeps gated batched reminder policies, and reminder-policy queries stay constant-count.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-client-project-options-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "client-project-options.db");
process.env.SUPER_ADMIN_PASSWORD = "Client-Project-Options-Test-123!";

const optionsHelperSource = readFileSync(path.join(root, "public/js/shared/client-project-options.js"), "utf8");
const sandboxWindow = {};
new Function("window", optionsHelperSource)(sandboxWindow);
const { normalizeClients } = sandboxWindow.LongtailForge.clientProjectOptions;

for (const [pagePath, scriptPath] of [
  ["views/protected/time-tracker.html", "js/stop-watch.js"],
  ["views/protected/workbench.html", "js/workbench.js"],
  ["views/protected/time-entries.html", "js/time-entries.js"],
]) {
  assertPageLoadsHelperBeforeScript(pagePath, scriptPath);
}
for (const sourcePath of [
  "public/js/stop-watch.js",
  "public/js/workbench.js",
  "public/js/time-entry-dialog.js",
  "public/js/time-entries.js",
]) {
  assertSourceUsesSharedHelper(sourcePath);
}
for (const sourcePath of [
  "public/js/stop-watch.js",
  "public/js/time-tracking-timer-dialog.js",
]) {
  assertTimerUsesSharedProjectOptions(sourcePath);
}

const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { readSqliteStatementCount } = await import("../../../src/db/sqlite.js");
const { clientsService } = await import("../../../src/modules/client-projects/clients.service.js");
const { taskRemindersService } = await import("../../../src/modules/tasks/task-reminders.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();

  const parentClient = (await clientsService.createClient({
    name: "Options Parent Client",
    billable: "yes",
    billing_rate: "150",
    billing_contact_name: "Parent Contact",
    billing_contact_email: "parent@example.test",
  }, session)).client;
  await clientsService.createClient({
    name: "Options Child Client",
    parent_client_id: parentClient.id,
  }, session);
  const inactiveClient = (await clientsService.createClient({
    name: "Options Inactive Client",
  }, session)).client;
  await clientsService.updateClient(inactiveClient.id, { status: "Inactive" }, session);

  const parentProject = (await clientsService.createProject(parentClient.id, {
    name: "Options Parent Project",
    billable: "yes",
  }, session)).project;
  await clientsService.createProject(parentClient.id, {
    name: "Options Child Project",
    parent_project_id: parentProject.id,
  }, session);
  const workspaceProject = (await clientsService.createProject("", {
    name: "Options Workspace Project",
  }, session)).project;
  await taskRemindersService.saveTargetPolicy(session.workspace_id, "client", parentClient.id, {
    dateTime: [60],
    dateOnly: [],
  }, false);
  await taskRemindersService.saveTargetPolicy(session.workspace_id, "project", workspaceProject.id, {
    dateTime: [],
    dateOnly: [1440],
  }, false);

  // The management shape is unchanged and carries batched reminder policies
  // only behind the include flag.
  const managementPayload = await clientsService.readClientProjects(session, { includeReminderPolicies: true });
  const managementParent = managementPayload.clients.find((client) => client.id === parentClient.id);
  assert.ok(managementParent, "management payload should retain the parent client");
  assert.ok(managementParent.taskReminderPolicy, "management payload should carry client reminder policies behind the flag");
  assert.equal(managementParent.taskReminderPolicy.inherited, false);
  assert.ok(
    managementParent.billing_contact && typeof managementParent.billing_contact === "object",
    "management payload keeps the full billing contact shape",
  );
  const managementWorkspaceProject = managementPayload.workspaceProjects.find((project) => project.id === workspaceProject.id);
  assert.ok(managementWorkspaceProject, "management payload should retain the workspace project");
  assert.ok(managementWorkspaceProject.taskReminderPolicy, "management payload should carry project reminder policies behind the flag");
  assert.ok(managementPayload.clients.some((client) => client.id === inactiveClient.id), "management payload keeps inactive records");

  const ungatedPayload = await clientsService.readClientProjects(session);
  const ungatedParent = ungatedPayload.clients.find((client) => client.id === parentClient.id);
  assert.ok(ungatedParent, "ungated payload should retain the parent client");
  assert.equal(Object.hasOwn(ungatedParent, "taskReminderPolicy"), false, "reminder policies must be gated behind the include flag");

  // The slim projection carries only option fields, filters inactive rows in
  // SQL by default, and returns them with includeInactive for scope labels.
  const optionsPayload = await clientsService.readClientProjectOptions(session);
  const optionsParent = optionsPayload.clients.find((client) => client.id === parentClient.id);
  assert.ok(optionsParent, "options payload should include readable clients");
  for (const heavyField of ["taskReminderPolicy", "billing_contact", "tags", "directTags", "childScopeIds"]) {
    assert.equal(Object.hasOwn(optionsParent, heavyField), false, `options payload must not carry ${heavyField}`);
  }
  assert.equal(optionsPayload.clients.some((client) => client.id === inactiveClient.id), false, "options payload filters inactive records in SQL");
  const inclusivePayload = await clientsService.readClientProjectOptions(session, { includeInactive: true });
  assert.ok(inclusivePayload.clients.some((client) => client.id === inactiveClient.id), "includeInactive keeps inactive records for scope labels");

  // Dropdown identity: the shared browser normalizer renders the same ordered
  // options from the slim projection as from the full management payload.
  const projectedFromFull = normalizeClients(managementPayload).map(dropdownProjection);
  const projectedFromOptions = normalizeClients(optionsPayload).map(dropdownProjection);
  assert.deepEqual(projectedFromOptions, projectedFromFull, "options consumers must render identical dropdowns from the slim projection");

  // Payload budget: the options projection is a fraction of the management
  // payload.
  const managementBytes = JSON.stringify(managementPayload).length;
  const optionsBytes = JSON.stringify(optionsPayload).length;
  assert.ok(
    optionsBytes < managementBytes / 2,
    `options payload (${optionsBytes} bytes) should be under half the management payload (${managementBytes} bytes)`,
  );

  // Query budget: reminder-policy reads stay constant-count as records grow.
  const beforeSmall = readSqliteStatementCount();
  await clientsService.readClientProjects(session, { includeReminderPolicies: true });
  const smallStatements = readSqliteStatementCount() - beforeSmall;

  for (let index = 0; index < 12; index += 1) {
    const grownClient = (await clientsService.createClient({ name: `Options Growth Client ${index}` }, session)).client;
    await clientsService.createProject(grownClient.id, { name: `Options Growth Project ${index}` }, session);
  }

  const beforeLarge = readSqliteStatementCount();
  await clientsService.readClientProjects(session, { includeReminderPolicies: true });
  const largeStatements = readSqliteStatementCount() - beforeLarge;
  assert.ok(
    largeStatements - smallStatements <= 4,
    `management read grew by ${largeStatements - smallStatements} statements for 24 extra records; the batched budget allows 4`,
  );

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");

  console.log("client project options projection regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { force: true, recursive: true });
}

function dropdownProjection(client) {
  return {
    id: client.id,
    optionLabel: client.optionLabel,
    displayName: client.displayName,
    hierarchyDepth: client.hierarchyDepth,
    status: client.status,
    billable: client.billable,
    billingRate: client.billingRate,
    billingPeriod: client.billingPeriod,
    billingRounding: client.billingRounding,
    isWorkspaceScope: client.isWorkspaceScope === true,
    projects: (client.projects || []).map((project) => ({
      id: project.id,
      optionLabel: project.optionLabel,
      displayName: project.displayName,
      hierarchyDepth: project.hierarchyDepth,
      status: project.status,
      billable: project.billable,
      billingRate: project.billingRate,
      billingPeriod: project.billingPeriod,
      billingRounding: project.billingRounding,
    })),
  };
}

function assertPageLoadsHelperBeforeScript(pagePath, scriptPath) {
  const html = readFileSync(path.join(root, pagePath), "utf8");
  const helperIndex = html.indexOf("js/shared/client-project-options.js");
  const scriptIndex = html.indexOf(scriptPath);

  assert.ok(helperIndex >= 0, `${pagePath} should load the shared client-project options helper.`);
  assert.ok(scriptIndex >= 0, `${pagePath} should load ${scriptPath}.`);
  assert.ok(helperIndex < scriptIndex, `${pagePath} should load the shared helper before ${scriptPath}.`);
}

function assertSourceUsesSharedHelper(sourcePath) {
  const source = readFileSync(path.join(root, sourcePath), "utf8");
  assert.match(
    source,
    /clientProjectOptions\.normalizeClients/,
    `${sourcePath} should normalize clients through the shared hierarchy helper.`,
  );
}

function assertTimerUsesSharedProjectOptions(sourcePath) {
  const source = readFileSync(path.join(root, sourcePath), "utf8");
  assert.match(
    source,
    /projects\.forEach\(\(project\) => \{[\s\S]*createOption\(project\.id, projectOptionLabel\(project\)\)/,
    `${sourcePath} should render the shared project hierarchy in its supplied order and with its supplied labels.`,
  );
  assert.match(
    source,
    /function projectOptionLabel\(project\) \{[\s\S]*clientProjectOptions\.optionLabel\(project\)/,
    `${sourcePath} should read project labels through the shared Clients/Projects option contract.`,
  );
  assert.doesNotMatch(
    source,
    /sortByName\(projects\)|sortByName\(client\.projects\)/,
    `${sourcePath} must not flatten the shared project hierarchy with a second alphabetical sort.`,
  );
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];
  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}
