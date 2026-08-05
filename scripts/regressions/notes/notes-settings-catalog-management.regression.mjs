export const regressionMeta = Object.freeze({
  id: "notes.notes-settings-catalog-management",
  area: "notes",
  tier: "focused",
  tags: ["bulk-edit", "catalogs", "navigation", "notes", "permissions", "settings"],
  description: "Proves the Notes Settings catalog surface, permission-gated safe read model, canonical row editing, and bounded bulk archive/restore behavior.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-settings-catalogs-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "notes-settings-catalogs.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Notes-Settings-Catalogs-Test-123!";

const [appShellSource, moduleSource, routesSource, settingsSource, viewSource] = await Promise.all([
  readText("src/services/app-shell.service.js"),
  readText("src/modules/notes/module.js"),
  readText("src/modules/notes/notes.routes.js"),
  readText("public/js/notes-settings.js"),
  readText("views/protected/notes-settings.html"),
]);

const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { NOTE_LIBRARY_BUCKETS } = await import("../../../src/modules/notes/library.js");
const { notesService } = await import("../../../src/modules/notes/notes.service.js");

try {
  assertStaticContract();
  await initializeDatabase();
  const session = await readProtectedSession();
  await assertCatalogManagement(session);
  await assertPermissionBoundary(session);
  const integrity = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(integrity, [{ integrity_check: "ok" }]);
  console.log("Notes Settings catalog management regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.match(moduleSource, /id: "notes-settings"[\s\S]*href: "notes-settings\.html"[\s\S]*parent: "settings\.html"[\s\S]*MANAGE_SETTINGS[\s\S]*MANAGE_LIBRARY/);
  assert.match(appShellSource, /\["calendar-settings\.html", 0\][\s\S]*\["files-settings\.html", 1\][\s\S]*\["tags\.html", 2\][\s\S]*\["notes-settings\.html", 3\][\s\S]*\["tasks-settings\.html", 4\]/);
  assert.match(moduleSource, /id: "notes-settings"[\s\S]*path: "\/notes-settings\.html"[\s\S]*file: "notes-settings\.html"/);
  assert.match(moduleSource, /id: "catalogManagement"[\s\S]*type: "info"[\s\S]*placement: "module"[\s\S]*runtime secrets|Catalogs are the collection hierarchy/i);
  assert.match(routesSource, /get\("\/notes\/settings\/catalogs"[\s\S]*listCatalogSettings/);
  assert.match(routesSource, /post\("\/notes\/settings\/catalogs\/bulk"[\s\S]*bulkManageCatalogs/);
  assert.match(viewSource, /data-settings-host="module"[\s\S]*data-settings-module-id="notes"[\s\S]*js\/notes-settings\.js/);
  assert.match(settingsSource, /createDataTable\(\{[\s\S]*Notes catalogs[\s\S]*Catalog[\s\S]*Library[\s\S]*Status[\s\S]*Actions/);
  assert.match(settingsSource, /catalogBulkButton\("Archive selected", "archive"[\s\S]*catalogBulkButton\("Restore selected", "restore"/);
  assert.match(settingsSource, /createBulkActionToolbar\(\{[\s\S]*label: "Bulk Catalog Actions"[\s\S]*selectedCount/);
  assert.match(settingsSource, /createModalForm\(\{[\s\S]*Edit Catalog[\s\S]*Create Catalog/);
  assert.doesNotMatch(settingsSource, /SECURE_NOTES_MASTER_KEY|LONGTAIL_SECURE_NOTES_MASTER_KEY/);
}

async function assertCatalogManagement(session) {
  const rootCatalog = (await notesService.createCollection({
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    title: "Operations",
  }, session)).collection;
  const childCatalog = (await notesService.createCollection({
    description: "Procedures and checklists",
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    parentCollectionId: rootCatalog.note_library_collection_id,
    sortOrder: 10,
    title: "Procedures",
  }, session)).collection;

  let settings = await notesService.listCatalogSettings(session);
  assert.equal(settings.limits.bulkSelection, 100);
  const safeChild = settings.catalogs.find((catalog) => catalog.catalogId === childCatalog.note_library_collection_id);
  assert.deepEqual(safeChild, {
    catalogId: childCatalog.note_library_collection_id,
    title: "Procedures",
    description: "Procedures and checklists",
    libraryBucket: NOTE_LIBRARY_BUCKETS.REFERENCE,
    parentCatalogId: rootCatalog.note_library_collection_id,
    path: "Operations / Procedures",
    depth: 1,
    sortOrder: 10,
    source: "manual",
    status: "active",
    securityPolicy: "normal",
    effectiveSecurityMode: "normal",
    securityInherited: false,
    securityTransitionState: "stable",
    securityTransitionAction: "none",
    securityTransitionVersion: 0,
    securityTransitionJobId: null,
    securityTransitionStartedAt: null,
    securityTransitionErrorCode: null,
    updatedAt: childCatalog.updated_at,
  });
  assert.equal(Object.hasOwn(safeChild, "metadata_json"), false);
  assert.equal(Object.hasOwn(safeChild, "accessibleNoteCount"), false);

  const edited = await notesService.updateCollection(childCatalog.note_library_collection_id, {
    description: "Updated catalog description",
    parentCollectionId: rootCatalog.note_library_collection_id,
    sortOrder: 20,
    title: "Runbooks",
  }, session);
  assert.equal(edited.collection.path_cache, "Operations / Runbooks");
  assert.equal(edited.collection.sort_order, 20);

  const archived = await notesService.bulkManageCatalogs({
    action: "archive",
    catalogIds: [rootCatalog.note_library_collection_id, childCatalog.note_library_collection_id],
  }, session);
  assert.equal(archived.requestedCount, 2);
  assert.equal(archived.affectedCount, 2, "selecting a parent and child should archive the subtree once");
  assert.equal(archived.catalogs.length, 1);
  assert.deepEqual(archived.errors, []);

  settings = await notesService.listCatalogSettings(session);
  assert.equal(settings.catalogs.find((catalog) => catalog.catalogId === rootCatalog.note_library_collection_id)?.status, "archived");
  assert.equal(settings.catalogs.find((catalog) => catalog.catalogId === childCatalog.note_library_collection_id)?.status, "archived");

  const restored = await notesService.bulkManageCatalogs({
    action: "restore",
    catalogIds: [childCatalog.note_library_collection_id, rootCatalog.note_library_collection_id],
  }, session);
  assert.equal(restored.affectedCount, 2, "bulk restore should process parents before selected children");
  assert.deepEqual(restored.errors, []);

  const partial = await notesService.bulkManageCatalogs({
    action: "archive",
    catalogIds: [rootCatalog.note_library_collection_id, "missing-catalog"],
  }, session);
  assert.equal(partial.affectedCount, 2);
  assert.deepEqual(partial.errors, [{ catalogId: "missing-catalog", message: "Note catalog not found." }]);

  await assert.rejects(
    notesService.bulkManageCatalogs({ action: "archive", catalogIds: [] }, session),
    (error) => error?.statusCode === 400 && /Select at least one Notes catalog/.test(error.message),
  );
  await assert.rejects(
    notesService.bulkManageCatalogs({ action: "archive", catalogIds: Array.from({ length: 101 }, (_, index) => `catalog-${index}`) }, session),
    (error) => error?.statusCode === 400 && /at most 100 catalogs/.test(error.message),
  );
}

async function assertPermissionBoundary(session) {
  const deniedSession = { ...session, user_id: "notes-settings-user-without-permissions" };
  await assert.rejects(
    notesService.listCatalogSettings(deniedSession),
    (error) => error?.statusCode === 403,
  );
  await assert.rejects(
    notesService.bulkManageCatalogs({ action: "archive", catalogIds: ["catalog"] }, deniedSession),
    (error) => error?.statusCode === 403,
  );
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.display_name, users.timezone, workspaces.workspace_id
FROM users
JOIN workspaces ON workspaces.owner_user_id = users.user_id
WHERE users.protected_user = 'yes'
ORDER BY users.rowid
LIMIT 1;
`);
  assert.ok(rows[0]?.workspace_id, "seeded protected workspace should exist");
  return {
    active_workspace_id: rows[0].workspace_id,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}

async function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}
