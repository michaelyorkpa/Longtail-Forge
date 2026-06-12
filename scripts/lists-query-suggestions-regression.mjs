import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-query-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-query.db");
process.env.SUPER_ADMIN_PASSWORD = "Lists-Query-Test-123!";

const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");
const { tagsService } = await import("../src/services/tags.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const session = await readSession();
  const fixtures = await seedLists(session);

  await assertCanonicalIndexQueries(session, fixtures);
  await assertCatalogSuggestionRanking(session, fixtures);
  await assertPermissionFiltering(session, fixtures);
  await assertBrowserQueryContract();
  await assertIntegrity();

  console.log("Lists query and suggestions regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function seedLists(session) {
  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(session.workspace_id)};
`);
  const client = (await clientsService.createClient({
    name: "Canonical Lists Client",
  }, session)).client;
  const project = (await clientsService.createProject(client.id, {
    name: "Canonical Lists Project",
  }, session)).project;

  const active = (await listsService.create({
    list_id: "lists-query-active",
    list_type: "procurement",
    project_id: project.id,
    title: "Active Query List",
  }, session)).list;
  const neededFirst = (await listsService.create({
    list_id: "lists-query-needed-first",
    list_type: "shopping",
    title: "Needed First List",
  }, session)).list;
  const reusable = (await listsService.create({
    list_id: "lists-query-reusable",
    list_type: "checklist",
    title: "Reusable Query Template",
  }, session)).list;
  await listsService.markReusable(reusable.list_id, session);
  const completed = (await listsService.create({
    list_id: "lists-query-completed",
    list_type: "packing",
    title: "Completed Query List",
  }, session)).list;
  await listsService.complete(completed.list_id, session);
  const archived = (await listsService.create({
    list_id: "lists-query-archived",
    title: "Archived Query List",
  }, session)).list;
  await listsService.archive(archived.list_id, session);
  const deleted = (await listsService.create({
    list_id: "lists-query-deleted",
    title: "Deleted Query List",
  }, session)).list;
  await listsService.softDelete(deleted.list_id, session);

  await listsService.createItem(active.list_id, {
    assigned_user_id: session.user_id,
    item_name: "Project cable",
    needed_by_date: "2026-06-20",
  }, session);
  await listsService.createItem(neededFirst.list_id, {
    item_name: "Sooner item",
    needed_by_date: "2026-06-15",
  }, session);
  await listsService.createItem(neededFirst.list_id, {
    item_name: "Checked item",
  }, session);
  const checkedItems = await listsService.read(neededFirst.list_id, session);
  await listsService.checkItem(neededFirst.list_id, checkedItems.items.find((item) => item.item_name === "Checked item").list_item_id, session);

  const linkedTask = (await tasksService.create({
    title: "Linked Query Task",
  }, session)).task;
  await listsService.createLink(active.list_id, {
    targetId: linkedTask.task_id,
    targetType: "task",
  }, session);

  const tag = (await tagsService.create(session, { name: "Canonical Lists Tag" })).tag;
  await tagsService.replaceAssignments(session, {
    targetId: active.list_id,
    targetType: "list",
    tagIds: [tag.tag_id],
  });

  await runSql(`
UPDATE lists
SET updated_at = '2026-06-01T10:00:00.000Z'
WHERE list_id = ${sqlText(active.list_id)};
UPDATE lists
SET updated_at = '2026-06-02T10:00:00.000Z'
WHERE list_id = ${sqlText(neededFirst.list_id)};
UPDATE lists
SET updated_at = '2026-06-03T10:00:00.000Z'
WHERE list_id = ${sqlText(reusable.list_id)};
`);

  return {
    active,
    client,
    completed,
    deleted,
    linkedTask,
    neededFirst,
    project,
    reusable,
    tag,
  };
}

async function assertCanonicalIndexQueries(session, fixtures) {
  const defaults = await listsService.list(session);
  assert.deepEqual(
    defaults.lists.map((list) => list.list_id),
    [fixtures.neededFirst.list_id, fixtures.active.list_id],
    "default Lists index should be active normal lists sorted by service-owned recent activity",
  );

  const reusable = await listsService.list(session, { reusable: "yes" });
  assert.deepEqual(reusable.lists.map((list) => list.list_id), [fixtures.reusable.list_id]);

  const completed = await listsService.list(session, { reusable: "all", status: "completed" });
  assert.deepEqual(completed.lists.map((list) => list.list_id), [fixtures.completed.list_id]);

  const deleted = await listsService.list(session, { archiveState: "deleted", includeDeleted: "true", reusable: "all" });
  assert.deepEqual(deleted.lists.map((list) => list.list_id), [fixtures.deleted.list_id]);

  const typed = await listsService.list(session, { listType: "procurement" });
  assert.deepEqual(typed.lists.map((list) => list.list_id), [fixtures.active.list_id]);

  const projectScoped = await listsService.list(session, { clientId: fixtures.client.id, projectId: fixtures.project.id });
  assert.deepEqual(projectScoped.lists.map((list) => list.list_id), [fixtures.active.list_id]);

  const assignedToMe = await listsService.list(session, { assigneeId: "me" });
  assert.deepEqual(assignedToMe.lists.map((list) => list.list_id), [fixtures.neededFirst.list_id, fixtures.active.list_id]);

  const neededByDate = await listsService.list(session, { neededByDate: "2026-06-15" });
  assert.deepEqual(neededByDate.lists.map((list) => list.list_id), [fixtures.neededFirst.list_id]);

  const linked = await listsService.list(session, {
    targetId: fixtures.linkedTask.task_id,
    targetType: "task",
  });
  assert.deepEqual(linked.lists.map((list) => list.list_id), [fixtures.active.list_id]);
  assert.equal(linked.lists[0].links[0].target.label, "Linked Query Task");

  const tagged = await listsService.list(session, { tagIds: [fixtures.tag.tag_id] });
  assert.deepEqual(tagged.lists.map((list) => list.list_id), [fixtures.active.list_id]);
  assert.equal(tagged.lists[0].tags[0].tag_id, fixtures.tag.tag_id);

  const noTags = await listsService.list(session, { tags: "__no_tags__" });
  assert.deepEqual(noTags.lists.map((list) => list.list_id), [fixtures.neededFirst.list_id]);

  const neededSort = await listsService.list(session, { sort: "needed_asc" });
  assert.deepEqual(
    neededSort.lists.map((list) => list.list_id),
    [fixtures.neededFirst.list_id, fixtures.active.list_id],
    "needed sort should use service-owned progress metadata",
  );

  const progressSort = await listsService.list(session, { sort: "progress_desc" });
  assert.deepEqual(
    progressSort.lists.map((list) => list.list_id),
    [fixtures.active.list_id, fixtures.neededFirst.list_id],
    "progress sort should use incomplete item counts before title fallback",
  );
}

async function assertCatalogSuggestionRanking(session, fixtures) {
  const shared = await listsService.createCatalogItem({
    item_name: "Canonical Bolt",
    list_type: "procurement",
    quantity: 1,
    use_count: 20,
  }, session);
  const clientScoped = await listsService.createCatalogItem({
    client_id: fixtures.client.id,
    item_name: "Canonical Bolt Client",
    list_type: "procurement",
    quantity: 2,
    use_count: 1,
  }, session);
  const projectScoped = await listsService.createCatalogItem({
    client_id: fixtures.client.id,
    item_name: "Canonical Bolt Project",
    list_type: "procurement",
    project_id: fixtures.project.id,
    quantity: 3,
    use_count: 1,
  }, session);

  const suggestions = await listsService.suggestItems(session, {
    listId: fixtures.active.list_id,
    q: "canonical bolt",
  });
  assert.deepEqual(
    suggestions.suggestions.slice(0, 3).map((item) => item.catalog_item_id),
    [
      projectScoped.catalogItem.catalog_item_id,
      clientScoped.catalogItem.catalog_item_id,
      shared.catalogItem.catalog_item_id,
    ],
    "suggestions should prefer project, then client, then shared context before usage/name fallback",
  );

  const catalogBackedItem = await listsService.createItem(fixtures.active.list_id, {
    catalog_item_id: projectScoped.catalogItem.catalog_item_id,
    item_name: "Canonical Bolt Project",
  }, session);
  await listsService.updateCatalogItem(projectScoped.catalogItem.catalog_item_id, {
    client_id: fixtures.client.id,
    item_name: "Canonical Bolt Project Revised",
    list_type: "procurement",
    project_id: fixtures.project.id,
    quantity: 99,
  }, session);
  const snapshotRead = await listsService.read(fixtures.active.list_id, session);
  const snapshotItem = snapshotRead.items.find((item) => item.list_item_id === catalogBackedItem.item.list_item_id);
  assert.equal(snapshotItem.item_name, "Canonical Bolt Project");
  assert.equal(snapshotItem.quantity, 3);
}

async function assertPermissionFiltering(session, fixtures) {
  const unprivilegedSession = {
    ...session,
    user_id: "lists-query-no-role-user",
    username: "lists-query-no-role-user@example.test",
  };
  const lists = await listsService.list(unprivilegedSession, { reusable: "all", status: "all" });
  assert.deepEqual(lists.lists, [], "inaccessible list labels should be removed before index shaping is returned");
  await assert.rejects(
    () => listsService.suggestItems(unprivilegedSession, { listId: fixtures.active.list_id }),
    /permission|access/i,
    "suggestions for an inaccessible list should fail before catalog labels are returned",
  );
}

async function assertBrowserQueryContract() {
  const listsJs = await fs.readFile(path.join(process.cwd(), "public/js/lists.js"), "utf8");
  assert.match(listsJs, /buildListQueryParams/);
  assert.match(listsJs, /params\.set\("status"/);
  assert.match(listsJs, /params\.set\("sort"/);
  assert.match(listsJs, /params\.set\("neededByDate"/);
  assert.doesNotMatch(listsJs, /function filteredLists/);
  assert.doesNotMatch(listsJs, /function sortedLists/);
  assert.doesNotMatch(listsJs, /state\.lists\.filter\(\(list\)/);
}

async function readSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, workspaces.workspace_id
FROM users
CROSS JOIN workspaces
WHERE users.protected_user = 'yes'
ORDER BY users.user_id, workspaces.workspace_id
LIMIT 1;
`);

  return {
    timezone: "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
