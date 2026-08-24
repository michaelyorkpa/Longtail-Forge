import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";
import { fixtureString, workspaceSessionFixture } from "./test-support/session-fixtures.mjs";
/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} PickerSession */
/** @typedef {import("../src/types/link-target-directory-contracts.js").LinkTargetCandidate} LinkTarget */

/** @typedef {Awaited<ReturnType<typeof createBusinessFixtures>>} ScopeFixtures */
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readTextAsync: readText } = createProjectTextReader();

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
  const pickerShell = await readText("public/js/shared/view-builder.js");
  const notesJs = await readText("public/js/notes.js");
  const notesServiceSource = await readText("src/modules/notes/notes.service.js");
  const linkTargetDirectorySource = await readText("src/modules/notes/link-target-directory.service.js");
  const clientProjectsProviderSource = await readText("src/modules/client-projects/link-target.provider.js");
  const pickerContract = await readText("docs/linked-context-picker-contract.md");

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
  assert.match(notesServiceSource, /linkTargetDirectory\.list/, "Notes service should delegate external target lookup to the directory");
  assert.match(linkTargetDirectorySource, /resolveClientProjectFilterScope/, "Link-target directory should use the shared hierarchy resolver for picker client scoping");
  assert.match(linkTargetDirectorySource, /targetMatchesClientContext/, "Link-target directory should filter external targets by the resolved client context");
  assert.match(clientProjectsProviderSource, /clientContext\?\.mode === "client" \|\| options\.clientContext\?\.mode === "workspace"/, "Project provider should drop client/workspace suffixes in scoped client contexts");
  assert.match(pickerContract, /0\.33\.6\.15\.1[\s\S]*client-context selector/, "Linked Context picker contract should document the client-context selector");
}

/** @param {PickerSession} session @param {{ workspace_id: string, workspace_name: unknown }} workspace */
async function createBusinessFixtures(session, workspace) {
  // The workspace name is an open database column, and both the seed helper and
  // the expected scope labels below read it as text, so it is proven here once
  // and reused rather than narrowed twice.
  const workspaceName = typeof workspace.workspace_name === "string" && workspace.workspace_name
    ? workspace.workspace_name
    : "LC Scope Workspace";
  await setWorkspace(session.workspace_id, "business", workspaceName);
  const suffix = randomUUID().slice(0, 8);
  const parentClientId = `lc-scope-parent-${suffix}`;
  const childClientId = `lc-scope-child-${suffix}`;
  const unrelatedClientId = `lc-scope-other-${suffix}`;
  const workspaceProjectId = `lc-scope-workspace-project-${suffix}`;
  const parentProjectId = `lc-scope-parent-project-${suffix}`;
  const childProjectId = `lc-scope-child-project-${suffix}`;
  const unrelatedProjectId = `lc-scope-other-project-${suffix}`;

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

/** @param {PickerSession} session @param {ScopeFixtures} fixtures */
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

/** @param {PickerSession} session */
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

/**
 * Index picker targets by id, preserving whatever the caller passed.
 *
 * Generic rather than fixed to the published candidate contract because the
 * picker service does not declare its return, so its targets arrive as inferred
 * literals; fixing the parameter would erase what the caller already knows.
 * @template {{ targetId: string }} TargetShape
 * @param {readonly TargetShape[]} [targets]
 * @returns {Map<string, TargetShape>}
 */
function indexTargets(targets = []) {
  return new Map(targets.map((target) => [target.targetId, target]));
}

/** @param {string} workspaceId @param {string} workspaceType @param {string} workspaceName */
async function setWorkspace(workspaceId, workspaceType, workspaceName) {
  await runSql(`
UPDATE workspaces
SET workspace_type = ${sqlText(workspaceType)},
    name = ${sqlText(workspaceName)}
WHERE workspace_id = ${sqlText(workspaceId)};
`);
}

/** @returns {Promise<{ workspace_id: string, workspace_name: unknown }>} */
async function readWorkspace() {
  const row = requireFirstRow(await querySql("SELECT workspace_id, name AS workspace_name FROM workspaces ORDER BY rowid LIMIT 1;"), "the workspace fixture");
  return {
    workspace_id: fixtureString(row.workspace_id, "the workspace fixture id"),
    workspace_name: row.workspace_name,
  };
}

/** @param {string} workspaceId @returns {Promise<PickerSession>} */
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
  return workspaceSessionFixture({ ...user, workspace_id: workspaceId });
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
