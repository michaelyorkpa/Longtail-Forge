/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.15.1";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-client-project-hierarchy-closeout-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-client-project-hierarchy-closeout.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Client-Project-Hierarchy-Closeout-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "client-project-hierarchy-closeout-master-key";
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "test-v1";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const changelog = readText("CHANGELOG.md");
const listsDocs = readText("docs/lists-module.md");
const moduleContract = readText("docs/module-contract.md");
const roadmap = readText("ROADMAP.md");
const viewBuildingContract = readText("docs/view-building-contract.md");
const clientProjectsModuleSource = readText("src/modules/client-projects/module.js");
const listsModuleSource = readText("src/modules/lists/module.js");
const regressionCoverageManifest = readText("scripts/regression-coverage-manifest.json");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { filesService } = await import("../src/services/files.service.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { createSession } = await import("../src/security/sessions.js");
const { searchService } = await import("../src/services/search.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const {
  FOCUS_MODE_IDS,
  workFocusModesService,
} = await import("../src/services/work-focus-modes.service.js");

let server;

try {
  assertStaticContract();

  await initializeDatabase();
  const adminUser = await readSeedUser();
  const adminSession = toSession(adminUser);
  const adminBrowserSession = await createSession(adminUser);
  const fixtures = await createHierarchyFixtures(adminSession);

  await reindexHierarchyFixtures(adminSession.workspace_id, fixtures);

  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = createApi(baseUrl);

  await assertTasksHierarchyScope(adminSession, fixtures);
  await assertNotesHierarchyScope(adminSession, fixtures);
  await assertFilesHierarchyScope(adminSession, fixtures);
  await assertListsHierarchyScope(adminSession, fixtures);
  await assertWorkbenchHierarchyScope(adminSession, fixtures);
  await assertSearchHierarchyScope(api, adminBrowserSession.sessionId, fixtures);
  await assertUnreadableDescendantsStayExcluded(api, adminSession);
  await assertIntegrity();

  console.log("Client/project hierarchy branch closeout regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the hierarchy branch closeout version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the hierarchy branch closeout version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the hierarchy branch closeout version");
  assert.match(listsModuleSource, /version:\s*appVersion/, "Lists module metadata should track the current app version");
  assert.match(clientProjectsModuleSource, /version:\s*appVersion/, "Clients/Projects module metadata should track the current app version");

  assert.match(
    listsDocs,
    new RegExp(`current Lists implementation as of ${escapeRegExp(appVersion)}`),
    "Lists docs should report the current implementation version",
  );
  assert.match(
    listsDocs,
    /As of 0\.33\.6\.14\.3, direct Lists client\/project filters now use the shared hierarchy scope resolver[\s\S]*selecting a parent client includes readable descendant sub-clients and descendant projects[\s\S]*selecting a parent project includes readable descendant sub-projects[\s\S]*leaf selection still drills down to the selected client\/project only[\s\S]*unreadable descendants remain excluded/,
    "Lists docs should document the shipped descendant-aware Lists scope",
  );
  assert.match(
    moduleContract,
    /As of 0\.33\.6\.14\.3, direct client\/project filters on Workbench, Tasks, Notes, Files, Lists, and Search use the same shared permission-aware hierarchy scope resolver[\s\S]*Parent client selection includes readable descendant sub-clients plus descendant-project records[\s\S]*parent project selection includes readable descendant sub-project records[\s\S]*project selection remains the narrower direct filter[\s\S]*Reporting keeps its explicit descendant-rollup behavior/,
    "Module contract should document the full shared hierarchy scope rule",
  );
  assert.match(
    viewBuildingContract,
    /As of 0\.33\.6\.14\.3, Lists reads and Search route filtering consume the shared descendant-aware hierarchy scope resolver[\s\S]*Browser code and query strings continue to submit only the selected direct client\/project values[\s\S]*Lists service\/repository and Search service\/adapter expand readable descendants server-side/,
    "View-building contract should document the Lists/Search hierarchy scope ownership boundary",
  );
  assert.match(
    roadmap,
    /Active cursor: `0\.33\.6\.15`/,
    "Roadmap should advance the active cursor beyond the completed hierarchy follow-up slice",
  );
  assert.doesNotMatch(
    roadmap,
    /### Version 0\.33\.6\.14 - App-wide hierarchical client\/project scoping standard[\s\S]*#### Version 0\.33\.6\.14\.3 - Lists and Search adoption plus branch closeout/,
    "Live roadmap should archive the completed 0.33.6.14 branch details",
  );
  assert.match(
    changelog,
    /## Version 0\.33\.6\.14\.3 - [\s\S]*Applied the shared hierarchy scope resolver to Lists filtering and Search route scoping[\s\S]*scripts\/client-project-hierarchy-branch-closeout-regression\.mjs/,
    "Changelog should record the hierarchy branch closeout and its regression owner",
  );
  assert.match(
    regressionSuite,
    /scripts\/client-project-hierarchy-branch-closeout-regression\.mjs/,
    "Regression suite should include the hierarchy branch closeout proof",
  );
  assert.match(
    regressionCoverageManifest,
    /scripts\/client-project-hierarchy-branch-closeout-regression\.mjs/,
    "Coverage manifest should include the hierarchy branch closeout proof",
  );
}

async function createHierarchyFixtures(session) {
  const parentClient = (await clientsService.createClient({ name: "Branch Parent Client" }, session)).client;
  const childClient = (await clientsService.createClient({
    name: "Scope Needle Child Client",
    parent_client_id: parentClient.id,
  }, session)).client;
  const unrelatedClient = (await clientsService.createClient({ name: "Unrelated Client" }, session)).client;

  const parentProject = (await clientsService.createProject(parentClient.id, {
    name: "Branch Parent Project",
  }, session)).project;
  const childProject = (await clientsService.createProject(parentClient.id, {
    name: "Scope Needle Child Project",
    parent_project_id: parentProject.id,
  }, session)).project;
  const childClientProject = (await clientsService.createProject(childClient.id, {
    name: "Scope Needle Child Client Project",
  }, session)).project;
  const unrelatedProject = (await clientsService.createProject(unrelatedClient.id, {
    name: "Unrelated Project",
  }, session)).project;

  const descendantClientTask = (await tasksService.create({
    project_id: childClientProject.id,
    title: "Scope needle descendant client task",
  }, session)).task;
  const descendantProjectTask = (await tasksService.create({
    project_id: childProject.id,
    title: "Scope needle descendant project task",
  }, session)).task;
  const unrelatedTask = (await tasksService.create({
    project_id: unrelatedProject.id,
    title: "Unrelated task",
  }, session)).task;

  const descendantClientNote = (await notesService.create({
    body_markdown: "Scope needle descendant client note body",
    client_id: childClient.id,
    libraryBucket: "active_work",
    project_id: childClientProject.id,
    title: "Scope needle descendant client note",
    visibility: "internal",
  }, session)).note;
  const descendantProjectNote = (await notesService.create({
    body_markdown: "Scope needle descendant project note body",
    client_id: parentClient.id,
    libraryBucket: "active_work",
    project_id: childProject.id,
    title: "Scope needle descendant project note",
    visibility: "internal",
  }, session)).note;
  const unrelatedNote = (await notesService.create({
    body_markdown: "Unrelated note body",
    client_id: unrelatedClient.id,
    libraryBucket: "active_work",
    project_id: unrelatedProject.id,
    title: "Unrelated note",
    visibility: "internal",
  }, session)).note;

  const descendantClientList = (await listsService.create({
    description: "Scope needle descendant client list description",
    project_id: childClientProject.id,
    title: "Scope needle descendant client list",
  }, session)).list;
  const descendantProjectList = (await listsService.create({
    description: "Scope needle descendant project list description",
    project_id: childProject.id,
    title: "Scope needle descendant project list",
  }, session)).list;
  const unrelatedList = (await listsService.create({
    description: "Unrelated list description",
    project_id: unrelatedProject.id,
    title: "Unrelated list",
  }, session)).list;

  const descendantClientAttachmentId = await insertAvailableAttachment({
    clientId: childClient.id,
    label: "scope-needle-descendant-client",
    projectId: childClientProject.id,
    session,
    targetId: descendantClientTask.task_id,
  });
  const descendantProjectAttachmentId = await insertAvailableAttachment({
    clientId: parentClient.id,
    label: "scope-needle-descendant-project",
    projectId: childProject.id,
    session,
    targetId: descendantProjectTask.task_id,
  });
  await insertAvailableAttachment({
    clientId: unrelatedClient.id,
    label: "unrelated",
    projectId: unrelatedProject.id,
    session,
    targetId: unrelatedTask.task_id,
  });

  return {
    childClient,
    childClientProject,
    childProject,
    descendantClientAttachmentId,
    descendantClientList,
    descendantClientNote,
    descendantClientTask,
    descendantProjectAttachmentId,
    descendantProjectList,
    descendantProjectNote,
    descendantProjectTask,
    parentClient,
    parentProject,
    unrelatedList,
    unrelatedNote,
    unrelatedTask,
  };
}

async function reindexHierarchyFixtures(workspaceId, fixtures) {
  await Promise.all([
    reindexRecord(workspaceId, "client-projects", "client", fixtures.childClient.id),
    reindexRecord(workspaceId, "client-projects", "project", fixtures.childClientProject.id),
    reindexRecord(workspaceId, "client-projects", "project", fixtures.childProject.id),
    reindexRecord(workspaceId, "tasks", "task", fixtures.descendantClientTask.task_id),
    reindexRecord(workspaceId, "tasks", "task", fixtures.descendantProjectTask.task_id),
    reindexRecord(workspaceId, "tasks", "task", fixtures.unrelatedTask.task_id),
    reindexRecord(workspaceId, "notes", "note", fixtures.descendantClientNote.note_id),
    reindexRecord(workspaceId, "notes", "note", fixtures.descendantProjectNote.note_id),
    reindexRecord(workspaceId, "notes", "note", fixtures.unrelatedNote.note_id),
    reindexRecord(workspaceId, "lists", "list", fixtures.descendantClientList.list_id),
    reindexRecord(workspaceId, "lists", "list", fixtures.descendantProjectList.list_id),
    reindexRecord(workspaceId, "lists", "list", fixtures.unrelatedList.list_id),
  ]);
}

async function assertTasksHierarchyScope(session, fixtures) {
  const parentClientScope = await tasksService.list(session, {
    client_id: fixtures.parentClient.id,
    status: "active",
  });
  assert.ok(
    parentClientScope.tasks.some((task) => task.task_id === fixtures.descendantClientTask.task_id),
    "parent client Tasks filter should include readable descendant-client tasks",
  );
  assert.ok(
    parentClientScope.tasks.some((task) => task.task_id === fixtures.descendantProjectTask.task_id),
    "parent client Tasks filter should include same-client descendant-project tasks",
  );
  assert.equal(
    parentClientScope.tasks.some((task) => task.task_id === fixtures.unrelatedTask.task_id),
    false,
    "parent client Tasks filter should exclude unrelated tasks",
  );

  const leafClientScope = await tasksService.list(session, {
    client_id: fixtures.childClient.id,
    status: "active",
  });
  assert.deepEqual(
    leafClientScope.tasks.map((task) => task.task_id),
    [fixtures.descendantClientTask.task_id],
    "leaf client Tasks filter should stay limited to the selected client scope",
  );

  const parentProjectScope = await tasksService.list(session, {
    project_id: fixtures.parentProject.id,
    status: "active",
  });
  assert.ok(
    parentProjectScope.tasks.some((task) => task.task_id === fixtures.descendantProjectTask.task_id),
    "parent project Tasks filter should include readable descendant-project tasks",
  );
}

async function assertNotesHierarchyScope(session, fixtures) {
  const parentClientScope = await notesService.list(session, {
    client_id: fixtures.parentClient.id,
    status: "all",
  });
  assert.ok(
    parentClientScope.notes.some((note) => note.note_id === fixtures.descendantClientNote.note_id),
    "parent client Notes filter should include readable descendant-client notes",
  );
  assert.ok(
    parentClientScope.notes.some((note) => note.note_id === fixtures.descendantProjectNote.note_id),
    "parent client Notes filter should include same-client descendant-project notes",
  );
  assert.equal(
    parentClientScope.notes.some((note) => note.note_id === fixtures.unrelatedNote.note_id),
    false,
    "parent client Notes filter should exclude unrelated notes",
  );

  const leafProjectScope = await notesService.list(session, {
    project_id: fixtures.childProject.id,
    status: "all",
  });
  assert.deepEqual(
    leafProjectScope.notes.map((note) => note.note_id),
    [fixtures.descendantProjectNote.note_id],
    "leaf project Notes filter should stay limited to the selected project scope",
  );
}

async function assertFilesHierarchyScope(session, fixtures) {
  const parentClientScope = await filesService.listAttachments(session, {
    client_id: fixtures.parentClient.id,
    status: "all",
  });
  assert.ok(
    parentClientScope.attachments.some((attachment) => attachment.fileAttachmentId === fixtures.descendantClientAttachmentId),
    "parent client Files browse filter should include readable descendant-client attachments",
  );
  assert.ok(
    parentClientScope.attachments.some((attachment) => attachment.fileAttachmentId === fixtures.descendantProjectAttachmentId),
    "parent client Files browse filter should include same-client descendant-project attachments",
  );
  assert.equal(
    parentClientScope.attachments.some((attachment) => attachment.targetId === fixtures.unrelatedTask.task_id),
    false,
    "parent client Files browse filter should exclude unrelated attachments",
  );

  const leafProjectScope = await filesService.listAttachments(session, {
    project_id: fixtures.childProject.id,
    status: "all",
  });
  assert.deepEqual(
    leafProjectScope.attachments.map((attachment) => attachment.fileAttachmentId),
    [fixtures.descendantProjectAttachmentId],
    "leaf project Files browse filter should stay limited to the selected project scope",
  );
}

async function assertListsHierarchyScope(session, fixtures) {
  const parentClientScope = await listsService.list(session, {
    client_id: fixtures.parentClient.id,
    status: "all",
  });
  assert.ok(
    parentClientScope.lists.some((list) => list.list_id === fixtures.descendantClientList.list_id),
    "parent client Lists filter should include readable descendant-client lists",
  );
  assert.ok(
    parentClientScope.lists.some((list) => list.list_id === fixtures.descendantProjectList.list_id),
    "parent client Lists filter should include same-client descendant-project lists",
  );
  assert.equal(
    parentClientScope.lists.some((list) => list.list_id === fixtures.unrelatedList.list_id),
    false,
    "parent client Lists filter should exclude unrelated lists",
  );

  const leafClientScope = await listsService.list(session, {
    client_id: fixtures.childClient.id,
    status: "all",
  });
  assert.deepEqual(
    leafClientScope.lists.map((list) => list.list_id),
    [fixtures.descendantClientList.list_id],
    "leaf client Lists filter should stay limited to the selected client scope",
  );

  const parentProjectScope = await listsService.list(session, {
    project_id: fixtures.parentProject.id,
    status: "all",
  });
  assert.ok(
    parentProjectScope.lists.some((list) => list.list_id === fixtures.descendantProjectList.list_id),
    "parent project Lists filter should include readable descendant-project lists",
  );
}

async function assertWorkbenchHierarchyScope(session, fixtures) {
  const parentClientScope = await workFocusModesService.listFocusCandidates(session, {
    clientId: fixtures.parentClient.id,
    modeId: FOCUS_MODE_IDS.clientFocus,
  });
  assert.ok(
    parentClientScope.items.some((item) => item.recordId === fixtures.descendantClientTask.task_id),
    "parent client Workbench focus should include readable descendant-client task candidates",
  );
  assert.ok(
    parentClientScope.items.some((item) => item.recordId === fixtures.descendantProjectTask.task_id),
    "parent client Workbench focus should include same-client descendant-project task candidates",
  );
  assert.equal(
    parentClientScope.items.some((item) => item.recordId === fixtures.unrelatedTask.task_id),
    false,
    "parent client Workbench focus should exclude unrelated tasks",
  );

  const leafClientScope = await workFocusModesService.listFocusCandidates(session, {
    clientId: fixtures.childClient.id,
    modeId: FOCUS_MODE_IDS.clientFocus,
  });
  assert.deepEqual(
    leafClientScope.items.map((item) => item.recordId),
    [fixtures.descendantClientTask.task_id],
    "leaf client Workbench focus should stay limited to the selected client scope",
  );

  const parentProjectScope = await workFocusModesService.listFocusCandidates(session, {
    modeId: FOCUS_MODE_IDS.projectFocus,
    projectId: fixtures.parentProject.id,
  });
  assert.ok(
    parentProjectScope.items.some((item) => item.recordId === fixtures.descendantProjectTask.task_id),
    "parent project Workbench focus should include readable descendant-project task candidates",
  );
}

async function assertSearchHierarchyScope(api, cookie, fixtures) {
  const taskResponse = await api.get(
    `/api/search?text=${encodeURIComponent("scope needle")}&recordType=task&clientId=${encodeURIComponent(fixtures.parentClient.id)}`,
    { cookie },
  );
  assert.equal(taskResponse.status, 200);
  assert.ok(
    taskResponse.body.results.some((result) => result.recordId === fixtures.descendantClientTask.task_id),
    "parent client Search task filters should include readable descendant-client task results",
  );
  assert.ok(
    taskResponse.body.results.some((result) => result.recordId === fixtures.descendantProjectTask.task_id),
    "parent client Search task filters should include same-client descendant-project task results",
  );
  assert.equal(
    taskResponse.body.results.some((result) => result.recordId === fixtures.unrelatedTask.task_id),
    false,
    "parent client Search task filters should exclude unrelated task results",
  );

  const noteResponse = await api.get(
    `/api/search?text=${encodeURIComponent("scope needle")}&recordType=note&clientId=${encodeURIComponent(fixtures.parentClient.id)}`,
    { cookie },
  );
  assert.equal(noteResponse.status, 200);
  assert.ok(
    noteResponse.body.results.some((result) => result.recordId === fixtures.descendantClientNote.note_id),
    "parent client Search note filters should include readable descendant-client note results",
  );
  assert.ok(
    noteResponse.body.results.some((result) => result.recordId === fixtures.descendantProjectNote.note_id),
    "parent client Search note filters should include same-client descendant-project note results",
  );

  const listResponse = await api.get(
    `/api/search?text=${encodeURIComponent("scope needle")}&recordType=list&clientId=${encodeURIComponent(fixtures.parentClient.id)}`,
    { cookie },
  );
  assert.equal(listResponse.status, 200);
  assert.ok(
    listResponse.body.results.some((result) => result.recordId === fixtures.descendantClientList.list_id),
    "parent client Search list filters should include readable descendant-client list results",
  );
  assert.ok(
    listResponse.body.results.some((result) => result.recordId === fixtures.descendantProjectList.list_id),
    "parent client Search list filters should include same-client descendant-project list results",
  );

  const clientResponse = await api.get(
    `/api/search?text=${encodeURIComponent("scope needle")}&recordType=client&clientId=${encodeURIComponent(fixtures.parentClient.id)}`,
    { cookie },
  );
  assert.equal(clientResponse.status, 200);
  assert.deepEqual(
    clientResponse.body.results.map((result) => result.recordId),
    [fixtures.childClient.id],
    "parent client Search client filters should include descendant client records themselves",
  );

  const projectResponse = await api.get(
    `/api/search?text=${encodeURIComponent("scope needle")}&recordType=project&projectId=${encodeURIComponent(fixtures.parentProject.id)}`,
    { cookie },
  );
  assert.equal(projectResponse.status, 200);
  assert.deepEqual(
    projectResponse.body.results.map((result) => result.recordId),
    [fixtures.childProject.id],
    "parent project Search project filters should include descendant project records themselves",
  );
}

async function assertUnreadableDescendantsStayExcluded(api, adminSession) {
  const parentClient = (await clientsService.createClient({ name: "Permission Parent Client" }, adminSession)).client;
  const readableChildClient = (await clientsService.createClient({
    name: "Permission Needle Readable Child Client",
    parent_client_id: parentClient.id,
  }, adminSession)).client;
  const hiddenChildClient = (await clientsService.createClient({
    name: "Permission Needle Hidden Child Client",
    parent_client_id: parentClient.id,
  }, adminSession)).client;

  const readableProject = (await clientsService.createProject(readableChildClient.id, {
    name: "Permission Needle Readable Project",
  }, adminSession)).project;
  const hiddenProject = (await clientsService.createProject(hiddenChildClient.id, {
    name: "Permission Needle Hidden Project",
  }, adminSession)).project;

  const readableTask = (await tasksService.create({
    project_id: readableProject.id,
    title: "Permission needle readable task",
  }, adminSession)).task;
  const hiddenTask = (await tasksService.create({
    project_id: hiddenProject.id,
    title: "Permission needle hidden task",
  }, adminSession)).task;

  const readableNote = (await notesService.create({
    body_markdown: "Permission needle readable note body",
    libraryBucket: "active_work",
    project_id: readableProject.id,
    title: "Permission needle readable note",
    visibility: "internal",
  }, adminSession)).note;
  const hiddenNote = (await notesService.create({
    body_markdown: "Permission needle hidden note body",
    libraryBucket: "active_work",
    project_id: hiddenProject.id,
    title: "Permission needle hidden note",
    visibility: "internal",
  }, adminSession)).note;

  const readableList = (await listsService.create({
    description: "Permission needle readable list description",
    project_id: readableProject.id,
    title: "Permission needle readable list",
  }, adminSession)).list;
  const hiddenList = (await listsService.create({
    description: "Permission needle hidden list description",
    project_id: hiddenProject.id,
    title: "Permission needle hidden list",
  }, adminSession)).list;

  const readableAttachmentId = await insertAvailableAttachment({
    clientId: readableChildClient.id,
    label: "permission-needle-readable",
    projectId: readableProject.id,
    session: adminSession,
    targetId: readableTask.task_id,
  });
  await insertAvailableAttachment({
    clientId: hiddenChildClient.id,
    label: "permission-needle-hidden",
    projectId: hiddenProject.id,
    session: adminSession,
    targetId: hiddenTask.task_id,
  });

  await Promise.all([
    reindexRecord(adminSession.workspace_id, "client-projects", "project", readableProject.id),
    reindexRecord(adminSession.workspace_id, "client-projects", "project", hiddenProject.id),
    reindexRecord(adminSession.workspace_id, "tasks", "task", readableTask.task_id),
    reindexRecord(adminSession.workspace_id, "tasks", "task", hiddenTask.task_id),
    reindexRecord(adminSession.workspace_id, "notes", "note", readableNote.note_id),
    reindexRecord(adminSession.workspace_id, "notes", "note", hiddenNote.note_id),
    reindexRecord(adminSession.workspace_id, "lists", "list", readableList.list_id),
    reindexRecord(adminSession.workspace_id, "lists", "list", hiddenList.list_id),
  ]);

  const limitedSession = await createNoRoleSession(adminSession.workspace_id);
  await assignProjectAdminRole(limitedSession.user_id, adminSession.workspace_id, readableProject.id);
  const limitedBrowserSession = await createSession({
    active_workspace_id: adminSession.workspace_id,
    home_workspace_id: adminSession.workspace_id,
    timezone: limitedSession.timezone,
    user_id: limitedSession.user_id,
    username: limitedSession.username,
  });

  const taskScope = await tasksService.list(limitedSession, {
    client_id: parentClient.id,
    status: "active",
  });
  assert.deepEqual(
    taskScope.tasks.map((task) => task.task_id),
    [readableTask.task_id],
    "parent client Tasks filters should exclude unreadable descendant tasks",
  );

  const noteScope = await notesService.list(limitedSession, {
    client_id: parentClient.id,
    status: "all",
  });
  assert.deepEqual(
    noteScope.notes.map((note) => note.note_id),
    [readableNote.note_id],
    "parent client Notes filters should exclude unreadable descendant notes",
  );

  const attachmentScope = await filesService.listAttachments(limitedSession, {
    client_id: parentClient.id,
    status: "all",
  });
  assert.deepEqual(
    attachmentScope.attachments.map((attachment) => attachment.fileAttachmentId),
    [readableAttachmentId],
    "parent client Files browse filters should exclude unreadable descendant attachments",
  );

  const listScope = await listsService.list(limitedSession, {
    client_id: parentClient.id,
    status: "all",
  });
  assert.deepEqual(
    listScope.lists.map((list) => list.list_id),
    [readableList.list_id],
    "parent client Lists filters should exclude unreadable descendant lists",
  );

  const workbenchScope = await workFocusModesService.listFocusCandidates(limitedSession, {
    clientId: parentClient.id,
    modeId: FOCUS_MODE_IDS.clientFocus,
  });
  assert.deepEqual(
    workbenchScope.items.map((item) => item.recordId),
    [readableTask.task_id],
    "parent client Workbench focus should exclude unreadable descendant task candidates",
  );

  const searchScope = await api.get(
    `/api/search?text=${encodeURIComponent("permission needle")}&clientId=${encodeURIComponent(parentClient.id)}`,
    { cookie: limitedBrowserSession.sessionId },
  );
  assert.equal(searchScope.status, 200);
  assert.ok(
    searchScope.body.results.some((result) => result.recordId === readableTask.task_id),
    "Search should keep readable descendant task results visible",
  );
  assert.ok(
    searchScope.body.results.some((result) => result.recordId === readableNote.note_id),
    "Search should keep readable descendant note results visible",
  );
  assert.ok(
    searchScope.body.results.some((result) => result.recordId === readableList.list_id),
    "Search should keep readable descendant list results visible",
  );
  assert.equal(
    searchScope.body.results.some((result) => (
      result.recordId === hiddenTask.task_id ||
      result.recordId === hiddenNote.note_id ||
      result.recordId === hiddenList.list_id
    )),
    false,
    "Search should exclude unreadable descendant results",
  );
}

async function reindexRecord(workspaceId, moduleId, recordType, recordId) {
  const result = await searchService.reindexSearchRecord({
    moduleId,
    recordId,
    recordType,
    workspaceId,
  }, {
    throwOnError: true,
  });

  assert.equal(result.ok, true, `${moduleId}:${recordType}:${recordId} should reindex successfully`);
}

async function insertAvailableAttachment({ clientId, label, projectId, session, targetId }) {
  const attachmentId = randomUUID();
  const fileId = randomUUID();
  const now = new Date().toISOString();
  const originalFilename = `${label}.txt`;

  await runSql(`
INSERT INTO files (
  file_id,
  workspace_id,
  storage_provider,
  storage_key,
  original_filename,
  stored_filename,
  display_name,
  extension,
  mime_type_claimed,
  mime_type_detected,
  file_size_bytes,
  sha256_hash,
  status,
  scan_status,
  quarantine_reason,
  uploaded_by_user_id,
  created_at,
  updated_at,
  deleted_at,
  metadata_json
)
VALUES (
  ${sqlText(fileId)},
  ${sqlText(session.workspace_id)},
  'local',
  ${sqlText(`test/${fileId}`)},
  ${sqlText(originalFilename)},
  ${sqlText(originalFilename)},
  ${sqlText(label)},
  '.txt',
  'text/plain',
  'text/plain',
  16,
  '',
  'available',
  'passed',
  NULL,
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)},
  NULL,
  '{}'
);

INSERT INTO file_attachments (
  file_attachment_id,
  workspace_id,
  file_id,
  module_id,
  target_type,
  target_id,
  client_id,
  project_id,
  visibility,
  attachment_role,
  caption,
  sort_order,
  attached_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
VALUES (
  ${sqlText(attachmentId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(fileId)},
  'tasks',
  'task',
  ${sqlText(targetId)},
  ${sqlText(clientId)},
  ${sqlText(projectId)},
  'private',
  NULL,
  NULL,
  0,
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  NULL,
  '{}'
);
`);

  return attachmentId;
}

async function readSeedUser() {
  const rows = await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

  assert.ok(user, "fresh database should seed a protected super admin");

  return user;
}

function toSession(user) {
  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function createNoRoleSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();
  const username = `hierarchy-closeout-${userId}@example.test`;

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  password,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(username)},
  'Hierarchy Closeout No Role',
  'unused',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username,
    workspace_id: workspaceId,
  };
}

async function assignProjectAdminRole(userId, workspaceId, projectId) {
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  'project_admin',
  'project',
  ${sqlText(projectId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}

function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, options),
  };
}

async function request(baseUrl, method, url, options = {}) {
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    status: response.status,
  };
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(activeServer) {
  return new Promise((resolve, reject) => {
    activeServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
