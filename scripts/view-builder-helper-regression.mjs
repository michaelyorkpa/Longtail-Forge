import assert from "node:assert/strict";
import vm from "node:vm";

import { createFakeBrowserContext } from "./test-support/fake-dom.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const helper = readText("public/js/shared/view-builder.js");
// 0.33.33.35.3 moved the modal stack into LongtailForge.viewModalStack. The builder
// delegates to it at call time, so every context that executes the builder provides it.
const viewModalStackSource = readText("public/js/shared/view-modal-stack.js");
const css = readText("public/css/longtail-forge.css");
const viewContract = readText("docs/view-building-contract.md");

assert.doesNotMatch(helper, /\binnerHTML\b|\binsertAdjacentHTML\b/, "view builder must not inject HTML strings");
assert.doesNotMatch(helper, /\bfetch\b|XMLHttpRequest|localStorage|sessionStorage/, "view builder must not own data loading or browser storage");
assert.match(helper, /global\.LongtailForge = root/, "view builder should expose the shared namespace");
assert.match(helper, /root\.view = Object\.freeze/, "view builder namespace should be frozen");

/** @typedef {import("./test-support/fake-dom.mjs").FakeNode} FakeNode */
/**
 * Framework-owned `viewParts` slots the published helpers expose to callers.
 * @typedef {{ body: ViewBuilderNode, footer: ViewBuilderNode, status: ViewBuilderNode }} ViewBuilderParts
 */
/**
 * A node built by the published `LongtailForge.view` helpers: fake-DOM anatomy
 * plus the framework-owned `viewParts` slots.
 * @typedef {FakeNode & { viewParts: ViewBuilderParts }} ViewBuilderNode
 */
/**
 * The published `LongtailForge.view` helper catalog under test.
 * @typedef {Record<string, (...args: unknown[]) => ViewBuilderNode>} ViewBuilderHelpers
 */

const context = createFakeBrowserContext();
vm.runInNewContext(viewModalStackSource, context, { filename: "view-modal-stack.js" });
vm.runInNewContext(helper, context, { filename: "view-builder.js" });
const view = /** @type {ViewBuilderHelpers} */ (context.window.LongtailForge.view);

for (const helperName of [
  "collectFieldValues",
  "createPageHeader",
  "createStatusMessage",
  "createBulkActionToolbar",
  "createFilterPanel",
  "createCollapsibleIndexPanel",
  "createSplitListDetail",
  "createDataTable",
  "createDetailActionMenu",
  "createDetailActionStrip",
  "createDetailBadgeRow",
  "createInfoPanel",
  "createModal",
  "createModalForm",
  "createField",
  "createFieldGrid",
  "createActionButton",
  "createEmptyState",
  "createDetailHeader",
  "createInlineActionRow",
  "createLinkedContextList",
  "createLinkedContextPicker",
  "createListShell",
  "showModal",
  "closeModal",
  "closeChildModals",
  "isTopModal",
]) {
  assert.equal(typeof view[helperName], "function", `LongtailForge.view.${helperName} should be exposed`);
}

const header = view.createPageHeader({
  title: "Lists",
  subtitle: "Operational execution",
  actions: [{ label: "Add List", icon: "add", action: "add", role: "primary" }],
});
assert.equal(header.tagName, "HEADER");
assert(header.classList.contains("view-page-header"), "page header should use view class");
assert.equal(header.querySelector("h1").textContent, "Lists");
assert.equal(header.querySelector("button").type, "button", "action buttons should default to type button");
assert.equal(header.querySelector("button").dataset.surfaceActionRole, "primary", "action role should be declared");

const status = view.createStatusMessage({ message: "Saved." });
assert(status.classList.contains("surface-main-panel"), "status messages should use a surface class");
assert.equal(status.getAttribute("role"), "status");
assert.equal(status.getAttribute("aria-live"), "polite");

const alert = view.createStatusMessage({ tone: "danger", message: "Failed." });
assert.equal(alert.getAttribute("role"), "alert");
assert.equal(alert.getAttribute("aria-live"), "assertive");

const empty = view.createEmptyState({ title: "No records", message: "Nothing to show." });
assert(empty.classList.contains("surface-card"), "empty states should use card surface styling");
assert.equal(empty.getAttribute("role"), "status");

const filter = view.createFilterPanel({
  title: "Filters",
  fields: [context.document.createElement("label")],
});
assert(filter.classList.contains("surface-main-panel"), "filter panels should use main panel surface styling");
assert(filter.querySelector(".view-field-grid"), "filter panel should contain a field grid");
assert.equal(filter.tagName, "DETAILS", "filter panels should be collapsible details");
assert.equal(filter.open, false, "filter panels should default to collapsed");
assert(view.createFilterPanel({ title: "Filters", fields: [], open: true }).open, "filter panels should honor the open option");

const bulkToolbar = view.createBulkActionToolbar({
  label: "Bulk Actions",
  selectedCount: 2,
  body: [context.document.createElement("label")],
});
assert.equal(bulkToolbar.tagName, "DETAILS", "bulk action toolbar should be a collapsible details shell");
assert.equal(bulkToolbar.open, false, "bulk action toolbar should default to collapsed");
assert.equal(bulkToolbar.querySelector(".view-bulk-action-toolbar-title").textContent, "Bulk Actions");
assert.equal(bulkToolbar.querySelector(".view-bulk-action-toolbar-count").textContent, "2 selected");
assert.equal(bulkToolbar.querySelector(".view-bulk-action-toolbar-count").hidden, false, "bulk action toolbar should show nonzero selected counts");
assert(bulkToolbar.viewParts.body.classList.contains("view-bulk-action-toolbar-body"), "bulk action toolbar should expose a framework-owned body");
assert.equal(view.createBulkActionToolbar({ label: "Bulk Actions" }).querySelector(".view-bulk-action-toolbar-count").hidden, true, "bulk action toolbar should hide zero selected counts");

const listShell = view.createListShell({
  toolbar: view.createElement("button", { text: "Bulk Actions" }),
  statusAttrs: { "data-list-status": "" },
  statusDataset: { listStatus: "" },
  children: view.createElement("div", { text: "Rows" }),
});
assert(listShell.classList.contains("view-list-shell"), "list shell should use the framework list shell class");
assert.equal(listShell.viewParts.status.getAttribute("role"), "status", "list shell should expose a status mount");
assert.equal(listShell.viewParts.status.getAttribute("aria-live"), "polite", "list shell status should be polite by default");
assert.equal(listShell.viewParts.status.dataset.listStatus, "", "list shell should expose a status part with caller hooks");
assert.equal(listShell.textContent, "Bulk ActionsRows", "list shell should place toolbar before status and content");

const index = view.createCollapsibleIndexPanel({ title: "Lists", body: ["Body"], open: false });
assert.equal(index.tagName, "DETAILS");
assert.equal(index.open, false);
assert.equal(index.querySelector("summary").textContent, "Lists");
assert(index.querySelector(".view-collapsible-index-title"), "collapsible index summaries should expose a title span");
const indexWithSummaryAction = view.createCollapsibleIndexPanel({
  title: "Notes",
  summaryActions: view.createElement("span", { text: "Page 1" }),
});
assert.equal(indexWithSummaryAction.querySelector(".view-collapsible-index-title").textContent, "Notes");
assert.equal(indexWithSummaryAction.querySelector(".view-collapsible-index-summary-actions").textContent, "Page 1");
const indexWithFooter = view.createCollapsibleIndexPanel({
  title: "Notes",
  body: ["Body"],
  footer: view.createElement("button", { text: "Next" }),
});
assert.equal(indexWithFooter.querySelector(".view-collapsible-index-footer").textContent, "Next", "collapsible index panels should expose a footer slot after the body");

const split = view.createSplitListDetail({ list: ["Index"], detail: ["Detail"] });
assert(split.querySelector(".view-split-list-detail-index"), "split helper should create index panel");
assert(split.querySelector(".view-split-list-detail-main"), "split helper should create detail panel");

const tableWrap = view.createDataTable({
  caption: "Records",
  columns: [{ key: "name", label: "Name", header: true }, { key: "status", label: "Status", align: "right" }],
  rows: [{ name: "Alpha", status: "Open" }],
  tableClassName: "list-table lists-table",
});
assert(tableWrap.classList.contains("view-table-wrap"), "data table should be wrapped");
assert(tableWrap.querySelector("table").classList.contains("list-table"), "data table should split compatibility table classes");
assert(tableWrap.querySelector("table").classList.contains("lists-table"), "data table should split whitespace-separated table classes");
assert.equal(tableWrap.querySelector("caption").textContent, "Records");
assert.equal(tableWrap.querySelector("th").getAttribute("scope"), "col");
assert.equal(tableWrap.querySelector("tbody th").getAttribute("scope"), "row");
assert.equal(tableWrap.querySelector("tbody td").dataset.align, "right");

const emptyTable = view.createDataTable({ columns: ["Name", "Status"], rows: [], emptyMessage: "No rows." });
assert.equal(emptyTable.querySelector(".view-data-table-empty").textContent, "No rows.");
assert.equal(emptyTable.querySelector(".view-data-table-empty").colSpan, 2);

const detailHeader = view.createDetailHeader({ title: "Project", meta: "Active", badges: [view.createElement("span", { text: "Open", className: "surface-chip" })] });
assert(detailHeader.querySelector(".view-detail-title"), "detail header should include a title");
assert(detailHeader.querySelector(".surface-chip-row"), "detail header should include badge row");

const detailBadgeRow = view.createDetailBadgeRow({
  ariaLabel: "Task summary",
  badges: [{ label: "Status", value: "Open", className: "task-metadata-chip", focusable: true }],
});
assert(detailBadgeRow.classList.contains("view-detail-badges"), "detail badge rows should use framework detail badge anatomy");
assert(detailBadgeRow.classList.contains("surface-chip-row"), "detail badge rows should use the shared chip row surface");
assert.equal(detailBadgeRow.getAttribute("aria-label"), "Task summary");
assert(detailBadgeRow.querySelector(".surface-chip"), "detail badge rows should create shared surface chips");
assert.equal(detailBadgeRow.querySelector(".surface-chip").textContent, "Status: Open");
assert.equal(detailBadgeRow.querySelector(".surface-chip").getAttribute("tabindex"), "0", "detail badge rows should support focusable badges");

const info = view.createInfoPanel({ title: "Summary", items: [{ label: "Items", value: "3" }] });
assert(info.classList.contains("surface-main-panel"), "info panels should use main panel surface styling");
assert.equal(info.querySelector("dt").textContent, "Items");

const modal = view.createModal({ title: "Create Record", body: ["Body"], actions: [{ label: "Save", role: "primary" }] });
assert.equal(modal.tagName, "DIALOG");
assert.equal(modal.getAttribute("role"), "dialog");
assert.equal(modal.getAttribute("aria-modal"), "true");
assert(modal.getAttribute("aria-labelledby"), "modal should be labelled by generated title");
assert(modal.viewParts.body, "modal should expose viewParts body");
assert(modal.viewParts.footer.classList.contains("surface-modal-footer"), "modal footer should use surface footer class");

const modalForm = view.createModalForm({ title: "Edit Record", fields: [context.document.createElement("label")], actions: [{ label: "Cancel" }] });
assert.equal(modalForm.querySelector("form").getAttribute("method"), "dialog");
assert(modalForm.querySelector(".view-field-grid"), "modal forms should use field grids");

const row = view.createInlineActionRow({ actions: [{ label: "Edit", icon: "edit" }] });
assert(row.classList.contains("surface-dense-actions"), "inline action rows should use dense actions");

const actionMenu = view.createDetailActionMenu({
  ariaLabel: "Row workflow actions",
  actions: [{ label: "Assign", icon: "edit", text: "Assign" }],
});
assert(actionMenu.classList.contains("view-detail-action-menu"), "detail action menus should use framework menu anatomy");
assert.equal(actionMenu.getAttribute("data-view-floating-menu"), "", "detail action menus should float by default");
assert.equal(actionMenu.querySelector("summary").textContent, "...", "detail action menus should expose a compact summary");
assert(actionMenu.querySelector(".view-detail-action-menu-list"), "detail action menus should expose a menu list");
assert.match(helper, /function wireFloatingDetailActionMenu/, "detail action menus should wire shared floating menu behavior");
assert.match(helper, /function positionFloatingDetailActionMenu/, "detail action menus should use shared viewport positioning");

const linkedContextPicker = view.createLinkedContextPicker({
  providers: [{ moduleId: "tasks", targetType: "task", label: "Task" }],
  records: [{ moduleId: "tasks", targetType: "task", targetId: "task-1", displayLabel: "Task one" }],
  linkedItems: [{ moduleId: "tasks", targetType: "task", targetId: "task-1", displayLabel: "Task one" }],
});
assert(linkedContextPicker.classList.contains("view-linked-context-picker"), "linked context picker should use the framework picker shell");

const linkedContextList = view.createLinkedContextList({
  items: [{ moduleId: "notes", targetType: "note", targetId: "note-1", displayLabel: "Panel note", hintLabel: "Active Work" }],
});
assert(linkedContextList.classList.contains("view-linked-context-picker-list"), "linked context lists should reuse linked-context row anatomy");
assert.equal(linkedContextList.querySelector(".view-linked-context-picker-row-label").textContent, "Panel note");
assert.equal(linkedContextList.querySelector(".view-linked-context-picker-row-hint").textContent, "Active Work");

assert.throws(() => view.createActionButton({}), /visible text or an accessible label/, "action buttons should require an accessible name");
assert.throws(() => view.createPageHeader({}), /Page headers require a title/, "page headers should require titles");

assert.match(css, /\.view-page-header,[\s\S]*\.view-detail-header\s*\{[\s\S]*display:\s*flex/, "CSS should define page header layout");
assert.match(css, /\.view-list-shell\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*0;/, "CSS should define a no-gap list shell");
assert.match(css, /\.view-list-shell-status:empty\s*\{[\s\S]*display:\s*none/, "CSS should hide empty list-shell status mounts");
assert.match(css, /\.view-table-wrap\s*\{[\s\S]*overflow-x:\s*auto/, "CSS should define table overflow wrapper");
assert.match(css, /\.view-filter-panel-fields,[\s\S]*\.view-field-grid\s*\{[\s\S]*flex-wrap:\s*wrap/, "CSS should define a wrapping field grid layout");
assert.match(css, /\.view-field-grid > \[data-view-field-width="narrow"\]/, "CSS should support narrow field width hints");
assert.match(css, /\.view-page-header\s*\{[\s\S]*margin-bottom:\s*8px;/, "CSS should define framework page-header separation");
assert.match(css, /\.view-bulk-action-toolbar-summary\s*\{[\s\S]*display:\s*flex/, "CSS should define the framework bulk toolbar summary");
assert.match(css, /\.view-bulk-action-toolbar-count\s*\{[\s\S]*margin-left:\s*auto/, "CSS should define the framework bulk toolbar count");
assert.match(css, /\.view-detail-action-menu\[data-view-floating-menu\] \.view-detail-action-menu-list\s*\{[\s\S]*position:\s*fixed;[\s\S]*max-height:[\s\S]*overflow-y:\s*auto/, "CSS should let floating detail action menus escape parent overflow");
assert.match(css, /\.view-detail-action-menu\[data-view-floating-menu\]\[data-view-floating-menu-positioned\] \.view-detail-action-menu-list\s*\{[\s\S]*visibility:\s*visible/, "CSS should reveal floating action menus only after positioning");
assert.match(css, /\.view-stacked\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*0;/, "CSS should define the stacked layout container without panel gaps");
assert.match(css, /\.view-stacked \.view-collapsible-index-body\s*\{[\s\S]*overflow-y:\s*auto/, "CSS should cap the stacked index to a scroll region");
assert.match(css, /\.view-collapsible-index-summary-actions\s*\{[\s\S]*justify-content:\s*flex-end/, "CSS should support right-aligned collapsible summary actions");
assert.match(css, /\.view-collapsible-index-footer\s*\{[\s\S]*justify-content:\s*flex-end/, "CSS should support right-aligned collapsible footers");
assert.match(css, /\.view-linked-context-picker\s*\{[\s\S]*display:\s*grid/, "CSS should define the shared linked context picker shell");
assert.match(viewContract, /As of 0\.33\.5\.15\.6/, "view contract should report helper implementation version");
assert.match(viewContract, /`LongtailForge\.view` is implemented in `public\/js\/shared\/view-builder\.js`/, "view contract should document implemented helper location");

console.log("View builder helper regression passed.");
