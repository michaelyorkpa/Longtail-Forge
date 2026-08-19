/**
 * One workflow-module movement row as authored below: identifier, owning
 * family, retired source path, recorded assertion count, and the description
 * the retained owner asserts a minimum length against.
 * @typedef {readonly [string, string, string, number, string]} WorkflowModuleMovementRow
 */

const movementRows = /** @type {readonly WorkflowModuleMovementRow[]} */ (Object.freeze([
  Object.freeze(["legacy.lists.declarative.readonly.surface", "lists", "scripts/lists-declarative-readonly-surface-regression.mjs", 39, "legacy.lists.declarative.readonly.surface remains a table-driven lists source contract."]),
  Object.freeze(["legacy.lists.items.modals.descriptor", "lists", "scripts/lists-items-modals-descriptor-regression.mjs", 40, "legacy.lists.items.modals.descriptor remains a table-driven lists source contract."]),
  Object.freeze(["legacy.lists.view.builder.pilot", "lists", "scripts/lists-view-builder-pilot-regression.mjs", 29, "legacy.lists.view.builder.pilot remains a table-driven lists source contract."]),
  Object.freeze(["legacy.lists.workflow.linked.layout", "lists", "scripts/lists-workflow-linked-layout-regression.mjs", 41, "legacy.lists.workflow.linked.layout remains a table-driven lists source contract."]),
  Object.freeze(["legacy.notes.context.terminology", "notes", "scripts/notes-context-terminology-regression.mjs", 24, "legacy.notes.context.terminology remains a table-driven notes source contract."]),
  Object.freeze(["legacy.notes.declarative.readonly.surface", "notes", "scripts/notes-declarative-readonly-surface-regression.mjs", 85, "legacy.notes.declarative.readonly.surface remains a table-driven notes source contract."]),
  Object.freeze(["legacy.notes.developer.docs", "notes", "scripts/notes-developer-docs-regression.mjs", 8, "legacy.notes.developer.docs remains a table-driven notes source contract."]),
  Object.freeze(["legacy.notes.file.preview.actions", "notes", "scripts/notes-file-preview-actions-regression.mjs", 25, "legacy.notes.file.preview.actions remains a table-driven notes source contract."]),
  Object.freeze(["legacy.notes.files.stacked.modal", "notes", "scripts/notes-files-stacked-modal-regression.mjs", 24, "legacy.notes.files.stacked.modal remains a table-driven notes source contract."]),
  Object.freeze(["legacy.notes.tags.stacked.modal", "notes", "scripts/notes-tags-stacked-modal-regression.mjs", 20, "legacy.notes.tags.stacked.modal remains a table-driven notes source contract."]),
  Object.freeze(["legacy.notes.tasks.modal.footer.visual.parity", "notes", "scripts/notes-tasks-modal-footer-visual-parity-regression.mjs", 23, "legacy.notes.tasks.modal.footer.visual.parity remains a table-driven notes source contract."]),
  Object.freeze(["notes.notes-critical-quick-fixes", "notes", "scripts/regressions/notes/notes-critical-quick-fixes.regression.mjs", 17, "notes.notes-critical-quick-fixes remains a table-driven notes source contract."]),
  Object.freeze(["legacy.search.results.page", "search", "scripts/search-results-page-regression.mjs", 41, "legacy.search.results.page remains a table-driven search source contract."]),
  Object.freeze(["legacy.tag.inline.picker", "tags", "scripts/tag-inline-picker-regression.mjs", 30, "legacy.tag.inline.picker remains a table-driven tags source contract."]),
  Object.freeze(["legacy.tag.management.page", "tags", "scripts/tag-management-page-regression.mjs", 19, "legacy.tag.management.page remains a table-driven tags source contract."]),
  Object.freeze(["legacy.tag.record.workflow", "tags", "scripts/tag-record-workflow-regression.mjs", 25, "legacy.tag.record.workflow remains a table-driven tags source contract."]),
  Object.freeze(["legacy.tag.usability.ui", "tags", "scripts/tag-usability-ui-regression.mjs", 32, "legacy.tag.usability.ui remains a table-driven tags source contract."]),
  Object.freeze(["legacy.task.checklist.editor.display", "tasks", "scripts/task-checklist-editor-display-regression.mjs", 12, "legacy.task.checklist.editor.display remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.task.list.canonical.ui", "tasks", "scripts/task-list-canonical-ui-regression.mjs", 22, "legacy.task.list.canonical.ui remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.task.list.density", "tasks", "scripts/task-list-density-regression.mjs", 19, "legacy.task.list.density remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.task.modal.compact.layout", "tasks", "scripts/task-modal-compact-layout-regression.mjs", 30, "legacy.task.modal.compact.layout remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.task.modal.followup", "tasks", "scripts/task-modal-followup-regression.mjs", 39, "legacy.task.modal.followup remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.task.modal.reflow", "tasks", "scripts/task-modal-reflow-regression.mjs", 39, "legacy.task.modal.reflow remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.bulk.toolbar.shell", "tasks", "scripts/tasks-bulk-toolbar-shell-regression.mjs", 23, "legacy.tasks.bulk.toolbar.shell remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.canonical.editor.opener", "tasks", "scripts/tasks-canonical-editor-opener-regression.mjs", 25, "legacy.tasks.canonical.editor.opener remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.checklist.escape.hatch", "tasks", "scripts/tasks-checklist-escape-hatch-regression.mjs", 20, "legacy.tasks.checklist.escape.hatch remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.declarative.readonly.surface", "tasks", "scripts/tasks-declarative-readonly-surface-regression.mjs", 39, "legacy.tasks.declarative.readonly.surface remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.detail.read.panel", "tasks", "scripts/tasks-detail-read-panel-regression.mjs", 23, "legacy.tasks.detail.read.panel remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.filter.sidebar.anatomy", "tasks", "scripts/tasks-filter-sidebar-anatomy-regression.mjs", 29, "legacy.tasks.filter.sidebar.anatomy remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.lifecycle.action.descriptor", "tasks", "scripts/tasks-lifecycle-action-descriptor-regression.mjs", 32, "legacy.tasks.lifecycle.action.descriptor remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.list.surface.boundary", "tasks", "scripts/tasks-list-surface-boundary-regression.mjs", 29, "legacy.tasks.list.surface.boundary remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.modal.context.sections", "tasks", "scripts/tasks-modal-context-sections-regression.mjs", 29, "legacy.tasks.modal.context.sections remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.modal.shell", "tasks", "scripts/tasks-modal-shell-regression.mjs", 32, "legacy.tasks.modal.shell remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.readonly.list.binding", "tasks", "scripts/tasks-readonly-list-binding-regression.mjs", 36, "legacy.tasks.readonly.list.binding remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.recurrence.reminder.escape.hatch", "tasks", "scripts/tasks-recurrence-reminder-escape-hatch-regression.mjs", 20, "legacy.tasks.recurrence.reminder.escape.hatch remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.relationship.linked.context", "tasks", "scripts/tasks-relationship-linked-context-regression.mjs", 41, "legacy.tasks.relationship.linked.context remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.strict.guardrail.inventory", "tasks", "scripts/tasks-strict-guardrail-inventory-regression.mjs", 40, "legacy.tasks.strict.guardrail.inventory remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.tags.files.child.dialog", "tasks", "scripts/tasks-tags-files-child-dialog-regression.mjs", 31, "legacy.tasks.tags.files.child.dialog remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.timer.utility.escape.hatch", "tasks", "scripts/tasks-timer-utility-escape-hatch-regression.mjs", 64, "legacy.tasks.timer.utility.escape.hatch remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.tasks.workflow.action.descriptor", "tasks", "scripts/tasks-workflow-action-descriptor-regression.mjs", 40, "legacy.tasks.workflow.action.descriptor remains a table-driven tasks source contract."]),
  Object.freeze(["tasks.task-critical-quick-fixes", "tasks", "scripts/regressions/tasks/task-critical-quick-fixes.regression.mjs", 52, "tasks.task-critical-quick-fixes remains a table-driven tasks source contract."]),
  Object.freeze(["tasks.task-editor-workbench-handoff", "tasks", "scripts/regressions/tasks/task-editor-workbench-handoff.regression.mjs", 17, "tasks.task-editor-workbench-handoff remains a table-driven tasks source contract."]),
  Object.freeze(["legacy.time.entries.screen", "time-tracking", "scripts/time-entries-screen-regression.mjs", 75, "legacy.time.entries.screen remains a table-driven time-tracking source contract."]),
  Object.freeze(["legacy.time.tracking.create.timer.modal", "time-tracking", "scripts/time-tracking-create-timer-modal-regression.mjs", 39, "legacy.time.tracking.create.timer.modal remains a table-driven time-tracking source contract."]),
  Object.freeze(["legacy.workbench.collapsible.sections", "workbench", "scripts/workbench-collapsible-sections-regression.mjs", 23, "legacy.workbench.collapsible.sections remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.guided.ui", "workbench", "scripts/workbench-guided-ui-regression.mjs", 28, "legacy.workbench.guided.ui remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.host.status.copy", "workbench", "scripts/workbench-host-status-copy-regression.mjs", 12, "legacy.workbench.host.status.copy remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.in.place.open.work", "workbench", "scripts/workbench-in-place-open-work-regression.mjs", 24, "legacy.workbench.in.place.open.work remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.inspector.panel", "workbench", "scripts/workbench-inspector-panel-regression.mjs", 31, "legacy.workbench.inspector.panel remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.recommended.cycling", "workbench", "scripts/workbench-recommended-cycling-regression.mjs", 32, "legacy.workbench.recommended.cycling remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.remove.all.tasks.list", "workbench", "scripts/workbench-remove-all-tasks-list-regression.mjs", 21, "legacy.workbench.remove.all.tasks.list remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.remove.quick.notes", "workbench", "scripts/workbench-remove-quick-notes-regression.mjs", 14, "legacy.workbench.remove.quick.notes remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.split.focus.filters", "workbench", "scripts/workbench-split-focus-filters-regression.mjs", 13, "legacy.workbench.split.focus.filters remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.task.focus.checklist", "workbench", "scripts/workbench-task-focus-checklist-regression.mjs", 27, "legacy.workbench.task.focus.checklist remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.task.focus.linked.note.view", "workbench", "scripts/workbench-task-focus-linked-note-view-regression.mjs", 18, "legacy.workbench.task.focus.linked.note.view remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.task.focus.related.context.ui", "workbench", "scripts/workbench-task-focus-related-context-ui-regression.mjs", 23, "legacy.workbench.task.focus.related.context.ui remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.task.focus.surface", "workbench", "scripts/workbench-task-focus-surface-regression.mjs", 37, "legacy.workbench.task.focus.surface remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.task.focus.timer", "workbench", "scripts/workbench-task-focus-timer-regression.mjs", 51, "legacy.workbench.task.focus.timer remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.task.ordering", "workbench", "scripts/workbench-task-ordering-regression.mjs", 6, "legacy.workbench.task.ordering remains a table-driven workbench source contract."]),
  Object.freeze(["legacy.workbench.view.state", "workbench", "scripts/workbench-view-state-regression.mjs", 29, "legacy.workbench.view.state remains a table-driven workbench source contract."]),
  Object.freeze(["workbench.task-focus-deep-link", "workbench", "scripts/regressions/workbench/task-focus-deep-link.regression.mjs", 18, "workbench.task-focus-deep-link remains a table-driven workbench source contract."]),
]));

const movements = Object.freeze(movementRows.map(([id, family, sourcePath, assertionCount, description]) => {
  const sourceName = sourcePath.split("/").at(-1);
  const contractName = /** @type {string} */ (sourceName).replace(/(?:-regression|\.regression)\.mjs$/, ".contract.mjs");
  return Object.freeze({
    id,
    family,
    sourcePath,
    modulePath: "scripts/regression-contracts/" + family + "/" + contractName,
    assertionCount,
    retainedOwner: family + ".current-static-contracts",
    description,
  });
}));

const retainedMixedOwners = Object.freeze([
  Object.freeze({ id: "legacy.linked.context.picker.shell", path: "scripts/linked-context-picker-shell-regression.mjs", reason: "fake-browser picker behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.linked.context.provider.contract", path: "scripts/linked-context-provider-contract-regression.mjs", reason: "provider and database behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.notes.external.markdown.links.preference", path: "scripts/notes-external-markdown-links-preference-regression.mjs", reason: "service and database preference behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.notes.files.hierarchy.scope", path: "scripts/notes-files-hierarchy-scope-regression.mjs", reason: "permission and database hierarchy behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.notes.modal.stack.guardrails", path: "scripts/notes-modal-stack-guardrails-regression.mjs", reason: "fake-browser modal behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.notes.notification.follow", path: "scripts/notes-notification-follow-regression.mjs", reason: "HTTP subscription behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.notes.records.filters.repository.conversion", path: "scripts/notes-records-filters-repository-conversion-regression.mjs", reason: "repository and database behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.notes.server.side.list.paging", path: "scripts/notes-server-side-list-paging-regression.mjs", reason: "server paging and database behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.notes.writes.revisions.links.collections.repository.conversion", path: "scripts/notes-writes-revisions-links-collections-repository-conversion-regression.mjs", reason: "write revision and repository behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.task.modal.complete.action", path: "scripts/task-modal-complete-action-regression.mjs", reason: "runtime task completion behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.tasks.bulk.lifecycle.toolbar", path: "scripts/tasks-bulk-lifecycle-toolbar-regression.mjs", reason: "bulk lifecycle behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.tasks.bulk.nondestructive.toolbar", path: "scripts/tasks-bulk-nondestructive-toolbar-regression.mjs", reason: "bulk mutation behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.workbench.service.dehardcode", path: "scripts/workbench-service-dehardcode-regression.mjs", reason: "service and database behavior remains independently runnable" }),
  Object.freeze({ id: "legacy.workbench.task.focus.related.context", path: "scripts/workbench-task-focus-related-context-regression.mjs", reason: "service and database context behavior remains independently runnable" }),
  Object.freeze({ id: "workbench.task-focus-exit-capture", path: "scripts/regressions/workbench/task-focus-exit-capture.regression.mjs", reason: "browser-memory navigation and recovery behavior remains independently runnable" }),
]);

const WORKFLOW_MODULE_STATIC_CONSOLIDATION = Object.freeze({
  schemaVersion: 1,
  version: "0.33.33.10",
  before: Object.freeze({ discoveredScripts: 424, sourceOwners: 61, movedAssertions: 1826 }),
  after: Object.freeze({ discoveredScripts: 370, tableDrivenOwners: 7 }),
  movements,
  areaCommands: Object.freeze(["lists", "notes", "notifications", "search", "tags", "tasks", "time-tracking", "workbench"]),
  retainedMixedOwners,
  retainedNotificationOwners: Object.freeze([
    "legacy.notification.jobs",
    "legacy.notifications.inbox.lifecycle.conversion",
    "legacy.notifications.preferences.subscriptions.conversion",
  ]),
});

export { WORKFLOW_MODULE_STATIC_CONSOLIDATION };
