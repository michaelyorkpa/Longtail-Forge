# Tasks Strict Guardrail Inventory

Current as of 0.33.5.18.10.7. This is the strict guardrail contract for the converted Tasks workspace surface.

`tasks.workspace` is now a strict declarative surface alongside `lists.workspace` and `notes.workspace`. Tasks may still own task-specific behavior and record fragments, but framework-owned shells must come from the descriptor renderer or shared `LongtailForge.view` helpers.

## Fail-On-Violation Tasks Guardrails

The strict guardrails fail when Tasks reintroduces hand-built framework-owned anatomy in `public/js/tasks.js`, `public/js/task-dialog.js`, or `views/protected/tasks.html`.

| Guarded anatomy | Required ownership |
| --- | --- |
| Raw template parsing | Tasks must not use `taskTemplateElement()`, `taskTemplateElements()`, `taskEditorFieldMarkup()`, `<template>`, or `innerHTML` for framework-owned chrome. |
| Page shell | `views/protected/tasks.html` stays a minimal descriptor host with no page/header/table/dialog/filter anatomy. |
| Slide-out sidebar shell | `tasks.workspace` and the shared renderer own the slide-out layout, sidebar panels, trigger, backdrop, and region placement. |
| Filter panel shell | Saved Task Views and Sorting/Filters mount through descriptor regions and shared helper-built controls; Tasks owns query semantics only. |
| Bulk toolbar shell | `LongtailForge.view.createBulkActionToolbar()` owns the toolbar wrapper, summary, and selected-count placement. Tasks owns bulk-control values and payloads. |
| Modal shell/footer | `LongtailForge.view.renderDescriptorModalForm()` owns the canonical add/edit Task modal shell and footer actions. The recurrence child dialog uses shared modal helpers. |
| Standard field grids | Task Details, Checklist, Recurrence, Timer, Reminders, Notes, Tags, and Files section placement is helper-built rather than parsed from raw markup. |
| Standard action placement | Row lifecycle actions use `createDetailActionStrip()`, workflow actions use `createDetailActionMenu()`, and modal actions use framework action buttons. |

## Documented Tasks-Owned Escape Hatches

These fragments remain module-owned because they carry Tasks-specific behavior or owning-module integrations. They are allowed only inside the documented paths.

| Escape hatch | Owning path | Reason |
| --- | --- | --- |
| Task row-specific content | `createTaskRow()`, `appendTaskMetadata()`, `appendTaskContext()`, `appendAttachmentCount()`, `appendNoteCount()`, `appendTagChips()` | Rows combine lifecycle state, selection, tags, files, notes, relationship summaries, resume context, and readable task metadata. |
| Recurrence editor internals | recurrence draft state, summary writers, `taskRecurrenceFieldNodes()`, recurrence save/clear handlers | Recurrence rules and payload shape are Tasks-owned; the child modal shell is framework-owned. |
| Checklist behavior fragments | `writeChecklistFields()`, `checklistItemRow()`, checklist action handlers | Checklist rows need inline editing, checkbox state, ordering, delete confirmation, progress refresh, route calls, and task update callbacks. |
| Timer state behavior | Task Timer section writers, start/pause/finalize/reset handlers, `/api/tasks/:taskId/timer` calls | Timer eligibility, elapsed display, sourced active-timer state, Time Tracking gates, audit, last-worked updates, and search reindexing are Tasks-owned. |
| Workflow and lifecycle behavior | `taskWorkflowActionsForTask()`, `taskLifecycleActionsForTask()`, behavior handlers | Shared helpers own placement. Tasks owns visibility, permissions metadata, route calls, refresh behavior, and lifecycle meaning. |
| Bulk action semantics | bulk control readers, `selectedBulkActions()`, confirmation helpers, `/api/tasks/bulk` calls | Shared helpers own toolbar placement. Tasks owns allowed mutations, confirmations, tag/assignee/lifecycle payloads, and result reconciliation. |
| Relationship and recovery context | `appendTaskContext()`, `blockingSummaryText()`, relationship route/service paths | Tasks owns parent/child validation, blocking counts, recovery behavior, and chip values. |
| Task modal utility behavior | Tags, Files, Notes, Copy Link, notification follow/unfollow | Framework owns footer/heading placement. Tags, Files, Notes, notifications, and Tasks own their behavior and routes. |
| Workspace context and payload rules | Client/Project visibility, assignment, validation, create/update payload builders | Business-only Client controls, Personal/Family behavior, nullable context, assignments, and save validation stay in Tasks. |

## Regression Coverage

`scripts/view-descriptor-declarative-guardrails.mjs` now includes `tasks.workspace` in the strict surface set. `scripts/tasks-strict-guardrail-inventory-regression.mjs` proves the raw-template helpers are gone, helper-built shells are used, and the escape hatches above remain explicit.

`scripts/tasks-conversion-closeout-regression.mjs` locks the 0.33.5.18.10.7 documentation closeout: Tasks remains a strict `slide-out-sidebar` adopter, the task list remains the primary main-panel view, bulk actions remain collapsed above the list, and `LongtailForge.tasksDialog.openTaskEditor()` remains the canonical Task editor opener for Tasks page, Workbench, future Quick Action Center, and future module-triggered task creation.

The strict Tasks guardrail runs alongside the narrower behavior-preservation regressions:

- `scripts/tasks-list-surface-boundary-regression.mjs`
- `scripts/tasks-modal-shell-regression.mjs`
- `scripts/tasks-modal-context-sections-regression.mjs`
- `scripts/tasks-recurrence-reminder-escape-hatch-regression.mjs`
- `scripts/tasks-checklist-escape-hatch-regression.mjs`
- `scripts/tasks-timer-utility-escape-hatch-regression.mjs`
- `scripts/tasks-lifecycle-action-descriptor-regression.mjs`
- `scripts/tasks-workflow-action-descriptor-regression.mjs`
- `scripts/tasks-detail-read-panel-regression.mjs`
- `scripts/tasks-relationship-linked-context-regression.mjs`

Later Tasks slices may shrink the escape hatches only when a stronger framework primitive exists without absorbing Tasks business behavior.
