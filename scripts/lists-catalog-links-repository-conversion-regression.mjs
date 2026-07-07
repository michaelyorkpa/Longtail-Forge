import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.6d";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-catalog-links-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-catalog-links-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Lists-Catalog-Links-Repository-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const listsRepoSource = readText("src/modules/lists/lists.repo.js");
const listsModuleSource = readText("src/modules/lists/module.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const listsDocs = readText("docs/lists-module.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, db, initializeDatabase } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { listsRepository } = await import("../src/modules/lists/lists.repo.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const {
  LIST_STATUSES,
  LIST_TYPES,
} = await import("../src/modules/lists/storage-contract.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { tasksService } = await import("../src/modules/tasks/tasks.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertCatalogLifecycle(session, fixtures);
  await assertLinkLifecycle(session, fixtures);
  await assertServiceReadShaping(session, fixtures);
  await assertIntegrity();

  console.log("Lists catalog and linked records repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Lists catalog/link conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Lists catalog/link conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Lists catalog/link conversion version");
  assert.match(listsModuleSource, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Lists module should report the current app version");

  assert.match(listsRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Lists repository should import only the provider-neutral db facade after the .17 wave");
  assert.doesNotMatch(listsRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger|numberOrNullSql)\b/, "Lists repository should have no literal helpers or compatibility query wrappers after the .17 wave");
  assert.doesNotMatch(listsRepoSource, /COLLATE NOCASE|LOWER\s*\(/, "Lists repository should route case-insensitive SQL through dialect seams");
  assert.match(listsRepoSource, /async function createCatalogItem[\s\S]*await db\.run\(`[\s\S]*INSERT INTO list_item_catalog[\s\S]*:catalogItemId/, "catalog creates should use named params through db.run");
  assert.match(listsRepoSource, /async function updateCatalogItem[\s\S]*await db\.run\(`[\s\S]*UPDATE list_item_catalog[\s\S]*:catalogItemId/, "catalog updates should use named params through db.run");
  assert.match(listsRepoSource, /async function readCatalogItemById[\s\S]*await db\.get\(`[\s\S]*catalog_item_id = :catalogItemId/, "catalog reads should use named params through db.get");
  assert.match(listsRepoSource, /async function listCatalogSuggestions[\s\S]*db\.dialect\.comparison\.likeNoCase\("normalized_name", ":queryPattern"\)[\s\S]*orderByNoCase\("item_name", "ASC"\)[\s\S]*LIMIT :limit/, "catalog suggestions should use bound params and dialect comparison/order seams");
  assert.match(listsRepoSource, /async function incrementCatalogUsage[\s\S]*await db\.run\(`[\s\S]*use_count = use_count \+ 1[\s\S]*:updatedByUserId/, "catalog usage updates should use named params through db.run");
  assert.match(listsRepoSource, /async function createLink[\s\S]*await db\.run\(`[\s\S]*INSERT INTO list_links[\s\S]*:linkId/, "link creates should use named params through db.run");
  assert.match(listsRepoSource, /async function listLinksForLists[\s\S]*list_id IN \(:listIds\)/, "batched link reads should use array-valued list id params");
  assert.match(listsRepoSource, /async function removeLink[\s\S]*await db\.run\(`[\s\S]*removed_at = :removedAt/, "link removals should use named params through db.run");
  assert.match(listsRepoSource, /function catalogInsertParams[\s\S]*quantity: numberOrNull\(item\.quantity \?\? 1\)[\s\S]*useCount: integer\(item\.use_count \|\| 0\)/, "catalog param builders should preserve quantity and use-count coercion");
  assert.match(listsRepoSource, /function linkInsertParams[\s\S]*linkRole: text\(link\.link_role \|\| "related"\)/, "link param builders should preserve default related role");

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.6d:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 388[\s\S]*Total runtime database operation calls seen by the audit scanner: 432/, "audit docs should record the current Files lifecycle/settings/quota conversion ratchet");
  assert.match(auditDocs, /\| lists\/lists\.repo \| Converted \| 0 \| 0 \| 21 \| 21 \|/, "audit inventory should mark lists/lists.repo fully converted");
  assert.match(auditDocs, /0\.33\.5\.27\.17 Lists Catalog and Linked Records Repository Conversion[\s\S]*`lists\/lists\.repo` is fully converted[\s\S]*726 runtime literal-helper invocations[\s\S]*149 direct interpolated SQL operation sites[\s\S]*201 existing bound operation sites/, "audit docs should record the Lists catalog/link conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.17[\s\S]*`lists\/lists\.repo` is fully converted[\s\S]*726 remaining helper invocations/, "database docs should record the full Lists repository conversion");
  assert.match(listsDocs, new RegExp(`current Lists implementation as of ${escapeRegExp(appVersion)}`), "Lists docs should report the current implementation version");
  assert.match(listsDocs, /As of 0\.33\.5\.27\.17[\s\S]*Lists repository is fully converted[\s\S]*catalog[\s\S]*linked-record/, "Lists docs should document the fully converted repository boundary");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.17 - Conversion wave: Lists catalog and linked records[\s\S]*- \[x\] Convert the remaining `lists\/lists\.repo`[\s\S]*- \[x\] Preserve catalog suggestions[\s\S]*- \[x\] Because the 0\.33\.5\.27\.16\/0\.33\.5\.27\.17 split[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.17 - [\s\S]*Lists catalog and linked records repository conversion[\s\S]*726 helper invocations[\s\S]*149 direct interpolated operation sites[\s\S]*201 bound operation sites/, "changelog should record the Lists catalog/link conversion burndown");
  assert.match(regressionSuite, /scripts\/lists-catalog-links-repository-conversion-regression\.mjs/, "regression suite should include the Lists catalog/link conversion proof");
}

async function createFixtures(session) {
  const suffix = randomUUID().slice(0, 8);
  const client = (await clientsService.createClient({
    name: `Lists Catalog Client ${suffix}`,
  }, session)).client;
  const project = (await clientsService.createProject(client.id, {
    name: `Lists Catalog Project ${suffix}`,
  }, session)).project;
  const list = await listsRepository.create(session.workspace_id, {
    client_id: client.id,
    created_by_user_id: session.user_id,
    description: "Catalog/link conversion list",
    is_reusable: false,
    list_type: LIST_TYPES.PROCUREMENT,
    metadata_json: JSON.stringify({ slice: "0.33.5.27.18" }),
    project_id: project.id,
    status: LIST_STATUSES.ACTIVE,
    title: `27.17 Catalog Links ${suffix}`,
    updated_by_user_id: session.user_id,
  });
  const secondList = await listsRepository.create(session.workspace_id, {
    created_by_user_id: session.user_id,
    is_reusable: false,
    list_type: LIST_TYPES.CHECKLIST,
    status: LIST_STATUSES.ACTIVE,
    title: `27.17 Second ${suffix}`,
    updated_by_user_id: session.user_id,
  });
  const task = (await tasksService.create({
    title: `27.17 Linked Task ${suffix}`,
  }, session)).task;
  const note = (await notesService.create({
    body_markdown: `27.17 linked note ${suffix}`,
    title: `27.17 Linked Note ${suffix}`,
  }, session)).note;

  return {
    client,
    list,
    note,
    project,
    secondList,
    suffix,
    task,
  };
}

async function assertCatalogLifecycle(session, fixtures) {
  const shared = await listsRepository.createCatalogItem(session.workspace_id, {
    created_by_user_id: session.user_id,
    estimated_cost: "10.50",
    item_name: `Conversion Bolt Shared ${fixtures.suffix}`,
    list_type: LIST_TYPES.PROCUREMENT,
    metadata_json: JSON.stringify({ scope: "shared" }),
    normalized_name: `conversion bolt shared ${fixtures.suffix}`,
    quantity: "1.5",
    unit: "box",
    updated_by_user_id: session.user_id,
    use_count: 20,
    vendor_name: "Shared Vendor",
  });
  const clientScoped = await listsRepository.createCatalogItem(session.workspace_id, {
    client_id: fixtures.client.id,
    created_by_user_id: session.user_id,
    item_name: `Conversion Bolt Client ${fixtures.suffix}`,
    list_type: LIST_TYPES.PROCUREMENT,
    normalized_name: `conversion bolt client ${fixtures.suffix}`,
    quantity: 2,
    unit: "each",
    updated_by_user_id: session.user_id,
    use_count: 1,
  });
  const projectScoped = await listsRepository.createCatalogItem(session.workspace_id, {
    client_id: fixtures.client.id,
    created_by_user_id: session.user_id,
    item_name: `Conversion Bolt Project ${fixtures.suffix}`,
    list_type: LIST_TYPES.PROCUREMENT,
    normalized_name: `conversion bolt project ${fixtures.suffix}`,
    project_id: fixtures.project.id,
    quantity: 3,
    unit: "pack",
    updated_by_user_id: session.user_id,
    use_count: 1,
  });
  const archived = await listsRepository.createCatalogItem(session.workspace_id, {
    archived_at: "2026-07-06T15:00:00.000Z",
    created_by_user_id: session.user_id,
    item_name: `Conversion Bolt Archived ${fixtures.suffix}`,
    list_type: LIST_TYPES.PROCUREMENT,
    normalized_name: `conversion bolt archived ${fixtures.suffix}`,
    updated_by_user_id: session.user_id,
    use_count: 100,
  });

  assert.equal(shared.quantity, 1.5, "catalog quantities should preserve finite numeric values");
  assert.equal(shared.estimated_cost, 10.5, "catalog estimated cost should preserve finite numeric values");
  assert.deepEqual(shared.metadata_json, { scope: "shared" }, "catalog metadata should remain parsed");
  assert.equal(shared.use_count, 20, "catalog use counts should preserve integer values");

  const suggestions = await listsRepository.listCatalogSuggestions(session.workspace_id, {
    clientId: fixtures.client.id,
    limit: 3,
    listType: LIST_TYPES.PROCUREMENT,
    projectId: fixtures.project.id,
    query: `conversion bolt`,
  });
  assert.deepEqual(
    suggestions.map((entry) => entry.catalog_item_id),
    [projectScoped.catalog_item_id, clientScoped.catalog_item_id, shared.catalog_item_id],
    "catalog suggestions should preserve project, client, shared ranking",
  );
  const fractionalLimit = await listsRepository.listCatalogSuggestions(session.workspace_id, {
    clientId: fixtures.client.id,
    limit: 2.9,
    listType: LIST_TYPES.PROCUREMENT,
    projectId: fixtures.project.id,
    query: `conversion bolt`,
  });
  assert.equal(fractionalLimit.length, 2, "catalog suggestion limits should preserve integer fallback coercion");
  const sharedOnly = await listsRepository.listCatalogSuggestions(session.workspace_id, {
    listType: LIST_TYPES.PROCUREMENT,
    query: `conversion bolt`,
  });
  assert.deepEqual(
    sharedOnly.map((entry) => entry.catalog_item_id),
    [shared.catalog_item_id],
    "catalog suggestions without client/project context should hide scoped suggestions",
  );
  assert.ok(!suggestions.some((entry) => entry.catalog_item_id === archived.catalog_item_id), "archived catalog rows should stay out of suggestions");

  const updated = await listsRepository.updateCatalogItem(session.workspace_id, {
    ...projectScoped,
    estimated_cost: "",
    item_name: `Conversion Bolt Project Revised ${fixtures.suffix}`,
    metadata_json: { updated: true },
    normalized_name: `conversion bolt project revised ${fixtures.suffix}`,
    quantity: null,
    updated_by_user_id: session.user_id,
    use_count: "7.8",
  });
  assert.equal(updated.item_name, `Conversion Bolt Project Revised ${fixtures.suffix}`, "catalog updates should return the updated row");
  assert.equal(updated.quantity, 1, "catalog update quantity should preserve null-to-default behavior");
  assert.equal(updated.estimated_cost, null, "catalog update blank estimated cost should remain null");
  assert.equal(updated.use_count, 7, "catalog update use count should preserve integer fallback behavior");
  assert.deepEqual(updated.metadata_json, { updated: true }, "catalog update metadata should remain parsed");

  const used = await listsRepository.incrementCatalogUsage(session.workspace_id, updated.catalog_item_id, session.user_id);
  assert.equal(used.use_count, 8, "catalog usage increments should preserve arithmetic behavior");
  assert.equal(used.updated_by_user_id, session.user_id, "catalog usage should keep updater storage");
  assert.ok(used.last_used_at, "catalog usage should set last_used_at");

  const archivedBefore = archived.use_count;
  const archivedAfter = await listsRepository.incrementCatalogUsage(session.workspace_id, archived.catalog_item_id, session.user_id);
  assert.equal(archivedAfter.use_count, archivedBefore, "archived catalog rows should not be usage-incremented");

  fixtures.catalog = {
    clientScoped,
    projectScoped: updated,
    shared,
  };
}

async function assertLinkLifecycle(session, fixtures) {
  const taskLink = await listsRepository.createLink(session.workspace_id, {
    created_by_user_id: session.user_id,
    link_role: "blocks",
    list_id: fixtures.list.list_id,
    metadata_json: { source: "repo" },
    module_id: "tasks",
    target_id: fixtures.task.task_id,
    target_type: "task",
  });
  const noteLink = await listsRepository.createLink(session.workspace_id, {
    created_by_user_id: session.user_id,
    list_id: fixtures.list.list_id,
    module_id: "notes",
    target_id: fixtures.note.note_id,
    target_type: "note",
  });
  const secondListLink = await listsRepository.createLink(session.workspace_id, {
    created_by_user_id: session.user_id,
    list_id: fixtures.secondList.list_id,
    module_id: "tasks",
    target_id: fixtures.task.task_id,
    target_type: "task",
  });

  assert.equal(taskLink.link_role, "blocks", "link roles should preserve explicit values");
  assert.deepEqual(taskLink.metadata_json, { source: "repo" }, "link metadata should remain parsed");
  assert.equal(noteLink.link_role, "related", "link roles should preserve the default related value");
  assert.equal((await listsRepository.readLinkById(session.workspace_id, fixtures.list.list_id, taskLink.list_link_id)).target_id, fixtures.task.task_id, "single link reads should remain exact");
  assert.deepEqual(
    (await listsRepository.listLinks(session.workspace_id, fixtures.list.list_id)).map((link) => link.list_link_id),
    [taskLink.list_link_id, noteLink.list_link_id],
    "active link reads should preserve created_at ordering",
  );
  assert.deepEqual(
    (await listsRepository.listLinksForLists(session.workspace_id, [fixtures.secondList.list_id, fixtures.list.list_id, fixtures.list.list_id])).map((link) => link.list_link_id),
    [taskLink, noteLink, secondListLink]
      .sort((left, right) => left.list_id.localeCompare(right.list_id) || left.created_at.localeCompare(right.created_at))
      .map((link) => link.list_link_id),
    "batched link reads should de-duplicate list ids and preserve list_id then created_at ordering",
  );
  assert.deepEqual(await listsRepository.listLinksForLists(session.workspace_id, []), [], "empty batched link reads should remain no-op");

  const removed = await listsRepository.removeLink(session.workspace_id, fixtures.list.list_id, taskLink.list_link_id);
  assert.ok(removed.removed_at, "link removals should return the soft-removed link");
  assert.equal((await listsRepository.readLinkById(session.workspace_id, fixtures.list.list_id, taskLink.list_link_id)).removed_at, removed.removed_at, "removed links should remain readable by id");
  assert.deepEqual(
    (await listsRepository.listLinks(session.workspace_id, fixtures.list.list_id)).map((link) => link.list_link_id),
    [noteLink.list_link_id],
    "active link reads should exclude removed links",
  );

  fixtures.links = {
    noteLink,
    secondListLink,
    taskLink: removed,
  };
}

async function assertServiceReadShaping(session, fixtures) {
  const read = await listsService.read(fixtures.list.list_id, session);
  assert.deepEqual(
    read.links.map((link) => [link.list_link_id, link.target?.label, link.targetAccess]),
    [[fixtures.links.noteLink.list_link_id, fixtures.note.title, "available"]],
    "service list reads should preserve permission-safe linked target shaping",
  );
  assert.equal(read.list.resumeContext.linkedRecords.length, 1, "service resume context should preserve active linked-record inputs");
  assert.equal(read.list.resumeContext.linkedRecords[0].label, fixtures.note.title, "service resume context should preserve linked-record labels");

  const linkedQuery = await listsService.list(session, {
    reusable: "all",
    targetId: fixtures.note.note_id,
    targetType: "note",
  });
  assert.deepEqual(
    linkedQuery.lists.map((list) => list.list_id),
    [fixtures.list.list_id],
    "service linked-record filters should keep using converted batched link reads",
  );

  const suggestions = await listsService.suggestItems(session, {
    listId: fixtures.list.list_id,
    q: "conversion bolt",
  });
  assert.equal(suggestions.suggestions[0].catalog_item_id, fixtures.catalog.projectScoped.catalog_item_id, "service catalog suggestions should preserve context ranking");
}

async function readSeedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);

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

async function assertIntegrity() {
  const rows = await db.query("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
