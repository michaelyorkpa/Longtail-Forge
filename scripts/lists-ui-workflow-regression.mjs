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

  assert.equal(listsModule.version, "0.33.5.21.7.3");
  assert.ok(listsModule.navigation.some((item) => item.href === "lists.html" && item.parent === "projects.html"));
  assert.ok(listsModule.protectedViews.some((view) => view.file === "lists.html" && view.allowDisabledRead === true));
  assert.ok(listsModule.browserAssets.some((asset) => asset.path === "/js/lists.js"));
}

async function assertProtectedView(session) {
  const result = await staticService.read("/lists.html", session);
  const html = result.contents.toString("utf8");
  const listsJs = await fs.readFile(path.join(process.cwd(), "public/js/lists.js"), "utf8");
  const styles = await fs.readFile(path.join(process.cwd(), "public/css/longtail-forge.css"), "utf8");
  const listsStyles = styles.slice(styles.indexOf(".lists-filters-panel"), styles.indexOf(".client-item"));

  assert.equal(result.statusCode, 200);
  assert.match(html, /data-lists-host/);
  assert.doesNotMatch(html, /data-list-filter-status/);
  assert.doesNotMatch(html, /data-list-detail/);
  assert.doesNotMatch(html, /data-list-dialog/);
  assert.doesNotMatch(html, /<details class="lists-index-panel"/);
  assert.match(html, /js\/shared\/icons\.js\?v=2/);
  assert.match(html, /js\/shared\/client-project-options\.js\?v=2/);
  assert.match(html, /js\/shared\/view-builder\.js\?v=5/);
  assert.match(html, /js\/shared\/view-renderer\.js\?v=6/);
  assert.match(html, /js\/lists\.js\?v=13/);
  assert.match(html, /css\/longtail-forge\.css\?v=32/);

  assert.match(listsJs, /buildListsViewShell/);
  assert.match(listsJs, /view\.renderSurface\(renderDescriptor, host\)/);
  assert.match(listsJs, /listsViewSurfaceDescriptor/);
  assert.match(listsJs, /decorateListsDeclarativeSurface/);
  assert.match(listsJs, /registerListsViewBehaviors/);
  assert.match(listsJs, /renderDescriptorDataTable/);
  assert.match(listsJs, /renderDescriptorModalForm/);
  assert.match(listsJs, /dataset\.listsTitle/);
  assert.match(listsJs, /dataset\.listCreate/);
  assert.match(listsJs, /"listFilterStatus"/);
  assert.match(listsJs, /Normal lists/);
  assert.match(listsJs, /"listFilterAssignee"/);
  assert.match(listsJs, /"listFilterNeeded"/);
  assert.match(listsJs, /"listFilterArchive"/);
  assert.match(listsJs, /dataset\.listDetail/);
  assert.match(listsJs, /dataset\.listDialog/);
  assert.match(listsJs, /listBusinessControl/);
  assert.match(listsJs, /listContextControl/);
  assert.match(listsJs, /dataset\.listsIndexPanel/);
  assert.match(listsJs, /dataset\.listsIndexContent/);
  assert.match(listsJs, /\/api\/lists\?\$\{buildListQueryParams\(\)\}/);
  assert.match(listsJs, /params\.set\("status"/);
  assert.match(listsJs, /params\.set\("sort"/);
  assert.match(listsJs, /\/api\/client-projects/);
  assert.match(listsJs, /\/api\/users/);
  assert.match(listsJs, /loadTaskLinkTargets/);
  assert.match(listsJs, /\/api\/tasks\?status=active&sort=updated_desc/);
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
  assert.doesNotMatch(listsJs, /complete-item/, "The redundant complete/Done row action should be removed (the row checkbox already toggles done)");
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
  assert.match(listsJs, /listsLinkedRecordsSurfaceDescriptor/);
  assert.match(listsJs, /renderDescriptorLinkedRecordsPanel/);
  assert.match(listsJs, /linkTargetTypeOptions/);
  assert.match(listsJs, /syncLinkPickerMode/);
  assert.match(listsJs, /populateTaskLinkPicker/);
  assert.match(listsJs, /taskLinkOptionLabel/);
  assert.match(listsJs, /TASK_STATUS_LABELS/);
  assert.match(listsJs, /data-list-link-form/);
  assert.match(listsJs, /listTaskPickerControl/);
  assert.match(listsJs, /listRawLinkControl/);
  assert.match(listsJs, /listTaskPicker/);
  assert.match(listsJs, /Select a task to link/);
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
  assert.match(listsJs, /activeListsViewDescriptor\?\.indexPanel\?\.collapseOnSelect/);
  assert.match(listsJs, /collapseIndexAfterSelection/);
  assert.match(listsJs, /indexPanel\.open = false/);

  // 0.33.5.18.5.8 Lists main page refinement.
  assert.match(listsJs, /function createListDetailHeader/, "Lists detail should use a Notes-style header (title row + rule + meta)");
  assert.match(listsJs, /view\.renderDescriptorActionMenu\(detailActionButtons/, "Lists detail actions should render as a 3-dot overflow menu");
  assert.doesNotMatch(listsJs, /view\.renderDescriptorActionStrip/, "Lists detail actions should no longer use the inline action strip");
  assert.match(listsJs, /function detailMetaItems/, "Lists detail meta should render as compact labeled spans like Notes");
  assert.match(listsJs, /function shouldShowSourceContext/, "The Source panel should be gated so it is omitted for plain independent lists");
  assert.match(listsJs, /shouldShowSourceContext\(list\) \? createSourceContextPanel\(list\) : null/, "renderDetail should only mount the Source panel when it is meaningful");
  assert.match(listsJs, /collapsible: true,\s*open: false/, "Lists linked records should be collapsible and collapsed by default");
  assert.match(listsJs, /icon: "add",\s*iconOnly: true,\s*label: addAction\.label \|\| "Add Link"/, "Add Link should be an icon button");
  assert.match(listsJs, /behavior: removeAction\.behavior,\s*icon: "delete"/, "Remove link should be an icon button");

  // 0.33.5.18.5.9 Lists item-entry inset refinement.
  assert.match(listsJs, /behavior: "lists\.catalog-suggestions", width: "full"/, "Item field should take its own full-width top row");
  assert.match(listsJs, /field: "needed_by_date", type: "date", label: "Needed by", width: "compact"/, "Needed by should be relabeled and narrowed");
  assert.match(listsJs, /field: "assigned_user_id", type: "select", label: "Assigned", optionsSource: "users", width: "compact"/, "Assigned should sit narrow on the side-by-side row");
  assert.match(listsJs, /field: "purchase_status", type: "select", label: "Status", default: "needed",[\s\S]*width: "compact"/, "Status should default to needed and be narrowed");
  assert.match(listsJs, /field: "notes", type: "textarea", label: "Notes", rows: "2", width: "full"/, "Notes should leave the Details disclosure and become a full-width field");
  assert.match(listsJs, /const notes = createItemFieldFromDescriptor\(itemFormField\("notes"\)\)/, "The item modal should build the Notes field from the descriptor");
  assert.match(listsJs, /function applySelectDefault/, "Selects should honor a descriptor default (so new items start on Needed)");
  assert.match(listsJs, /checkboxField\(field\.label \|\| field\.field, field\.field, "true", \{ checked: field\.default === "true"/, "Save-as-reusable should be checked by default from the descriptor default");
  assert.match(listsJs, /input\.defaultChecked = true/, "Checked-by-default checkboxes should survive form.reset()");

  // 0.33.5.18.5.11 Lists add/edit item modal.
  assert.match(listsJs, /function createItemsHeader/, "The detail should render an Items header with an Add Item button");
  assert.match(listsJs, /add\.dataset\.listAction = "add-item"/, "The Add Item button should open the item modal via the add-item action");
  assert.match(listsJs, /function createItemDialogShell/, "The add/edit item form should be a framework-rendered modal");
  assert.match(listsJs, /view\.renderDescriptorModalForm\(descriptor, \{[\s\S]*size: "wide"/, "The item modal should be built via renderDescriptorModalForm (framework renders, module supplies fields)");
  assert.match(listsJs, /function openItemDialog/, "Add and Edit should open the shared item modal");
  assert.match(listsJs, /function saveItem/, "The item modal should own its save submit");
  assert.match(listsJs, /await openItemDialog\(list, list\?\.items\?\.find/, "Edit item should open the modal pre-filled");
  assert.match(listsJs, /itemDialogForm\?\.addEventListener\("submit", saveItem\)/, "The item modal form should submit via saveItem");
  assert.match(listsJs, /document\.body\.appendChild\(createItemDialogShell\(\)\)/, "The item modal shell should be appended once at startup");
  assert.match(listsJs, /function populateItemAssigneeOptions/, "Assignee options must populate on open (the modal is built once before users load, so the field cannot read state.users at build time)");
  assert.doesNotMatch(listsJs, /function createItemForm\b/, "The inline item form should be replaced by the modal");
  assert.doesNotMatch(listsJs, /function populateItemForm\b/, "populateItemForm should be replaced by fillItemForm");

  // 0.33.5.18.5.10 Lists items table (display) refinement.
  assert.match(listsJs, /\{ id: "cost", field: "estimated_cost", label: "Cost" \}/, "Items table should carry a dedicated Cost column");
  assert.match(listsJs, /\{ id: "needed", field: "needed_by_date", label: "Needed By" \}/, "Items table Needed column should be relabeled Needed By");
  assert.doesNotMatch(listsJs, /\{ id: "assigned", field: "assigned_user_id", label: "Assigned" \}/, "Items table should no longer carry the Assigned column");
  assert.match(listsJs, /function truncateItemName/, "Item names should be truncated in the table");
  assert.match(listsJs, /itemCell\.title = itemName/, "Truncated item names should keep the full name in the cell title");
  assert.match(listsJs, /function applyItemCostCell/, "The Cost column should render estimated/actual cost");
  assert.doesNotMatch(listsJs, /function itemDetailSummary/, "The per-row metadata sub-line should be removed from the items table");
  assert.doesNotMatch(listsJs, /lists-row-meta/, "The items table should no longer render the row-meta sub-line");
  assert.match(listsJs, /row\.append\(doneCell, itemCell, qtyCell, costCell, neededCell, statusCell, actionsCell\)/, "Item rows should drop Assigned and add Cost after Qty");

  // 0.33.5.18.5.10 follow-up: tighter table + row action overflow menu.
  assert.match(listsJs, /function createItemRowActions/, "Row actions should be built by a dedicated helper");
  assert.match(listsJs, /view\.renderDescriptorActionMenu\([\s\S]*rowActionButton\("edit-item", \{ menu: true \}\), rowActionButton\("delete-item", \{ menu: true \}\)/, "Edit and Delete should fold into a row '...' overflow menu");
  assert.match(listsJs, /renderDescriptorInlineActions\(\s*\[rowActionButton\("move-item-up"\), rowActionButton\("move-item-down"\), menu\]/, "Up and Down should stay inline, ahead of the '...' menu");

  assert.match(styles, /\.view-split-list-detail/);
  assert.match(styles, /\.lists-index-panel summary/);
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
  assert.match(styles, /\.lists-item-actions button/);
  assert.match(styles, /\.lists-status-badge\.is-active/);
  assert.match(styles, /@media[^{]*\{\s*\.view-split-list-detail\s*\{[\s\S]*grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 1366px\)[\s\S]*\.lists-detail-actions[\s\S]*flex-wrap: wrap/);
  assert.match(styles, /@media \(max-width: 1366px\)[\s\S]*\.lists-link-form[\s\S]*repeat\(auto-fit, minmax\(180px, 1fr\)\)/);
  assert.match(styles, /\.lists-next-action[\s\S]*background: var\(--color-surface-muted\)/);
  assert.match(styles, /\.lists-source-context,[\s\S]*\.lists-cost-summary[\s\S]*background: var\(--color-surface-muted\)/);
  assert.match(styles, /\.lists-detail-title-row\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto/, "Lists detail title row should put the action menu to the right of the title");
  assert.match(styles, /\.lists-detail-meta\s*\{[\s\S]*font-size: 13px/, "Lists detail meta should use the compact Notes meta size");
  assert.match(styles, /\.view-field-grid > \[data-view-field-width="full"\]\s*\{[\s\S]*flex: 1 1 100%/, "Framework field grid should support a full-row width hint");
  assert.match(styles, /\.view-field-grid > \[data-view-field-width="compact"\]\s*\{[\s\S]*flex: 1 1 150px/, "Framework field grid should support a compact width hint");
  assert.match(styles, /\.lists-items-header\s*\{[\s\S]*justify-content: space-between/, "The Items header should place the Add Item button opposite the title");
  assert.match(styles, /\.lists-item-advanced\s*\{[\s\S]*flex: 1 1 100%/, "The Details disclosure should span its own full-width row");
  assert.doesNotMatch(styles, /\.lists-item-advanced summary\s*\{[^}]*display:\s*(?:grid|flex)/, "The Details summary must keep the native disclosure caret (no display:grid/flex that flexes the marker away)");
  assert.match(styles, /\.lists-next-action\s*\{[\s\S]*max-width: 520px/, "The Next panel should be roughly half width");
  assert.match(styles, /\.lists-items-table td:nth-child\(2\)\s*\{[\s\S]*text-overflow: ellipsis/, "The items table Item column should ellipsis-truncate");
  assert.match(styles, /\.lists-items-table\s*\{[\s\S]*width: auto;[\s\S]*table-layout: auto/, "The items table should be content-sized so columns pack together (no full-width stretch)");
  assert.match(styles, /\.lists-items-table th,\s*\.lists-items-table td\s*\{[\s\S]*padding: 8px 10px/, "The items table cells should use tighter padding");
  assert.match(styles, /\.lists-items-table th:first-child,\s*\.lists-items-table td:first-child\s*\{[\s\S]*width: 1%/, "The Done column should shrink to its checkbox so it sits close to Item");
  assert.match(styles, /\.lists-items\s*\{[\s\S]*overflow: visible/, "The items wrapper should not clip the row action menu");
  assert.match(styles, /\.lists-items-table-wrap\s*\{[\s\S]*overflow: visible/, "The framework table wrapper should not clip the row action menu");
  assert.doesNotMatch(listsStyles, /#eff6ff|#f0fdfa|#fff7ed|#bfdbfe|#99f6e4|#fed7aa/);
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
