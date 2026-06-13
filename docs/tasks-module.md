# Tasks Module

This document captures the current Tasks module behavior as of 0.33.5.10.1. It is a developer handoff for shipped behavior, not a roadmap promise.

Tasks are a first-party workflow module for commitments and outcomes. The module owns task storage, recurrence records, lightweight checklist items, parent/child task relationships, task reminder settings, task timer source routes, task browser routes, public task API routes, task search indexing, task audit payloads, and task lifecycle events.

Tasks stay integrated through framework contracts for permissions, app shell navigation, Workbench cards, Dashboard summaries, tags, files, search, notifications, audit, public API scopes, Help, module settings, and module status. The framework owns those services; Tasks contributes declarations, routes, event metadata, and record-specific behavior.

## Current Workflow Surface

The protected Tasks page is `tasks.html` under the Projects menu. It supports scoped task creation, editing, duplicate, complete, reopen, archive, restore, bulk status/priority/assignee updates, tag filtering, notification following, recurrence settings, reminders, files, and task timers when Time Tracking is enabled.

The task dialog includes:

- title, status, priority, client/project context, due date, and due time
- assignees
- next action
- blocked reason
- resume note
- completion duration for completed or archived records
- lightweight checklist controls
- recurrence, reminders, tags, files, notes, notifications, description, and task timer controls

The task dialog includes a Notes panel mounted through the Notes-owned linked-record helper. Saved tasks show notes linked through task context or `note_links`, permitted create/link/unlink actions, and the empty state "No notes linked to this task." Unsaved tasks show "Save the task before adding notes." New notes created from a task carry task context, available project/client context, Note Kind `log`, the Active Work Library suggestion, and the normal internal visibility default unless the user changes it.

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
- `scripts/task-qol-closeout-regression.mjs`
- `scripts/task-timer-status-regression.mjs`
- `scripts/notes-linked-panel-regression.mjs`

The closeout regression verifies task reads, summaries, Workbench items, search documents, internal event metadata, inactive-task resume candidacy, inaccessible-task boundaries, Help declarations, and this developer handoff. The linked-panel regression verifies the Task dialog Notes panel contract, task-created note defaults, and task note-count source wiring.
