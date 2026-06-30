# Tasks Module

This document captures the current Tasks module behavior as of 0.33.5.19.5. It is a developer handoff for shipped behavior, not a roadmap promise.

Tasks are a first-party workflow module for commitments and outcomes. The module owns task storage, recurrence records, lightweight checklist items, parent/child task relationships, task reminder settings, task timer source routes, task browser routes, public task API routes, task search indexing, task audit payloads, and task lifecycle events.

Tasks stay integrated through framework contracts for permissions, app shell navigation, Workbench cards, Dashboard summaries, tags, files, search, notifications, audit, public API scopes, Help, module settings, and module status. The framework owns those services; Tasks contributes declarations, routes, event metadata, and record-specific behavior.

## Current Workflow Surface

The protected Tasks page is `tasks.html` under the Projects menu. As of 0.33.5.18.10.4, the page shell is descriptor-backed through `tasks.workspace` with the framework `slide-out-sidebar` layout and a minimal protected host. The main panel remains the task list surface, while the slide-out sidebar mounts task view, sorting, and filter controls only.

The current task list mounts through the descriptor `tasks-main-list` detail region and the Tasks-owned `tasks.main.list` behavior. As of 0.33.5.18.8.4, the framework list shell owns the main list wrapper, status mount, and table overflow wrapper through `LongtailForge.view.createListShell()` and shared `.view-list-shell` / `.view-table-wrap` CSS. Tasks continues to own the task table header/body hooks, `renderTasks`, `createTaskRow`, canonical query construction, row data shaping, selection state, bulk control body, selected-count value, and row/bulk workflow handlers. The region wrapper is visually neutral so the existing task list density and row appearance are preserved.

The sidebar starts with a non-collapsible `Saved Task Views` dropdown. Options are `My Tasks`, `All`, `Unassigned`, `Overdue`, `Due Today`, `Due This Week`, `Completed`, and `Archived`; `My Tasks` is the default when there is no saved explicit selection. The dropdown does not repeat a second visible label inside the panel. `Sorting and Filters` appears below the dropdown as a collapsed section containing the existing sort, status, assignee, client, project, and tag filters. Client controls remain Business-workspace-only.

The selected saved task view is sent to the Tasks service as `task_view`; the framework does not interpret task status, assignment, or due-date semantics. `My Tasks`, `All`, `Unassigned`, `Overdue`, `Due Today`, and `Due This Week` are active-task views. `My Tasks` is active tasks assigned to the current user, `All` is active tasks regardless of assignee, `Unassigned` is active tasks with no assignee, `Overdue` is active tasks with a due date before the current user/workspace-local date, `Due Today` is active tasks due on the current local date, and `Due This Week` is active tasks due from today through the current week end. `Completed` and `Archived` are intentionally selected history views and do not leak into normal active views.

Sorting and Filters controls narrow the selected saved task view instead of replacing it. Changing the saved task view preserves compatible advanced filters, clears incompatible assignee filters for `My Tasks` and `Unassigned`, and resets incompatible status filters to the selected view's default. The `Reset Filters` action resets sort, status, assignee, client, project, and tag controls without changing the selected saved task view.

Tasks still owns scoped task creation, editing, duplicate, complete, reopen, block/unblock, archive, restore, bulk status/priority/assignee/due date/due time/tag updates, tag filtering, notification following, recurrence settings, reminders, files, and task timers when Time Tracking is enabled. As of 0.33.5.18.10.1, task row lifecycle actions are descriptor-backed and registered as `tasks.lifecycle.*` behaviors inside a framework-owned dense action strip. Complete/Reopen/Archive/Restore continue through existing Tasks lifecycle routes; Block/Unblock use the existing Tasks update route with status payloads. The framework owns lifecycle action placement and button disabled display, while Tasks owns status visibility, route calls, permission implications, service side effects, and list refreshes.

As of 0.33.5.18.10.2, non-lifecycle row workflow actions are descriptor-backed and registered as `tasks.workflow.*` behaviors inside a framework-owned row workflow menu. Assign, Due Date, Due Time, and Recurrence open the canonical Task editor with the relevant field focused, so assignment eligibility, workspace/client/project visibility, recurrence payloads, validation, and save refresh hooks remain in the existing Task modal and service. Start Timer, Pause Timer, and Resume Timer call the existing `/api/tasks/:taskId/timer` route, preserve accumulated elapsed time, and refresh the list after the task timer service applies Time Tracking gates, project-linked eligibility, permissions, sourced active-timer state, and open-to-in-progress side effects.

As of 0.33.5.18.10.3, the canonical Task detail/editor modal renders its top summary metadata through the framework `LongtailForge.view.createDetailBadgeRow()` detail badge row primitive. Tasks still owns which badges appear and how values are selected: status, priority, readable Client/Project context, due date, due time, and saved TTC completion duration. The task list remains the primary view; opening a task still uses the modal detail/editor rather than a persistent detail column. Normal task metadata uses hydrated readable labels or safe fallbacks such as `No client` and `No project`, not raw IDs.

As of 0.33.5.18.10.4, task relationships and linked notes use shared framework row anatomy where it fits without moving rules out of owning modules. Task row context chips, including blocking-child summaries from `relationshipSummary`, render through `LongtailForge.view.createDetailBadgeRow()` while Tasks still owns the chip labels, values, and relationship summary calculation. The Task modal Notes panel uses the Notes-owned linked-panel helper, and that helper renders linked note rows through `LongtailForge.view.createLinkedContextList()` while preserving Notes-owned permission-safe reads, create/link/unlink actions, task-created note defaults, secure-note body hiding, and readable labels. Relationship and linked-note UI must not show raw UUIDs as normal labels.

As of 0.33.5.18.10.6, strict declarative guardrails now enforce `tasks.workspace`. `docs/tasks-strict-guardrail-inventory.md` is the fail-on-violation contract for Tasks: the protected host stays minimal, raw template parsing for framework-owned chrome is gone, sidebar/filter/list/bulk/modal/action shells must come from descriptor rendering or shared view helpers, and standard field sections are helper-built. Intentional Tasks-owned escape hatches remain task row-specific content, recurrence internals, checklist behavior fragments, timer state behavior, task modal utilities, relationship context, bulk semantics, workspace context, payload rules, and validation.

As of 0.33.5.18.9.1, the create/edit dialog shell renders through the framework `renderDescriptorModalForm()` helper from the Tasks-owned `task.editor` descriptor. The framework owns the dialog/form/footer/action groups and field-grid wrapper; Tasks owns the task field fragments, save payloads, validation, workspace-specific behavior, routes, permissions, and canonical task queries.

As of 0.33.5.18.9.2, `LongtailForge.tasksDialog.openTaskEditor()` is the canonical browser entry point for the Task editor. It supports add, edit, duplicate, caller defaults, source context, focus return to the triggering control, and caller refresh hooks after save. The Tasks page, Workbench, and `LongtailForge.moduleActions` route Task add/edit flows through that opener. `openAdd()` and `openEdit()` remain compatibility aliases, but new surfaces should call `openTaskEditor()` or the registered module action instead of building separate task forms.

## Canonical Task Editor Entry Point

As of 0.33.5.18.10.7, the canonical Task editor entry point is the supported cross-surface contract for browser Task creation and editing:

- The Tasks page calls `LongtailForge.tasksDialog.openTaskEditor()` for add, edit, duplicate, URL-driven new-task defaults, focus return, and post-save list refresh.
- Workbench calls the same opener through the registered module action path so task creation and editing reuse Tasks-owned validation, context, assignment, recurrence, checklist, timer, tags, files, notes, and save behavior.
- Future Quick Action Center flows should dispatch the registered Task module action or call `openTaskEditor()` with defaults/source context; they should not create a separate quick-task form unless a later roadmap item explicitly changes the canonical editor contract.
- Future module-triggered task creation should pass safe caller defaults, `sourceContext`, `hostContext`, `returnFocusTo`, and `onSaved` or `refresh` callbacks into the opener rather than importing Task field internals or duplicating save payload construction.

The framework may own action discovery, availability filtering, dispatch status, focus return, and host lifecycle around module actions. Tasks owns the editor body, field hydration, payload construction, validation, route calls, permission implications, recurrence/checklist/timer/utility behavior, and refresh semantics. Supported focus targets include assignment, due date, due time, recurrence, timer, and notes; complex assignment, scheduling, recurrence, and workspace-context edits should stay in the canonical editor instead of being flattened into inline controls.

As of 0.33.5.18.9.3, the Task editor uses one framework-owned `Task Details` section before the specialized task-owned fragments. Task Details contains status, priority, parent task, due date, due time, resume note, next action, nullable Client/Project controls, description, assignees, and the final blocked reason field. Blocked Reason is hidden and disabled unless Status is `Blocked`. The dialog uses the shared `wide` modal size without a narrower Task-only width override.

As of 0.33.5.18.9.4, the Task editor and recurrence child editor open and close through `LongtailForge.view.showModal()` / `LongtailForge.view.closeModal()`. The recurrence child editor shell is built with `LongtailForge.view.createModalForm()` so the framework owns the child dialog shell, footer, placement, stack metadata, and focus return. Tasks still owns recurrence draft hydration, frequency/interval/end-date fields, recurrence summary text, save payload shape, and service rules.

As of 0.33.5.18.9.5, the Checklist section keeps the shared `.surface-modal-group` shell while checklist rows and behavior remain Tasks-owned. Checklist add, label save, check, uncheck, reorder, and delete controls call the Tasks checklist routes directly, refresh task-owned row state/progress through the existing task editor callback path, and avoid generic descriptor rows because the workflow needs inline editing, ordering buttons, checkbox state, and delete confirmation.

As of 0.33.5.18.9.6, the Task Timer section keeps the shared `.surface-modal-group` shell and shared dense action placement while timer state and actions remain Tasks-owned. Start, pause, save time, and reset continue through the Tasks timer routes and service, preserving timer eligibility, Time Tracking gates, sourced active-timer state, open-to-in-progress transition behavior, reset/finalize side effects, audit entries, last-worked updates, and search reindexing. Tags and Files stay in framework-placed footer utility actions while using the Tags-owned picker and Files-owned attachment helper, the linked Notes panel stays mounted through the Notes-owned helper, Copy Link remains Tasks-owned URL/clipboard behavior, and notification follow/unfollow remains the heading bell backed by notification subscription helpers.

Task Primary Context follows the Notes/List direction. Business workspaces show nullable Client and Project controls. Personal and Family workspaces hide Client, keep Project available, and save empty client context. Selecting a Business project derives its Client when the project has one; workspace-level projects keep Client empty. Saved or defaulted Client/Project values hydrate with readable option labels, using saved task names or safe `Unavailable client` / `Unavailable project` fallbacks when active option lists omit the current value. Normal Task modal UI must not display raw UUIDs or raw target IDs for context.

Bulk task updates sit in a framework-owned collapsed toolbar shell above the task list. The shell is collapsed by default, shows `Bulk Actions`, displays a selected-count chip when one or more tasks are selected, and preserves the existing auto-open-on-selection behavior. It remains inside the main task-list panel and never renders in the slide-out sidebar. Tasks owns the controls inside the shell and keeps due date and due time as separate actions. Due dates can be set or cleared; clearing due date clears due time. Due time can be set or cleared only when the task has a due date, with per-task partial errors for invalid or inaccessible targets. Bulk tag add/remove/replace behavior goes through the Tags-owned bulk assignment contract so direct/manual tag changes preserve propagated and system tag assignments. The browser shows an in-app confirmation before mixed due date, due time, or tag values are overwritten, added, removed, or cleared.

As of 0.33.5.18.8.3, the framework toolbar shell wires the existing non-destructive bulk behavior for status, priority, assignee replacement, due date, due time, and tags, plus the shipped lifecycle behavior for archive and restore. The toolbar controls are only display/payload helpers; `POST /api/tasks/bulk` and `tasksService.bulkUpdate()` remain authoritative for permissions, validation, partial errors, lifecycle side effects, and response shaping. The Lifecycle selector offers Archive for selected non-archived tasks and Restore for selected archived tasks. Bulk archive preserves a dangerous confirmation prompt. Tasks still does not expose a task delete, soft-delete, or permanent-delete workflow in the shipped browser or public API surface.

The task dialog includes:

- title and a compact framework detail badge row for status, priority, client/project context, due date, due time, and saved completion duration
- `Task Details` for status, priority, parent task, due date, due time, resume note, next action, nullable Business Client and Project scope, description, assignees, and status-gated blocked reason
- a `TTC:` completion duration chip only for saved completed tasks with persisted completion metadata
- lightweight checklist controls
- recurrence, reminders, tags, files, notes, notifications, and task timer controls

Task modal notification following is owned by the heading bell. The dialog does not render a separate in-body Notifications fieldset or popover; clicking the heading bell follows or unfollows the saved task, and a red bell means the current user follows that task. The current modal footer uses icon-plus-text utility controls for Tags, Files, and Copy Link, while Cancel and Save remain compact icon commit controls with accessible labels and titles.

As of 0.33.5.18.10.8.2, the Task Tags and Files footer utilities open stacked child dialogs above the parent Task editor, matching the Notes pattern. The framework owns the child dialog shell, stack ordering, Escape/backdrop handling, parent-close cleanup, and focus return. Tasks owns task-specific placement, footer utility button behavior, target identifiers, save-first state, visibility, refresh hooks, tag picker staging, file attachment mounting, and parent editor save/cancel cleanup. The Tags dialog hosts the existing Tags-owned picker and staged selections still save through the normal Task `tagIds` payload. The Files dialog hosts the existing file attachment helper; saved tasks can upload/list files through the Files routes, while unsaved tasks show `Save the task before adding files.` through the helper instead of mounting against an empty task id.

As of 0.33.5.18.10.8.3, the Task modal footer uses the shared converted-modal visual standard: Tags, Files, and Copy Link footer utilities use icon plus text, while Cancel and Save remain compact icon commit controls with accessible labels and titles. Tasks still owns Copy Link URL/clipboard behavior, Tags picker staging, Files helper mounting, notification follow/unfollow, save payloads, validation, and permissions.

As of 0.33.5.18.10.8.5, the Task editor is the Tasks reference implementation for the finalized converted-modal action standard. Future Task modal work should keep modal footer utilities in the shared utility group, keep Cancel and Save in the shared commit group, keep the saved-task follow bell in the heading action slot, and open substantial utility bodies such as Tags and Files through stacked child dialogs. Tasks-owned escape hatches may continue to own timer, checklist, recurrence, linked Notes, tag staging, file helper mounting, copy-link, payload, and validation behavior, but they should not rebuild framework-owned footer or heading anatomy.

Recurrence, reminders, checklist, timer, tags, files, notes, and other specialized task fragments remain mounted through their existing Tasks-owned paths. The recurrence editor uses a shared child-modal shell, but its fields and behavior are task-owned. Reminder overrides remain inline in the Reminders section: the modal hydrates task policy/effective policy details, toggles the override fields locally, and saves `reminderOverrideEnabled` plus `reminderPolicy` through the Tasks service. Checklist remains inline in the Task editor with no separate checklist dialog shell.

The task dialog includes a Notes panel mounted through the Notes-owned linked-record helper. Saved tasks show notes linked through task context or `note_links`, permitted create/link/unlink actions, and the empty state "No notes linked to this task." Unsaved tasks show "Save the task before adding notes." New notes created from a task carry task context, available project/client context, Note Kind `log`, the Active Work Library suggestion, and the normal internal visibility default unless the user changes it. Linked note rows use the shared linked-context read-list anatomy, but Notes remains the source of truth for which notes are readable, linkable, unlinkable, private, secure, disabled, or archived.

Task list rows show compact linked-note count badges where the current user may read linked notes. Clicking a note count opens the Task detail dialog focused on the Notes panel. Counts come from the Notes target read model, so inaccessible private, secure, disabled, or otherwise unreadable notes do not leak through task-row metadata.

Tasks do not expose a task delete workflow in the shipped browser or public API surface. Archive and restore are the lifecycle actions for inactive task history.

## Resume-Safe Context

Tasks expose resume-safe context through task reads, task summaries, Workbench task items, task search documents, audit metadata, and internal task event metadata. The core fields are:

- `next_action`: the immediate human-written step
- `blocked_reason`: shown when the task is blocked
- `resume_note`: human-written context for where work paused
- `last_worked_at`: normalized task-owned activity timestamp
- `completionMetrics`: completion duration for completed and archived tasks
- `checklistProgress`: total count, completed count, and next incomplete item label
- `relationshipSummary`: child, blocking child, incomplete child, and parent counts
- `resumeContext`: active-candidate flag plus safe status, activity, checklist, relationship, blocked, and resume-note signals

Completed and archived tasks keep their readable context but do not become active resume candidates by default. Inaccessible tasks do not expose resume-safe context through task reads, summaries, Workbench items, or permission-shaped browser routes.

The global resume-state service, ranking model, dismissal state, API, and cross-module Workbench feed are framework-owned future work. Tasks provides source context and events for those consumers without owning the global resume-state framework.

## Checklists

Task checklists are lightweight progress aids inside a parent task. Checklist items have labels, ordering, checked state, completion metadata, and soft deletion. They are not independently assignable, taggable, timed, scheduled, searchable records, or separate dependencies.

Checklist mutations update `last_worked_at`, task search indexing, audit metadata, and internal events. Event metadata includes parent task identity and checklist progress so downstream consumers can update summaries without reading checklist rows directly.

## Parent And Child Tasks

Tasks can link parent and child tasks for planning. Relationship behavior prevents circular references, enforces workspace boundaries, and keeps business-workspace client context compatible when both records have client context.

A child task can be marked blocking. Incomplete blocking children keep or move the parent task into `blocked` and preserve a useful blocked reason. When blockers clear, the service can recover auto-blocked parent tasks. Relationship summaries are exposed on readable task details, summaries, Workbench items, search documents, and relationship events.

The browser may display compact blocking-child relationship summaries in the task list and a readable Parent Task selector in the canonical Task modal, but relationship rules stay in the Tasks service and repository. Parent options use readable task titles; task IDs remain control values and API identifiers only.

## Recurrence

Task recurrence supports Daily, Weekdays, Weekends, Weekly, and Monthly frequencies. Weekdays are Monday through Friday; Weekends are Saturday and Sunday; Daily remains every day. Recurrence generation is owned by the Tasks module and emits normal task records for follow-up instances.

## Events And Search

Task lifecycle events include `task.created`, `task.updated`, `task.assigned`, `task.completed`, `task.archived`, `task.restored`, checklist events, and relationship events. Task lifecycle event metadata includes safe resume fields such as `last_worked_at`, `completion_metrics`, `checklist_progress`, `relationship_summary`, `next_action`, `blocked_reason`, `resume_note`, and `resume_context`.

Task search indexing uses the module indexer ID `tasks.records` and requires `tasks.view`. The indexer includes title, next action, blocked reason, resume note, description, project/client context, assignee names, checklist next item context, and blocking-child context. Framework search remains responsible for storage, full-text backend behavior, and result permission shaping.

## Verification

Core regression coverage for the current Tasks QoL line includes:

- `scripts/task-resume-context-regression.mjs`
- `scripts/task-activity-metrics-regression.mjs`
- `scripts/task-recurrence-frequency-regression.mjs`
- `scripts/task-checklist-regression.mjs`
- `scripts/task-relationships-regression.mjs`
- `scripts/task-list-density-regression.mjs`
- `scripts/tasks-declarative-readonly-surface-regression.mjs`
- `scripts/tasks-filter-sidebar-anatomy-regression.mjs`
- `scripts/tasks-readonly-list-binding-regression.mjs`
- `scripts/tasks-bulk-toolbar-shell-regression.mjs`
- `scripts/tasks-bulk-nondestructive-toolbar-regression.mjs`
- `scripts/tasks-bulk-lifecycle-toolbar-regression.mjs`
- `scripts/tasks-list-surface-boundary-regression.mjs`
- `scripts/tasks-modal-shell-regression.mjs`
- `scripts/tasks-recurrence-reminder-escape-hatch-regression.mjs`
- `scripts/tasks-checklist-escape-hatch-regression.mjs`
- `scripts/tasks-timer-utility-escape-hatch-regression.mjs`
- `scripts/tasks-canonical-editor-opener-regression.mjs`
- `scripts/tasks-view-selector-query-contract-regression.mjs`
- `scripts/task-qol-closeout-regression.mjs`
- `scripts/task-bulk-due-tags-regression.mjs`
- `scripts/task-modal-compact-layout-regression.mjs`
- `scripts/task-modal-reflow-regression.mjs`
- `scripts/task-modal-followup-regression.mjs`
- `scripts/task-timer-status-regression.mjs`
- `scripts/notes-linked-panel-regression.mjs`

The closeout regression verifies task reads, summaries, Workbench items, search documents, internal event metadata, inactive-task resume candidacy, inaccessible-task boundaries, Help declarations, module version bookkeeping, and this developer handoff. The modal regressions verify the framework-rendered task modal shell, canonical editor opener, compact task dialog fields, metadata ribbon, saved-only `TTC:` chip, heading notification bell, footer actions, stacked Tags/Files child dialogs, task timer state/actions, utility escape hatches, and collapsed section defaults. The linked-panel regression verifies the Task dialog Notes panel contract, task-created note defaults, and task note-count source wiring.
