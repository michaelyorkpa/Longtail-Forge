import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.28";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-record-item-repo-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-record-item-repo.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Lists-Record-Item-Repository-Test-123!";
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
const { listsRepository } = await import("../src/modules/lists/lists.repo.js");
const { listsService } = await import("../src/modules/lists/lists.service.js");
const {
  LIST_ITEM_PURCHASE_STATUSES,
  LIST_STATUSES,
  LIST_TYPES,
} = await import("../src/modules/lists/storage-contract.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();
  await assertRepositoryRecordAndItemLifecycle(session);
  await assertIntegrity();

  console.log("Lists records and items repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Lists records/items conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Lists records/items conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Lists records/items conversion version");
  assert.match(listsModuleSource, new RegExp(`version:\\s*"${escapeRegExp(appVersion)}"`), "Lists module should report the current app version");

  assert.match(listsRepoSource, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, "Lists repository should import only the provider-neutral db facade after the .17 wave");
  const convertedSource = listsRepoSource.slice(
    listsRepoSource.indexOf("async function list("),
    listsRepoSource.indexOf("async function createCatalogItem("),
  );
  assert.ok(convertedSource.length > 0, "Lists converted source slice should be discoverable");
  assert.doesNotMatch(convertedSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger|numberOrNullSql)\b/, "converted list record/item paths should not use literal helpers or compatibility wrappers");
  assert.doesNotMatch(convertedSource, /COLLATE NOCASE|LOWER\s*\(/, "converted list record/item paths should route case-insensitive ordering through dialect seams");
  assert.match(convertedSource, /db\.query\(`[\s\S]*FROM lists[\s\S]*:workspaceId[\s\S]*orderByNoCase\("title", "ASC"\)/, "list record reads should use named params and the title ordering seam");
  assert.match(convertedSource, /list_id IN \(:listIds\)/, "batched list reads should use array-valued named params");
  assert.match(convertedSource, /FROM list_items[\s\S]*list_id IN \(:listIds\)/, "batched item reads should use array-valued named params");
  assert.match(convertedSource, /db\.dialect\.boolean\.bind\(Boolean\(filters\.isReusable\)\)/, "list reusable filters should bind through the boolean seam");
  assert.match(listsRepoSource, /db\.dialect\.boolean\.bind\(Boolean\(listPayload\.is_reusable\)\)/, "list reusable writes should bind through the boolean seam");
  assert.match(convertedSource, /db\.transaction\(async \(transaction\)[\s\S]*transaction\.run\(`[\s\S]*UPDATE list_items/, "item reorder writes should use transaction callback updates");
  assert.doesNotMatch(listsRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger|numberOrNullSql)\b/, "Lists repository should have no literal helpers or compatibility query wrappers after the .17 wave");
  assert.match(listsRepoSource, /function nullableText\(value\)[\s\S]*String\(value\)\.trim\(\) === ""[\s\S]*\? null/, "converted nullable params should preserve nullable text trimming");
  assert.match(listsRepoSource, /function integer\(value\)[\s\S]*Number\.parseInt[\s\S]*: 0/, "converted integer params should preserve integer fallback behavior");
  assert.match(listsRepoSource, /function numberOrNull\(value\)[\s\S]*Number\(value\)[\s\S]*Number\.isFinite/, "converted item number params should preserve finite-number-or-null behavior");

  assert.match(auditDocs, /0\.33\.5\.27\.16 Lists Records and Items Repository Conversion[\s\S]*record and item read\/write paths[\s\S]*`lists\/lists\.repo`[\s\S]*remaining catalog and linked-record paths[\s\S]*798 runtime literal-helper invocations[\s\S]*159 direct interpolated SQL operation sites[\s\S]*191 existing bound operation sites/, "audit docs should record the Lists records/items conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.16[\s\S]*`lists\/lists\.repo`[\s\S]*record and item paths[\s\S]*72 helper invocations remain[\s\S]*798 remaining helper invocations/, "database docs should record the Lists records/items conversion");
  assert.match(listsDocs, new RegExp(`current Lists implementation as of ${escapeRegExp(appVersion)}`), "Lists docs should report the current implementation version");
  assert.match(listsDocs, /As of 0\.33\.5\.27\.16[\s\S]*list record and list item persistence paths use named params[\s\S]*[Cc]atalog and linked-record paths remain assigned to 0\.33\.5\.27\.17/, "Lists docs should document the converted records/items boundary");
  assert.match(roadmap, /### Version 0\.33\.5\.27\.16 - Conversion wave: Lists records and items[\s\S]*- \[x\] Convert list record and list item read\/write paths[\s\S]*- \[x\] Preserve list execution[\s\S]*- \[x\] Update the burndown ratchet/, "roadmap should mark the Lists records/items conversion slice complete");
  assert.match(changelog, /## Version 0\.33\.5\.27\.16 - [\s\S]*Lists records and items repository conversion[\s\S]*798 helper invocations[\s\S]*159 direct interpolated operation sites[\s\S]*191 bound operation sites/, "changelog should record the Lists records/items conversion burndown");
  assert.match(regressionSuite, /scripts\/lists-records-items-repository-conversion-regression\.mjs/, "regression suite should include the Lists records/items conversion proof");
}

async function assertRepositoryRecordAndItemLifecycle(session) {
  const suffix = randomUUID().slice(0, 8);
  const list = await listsRepository.create(session.workspace_id, {
    created_by_user_id: session.user_id,
    description: "Record/item conversion coverage",
    is_reusable: false,
    list_type: LIST_TYPES.PROCUREMENT,
    metadata_json: JSON.stringify({ slice: "0.33.5.27.16" }),
    status: LIST_STATUSES.ACTIVE,
    title: `27.16 Active ${suffix}`,
    updated_by_user_id: session.user_id,
  });
  const secondList = await listsRepository.create(session.workspace_id, {
    created_by_user_id: session.user_id,
    description: "",
    is_reusable: true,
    list_type: LIST_TYPES.PACKING,
    status: LIST_STATUSES.ACTIVE,
    title: `27.16 Reusable ${suffix}`,
    updated_by_user_id: session.user_id,
  });
  const deletedList = await listsRepository.create(session.workspace_id, {
    created_by_user_id: session.user_id,
    is_reusable: false,
    list_type: LIST_TYPES.SUPPLIES,
    status: LIST_STATUSES.DELETED,
    title: `27.16 Deleted ${suffix}`,
    updated_by_user_id: session.user_id,
  });

  assert.equal(list.is_reusable, false, "created non-reusable list should read as false");
  assert.deepEqual(list.metadata_json, { slice: "0.33.5.27.16" }, "list metadata should remain parsed");
  assert.equal(secondList.is_reusable, true, "created reusable list should read through the boolean seam");
  assert.equal((await listsRepository.readById(session.workspace_id, list.list_id)).title, list.title, "single list reads should stay exact");
  assert.equal((await listsRepository.readByIds(session.workspace_id, [list.list_id, secondList.list_id, list.list_id])).length, 2, "batched list reads should de-duplicate ids");
  assert.ok((await listsRepository.readByIds(session.workspace_id, [])).length === 0, "empty batched list reads should remain no-op");
  assert.ok((await listsRepository.list(session.workspace_id)).every((entry) => entry.list_id !== deletedList.list_id), "default list reads should hide deleted rows");
  assert.ok((await listsRepository.list(session.workspace_id, { includeDeleted: true })).some((entry) => entry.list_id === deletedList.list_id), "includeDeleted list reads should include deleted rows");
  assert.deepEqual(
    (await listsRepository.list(session.workspace_id, { isReusable: true })).map((entry) => entry.list_id),
    [secondList.list_id],
    "reusable filters should use boolean seam storage",
  );
  assert.deepEqual(
    (await listsRepository.list(session.workspace_id, { listType: LIST_TYPES.PROCUREMENT })).map((entry) => entry.list_id),
    [list.list_id],
    "list type filters should remain repository-owned and exact",
  );

  const updatedList = await listsRepository.update(session.workspace_id, {
    ...list,
    description: "Updated record conversion description",
    is_reusable: true,
    metadata_json: JSON.stringify({ updated: true }),
    status: LIST_STATUSES.COMPLETED,
    title: `27.16 Updated ${suffix}`,
    updated_by_user_id: session.user_id,
  });
  assert.equal(updatedList.status, LIST_STATUSES.COMPLETED, "list status updates should remain intact");
  assert.equal(updatedList.is_reusable, true, "list reusable updates should read through the boolean seam");
  assert.deepEqual(updatedList.metadata_json, { updated: true }, "list update metadata should remain parsed");

  const firstItem = await listsRepository.createItem(session.workspace_id, {
    actual_cost: "12.5",
    assigned_user_id: session.user_id,
    created_by_user_id: session.user_id,
    estimated_cost: "",
    item_name: `27.16 Bracket ${suffix}`,
    list_id: list.list_id,
    metadata_json: JSON.stringify({ item: "first" }),
    needed_by_date: "2026-07-20",
    notes: "Install on assembly",
    purchase_status: LIST_ITEM_PURCHASE_STATUSES.NEEDED,
    quantity: "2.5",
    sort_order: 20,
    unit: "box",
    updated_by_user_id: session.user_id,
  });
  const secondItem = await listsRepository.createItem(session.workspace_id, {
    created_by_user_id: session.user_id,
    item_name: `27.16 Cable ${suffix}`,
    list_id: list.list_id,
    purchase_status: LIST_ITEM_PURCHASE_STATUSES.ORDERED,
    quantity: 4,
    sort_order: 10,
    updated_by_user_id: session.user_id,
  });
  await listsRepository.createItem(session.workspace_id, {
    created_by_user_id: session.user_id,
    item_name: `27.16 Other List Item ${suffix}`,
    list_id: secondList.list_id,
    purchase_status: LIST_ITEM_PURCHASE_STATUSES.NEEDED,
    quantity: 1,
    sort_order: 5,
    updated_by_user_id: session.user_id,
  });

  assert.equal(firstItem.quantity, 2.5, "item quantity should preserve finite numeric values");
  assert.equal(firstItem.estimated_cost, null, "blank item numeric fields should remain null");
  assert.equal(firstItem.actual_cost, 12.5, "item actual cost should preserve finite numeric values");
  assert.deepEqual(firstItem.metadata_json, { item: "first" }, "item metadata should remain parsed");
  assert.deepEqual(
    (await listsRepository.listItems(session.workspace_id, list.list_id)).map((item) => item.list_item_id),
    [secondItem.list_item_id, firstItem.list_item_id],
    "item reads should preserve sort_order then created_at ordering",
  );
  assert.deepEqual(
    (await listsRepository.listItems(session.workspace_id, list.list_id, { purchaseStatus: LIST_ITEM_PURCHASE_STATUSES.ORDERED })).map((item) => item.list_item_id),
    [secondItem.list_item_id],
    "item purchase-status filters should remain exact",
  );
  assert.equal((await listsRepository.listItemsForLists(session.workspace_id, [list.list_id, secondList.list_id, list.list_id])).length, 3, "batched item reads should de-duplicate list ids and include visible items");
  assert.deepEqual(await listsRepository.listItemsForLists(session.workspace_id, []), [], "empty batched item reads should remain no-op");

  const checkedAt = "2026-07-06T12:30:00.000Z";
  const completedAt = "2026-07-06T13:00:00.000Z";
  const updatedItem = await listsRepository.updateItem(session.workspace_id, {
    ...firstItem,
    actual_cost: "",
    checked_at: checkedAt,
    checked_by_user_id: session.user_id,
    completed_at: completedAt,
    completed_by_user_id: session.user_id,
    estimated_cost: "not-a-number",
    item_name: `27.16 Bracket Updated ${suffix}`,
    metadata_json: JSON.stringify({ item: "updated" }),
    purchase_status: LIST_ITEM_PURCHASE_STATUSES.RECEIVED,
    quantity: 0,
    sort_order: "not-a-number",
    updated_by_user_id: session.user_id,
  });
  assert.equal(updatedItem.item_name, `27.16 Bracket Updated ${suffix}`, "item updates should return the updated item");
  assert.equal(updatedItem.quantity, 0, "updated quantity should preserve finite numeric values");
  assert.equal(updatedItem.estimated_cost, null, "invalid updated estimated cost should preserve number-or-null behavior");
  assert.equal(updatedItem.actual_cost, null, "blank updated actual cost should preserve number-or-null behavior");
  assert.equal(updatedItem.sort_order, 0, "invalid sort order should preserve integer fallback behavior");
  assert.equal(updatedItem.checked_at, checkedAt, "checked timestamp updates should remain intact");
  assert.equal(updatedItem.completed_at, completedAt, "completed timestamp updates should remain intact");
  assert.deepEqual(updatedItem.metadata_json, { item: "updated" }, "updated item metadata should remain parsed");

  const reordered = await listsRepository.reorderItems(session.workspace_id, list.list_id, [
    { list_item_id: firstItem.list_item_id, sort_order: 5 },
    { list_item_id: secondItem.list_item_id, sort_order: 15 },
  ], session.user_id);
  assert.deepEqual(
    reordered.map((item) => item.list_item_id),
    [firstItem.list_item_id, secondItem.list_item_id],
    "item reorder should preserve returned item ordering",
  );
  assert.deepEqual(
    (await listsRepository.reorderItems(session.workspace_id, list.list_id, [], session.user_id)).map((item) => item.list_item_id),
    [firstItem.list_item_id, secondItem.list_item_id],
    "empty item reorder should keep the existing ordering",
  );

  const deletedItem = await listsRepository.updateItem(session.workspace_id, {
    ...secondItem,
    deleted_at: "2026-07-06T14:00:00.000Z",
    updated_by_user_id: session.user_id,
  });
  assert.ok(deletedItem.deleted_at, "item delete-style updates should persist deleted_at");
  assert.deepEqual(
    (await listsRepository.listItems(session.workspace_id, list.list_id)).map((item) => item.list_item_id),
    [firstItem.list_item_id],
    "default item reads should hide deleted rows",
  );
  assert.deepEqual(
    (await listsRepository.listItems(session.workspace_id, list.list_id, { includeDeleted: true })).map((item) => item.list_item_id),
    [firstItem.list_item_id, secondItem.list_item_id],
    "includeDeleted item reads should include deleted rows",
  );

  const shaped = await listsService.read(list.list_id, session);
  assert.equal(shaped.list.progress.totalItemCount, 1, "service-shaped progress should still use converted item reads");
  assert.equal(shaped.list.progress.checkedItemCount, 1, "service-shaped checked progress should remain intact");
  assert.equal(shaped.list.resumeContext.progress.totalItemCount, 1, "service-owned resume context should remain shaped after conversion");
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
