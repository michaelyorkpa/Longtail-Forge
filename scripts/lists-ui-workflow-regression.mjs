import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-ui-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-ui.db");
process.env.SUPER_ADMIN_PASSWORD = "Lists-Ui-Test-123!";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { appShellService } = await import("../src/services/app-shell.service.js");
const { staticService } = await import("../src/services/static.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const session = await readProtectedSession(workspace.workspace_id);

  await assertManifest();
  await assertProtectedView(session);
  await assertNavigation(session);
  await assertWorkspaceAwareLabels(session);
  await assertDisabledModuleState(session);
  await assertIntegrity();

  console.log("Lists UI workflow regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifest() {
  const listsModule = modulesService.getModule("lists");

  assert.equal(listsModule.version, "0.33.5.14.2");
  assert.ok(listsModule.navigation.some((item) => item.href === "lists.html" && item.parent === "projects.html"));
  assert.ok(listsModule.protectedViews.some((view) => view.file === "lists.html" && view.allowDisabledRead === true));
  assert.ok(listsModule.browserAssets.some((asset) => asset.path === "/js/lists.js"));
}

async function assertProtectedView(session) {
  const result = await staticService.read("/lists.html", session);
  const html = result.contents.toString("utf8");
  const listsJs = await fs.readFile(path.join(process.cwd(), "public/js/lists.js"), "utf8");
  const styles = await fs.readFile(path.join(process.cwd(), "public/css/longtail-forge.css"), "utf8");

  assert.equal(result.statusCode, 200);
  assert.match(html, /data-lists-title/);
  assert.match(html, /data-list-create/);
  assert.match(html, /data-list-filter-status/);
  assert.match(html, /data-list-filter-reusable/);
  assert.match(html, /<option value="no" selected>Normal lists<\/option>/);
  assert.match(html, /data-list-filter-assignee/);
  assert.match(html, /data-list-filter-needed/);
  assert.match(html, /data-list-filter-archive/);
  assert.match(html, /data-list-detail/);
  assert.match(html, /data-list-dialog/);
  assert.match(html, /data-list-business-control/);
  assert.match(html, /data-list-context-control/);
  assert.match(html, /js\/shared\/icons\.js\?v=1/);
  assert.match(html, /js\/shared\/client-project-options\.js\?v=1/);
  assert.match(html, /js\/lists\.js\?v=3/);
  assert.match(html, /css\/longtail-forge\.css\?v=20/);

  assert.match(listsJs, /\/api\/lists\?\$\{buildListQueryParams\(\)\}/);
  assert.match(listsJs, /params\.set\("status"/);
  assert.match(listsJs, /params\.set\("sort"/);
  assert.match(listsJs, /\/api\/client-projects/);
  assert.match(listsJs, /\/api\/users/);
  assert.match(listsJs, /complete-list/);
  assert.match(listsJs, /finalize-list/);
  assert.match(listsJs, /duplicate-list/);
  assert.match(listsJs, /mark-reusable-list/);
  assert.match(listsJs, /unmark-reusable-list/);
  assert.match(listsJs, /\/api\/lists\/\$\{listId\}\/duplicate/);
  assert.match(listsJs, /\/api\/lists\/item-suggestions/);
  assert.match(listsJs, /Reusable List/);
  assert.match(listsJs, /BOM/);
  assert.match(listsJs, /reopen-list/);
  assert.match(listsJs, /archive-list/);
  assert.match(listsJs, /restore-list/);
  assert.match(listsJs, /delete-list/);
  assert.match(listsJs, /check-item/);
  assert.match(listsJs, /uncheck-item/);
  assert.match(listsJs, /complete-item/);
  assert.match(listsJs, /move-item-up/);
  assert.match(listsJs, /move-item-down/);
  assert.match(listsJs, /setBusinessControlsVisible\(usesBusinessScope\(\)\)/);
  assert.match(listsJs, /compactStateSummary/);
  assert.match(listsJs, /dataset\.listStateSummary/);
  assert.match(listsJs, /createNextActionStrip/);
  assert.match(listsJs, /dataset\.listNextAction/);
  assert.match(listsJs, /normalizeListProgress/);
  assert.match(listsJs, /resumeContext/);
  assert.match(listsJs, /sourceUrl/);
  assert.match(listsJs, /readOnlyStateMessage/);
  assert.match(listsJs, /setContextControlsVisible/);
  assert.match(listsJs, /shouldShowContextControls/);
  assert.match(listsJs, /Create a list or adjust filters to resume work/);
  assert.match(listsJs, /Create an active working copy when this historical record should be used again/);
  assert.match(listsJs, /Create Working Copy/);
  assert.match(listsJs, /Duplicate into Active Work/);
  assert.match(listsJs, /createSourceContextPanel/);
  assert.match(listsJs, /dataset\.listSourceContext/);
  assert.match(listsJs, /sourceContextLabel/);
  assert.match(listsJs, /Independent working copy from/);
  assert.match(listsJs, /Template for repeatable work/);
  assert.match(listsJs, /Working Copy/);
  assert.match(listsJs, /createItemNameField/);
  assert.match(listsJs, /data-list-item-suggestions/);
  assert.match(listsJs, /save_to_catalog/);
  assert.match(listsJs, /catalog_item_id/);
  assert.match(listsJs, /applySuggestionSelection/);
  assert.match(listsJs, /Save as reusable item/);
  assert.match(listsJs, /createLinkedRecordsPanel/);
  assert.match(listsJs, /data-list-link-form/);
  assert.match(listsJs, /\/api\/lists\/\$\{encodeURIComponent\(listId\)\}\/links/);
  assert.match(listsJs, /remove-link/);
  assert.match(listsJs, /Linked Records/);
  assert.match(listsJs, /dataset\.linkAccess/);
  assert.match(listsJs, /Unavailable linked record/);
  assert.match(listsJs, /listDescriptionExcerpt/);
  assert.match(listsJs, /linkedRecordSummary/);
  assert.match(listsJs, /listTimelineSummary/);
  assert.match(listsJs, /createCostSummaryPanel/);
  assert.match(listsJs, /dataset\.listCostSummary/);
  assert.match(listsJs, /vendor_name/);
  assert.match(listsJs, /estimated_cost/);
  assert.match(listsJs, /actual_cost/);
  assert.match(listsJs, /tracking_id/);
  assert.match(listsJs, /formatCurrency/);

  assert.match(styles, /\.lists-workspace/);
  assert.match(styles, /\.lists-state-summary/);
  assert.match(styles, /\.lists-next-action/);
  assert.match(styles, /\.lists-next-action-facts/);
  assert.match(styles, /\.lists-source-context/);
  assert.match(styles, /\.lists-checkbox-field/);
  assert.match(styles, /\.lists-links-panel/);
  assert.match(styles, /\.lists-link-form/);
  assert.match(styles, /\.lists-link-item\[data-link-access="unavailable"\]/);
  assert.match(styles, /\.lists-cost-summary/);
  assert.match(styles, /\.lists-item-advanced/);
  assert.match(styles, /\.lists-item-advanced-fields/);
  assert.match(styles, /\.lists-badge\.is-reusable/);
  assert.match(styles, /\.lists-badge\.is-bom/);
  assert.match(styles, /\.lists-badge\.is-duplicated/);
  assert.match(styles, /\.lists-item-form/);
  assert.match(styles, /\.lists-status-badge\.is-active/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*\.lists-workspace/);
}

async function assertNavigation(session) {
  const bootstrap = await appShellService.bootstrap(session);
  const actionsMenu = bootstrap.navigation.find((item) => item.id === "actions" && Array.isArray(item.items));
  const listsLink = flattenNavigation(actionsMenu?.items).find((item) => item.href === "lists.html");

  assert.ok(listsLink, "Lists should appear in authenticated navigation while enabled");
  assert.equal(listsLink.label, "Procurement Lists");
  assert.deepEqual(
    actionsMenu.items.map((item) => item.label),
    ["Time Keeping", "Tasks", "Notes", "Procurement Lists", "Files", "Project Settings", "Reporting"],
  );
}

async function assertWorkspaceAwareLabels(session) {
  await runSql(`
UPDATE workspaces
SET workspace_type = 'family'
WHERE workspace_id = ${sqlText(session.workspace_id)};
`);

  const bootstrap = await appShellService.bootstrap(session);
  const listsLink = flattenNavigation(bootstrap.navigation).find((item) => item.href === "lists.html");
  assert.equal(listsLink?.label, "Shopping Lists");

  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(session.workspace_id)};
`);
}

async function assertDisabledModuleState(session) {
  await setListsStatus(session.workspace_id, "disabled");

  const bootstrap = await appShellService.bootstrap(session);
  const listsLink = flattenNavigation(bootstrap.navigation).find((item) => item.href === "lists.html");
  assert.equal(listsLink, undefined, "disabled Lists module should not appear in navigation");

  const historicalRead = await staticService.read("/lists.html", session);
  assert.equal(historicalRead.statusCode, 200, "Lists view should allow historical read while disabled");

  await setListsStatus(session.workspace_id, "enabled");
}

async function setListsStatus(workspaceId, status) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE workspace_modules
SET status = ${sqlText(status)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'lists';
`);
}

function flattenNavigation(items = []) {
  return items.flatMap((item) => [
    item,
    ...(item.items ? flattenNavigation(item.items) : []),
  ]);
}

async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
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

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    user_id: rows[0].user_id,
    username: rows[0].username,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}
