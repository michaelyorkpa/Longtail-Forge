import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-linked-context-client-scope-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-linked-context-client-scope.db");
process.env.SUPER_ADMIN_PASSWORD = "Linked-Context-Client-Scope-Test-123!";

const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");


try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertStaticContract();
  const fixtures = await createBusinessFixtures(session, workspace);
  await assertBusinessClientContextScopes(session, fixtures);
  await assertPersonalFamilyClientContextHidden(session);
  await assertIntegrity();

  console.log("Linked Context client-scope picker regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertStaticContract() {
  const packageJson = JSON.parse(await readText("package.json"));
  const packageLock = JSON.parse(await readText("package-lock.json"));
  const pickerShell = await readText("public/js/shared/view-builder.js");
  const notesJs = await readText("public/js/notes.js");
  const notesServiceSource = await readText("src/modules/notes/notes.service.js");
  const pickerContract = await readText("docs/linked-context-picker-contract.md");
  const roadmap = await readText("ROADMAP.md");
  const regressionSuite = await readText("scripts/regression-legacy-snapshot.json");

  assert.equal(packageJson.version, appVersion, "package.json should report the Linked Context client-scope version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Linked Context client-scope version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Linked Context client-scope version");

  assert.match(pickerShell, /clientContextSelect/, "Picker shell should expose an optional client-context select");
  assert.match(pickerShell, /setClientContexts/, "Picker shell should expose a client-context update hook");
  assert.doesNotMatch(pickerShell, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage/, "Picker shell must remain data-agnostic");

  assert.match(notesJs, /clientContexts: \[\]/, "Notes should own client-context option loading for the shared picker");
  assert.match(notesJs, /dataset\.noteContextClient = ""/, "Notes should expose the picker client-context select hook");
  assert.match(notesJs, /function populateLinkClientContextSelect/, "Notes should populate client-context options after workspace context is known");
  assert.match(notesJs, /value: LINK_CLIENT_CONTEXT_ALL, label: "All Clients"/, "Notes should default the Linked Context picker to All Clients");
  assert.match(notesJs, /value: LINK_CLIENT_CONTEXT_WORKSPACE, label: linkTargetWorkspaceClientLabel\(\)/, "Notes should include the workspace-project bucket");
  assert.match(notesJs, /clientScope === LINK_CLIENT_CONTEXT_WORKSPACE[\s\S]*params\.set\("clientScope", LINK_CLIENT_CONTEXT_WORKSPACE\)/, "Notes should submit workspace client scope only through the caller-owned route request");
  assert.match(notesJs, /clientScope === "client" && clientId[\s\S]*params\.set\("clientScope", "client"[\s\S]*params\.set\("clientId", clientId\)/, "Notes should submit selected client scope and client id");
  assert.match(notesJs, /if \(!usesBusinessScope\(\)\)[\s\S]*setClientContexts\(\[\]\)/, "Notes should hide client context outside Business workspaces");

  assert.match(notesServiceSource, /normalizeLinkTargetClientContext/, "Notes service should normalize the picker client scope");
  assert.match(notesServiceSource, /resolveLinkTargetClientScope[\s\S]*resolveClientProjectFilterScope/, "Notes service should use the shared hierarchy resolver for picker client scoping");
  assert.match(notesServiceSource, /targetMatchesClientContext/, "Notes service should filter link targets by the resolved client context");
  assert.match(notesServiceSource, /omitBusinessContext: isScopedLinkTargetClientContext/, "Project target labels should drop client/workspace suffixes in scoped client contexts");
  assert.match(pickerContract, /0\.33\.6\.15\.1[\s\S]*client-context selector/, "Linked Context picker contract should document the client-context selector");
  assert.match(roadmap, /Active cursor: `0\.33\.8`/, "Roadmap should remain on the current active branch after the Linked Context client-scope slice closes");
  assert.match(regressionSuite, /scripts\/linked-context-client-scope-picker-regression\.mjs/, "Regression suite should include the Linked Context client-scope picker proof");
}

async function createBusinessFixtures(session, workspace) {
  await setWorkspace(session.workspace_id, "business", workspace.workspace_name || "LC Scope Workspace");
  const suffix = randomUUID().slice(0, 8);
  const parentClientId = `lc-scope-parent-${suffix}`;
  const childClientId = `lc-scope-child-${suffix}`;
  const unrelatedClientId = `lc-scope-other-${suffix}`;
  const workspaceProjectId = `lc-scope-workspace-project-${suffix}`;
  const parentProjectId = `lc-scope-parent-project-${suffix}`;
  const childProjectId = `lc-scope-child-project-${suffix}`;
  const unrelatedProjectId = `lc-scope-other-project-${suffix}`;
  const workspaceName = workspace.workspace_name || "LC Scope Workspace";

  await clientsRepository.create(session.workspace_id, {
    id: parentClientId,
    name: "LC Scope Parent Client",
    status: "Active",
    billable: "yes",
  });
  await clientsRepository.create(session.workspace_id, {
    id: childClientId,
    name: "LC Scope Child Client",
    parent_client_id: parentClientId,
    status: "Active",
    billable: "yes",
  });
  await clientsRepository.create(session.workspace_id, {
    id: unrelatedClientId,
    name: "LC Scope Unrelated Client",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, "", {
    id: workspaceProjectId,
    name: "LC Scope Workspace Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, parentClientId, {
    id: parentProjectId,
    name: "LC Scope Parent Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, childClientId, {
    id: childProjectId,
    name: "LC Scope Child Project",
    status: "Active",
    billable: "yes",
  });
  await projectsRepository.create(session.workspace_id, unrelatedClientId, {
    id: unrelatedProjectId,
    name: "LC Scope Unrelated Project",
    status: "Active",
    billable: "yes",
  });

  const childTask = (await tasksService.create({
    project_id: childProjectId,
    title: `LC Scope Child Task ${suffix}`,
  }, session)).task;
  const workspaceTask = (await tasksService.create({
    project_id: workspaceProjectId,
    title: `LC Scope Workspace Task ${suffix}`,
  }, session)).task;
  const childNote = (await notesService.create({
    body_markdown: "Client-scoped linked context note.",
    libraryBucket: "active_work",
    project_id: childProjectId,
    title: `LC Scope Child Note ${suffix}`,
  }, session)).note;
  const childList = (await listsService.create({
    list_type: "checklist",
    project_id: childProjectId,
    title: `LC Scope Child List ${suffix}`,
  }, session)).list;

  return {
    childClientId,
    childList,
    childNote,
    childProjectId,
    childTask,
    parentClientId,
    parentProjectId,
    unrelatedProjectId,
    workspaceName,
    workspaceProjectId,
    workspaceTask,
  };
}

async function assertBusinessClientContextScopes(session, fixtures) {
  const allProjects = await notesService.listLinkTargets(session, {
    targetType: "project",
    q: "LC Scope",
    limit: 50,
  });
  const allProjectTargets = indexTargets(allProjects.targets);

  assert.equal(
    allProjectTargets.get(fixtures.workspaceProjectId)?.displayLabel,
    `LC Scope Workspace Project - ${fixtures.workspaceName}`,
    "All Clients should keep workspace suffix on workspace project labels",
  );
  assert.equal(
    allProjectTargets.get(fixtures.childProjectId)?.displayLabel,
    "LC Scope Child Project - LC Scope Child Client",
    "All Clients should keep client suffix on client project labels",
  );

  const workspaceProjects = await notesService.listLinkTargets(session, {
    clientScope: "workspace",
    targetType: "project",
    q: "LC Scope",
    limit: 50,
  });
  assert.deepEqual(
    workspaceProjects.targets.map((target) => target.targetId),
    [fixtures.workspaceProjectId],
    "Workspace client context should show only client-less workspace projects",
  );
  assert.equal(workspaceProjects.targets[0]?.displayLabel, "LC Scope Workspace Project");
  assert.doesNotMatch(workspaceProjects.targets[0]?.displayLabel || "", / - /);

  const parentProjectScope = await notesService.listLinkTargets(session, {
    clientScope: "client",
    clientId: fixtures.parentClientId,
    targetType: "project",
    q: "LC Scope",
    limit: 50,
  });
  assert.deepEqual(
    parentProjectScope.targets.map((target) => target.targetId),
    [fixtures.childProjectId, fixtures.parentProjectId],
    "Parent client context should include readable descendant-client projects",
  );
  assert.deepEqual(
    parentProjectScope.targets.map((target) => target.displayLabel),
    ["LC Scope Child Project", "LC Scope Parent Project"],
    "Scoped client project labels should drop the client suffix",
  );

  const childProjectScope = await notesService.listLinkTargets(session, {
    clientScope: "client",
    clientId: fixtures.childClientId,
    targetType: "project",
    q: "LC Scope",
    limit: 50,
  });
  assert.deepEqual(
    childProjectScope.targets.map((target) => target.targetId),
    [fixtures.childProjectId],
    "Leaf client context should drill down to that client only",
  );

  const parentRecords = await notesService.listLinkTargets(session, {
    clientScope: "client",
    clientId: fixtures.parentClientId,
    targetType: "all",
    q: "LC Scope Child",
    limit: 50,
  });
  const parentRecordIds = new Set(parentRecords.targets.map((target) => target.targetId));
  assert.ok(parentRecordIds.has(fixtures.childTask.task_id), "Parent client scope should include descendant-client task targets");
  assert.ok(parentRecordIds.has(fixtures.childNote.note_id), "Parent client scope should include descendant-client note targets");
  assert.ok(parentRecordIds.has(fixtures.childList.list_id), "Parent client scope should include descendant-client list targets");
  assert.equal(parentRecordIds.has(fixtures.workspaceTask.task_id), false, "Parent client scope should exclude workspace-project task targets");

  const workspaceRecords = await notesService.listLinkTargets(session, {
    clientScope: "workspace",
    targetType: "task",
    q: "LC Scope",
    limit: 50,
  });
  assert.deepEqual(
    workspaceRecords.targets.map((target) => target.targetId),
    [fixtures.workspaceTask.task_id],
    "Workspace client context should scope record targets to client-less workspace work",
  );
}

async function assertPersonalFamilyClientContextHidden(session) {
  await setWorkspace(session.workspace_id, "family", "LC Scope Family Workspace");
  const suffix = randomUUID().slice(0, 8);
  const familyProjectId = `lc-scope-family-project-${suffix}`;

  await projectsRepository.create(session.workspace_id, "", {
    id: familyProjectId,
    name: "LC Scope Family Project",
    status: "Active",
    billable: "no",
  });

  const clientTargets = await notesService.listLinkTargets(session, {
    targetType: "client",
    q: "LC Scope",
    limit: 20,
  });
  assert.equal(clientTargets.targets.length, 0, "Family workspaces should not expose Client target choices");

  const projectTargets = await notesService.listLinkTargets(session, {
    clientScope: "client",
    clientId: "ignored-client-id",
    targetType: "project",
    q: "LC Scope",
    limit: 20,
  });
  assert.ok(
    projectTargets.targets.some((target) => target.targetId === familyProjectId),
    "Family project should remain available through the picker",
  );
  assert.ok(
    projectTargets.targets.every((target) => !/ - /.test(target.displayLabel || "")),
    "Family project labels should not expose client/workspace suffixes",
  );
}

function indexTargets(targets = []) {
  return new Map(targets.map((target) => [target.targetId, target]));
}

async function setWorkspace(workspaceId, workspaceType, workspaceName) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)},
    name = ${sqlText(workspaceName)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

async function readWorkspace() {
  const rows = await querySql("SELECT workspace_id, name AS workspace_name FROM workspaces ORDER BY rowid LIMIT 1;");
  assert.ok(rows[0]?.workspace_id, "workspace fixture is required");
  return rows[0];
}

async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  const user = rows[0];
  assert.ok(user?.user_id, "protected user fixture is required");
  return {
    display_name: user.display_name || user.username,
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: workspaceId,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

async function readText(filePath) {
  return fs.readFile(path.join(process.cwd(), filePath), "utf8");
}
