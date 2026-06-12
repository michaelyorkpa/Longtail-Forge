# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.33.5.0 - Task Module QoL Updates

### Implementation Sub-Versions

Use these sub-versions as the implementation order for the Tasks quality-of-life pass. The detailed checklist below remains the source backlog; each sub-version owns the relevant checklist items and should be closed out with package version, changelog, decisions, and verification when implemented.

#### Version 0.33.5.0.1 - Task Context and Resume-Safe Fields

Goal:
Tasks should expose enough human-written context to explain what the user can do next, why a task is blocked, and where work paused without requiring Dashboard, Workbench, notifications, search, or future resume state to infer meaning from title/status/due date alone.

- [x] Add and persist optional `next_action`, `blocked_reason`, and `resume_note` task fields.
- [x] Show these fields in the task detail dialog with compact, plain-language labels.
- [x] Prompt for `blocked_reason` when moving a task to `blocked`, without making it a hard requirement unless implementation stays simple.
- [x] Keep `resume_note` human-written and separate from description; do not auto-generate it.
- [x] Include these fields in permission-safe task API reads and task summaries where the user can read the task.
- [x] Include safe task context in search/resume-safe payloads where appropriate without adding framework-owned resume storage.
- [x] Add focused create/update/read regressions proving the fields survive normal task workflows and do not leak inaccessible linked context.

#### Version 0.33.5.0.2 - Task Activity and Completion Metrics

Goal:
Tasks should expose normalized activity and completion metadata so later Dashboard, reporting, Workbench, notifications, and resume-state consumers can rank or summarize work without depending on browser-local timestamps.

- [x] Expose a normalized `last_worked_at` value for tasks, stored or derived by the task service.
- [x] Update or derive activity from task edits, status changes, checklist activity, timer interactions, linked notes, and file attachment events where those hooks already exist or can be safely introduced.
- [x] Keep future Workbench ranking out of this pass; only expose the task-owned activity signal.
- [x] Display "Time to completion" for completed and archived tasks in the task detail modal, calculated from created date/time to completed date/time.
- [x] Shape the completion duration so the future reporting module can reuse it for efficiency reporting.
- [x] Add regressions for completed/archived readability and for inactive tasks not becoming active resume candidates by default.

#### Version 0.33.5.0.3 - Recurrence Frequency QoL

Goal:
Task recurrence should support common weekday/weekend planning without forcing users to manually recreate predictable work patterns.

- [x] Add `Weekdays` and `Weekends` frequency options below `Daily`.
- [x] Define `Weekdays` as Monday, Tuesday, Wednesday, Thursday, and Friday.
- [x] Define `Weekends` as Saturday and Sunday.
- [x] Preserve `Daily` as seven days a week.
- [x] Update recurrence creation/update/read behavior and focused recurrence regressions.

#### Version 0.33.5.0.4 - Lightweight Task Checklists

Goal:
Task checklists should make task progress visible and resumable while staying lightweight aids inside a task, not separate subtasks, dependencies, schedules, or Workbench records.

- [x] Add module-owned lightweight checklist storage and service behavior.
- [x] Allow permitted users to add, edit, reorder, check, uncheck, and delete checklist items.
- [x] Display checklist progress in task detail, including total count, completed count, and next incomplete item label where permitted.
- [x] Include checklist progress in task summary/resume-safe payloads without making checklist items independently taggable, assignable, timed, or searchable records.
- [x] Add focused checklist regressions for permissions, ordering, completion state, progress summaries, and private/inaccessible context boundaries.

#### Version 0.33.5.0.5 - Parent/Child Task Planning and Blocking Rules

Goal:
Parent/child task relationships should support visible blocking work without turning checklist items into subtasks or making project scheduling/dependency management broader than Tasks can safely own in this pass.

- [x] Add parent/child task relationships.
- [x] Prevent circular references.
- [x] Enforce workspace boundaries.
- [x] In business workspaces, require parent and child tasks to remain within the same client when both have client context.
- [x] Defer configurable same-project/same-client relationship policy unless implementation review shows a simple workspace setting is necessary before launch.
- [x] Allow child tasks to be marked as blocking.
- [x] Prevent or recover parent `in_progress` transitions while blocking child tasks remain incomplete.
- [x] Move parent tasks to or keep them in `blocked` when incomplete blocking child tasks require it, while preserving a useful `blocked_reason` where available.
- [x] Add focused regressions for circular-reference prevention, client/workspace boundaries, blocking state transitions, and blocked-reason preservation.

#### Version 0.33.5.0.6 - Task List Density and Recovery UI

Goal:
Projects -> Tasks should become easier to scan and resume from without becoming a dashboard or hiding the next useful task action.

- [x] Convert task list rows to a compact three-row layout.
- [x] Row one: task name with tight tag chips below.
- [x] Row two: very tight metadata, with harder Scope/Assignee truncation on mobile.
- [x] Row three: right-aligned actions.
- [x] Keep existing icon buttons where clear.
- [x] Change "Follow Notifications" to a bell icon.
- [x] Avoid horizontal rules/borders inside the three-row listing so rows stay dense.
- [x] Surface `next_action`, blocked state, checklist progress, and resume note indicators only where they improve scanning without overcrowding the row.
- [x] Add focused responsive/UI regressions for dense rows, mobile truncation, action availability, and resume-context visibility.

#### Version 0.33.5.0.7 - Task QoL Verification and Resume-Hook Closeout

Goal:
Close the Tasks QoL line by proving Tasks expose useful, permission-safe state for future framework resume consumers while leaving the global resume-state service, ranking, dismissal, API, and Workbench feed to the framework-owned resume-state release.

- [x] Verify task reads, summaries, search payloads, events, and hooks expose only permission-safe task context.
- [x] Verify completed, archived, deleted, private, or inaccessible tasks do not become active resume candidates by default. Tasks do not expose a shipped task delete workflow; archive/restore remains the inactive-history path.
- [x] Verify task lifecycle events include safe source/activity/progress metadata needed by future resume-state producers.
- [x] Verify blocked and interrupted task states offer useful recovery actions instead of dead ends.
- [x] Update Help and developer/module docs for current Tasks behavior without documenting future promises as shipped behavior.
- [x] Run focused Tasks service/API/UI regressions.
- [x] Run permission regressions covering task summaries, checklists, parent/child links, and resume-safe payloads.
- [x] Run `npm run check`.
- [x] Run `npm run test:permissions`.
- [x] Verify `/api/app-info` reports the completed Tasks QoL closeout version.
- [x] Move completed roadmap sections to `ROADMAP-ARCHIVE.md` according to the existing release process. No older completed top-level roadmap section is ahead of 0.33.5.0, so 0.33.5.0 remains the most recently completed active section.

### Detailed Requirements Backlog

#### Task Next Action and Resume Metadata

Decision:
Tasks should carry enough plain-language context for Dashboard, Workbench, notifications, search, and future resume state to explain what the user can do next without guessing from title/status/due date alone.

- [x] Add optional `next_action` field to tasks.
  - [x] Keep it short and plain-language.
  - [x] Example: "Send draft invoice to CTU."
  - [x] Show it in the task detail dialog.
  - [x] Include it in task API responses where the user can read the task.
  - [x] Include it in task search/resume-safe payloads where appropriate.

- [x] Add optional `blocked_reason` field to tasks.
  - [x] Show when task status is `blocked`.
  - [x] Prompt for it when moving a task to `blocked`, but do not hard-require it in the first pass unless implementation is simple.
  - [x] Include it in safe task summaries for Workbench and notifications.

- [x] Add optional `resume_note` or `handoff_note` field to tasks.
  - [x] This is the human-written "where I left off" field.
  - [x] Example: "Waiting on CTU to confirm PO number; invoice draft is otherwise ready."
  - [x] Keep it separate from the full task description.
  - [x] Include it in task detail and permission-safe task reads.
  - [x] Do not auto-generate this in 0.33.5.0.

- [x] Add task activity timestamps useful for resume ranking.
  - [x] `last_worked_at` may be stored or derived, but the service should expose a normalized value.
  - [x] Timer start/pause/finalize, task edits, status changes, linked notes, and file attachments update/derive it now; checklist activity remains reserved for the checklist slice.
  - [x] Do not make Workbench ranking depend on browser-local timestamps.

- [x] Update task checklist payloads to expose progress.
  - [x] Total checklist item count.
  - [x] Completed checklist item count.
  - [x] Next incomplete checklist item label where permitted.
  - [x] Do not make checklist items full Workbench records.

- [x] Add task service/API regression coverage.
  - [x] `next_action`, `blocked_reason`, and `resume_note` survive create/update/read.
  - [x] Blocked tasks can safely expose blocked reason.
  - [x] Completed/archived tasks remain readable without becoming active resume candidates by default.
  - [x] Private/inaccessible linked context is not leaked through task summary payloads.

#### Task Metadata Update

- [x] Inside the task details (Edit Task Modal), completed and archived tasks should display "Time to completion" which is calculated from created date/time and completed date/time
  - [x] This number should be usable by reporting module for efficiency numbers

#### Recurrence Update

- [x] Add Weekdays and Weekends to Frequency options, below Daily
  - Weekdays means Monday, Tuesday, Wednesday, Thursday, Friday
  - Weekends means Saturday, Sunday
  - Daily means 7 days a week

#### Task Checklists

Decision: Task checklists are lightweight completion aids inside a task. Full subtasks are separate task records and should be deferred until the Tasks module needs parent-child task planning, dependencies, or nested assignment workflows.

- [x] Add lightweight checklist support to Tasks.
  - [x] Checklist items belong to a single task.
  - [x] Checklist items are not full subtasks.
  - [x] Checklist items should support:
    - [x] Checklist item ID
    - [x] Workspace ID
    - [x] Task ID
    - [x] Label/title
    - [x] Checked/completed state
    - [x] Completed at
    - [x] Completed by user ID
    - [x] Sort order
    - [x] Created at
    - [x] Updated at
  - [x] Allow permitted users to add, edit, reorder, check, uncheck, and delete checklist items.
  - [x] Display checklist progress on the task detail view.
    - [x] Example: `3 / 7 complete`
  - [x] Optionally show checklist progress on task cards/list rows after the task UI is cleaned up.
  - [x] Do not make checklist items separately taggable in the first pass.
  - [x] Do not make checklist items separately assignable in the first pass.
  - [x] Do not attach timers directly to checklist items in the first pass.
  - [x] Do not treat checklist items as dependencies or project schedule records.

#### Parent/Child Tasks

- [x] Add parent/child task relationships
  - [x] Prevent circular references
  - [x] Parent tasks can be part of different projects, but, within Business workspaces, must be part of the same client
    - Should this be an adjustable setting within the workspace? Should you only be allowed to pull from the same project/client for parent tasks? I can see this being a useful setting, but I'm open to ideas.
  - [x] Child tasks can be markable as "blocking"
    - [x] If a child is marked as blocking, and incomplete, it sets the status of parent tasks to "blocked" until the child task is completed
      - [x] Before moving parent tasks to In Progress, logic should check that no other blocking child tasks are incomplete

#### Task UI

In Projects -> Tasks, the task list isn't optimized for efficient viewing.
- [x] Create a three row listing for each task
  - [x] Row one is the task name with tag chips below (Kept tight)
  - [x] Row two is the rest of the meta data (Very Tight)
    - [x] Truncate Scope/Assignees harder on mobile
  - [x] Row three is the buttons, right aligned
    - The icon buttons are great, except for the "Follow Notifications" button, this should be a bell
  - [x] No horizontal rules/borders for these 3 rows, to keep it as tight as possible

## Version 0.33.5.2 - Client/Projects Fixes, Listing/View Ownership and Availability Refinement

Shared implementation contract:
0.33.5.2 moves repeated sorting, filtering, option-building, count, and permission-safe read-model logic into the module that owns the records. Browser code may cache, render, and pass user-selected query parameters, but it should not be the canonical source for which records are visible, how hierarchy is shaped, how picker labels are indented, how "No Tags" is interpreted, or how reusable suggestions are ranked.

- Permission and workspace/module-availability checks must happen before sorting, shaping, counting, or returning labels.
- Modules should expose stable query helpers and browser/API payloads that other surfaces can reuse.
- Framework-owned services may coordinate cross-module contracts, but they should not hard-code module-specific record rules.
- Public API payloads may reuse the same underlying query helpers, but must keep stable external contracts, API-key scopes, pagination, and no browser-only fields.
- No AI ranking is included in this line. All ordering must be deterministic and explainable.
- No open implementation questions are expected for this line; each slice below should be implemented by following the owning-module boundary.

### Version 0.33.5.2.0 - Client/Projects Fixes

Goal:
Squash focused Client/Projects regressions before the broader canonical list/view ownership work begins. This pass should repair real user-facing data preservation and inheritance bugs without redesigning Client/Projects list payloads, picker ordering, or public API contracts.

Out of scope:
- Do not introduce the canonical client/project list payload contract from 0.33.5.2.1.
- Do not redesign Client Settings, Project Settings, tag propagation, or billing settings UI beyond what is needed to fix the listed bugs.
- Do not change tag semantics; tags remain classification metadata and must not drive billing behavior.

#### Project billing inheritance from Project Settings

- [x] Reproduce the Project Settings add-project path:
  - [x] Open Projects -> Project Settings -> Add Project.
  - [x] Select a billable business client with configured billing rate, billing period, rounding mode, and rounding increment.
  - [x] Save a new project without manually overriding billing fields.
  - [x] Confirm the created project currently fails to inherit expected client billing defaults.
- [x] Fix project creation from Projects -> Project Settings -> Add Project so client-linked business projects inherit client billing settings when no explicit project override is provided.
- [x] Preserve existing rules for workspace-level projects and personal/family workspaces:
  - [x] Workspace-level projects should keep workspace/default project billing behavior.
  - [x] Personal and family workspace projects remain non-billable by design while preserving rounding behavior where applicable.
- [x] Ensure inherited billing values are visible after save in Project Settings, project detail reads, and time-entry/timer billing calculations that already consume project billing settings.
- [x] Add focused regression coverage for project creation through the Project Settings path, including client-linked inheritance and non-client/workspace-level behavior.

#### Client billing saves must preserve tags

- [x] Reproduce the client tag loss path:
  - [x] Go to Settings -> Workspace -> Clients.
  - [x] Use Add Client to create a client with one or more direct/manual tags.
  - [x] Edit the client billing settings, such as turning billing off and enabling rounding.
  - [x] Save the client.
  - [x] Confirm the client tags are currently removed after the billing-only save.
- [x] Fix client billing/settings save behavior so updating billing fields preserves all existing client tag assignments.
- [x] Preserve both direct/manual and propagated tag assignments when client billing settings are saved.
- [x] Ensure re-saving client identity/status/contact/billing fields does not treat omitted tag picker payloads as an instruction to clear tags.
- [x] Keep explicit tag edits through the client edit modal working normally, including adding/removing direct/manual tags through the intended tag picker flow.
- [x] Add focused regression coverage proving client billing saves preserve tags and explicit client tag edits still update tags correctly.

#### Verification and closeout

- [x] Run focused Client/Projects service/API tests for project billing inheritance and client billing-save tag preservation.
- [x] Run focused browser/UI regression coverage for Settings -> Workspace -> Clients and Projects -> Project Settings -> Add Project where available. Browser payload behavior is covered by `scripts/check-js.mjs` and the focused service/API regression because no browser automation surface was available in this pass.
- [x] Run tag permission/assignment regressions if the fix touches shared tag assignment helpers.
- [x] Run billing-related time-entry or timer regressions if the project inheritance fix changes billing source selection. The fix keeps inherited project billing fields unset and does not change downstream billing source selection logic.
- [x] Run `npm run check`.
- [x] Run `npm run test:permissions` if the touched code changes tag reads/writes, project/client visibility, or permission-sensitive payloads.
- [x] Update `DECISIONS.md` if implementation clarifies a lasting Client/Projects, billing inheritance, or tag-preservation rule.
- [x] Add the completed bug fixes to the current `CHANGELOG.md` version entry when implemented.

### Version 0.33.5.2.1 - Canonical client and project list payloads

Goal:
Make `client-projects` the canonical owner for client/project filtering, hierarchy shaping, display-label metadata, and ordering so every UI surface, picker, embedded panel, and public API read can reuse one permission-safe contract.

Out of scope:
- Do not redesign Projects or Clients page layout in this slice.
- Do not add unrelated API-key scopes; public API scope cleanup is tracked in 0.33.5.2.9 and later 0.33.5.3.x.
- Do not move tag semantics into Client/Projects. Tags remain framework classification metadata consumed through the Tags contract.

- [x] Add module-owned client/project query helpers in `client-projects`.
  - [x] Filter by workspace and readable scope before sorting or shaping.
  - [x] Return stable IDs, parent IDs, status, display names, depth/path metadata where useful, and optional tag metadata only when requested.
  - [x] Keep orphan/cycle-safe behavior deterministic and non-crashing.
  - [x] Support business, personal, and family workspace differences without browser-specific branches becoming canonical.
- [x] Add canonical client list behavior.
  - [x] Default filter: `status=Active`.
  - [x] Explicit filters: `status=Active|Inactive|All`.
  - [x] `shape=flat&scope=top_level`: top-level clients only, alphabetical by display name.
  - [x] `shape=tree`: top-level clients alphabetical, with child clients nested below each parent alphabetically.
  - [x] `shape=flat&include_depth=true`: flattened tree order for selects/dropdowns with `depth`, `parent_client_id`, and safe display-label metadata.
- [x] Add canonical project list behavior.
  - [x] Default filters: `status=Active` and `client=All`.
  - [x] Explicit filters: `status=Active|Inactive|Completed|All`.
  - [x] Explicit client scopes: `client=All|<client_id>|workspace`.
  - [x] `shape=flat`: alphabetical project list, optionally filtered by client/workspace scope.
  - [x] `shape=tree`: parent projects alphabetical, with child projects nested below each parent alphabetically.
  - [x] `shape=flat&include_depth=true`: flattened tree order for selects/dropdowns with `depth`, `parent_project_id`, `client_id`, and safe display-label metadata.
  - [x] Support workspace-level projects in personal/family workspaces and business workspaces where `client_id` is empty.
- [x] Enhance existing browser and public API contracts where practical.
  - [x] Prefer `/api/clients`, `/api/projects`, `/api/client-projects`, `/api/v1/clients`, and `/api/v1/projects` enhancements over a separate sorting endpoint unless a dedicated options route is clearly simpler.
  - [x] Keep public API responses stable, paginated where needed, API-key scoped, and free of browser-only fields.
  - [x] Move existing page-local client/project sorting helpers toward rendering-only use once canonical payloads are available.
- [x] Add regression coverage.
  - [x] Active defaults.
  - [x] Inactive/all client filters.
  - [x] Inactive/completed/all project filters.
  - [x] Top-level-only client/project views.
  - [x] Nested tree views.
  - [x] Flattened picker labels and depth values.
  - [x] Permission filtering before shaping.
  - [x] Orphan/cycle-safe behavior.
  - [x] Public API pagination.
  - [x] Workspace-type differences between business, personal, and family workspaces.

### Version 0.33.5.2.1.1 - Main Navigation Actions Rename and Reporting Placement

Goal:
Apply the Short Term -> Main Navigation Update by making the top-level project-adjacent work menu read as "Actions" across current user-facing navigation/docs and moving Reporting under Actions.

Implementation interpretation:
- The original TODO line that mentioned "Projects" for Reporting placement was a typo; Reporting belongs directly under Actions.
- The former top-level Projects menu becomes the top-level Actions menu.
- There is no Projects submenu under Actions.
- Reporting remains a slide-out menu with a single Reporting entry for now, but that slide-out lives directly under Actions instead of being top-level.
- Clients remains under Settings -> Workspace and does not move into the Actions menu.

- [x] Update the roadmap from the TODO Short Term -> Main Navigation Update.
- [x] Rename the app-shell top-level Projects menu to Actions.
- [x] Keep existing project-adjacent entries under Actions:
  - [x] Time Keeping.
  - [x] Tasks.
  - [x] Notes.
  - [x] Lists when enabled.
  - [x] Files.
  - [x] Project Settings.
  - [x] Reporting.
- [x] Move Project Settings directly under Actions.
- [x] Move Reporting directly under Actions.
- [x] Keep Reporting as a slide-out submenu with one Reporting entry for now.
- [x] Preserve Clients under Settings -> Workspace.
- [x] Add focused regression coverage for the app-shell navigation shape.
- [x] Run focused navigation/app-shell regressions.
- [x] Run `npm run check`.
- [x] Run `npm run test:permissions`.
- [x] Update `CHANGELOG.md`, `DECISIONS.md`, package metadata, and TODO cleanup.

### Version 0.33.5.2.2 - Canonical Task Query and Work Item Summary Payloads

Goal:
Move task filtering/sorting used by Tasks, Dashboard, Workbench, and future resume-state producers into Tasks-owned service/query helpers, then expose a normalized task work-item summary payload that other surfaces can consume without reconstructing task context in browser code.

Out of scope:
- Do not add global `work_resume_state` storage, ranking, dismissal, or Workbench feed behavior here.
- Do not add AI ranking.
- Do not make Dashboard or Workbench the canonical owner of task filtering.

- [ ] Add a Tasks-owned canonical query helper for task list/work-item reads.
  - [ ] Enforce workspace, module, task read permission, private/inaccessible context, and readable client/project boundaries before sorting/shaping.
  - [ ] Preserve existing Tasks API behavior while adding reusable query options.
  - [ ] Keep browser-local sorting as a display fallback only until callers are migrated.
- [ ] Support canonical task filters.
  - [ ] Assigned to current user.
  - [ ] Unassigned.
  - [ ] Due today.
  - [ ] Next due.
  - [ ] Due this week.
  - [ ] Overdue.
  - [ ] In progress.
  - [ ] Blocked.
  - [ ] Has running/paused timer.
  - [ ] Recently updated/worked.
  - [ ] Project.
  - [ ] Client for business workspaces.
  - [ ] Tags and No Tags through the Tags contract where supported.
  - [ ] Archived/completed/history filters only when explicitly requested.
- [ ] Support deterministic task sorts.
  - [ ] Due date/time.
  - [ ] Priority.
  - [ ] Status.
  - [ ] Last worked.
  - [ ] Recently updated.
  - [ ] Project/client context.
  - [ ] Stable fallback by title or created date so pagination and repeated reads do not drift.
- [ ] Add normalized task work-item summary payload for Tasks list, Dashboard summaries, Workbench, and future resume-state consumers.
  - [ ] Include `source_module_id`, `source_type`, `source_id`, `source_label`, and `source_url`.
  - [ ] Include `title`, `description_excerpt`, `status`, `priority`, `due_date`, `due_time`, and normalized `due_at`.
  - [ ] Include readable `client_id`, `client_name`, `project_id`, and `project_name`.
  - [ ] Include `assignee_ids` and `assigned_to_current_user`.
  - [ ] Include `next_action`, `blocked_reason`, and `resume_note` using the current task field name; do not introduce a separate `handoff_note` storage field.
  - [ ] Include `checklist_progress`, `timer_status`, `elapsed_seconds`, `last_worked_at`, and `updated_at`.
  - [ ] Mark completed, archived, deleted, private, or inaccessible tasks as inactive/non-candidates where summary payloads expose resume-safe metadata.
- [ ] Add regression coverage.
  - [ ] Permission filtering before task shaping.
  - [ ] Private/inaccessible task context is not leaked.
  - [ ] Each filter and sort mode returns deterministic results.
  - [ ] Work-item summary payload includes current 0.33.5 task context fields.
  - [ ] Dashboard/Workbench callers can consume the canonical payload without adding their own task-query rules.

### Version 0.33.5.2.3 - Task list filtering/sorting/options

Goal:
Update the protected Projects -> Tasks list to consume the canonical Tasks query/options contract from 0.33.5.2.2 so the browser controls query intent but no longer owns canonical task filtering, option visibility, or multi-mode sorting.

Out of scope:
- Do not redesign the dense task row layout from 0.33.5.0.6.
- Do not add new task fields beyond consuming the canonical payload from 0.33.5.2.2.
- Do not add Workbench-specific ranking.

- [ ] Replace browser-owned task filtering with canonical task query parameters.
  - [ ] Status filter.
  - [ ] Client filter for business workspaces.
  - [ ] Project filter, including workspace-level projects.
  - [ ] Assignee/quick filter states such as My Tasks, All, Unassigned, and active recovery views.
  - [ ] Tag and No Tags filter through the Tags contract.
- [ ] Replace browser-owned multi-mode sorting with canonical sort parameters.
  - [ ] Due date/time.
  - [ ] Priority.
  - [ ] Status.
  - [ ] Last worked/recently updated.
  - [ ] Project/client context.
- [ ] Update task options payload consumption.
  - [ ] Read visible client/project/user/tag filter options from service-owned options payloads.
  - [ ] Reuse the canonical Client/Projects option payload from 0.33.5.2.1 for client/project labels and hierarchy.
  - [ ] Keep inactive/archived choices out of active defaults unless explicitly requested.
- [ ] Preserve task-list UX behavior.
  - [ ] Keep the explicit All quick filter in the expected position.
  - [ ] Keep dense row metadata and action availability intact.
  - [ ] Keep empty states recovery-oriented and specific to the selected filter.
- [ ] Add regression coverage.
  - [ ] Browser sends query/sort intent instead of re-filtering canonical results.
  - [ ] Task filter options respect permissions and workspace type.
  - [ ] Mobile/dense task rows still render correctly after payload changes.
  - [ ] No Tags behavior matches effective-tag semantics.

### Version 0.33.5.2.4 - Task/client/project picker options

Goal:
Make task, timer, note-link, list-link, file-attachment, and other record pickers consume module-owned option payloads instead of rebuilding active client/project/user/task option lists in each browser file.

Out of scope:
- Do not create a framework-owned universal picker database.
- Do not change tag picker semantics; Tags remains the owner of tag options and No Tags behavior.
- Do not expose unreadable record labels through convenience option endpoints.

- [ ] Update `tasksService.readOptions` to reuse the canonical Client/Projects option payload from 0.33.5.2.1.
  - [ ] Preserve active client/project defaults.
  - [ ] Preserve workspace-level projects.
  - [ ] Preserve personal/family workspace behavior where clients are unavailable.
  - [ ] Return depth/label metadata so browser code does not own indentation.
- [ ] Add or normalize task option payloads where other modules need task pickers.
  - [ ] Active task options by default.
  - [ ] Explicit include-completed/include-archived flags where historical linking is allowed.
  - [ ] Permission filtering before labels are returned.
  - [ ] Client/project context metadata when readable.
- [ ] Update browser consumers gradually.
  - [ ] Task dialogs.
  - [ ] Time Tracker and Time Entries task selectors.
  - [ ] Notes linked-record panels.
  - [ ] Lists linked-record selectors.
  - [ ] Files attachment target selectors where present.
- [ ] Add regression coverage.
  - [ ] Picker labels and indentation come from service payloads.
  - [ ] Inactive/archived records do not leak into active pickers.
  - [ ] Permission-filtered records are absent rather than relabeled.
  - [ ] Workspace type differences are preserved.

### Version 0.33.5.2.5 - Notes linked-record panels and collection trees

Goal:
Keep Notes-owned linked-record panels and collection trees canonical inside the Notes module so Tasks, Clients, Projects, Lists, Files, Tickets, and future modules do not duplicate note lookup, collection ordering, or permission checks.

Out of scope:
- Do not turn Notes into workflow status, task dependencies, or Knowledge Base publication state.
- Do not let consuming modules query Notes tables directly for panel data.
- Do not change secure/private note access semantics beyond preserving them in the read model.

- [ ] Harden `/api/notes/for-target` as the canonical linked-note panel read.
  - [ ] Filter by note access policy before counts, labels, excerpts, or links are returned.
  - [ ] Support deterministic sort modes such as pinned/recent/updated/title where useful.
  - [ ] Include safe target metadata and source URLs without leaking inaccessible linked-record labels.
  - [ ] Return empty states that help users add or recover notes without implying future KB behavior.
- [ ] Harden `/api/notes/collections` as the canonical collection tree read.
  - [ ] Preserve bucket-first collection ordering.
  - [ ] Preserve `All Libraries`, `All collections`, and `Uncategorized` defaults.
  - [ ] Keep collapsed revision behavior and avoid lone `Original` display regressions.
  - [ ] Filter secure/private collection content through Notes access policy before counts are shown.
- [ ] Update reusable Notes panels to consume Notes-owned payloads.
  - [ ] Tasks note panels.
  - [ ] Client/project note panels.
  - [ ] Lists note panels.
  - [ ] Future ticket panels when Tickets arrive.
- [ ] Add regression coverage.
  - [ ] Notes access policy is enforced before linked-note panel shaping.
  - [ ] Collection tree ordering and defaults remain stable.
  - [ ] Secure/private notes do not leak through counts, labels, excerpts, or linked panels.

### Version 0.33.5.2.6 - Files attachment lists/counts

Goal:
Keep attachment list, count, sorting, filtering, and pagination behavior inside the framework-owned Files service while modules own only the business meaning and placement of their file attachments.

Out of scope:
- Do not add file deletion, multi-upload, drag-and-drop upload, or storage quotas here; those belong to the later Files QoL section.
- Do not expose protected storage paths, raw scanner details, or unsafe URLs.
- Do not make individual modules query file tables directly for counts.

- [ ] Formalize canonical attachment list/count reads.
  - [ ] Target module/type/id reads must re-check target access before returning attachment labels or counts.
  - [ ] Counts must be permission-safe and must not reveal inaccessible attachments.
  - [ ] Attachment list sorting should be service-owned, with deterministic defaults such as newest first.
  - [ ] Pagination/filtering should be accepted at the Files service/API boundary where list sizes can grow.
- [ ] Update module attachment panels to consume Files-owned payloads.
  - [ ] Tasks attachments.
  - [ ] Notes attachments.
  - [ ] Lists attachments.
  - [ ] Client/project attachments if present.
  - [ ] Future Tickets and Knowledge Base attachments.
- [ ] Preserve file lifecycle boundaries.
  - [ ] Modules may subscribe to safe file lifecycle events.
  - [ ] File service remains responsible for storage, access, downloads, scanner results, and shared UI behavior.
- [ ] Add regression coverage.
  - [ ] Attachment counts are permission-safe.
  - [ ] Attachment list pagination/sorting is deterministic.
  - [ ] Inaccessible target records do not reveal file labels or counts.
  - [ ] Lifecycle event payloads remain sanitized.

### Version 0.33.5.2.7 - Lists module index filters/sorts and item suggestions

Goal:
Move Lists index filters, sorts, progress summaries, reusable-list views, linked-record context, and item catalog suggestions into Lists-owned service/API behavior so the browser UI renders a canonical list work surface rather than becoming the source of truth.

Out of scope:
- Do not turn Lists into Notes, Tasks, inventory, purchasing, accounting, vendor management, manufacturing, or ERP.
- Do not introduce automatic catalog learning unless a later Lists slice explicitly promotes it.
- Do not make list items independently taggable, assignable, timed, or searchable beyond the existing Lists contract.

- [ ] Add/verify Lists-owned index query behavior.
  - [ ] Default active list view.
  - [ ] Status filters for active/completed/finalized/archived/deleted where supported.
  - [ ] Type filters for shopping/procurement/packing/supplies/parts/checklist/bill of materials.
  - [ ] Reusable-list filter/view.
  - [ ] Client/project filters for business workspaces.
  - [ ] Linked-record filters where the Lists link contract supports them.
  - [ ] Tag and No Tags filters through the Tags contract.
- [ ] Add deterministic Lists sort behavior.
  - [ ] Updated/recent activity.
  - [ ] Needed-by date.
  - [ ] Progress/incomplete count where useful.
  - [ ] Name/type/status fallback ordering.
  - [ ] Source/reusable context ordering where useful.
- [ ] Keep item catalog suggestions service-owned.
  - [ ] Rank by workspace scope, matching project/client/list type context, usage count, last-used recency, and item name.
  - [ ] Preserve permission checks before suggestion labels or source context are returned.
  - [ ] Preserve snapshot behavior when catalog suggestions are copied into list items.
- [ ] Update Lists browser UI to consume canonical query/suggestion payloads.
  - [ ] Browser sends filter/sort intent.
  - [ ] Browser does not own reusable-list/source ranking.
  - [ ] Empty states remain workflow-oriented and recovery-friendly.
- [ ] Add regression coverage.
  - [ ] Lists filters and sorts are service/API-owned.
  - [ ] Catalog suggestion ranking is deterministic.
  - [ ] Permission filtering happens before list labels, linked context, tags, or suggestions are returned.

### Version 0.33.5.2.8 - Tags filters and bulk tag assignment

Goal:
Make tag filter semantics and bulk tag assignment a Tags-owned/framework-hooked contract so modules can opt into taggable records without hard-coding No Tags filters or bulk assignment behavior per module.

Out of scope:
- Do not add tag scopes.
- Do not make tags drive permissions, visibility, billing status, workflow status, archive state, or report totals.
- Do not force every module to expose bulk tag UI in this slice; the contract should allow safe adoption by module.

- [ ] Formalize shared tag filter semantics.
  - [ ] Simple No Tags means no effective tags.
  - [ ] Preserve the reserved direct-only sentinel for future advanced UI without exposing broad advanced controls here.
  - [ ] Tag filters should use the Tags service/effective-tag contract rather than module-local string matching.
  - [ ] Modules should pass tag filter intent to their owning query helpers.
- [ ] Add a safe bulk tag assignment contract.
  - [ ] Bulk assignment operates on direct/manual assignments unless an explicit future workflow says otherwise.
  - [ ] Propagated and system assignments must be preserved.
  - [ ] Per-record permission checks happen before mutation.
  - [ ] Partial success/failure reporting identifies skipped records without leaking inaccessible labels.
  - [ ] Bulk remove must not delete parent assignments or propagated/system tags.
- [ ] Wire first consumers where the UI already needs the pattern.
  - [ ] Tasks filters and bulk tag assignment.
  - [ ] Clients/Projects filters and bulk tag assignment where appropriate.
  - [ ] Lists filters and bulk tag assignment where Lists taggable contracts are active.
  - [ ] Time Entries/Reporting filters continue to use stored/effective tag semantics already defined for finalized entries.
- [ ] Add regression coverage.
  - [ ] No Tags filters use effective-tag semantics.
  - [ ] Bulk tag assignment preserves propagated/system assignments.
  - [ ] Per-record permissions are enforced before mutation.
  - [ ] Tags remain classification metadata only.

### Version 0.33.5.2.9 - API Key cleanup

Goal:
Audit public API key scopes against framework and first-party module capabilities, then document the missing scope work for 0.33.5.3.x without trying to complete the full public API expansion inside 0.33.5.2.

Out of scope:
- Do not implement the full missing API-key scope set in this slice unless it remains a tiny documentation correction.
- Do not expose new public API routes without a dedicated implementation/version slice.
- Do not bypass module permissions; API keys must map through stable module/framework permission contracts.

- [ ] Audit current API key scopes visible to Workspace Admin and Super Admin users.
  - [ ] Confirm existing scopes: `clients:read`, `projects:read`, `tasks:read`, `tasks:write`, `time_entries:read`, and `time_entries:write`.
  - [ ] Confirm missing write scopes for clients/projects if still absent.
  - [ ] Confirm missing public scopes for files, search, notes, lists, tags, notifications, Help/read-only discovery, and any other active first-party modules.
  - [ ] Compare UI-visible scopes with seeded/default API-key scope definitions.
- [ ] Map desired scopes to owning contracts.
  - [ ] Framework-owned scopes such as files, search, notifications, Help, and settings/discovery.
  - [ ] Module-owned scopes such as notes, lists, tasks, client-projects, time-tracking, and tags.
  - [ ] Read/write/admin/manage distinctions where the module permission model supports them.
  - [ ] Explicitly identify scopes that should remain internal-only for now.
- [ ] Add a 0.33.5.3.x roadmap plan for API key scope repair.
  - [ ] Scope registration/source-of-truth update.
  - [ ] UI display/update behavior for new scopes.
  - [ ] Public API route coverage or explicit route deferrals.
  - [ ] Permission regression coverage for API-key-scoped reads/writes.
  - [ ] Documentation updates to `docs/public-api.md`.
- [ ] Add audit/regression checklist for the future implementation.
  - [ ] Workspace Admin and Super Admin see the same allowed scope catalog where appropriate.
  - [ ] API-key reads/writes enforce the same module boundaries as browser/session permissions.
  - [ ] Missing modules are either intentionally absent and documented or available through scopes.

## Version 0.33.5.4 - Files and Time Tracking QoL Updates

### Files module

- There's no way to delete files?!
- Multiple file upload at once
- Drag and Drop file upload

- Need to have a way to limit file uploads, per workspace and per user
  - This would be quantity/size limits
  - This would be file types

### Time Entries

- Time entries aren't editable by Workspace admin
  - Tried to add tags as workspace admin to "81c61ec4-ebe4-45c2-a35d-b03e88b45bb9" and got a permissions error (couldn't read the whole thing, it was on the main window and the modal window blocked it)
  - Had to log in as Super Admin to add tags

- Are time entries from timers storing the actual start and end time with an unconnected duration, or are they adjusting start or end time based on total duration?
  - It should be the former. I want to see exactly when a timer was started and ended, as well as the total duration the timer was running during that period. Start and End time are informational, not anything to be calculated.

### Timer Resume Metadata

- [ ] Preserve exact timer start/end timestamps when finalizing active timers.
  - [ ] Start/end timestamps are informational facts.
  - [ ] Duration is stored separately and should not rewrite the start/end facts.

- [ ] Ensure active/paused timer payloads expose resume-safe source metadata.
  - [ ] Source module ID.
  - [ ] Source type.
  - [ ] Source record ID.
  - [ ] Source label.
  - [ ] Source URL.
  - [ ] Client/project context.
  - [ ] Timer status.
  - [ ] Last active start time.
  - [ ] Accumulated elapsed seconds.

- [ ] Emit or preserve safe timer lifecycle metadata for future resume state.
  - [ ] Timer started.
  - [ ] Timer paused.
  - [ ] Timer finalized.
  - [ ] Timer discarded.
  - [ ] Do not expose inaccessible source-record details.

## Version 0.33.5.6 - Search, Notification, and Tag QoL Updates

### Search Fixes/Tweaks

- Help is in the record types twice

### Notification Fixes/Tweaks

- Users who perform the action, don't need notifications of the action happening, e.g.
  - Creators of records don't need {{recordType}} created notifications
  - Modifiers of records don't need {{recordType}} updated notifications

- [ ] Record update notifications should include the changed context human-formatted from the event
  - [ ] Notifications should display a truncated example of the change for things like:
    - Description added
    - Task updated
    - etc.

- "Urgent" priority notifications should turn the bell icon red and, optionally, show an in-app alert modal
- "High" priority notifications should turn the bell icon red and not be grouped
- "Normal" priority should be grouped and increment the number on the bell icon
- "Low" priority should be grouped and NOT increase the number on the bell icon

- [ ] Use icons from notifications.html in the Notifications bell drop-down instead of full text buttons
  - [ ] Be sure to use hover-over titles on these icons

- [ ] Place "Read all" and "Dismiss all" text at bottom of notification bell drop-down
  - Font size should match "View all"

#### All notifications Page
- [ ] notifications.html: Notification Type chip should be aligned to right, left of "Dismissed"
- [ ] Read/Dismiss icon buttons do not have hover over titles (required for Accessibility and clarity)

- [ ] Disabled modules' preferences should be moved to the bottom of the preferences section automatically; not hard-coded by order
  - [ ] Listing of preferences should be a view provided by notification module

- [ ] Users should be able to adjust notification grouping (In notification Preferences in Settings -> User)
  - Workspace notifications cab be grouped by:
    - [ ] Client (Business Only)/Project (Default)
    - [ ] Notification type (Updated/Created/etc.)
    - [ ] Record Type

- [ ] Notification type chip is floating weird, it should be anchored just left of the Unread/Read/Dismissed chip

### Tags Fixes/Tweaks

- [ ] Anywhere there's a Tag filter, add a "No Tags" option to easily identify items that still need to be tagged
  - Should be directly below "All tags" option

- Tags should be bulk assignable/removable in the following contexts:
  - Projects -> Time Keeping -> Time Entries
    - This will require checkboxes in a tight leftmost column for this display to enable bulk editing
  - Projects -> Tasks
  - Eventually, Projects -> Notes
  - Bulk tag application should use the same/similar box to initial entry
    - This entire thing should be owned within tags and be hooked in via the framework, not hard coded anywhere

- [ ] Add tag chips between task title and task meta data on Workbench; keep it tight

### Resume-Safe Event Summary Cleanup

- [ ] Update event/notification summary helpers so user-facing changed context can be reused by activity feed and future resume state.
  - [ ] Summaries should be human-readable.
  - [ ] Summaries should be permission-safe.
  - [ ] Summaries should avoid raw audit JSON.
  - [ ] Summaries should include safe record labels, record type, module ID, action type, actor where allowed, and changed field labels where useful.

- [ ] Do not make notifications the source of truth for resume state.
  - [ ] Notifications are directed attention items.
  - [ ] Activity/resume summaries are recovery context.
  - [ ] Audit remains the admin/security truth.

## Version 0.33.5.8 - Notes Cleanup

### Notes Type Cleanup

- [ ] Reframe `note_type` as content kind, not linked-record context.
- [ ] Keep the database column name `note_type` for compatibility.
- [ ] Change the user-facing label to "Note Kind" or "Content Type".
- [ ] Keep initial content-kind values small:
  - `general`
  - `meeting`
  - `research`
  - `decision`
  - `procedure`
  - `reference`
  - `idea`
  - `log`
- [ ] Stop offering `client`, `project`, `task`, `ticket`, and `user` as new note type choices.
- [ ] Preserve legacy values in existing records and display them safely.
- [ ] There are some existing rows, but none use the deprecated type
- [ ] Use linked context and `note_links` for client/project/task/user/ticket association.
- [ ] Add regression coverage that `note_type` does not control permissions, visibility, Library bucket, collection membership, or KB publication.

### Notes Linked Record Usability

* [ ] Replace raw linked-context ID entry in Notes with a permission-safe record picker.

  * [ ] Users should be able to search/select supported link targets instead of pasting IDs.
  * [ ] Supported initial targets:

    * [ ] Workspace
    * [ ] Client
    * [ ] Project
    * [ ] Task
    * [ ] User
  * [ ] Ticket should remain reserved until the Tickets module exists.
  * [ ] Picker results must respect workspace, module state, target read permissions, and record visibility.
  * [ ] Picker results should show human labels, not only UUIDs.
  * [ ] Selecting a task should optionally infer project/client context where safe.
  * [ ] Linking a note to a task should suggest the Active Work Library bucket.
  * [ ] Linking a note to a client/project/user should suggest Ongoing Areas unless the user manually overrides the Library bucket.
  * [ ] Linking behavior must not grant note access or target-record access by itself.

* [ ] Add a reusable Notes linked-record panel/helper.

  * [ ] This should be owned by the Notes module and mounted by other modules where appropriate.
  * [ ] Inputs:

    * [ ] `targetType`
    * [ ] `targetId`
    * [ ] `clientId` optional
    * [ ] `projectId` optional
    * [ ] `readonly` optional
  * [ ] The helper should list notes linked by direct context columns and flexible `note_links` rows.
  * [ ] The helper should support:

    * [ ] View linked notes.
    * [ ] Create note for current record.
    * [ ] Link existing note.
    * [ ] Unlink note where permitted.
    * [ ] Show note visibility/security/status badges.
    * [ ] Hide private/secure/inaccessible notes without leaking counts or titles.
  * [ ] The helper should use `/api/notes/for-target` or a successor route rather than duplicating note lookup logic inside Tasks, Clients, Projects, or future Tickets.

### Task Notes Integration

* [ ] Add a Notes panel to the Task detail dialog.

  * [ ] Show notes linked to the current task.
  * [ ] Show a clear empty state: “No notes linked to this task.”
  * [ ] Allow permitted users to create a note from the task.
  * [ ] New task-created notes should:

    * [ ] Set `task_id`.
    * [ ] Set `project_id` and `client_id` from the task where available.
    * [ ] Default Library bucket to Active Work.
    * [ ] New task-created notes should:
      * [ ] Link to the task through `task_id` and/or `note_links`.
      * [ ] Set `project_id` and `client_id` from the task where available.
      * [ ] Default Library bucket to Active Work.
      * [ ] Default Note Kind / Content Type to `log` or `general`, not `task`.
      * [ ] Default visibility to `internal` unless the user chooses otherwise.
  * [ ] Allow permitted users to link an existing note to the task.
  * [ ] Allow permitted users to unlink a note from the task.
  * [ ] Do not show the panel for unsaved tasks except for a “Save the task before adding notes” state.

* [ ] Add linked-note indicators to task list rows/cards after the current task-list UI cleanup.

  * [ ] Show a compact note count where permitted.
  * [ ] Do not leak inaccessible note counts.
  * [ ] Clicking the count should open the task detail dialog and focus the Notes panel.

### Notes Display Improvements

* [ ] Replace raw linked context values in Note detail with human-readable links.

  * [ ] Client name instead of client ID.
  * [ ] Project name instead of project ID.
  * [ ] Task title instead of task ID.
  * [ ] User display name/email where allowed.
  * [ ] Fall back to safe ID display only when the target label cannot be read.

* [ ] Add linked-record navigation from Note detail.

  * [ ] Client/project/task/user links should open the appropriate record view where available.
  * [ ] Missing or inaccessible records should show a safe unavailable state.

### Notes Resume Context

- [ ] Notes should provide supporting context for resume state.
  - [ ] Active Work notes linked to tasks/projects/lists may appear as supporting context.
  - [ ] Recently edited Active Work notes may be eligible for "Pick up where I left off."
  - [ ] Normal notes should not become primary next-action candidates unless explicitly marked as Active Work or linked to active work.
  - [ ] Secure/private notes must not expose body previews, excerpts, or hidden counts in Workbench/resume contexts.
  - [ ] Linked-note panels should provide safe note count, title, status, visibility/security badges, and source URL where permitted.

### Regressions

* [ ] Notes target picker only returns records the user can read.
* [ ] Task-linked notes appear in the task Notes panel when linked through `task_id`.
* [ ] Task-linked notes appear in the task Notes panel when linked through `note_links`.
* [ ] Creating a note from a task sets task/project/client context safely.
* [ ] Private notes do not appear to unauthorized users in linked-note panels.
* [ ] Secure note bodies and previews do not appear in linked-note panels.
* [ ] Linked-note counts do not leak inaccessible notes.
* [ ] Archived notes are read-only from embedded panels.
* [ ] Disabled Notes module blocks new note/link writes but preserves historical reads where allowed.

## Version 0.33.5.9 - Work Resume State Foundation

Decision:
Work resume state is framework-owned recovery infrastructure. It records where a user left off across enabled modules without making Dashboard, Workbench, Tasks, Lists, Notes, Files, Time Tracking, or future Tickets own separate resume systems.

This release should add backend storage, service contracts, safe update hooks, and regressions only. The user-facing guided Workbench remains deferred to 0.33.7.

### Resume State Storage

- [ ] Add framework-owned `work_resume_state` storage.
- [ ] Each row represents one resumable record for one user in one workspace.
- [ ] Suggested fields:
  - [ ] `resume_state_id`
  - [ ] `workspace_id`
  - [ ] `user_id`
  - [ ] `module_id`
  - [ ] `record_type`
  - [ ] `record_id`
  - [ ] `client_id` optional
  - [ ] `project_id` optional
  - [ ] `source_url`
  - [ ] `title_snapshot`
  - [ ] `context_label_snapshot`
  - [ ] `last_action_type`
  - [ ] `last_action_label`
  - [ ] `last_worked_at`
  - [ ] `handoff_note`
  - [ ] `next_action`
  - [ ] `blocked_reason`
  - [ ] `status_snapshot`
  - [ ] `priority_snapshot`
  - [ ] `due_at_snapshot`
  - [ ] `resume_rank_hint`
  - [ ] `metadata_json`
  - [ ] `created_at`
  - [ ] `updated_at`
  - [ ] `dismissed_at` optional

### Resume State Service

- [ ] Add framework-owned resume state service.
- [ ] Add service methods:
  - [ ] `upsertResumeState(session, payload)`
  - [ ] `dismissResumeState(session, resumeStateId)`
  - [ ] `listResumeState(session, query)`
  - [ ] `removeResumeStateForRecord(workspaceId, moduleId, recordType, recordId)`
- [ ] Resume state writes must validate workspace/user ownership.
- [ ] Resume state reads must re-check record/module permissions where possible.
- [ ] Disabled modules should hide active resume candidates unless historical read access explicitly allows safe read-only context.
- [ ] Deleted records should not appear as active resume candidates.
- [ ] Archived/completed records should appear only in historical/recent contexts, not primary next-action contexts.

### Initial Resume State Producers

- [ ] Tasks should update resume state when:
  - [ ] Task is created or updated by the current user.
  - [ ] Task status changes.
  - [ ] Task timer starts, pauses, finalizes, or is discarded.
  - [ ] Task checklist changes.
  - [ ] Task `next_action`, `blocked_reason`, or `handoff_note` changes.

- [ ] Lists should update resume state when:
  - [ ] List is created or updated.
  - [ ] List item is checked/unchecked/completed/updated/reordered.
  - [ ] List is linked to or unlinked from a task/project/client/note.
  - [ ] List is completed/reopened/finalized/archived/restored/deleted.

- [ ] Notes should update resume state when:
  - [ ] Active Work note is created or edited.
  - [ ] Note is linked to a task/project/list/client.
  - [ ] Note is archived/restored/deleted.
  - [ ] Secure/private notes must not write body/excerpt content into resume state.

- [ ] Time Tracking should update resume state when:
  - [ ] Manual timer starts/pauses/finalizes/discards.
  - [ ] Sourced task timer starts/pauses/finalizes/discards.
  - [ ] Resume state should preserve source metadata without making Time Tracking own the source record.

### Resume State API

- [ ] Add protected browser API route for resume state reads.
  - [ ] Suggested route: `GET /api/work-resume`
  - [ ] Support filters:
    - [ ] `mode=recent`
    - [ ] `mode=left_off`
    - [ ] `mode=active`
    - [ ] `module_id`
    - [ ] `client_id`
    - [ ] `project_id`
    - [ ] `record_type`
  - [ ] Do not add public API routes in this release.

- [ ] Add protected browser API route to dismiss a resume candidate.
  - [ ] Suggested route: `POST /api/work-resume/:resumeStateId/dismiss`

### Regressions

- [ ] Resume state cannot cross workspace boundaries.
- [ ] Resume state cannot expose records the user can no longer read.
- [ ] Disabled modules hide active resume state safely.
- [ ] Deleted records are removed from active resume results.
- [ ] Completed/archived records are not ranked as primary active work.
- [ ] Private notes do not leak title/body/counts to unauthorized users.
- [ ] Secure notes never write decrypted body, excerpt, rendered HTML, or encryption metadata into resume state.
- [ ] List access does not grant linked task/note/project/client access through resume state.
- [ ] Task/list/note/timer updates produce deterministic resume state rows.
- [ ] Dismissed resume rows do not appear in default "left off" results.

## Version 0.33.5.10 - Help Center Re-work

- Need a way to edit and expand the help center records easily
  - Place a help directory wherever makes sense
    - Within the help directory, create directories for each first-party module
  - Take the .js that contains the help "files" and convert each help "file" to .md and place them in the appropriate spot within the help directory structure
  - In top level help/ add toc.md to build the Table of Contents on the left
    - Special processing for the toc.md:
      - The first line in the file will be the first help center page that opens (Either "Help Center or Getting Started")
      - All headings should be collapsible 
      - All headings represent a directory within the help/ structure
        - Headings should have a link behind them that allows you specify the directory name
      - Headings can be nested
      - Nested headings can also be collapsed

- Update Help Center framework module to dynamically load the toc.md and help files

### Potential Help Directory Structure

- Table of Contents (ToC) sections should be collapsible
  - Help Center
  - Getting Started
  - Framework (Collapsible)
    - Worspaces and Workspace Switching
    - Users, Roles and Permissions
    - Clients and Projects
    - Notifications
    - Search
    - Tags
    - Files
    - Settings and User Preferences
    - Modules and Optional Features
  - Time Tracking (Module, Collapsible)
    - Time Tracking Basics
    - Time Entries Editing
    - Manual Time Entries
  - Tasks (Module, Collapsible)
    - Tasks Basics
    - Task Recurrence
  - Notes (Module, Collapsible)
    - Using Notes
    - Notes Library
      - Active Work
      - Ongoing Area
      - Reference Library
      - Archive
    - Notes Collections
    - Markdown
    - Note Linking
    - Note Revisions
    - Secure Notes
    - Notes, Files, and Search

- Help Center (doc) should explain what framework, first-party, and third-party modules are
- Getting Started should explain the key concepts within LTF, how they're inter-linked, and what makes it all unique

## Version 0.33.6 - Reporting Module

- Create a reporting module
  - I believe, currently, reporting is hard coded. This needs to be fixed and aligned with the current product models and philosophies.

### Guidance for details in Reporting Module

- Reporting -> Time Reports
  - Hide Start Date and End Date until billing period is set to Custom
    - Alternately, update Start Date and End Date based on Billing Period Selection (currently always shows current billing period)

- For proper calculation in time/billable reports, each sub project must sum all time entries and apply rounding rules (if enabled)
  - Parent projects should then sum their direct time entries, round as appropriate, and add that to the sum of all sub project time entries
  - This will produce a sub-client total which can then be added to parent client totals in the same fashion

## Version 0.33.7 - Dashboard and Workbench Formalization as Project hub and work center

### Version 0.33.7.1 - Dashboard and Workbench Surface Contracts

- [ ] Define Dashboard as the workspace overview/orientation surface.
- [ ] Define Workbench as the active work/resumption/focus surface.
- [ ] Keep Dashboard and Workbench separate.
- [ ] Add framework-owned contribution contracts for:
  - [ ] Dashboard panels.
  - [ ] Workbench cards.
  - [ ] Focus modes.
  - [ ] Work item sources.
  - [ ] Next action candidates.
  - [ ] Resume state/context snippets.
- [ ] Remove remaining hardcoded Task/Time assumptions from Dashboard and Workbench where a module contribution can own the behavior.
- [ ] Preserve permission checks, module enabled/disabled checks, and workspace boundaries for every contribution.

### Version 0.33.7.2 - Workbench Focus Modes

- [ ] Add Workbench focus selector.
- [ ] Initial modes:
  - [ ] Pick up where I left off.
  - [ ] Today.
  - [ ] Next due.
  - [ ] This week.
  - [ ] Blocked.
  - [ ] In progress.
  - [ ] Project focus.
  - [ ] Client focus for Business workspaces.
- [ ] Each focus mode should resolve to a normalized focus context passed to module work item providers.
- [ ] Focus modes should be user-friendly labels over deterministic filters, not separate hardcoded pages.

### Version 0.33.7.3 - Next Action Candidates

- [ ] Add normalized next action candidate shape.
- [ ] Tasks should provide first next action candidates.
- [ ] Time Tracking should provide running/paused timer candidates.
- [ ] Lists should provide active/incomplete/needed-soon list candidates when Lists integrations are ready.
- [ ] Notes should provide resume/supporting-context candidates for Active Work notes when Notes integrations are ready.
- [ ] Future Tickets should provide waiting/urgent/assigned ticket candidates.
- [ ] Add deterministic ranking:
  - [ ] Running timers.
  - [ ] Paused timers.
  - [ ] Overdue assigned work.
  - [ ] Due today.
  - [ ] Blocked/stale work.
  - [ ] Recently touched work.
  - [ ] Due this week.
- [ ] Every candidate should provide a reason string, primary action, safe context label, and source URL.

### Version 0.33.7.4 - Resume State / Where I Left Off

- [ ] Add framework-owned resume state storage.
- [ ] Track per-user, per-workspace resumable records.
- [ ] Update resume state from timers, task edits, checklist changes, note edits, list item activity, file attachments, and future ticket updates.
- [ ] Workbench "Pick up where I left off" should use resume state first, then fall back to recent activity.
- [ ] Resume hints must be permission-safe and must not expose secure/private content.
- [ ] Add regressions for permission changes, disabled modules, deleted/archived records, and inaccessible linked context.

### Version 0.33.7.5 - Guided Workbench UI

- [ ] Add question-led Workbench entry:
  - [ ] "Pick up where I left off"
  - [ ] "Start with what’s due"
  - [ ] "Work this week"
  - [ ] "Review blocked work"
  - [ ] "Focus on a project"
- [ ] Show one recommended next action before showing longer lists.
- [ ] Keep secondary lists available but visually subordinate.
- [ ] Avoid turning Workbench into another full module index.
- [ ] Add empty states that suggest a useful next step instead of dead ends.

### Version 0.33.7.6 - Quick Action Capture Utility Rail

Decision:

Quick Action Capture (QAC) is app-shell utility behavior, not a Workbench focus mode. It should provide low-distraction access to common capture and recovery tools without navigating away from the user’s current work surface. QAC should keep the user on the existing screen and simply open modals (where available). The basic concept is to: 

- Reduce the likelihood of focus/workflow being interrupted 
- Keep productivity focused 
- Allow easy idea/concept/thought expungement without derailing the entire work train

- [ ] Add a compact right-side Utility Rail on protected app pages.
  - [ ] Should be icons + small text on wide screens, can be narrowed to strictly icons on narrow screens
  - [ ] Should be available on ALL protected screens (not just the workbench)
  - [ ] A single, drawer-style Quick Action Capture button should float on mobile
    - [ ] The QAC menu drawer button should be an icon that indicates what it is, rather than words that would steal valuable screen real estate
      - Action or Capture should be the main icon driver; Perhaps a fast moving runner? Is there an icon for that?

- [ ] Rail actions should be contributed by enabled modules or mapped from registered module actions.
  - Since we don't know if the user has an idea/thought to contribute to an existing, task, list, or note we should offer an initial modal that allows for finding of the item or creating a new one.
  - [ ] Timer (Should open a modal capable of 2 timers, eventually; for now take you to time-tracker.html)
    - [ ] Add documentation for 0.33.7.7 for creating the timer modal funcationality with a limit of 2 timers
      - Within this documentation include instructions to redirect the QAC timer button to this new modal timer.
  - [ ] Task (Should open a picker to find a task with a button to Add Task, then open the appropriate modal)
  - [ ] Note (Should open a picker to find a note with a button to Add Note, then direct to the appropriate modal)
  - [ ] List (Should open a picker to add an item to a list or add a list, then open the appropriate modal)
  - [ ] Reporting (Should open a report creation modal, eventually; for now take you to reporting.html)
    - [ ] Add documentation for 0.37.5 for creating the reporting modal
  - [ ] File (Should open the Add file modal)
  - [ ] Search (Should open an advanced search modal, eventually; for now take you to search.html)
    - [ ] Add documentation for 0.33.7.8 for creating the advanced search modal functionality with a search result display modal
      - Add documentation in 0.33.7.9 to update all search results to display in this modal, even searches from the main menu ribbon. Yes, this might be a complete overhaul of the search system (or at least a major extension of it) if this needs to go into its own ROADMAP version in 0.33.8, that's also fine. Evaluate at the time of building the documentation, please

- [ ] Actions should open modals without changing the current page.
- [ ] Actions should receive safe current-page context when available.
- [ ] Actions must return focus to the triggering control when closed.
- [ ] The rail must stay visually quiet unless opened by the user.
- [ ] Do not use badges, alerts, or recommendation behavior in the rail; notifications and Workbench own those concerns.

## Version 0.34 - Knowledge Base Module

## Knowledge Base Direction Adjustment

Decision:
Knowledge Base is the reviewed, read-only knowledge layer generated from Notes first. Notes remain the working authoring records. Knowledge Base entries may still be written directly, but the default workflow is note-sourced: normal internal/workspace/client-visible notes become KB review candidates automatically, then reviewers approve and publish safe read-only KB snapshots.

### Add to 0.34.1 - Knowledge Base Module Contract, Publishing Model, and Notes Relationship

* [ ] Define Knowledge Base as the reviewed consumption layer for Notes-backed knowledge.

  * [ ] Notes are the working/source records.
  * [ ] KB articles are reviewed read-only article records or publication snapshots.
  * [ ] Normal note creation/update can automatically create or update a KB review candidate.
  * [ ] Automatic KB candidate creation does not mean automatic publishing.
  * [ ] Publishing remains explicit, permission-protected, audited, and snapshot-based.
  * [ ] KB may support directly authored articles, but direct authoring is secondary to note-sourced workflow.

* [ ] Add KB candidate/source behavior.

  * [ ] Add `source_mode` values:

    * [ ] `note_sourced`
    * [ ] `manual`
    * [ ] `imported`
  * [ ] Add `source_sync_state` or equivalent metadata:

    * [ ] `current`
    * [ ] `source_updated`
    * [ ] `manual_override`
    * [ ] `detached`
  * [ ] Add `source_note_id` convenience field only if it simplifies the common one-note article case; keep `kb_article_sources` as the canonical many-source table.
  * [ ] Add `source_note_revision_id` or use `kb_article_sources.source_revision_id` to preserve the note revision that seeded the reviewed article.
  * [ ] Add `last_source_synced_at`.
  * [ ] Add `last_reviewed_at`.
  * [ ] Add `review_due_at` optional for future maintenance workflows.

* [ ] Define automatic candidate rules.

  * [ ] Normal `internal` notes create internal KB candidates.
  * [ ] Normal `workspace` notes create workspace KB candidates.
  * [ ] Normal `client_visible` notes may create client-visible KB candidates only after client-visible KB permissions and file safety are enabled.
  * [ ] `private` notes do not create KB candidates by default.
  * [ ] `secure` notes must never create KB candidates.
  * [ ] Deleted notes should not create KB candidates.
  * [ ] Archived notes may remain as KB sources, but should not automatically update pending candidates unless explicitly configured.

* [ ] Define KB statuses for note-sourced workflow.

  * [ ] `draft`
  * [ ] `in_review`
  * [ ] `approved`
  * [ ] `published`
  * [ ] `rejected`
  * [ ] `archived`
  * [ ] `deleted`
  * [ ] Manually created articles start as `draft`.
  * [ ] Automatically note-sourced articles start as `in_review`.
  * [ ] Updating a source note marks the KB candidate/publication as `source_updated` or creates a new review revision, but does not silently mutate the published snapshot.
  * [ ] Rejected candidates remain linked to the source note for history unless deleted by a permitted user.

### Add to 0.34.2 - Knowledge Base Browser API, Editorial Workflow, and Internal UI MVP

* [ ] Add automatic note-to-KB candidate service methods.

  * [ ] Create or update candidate from note.
  * [ ] Queue note for KB review.
  * [ ] Read KB candidate by source note.
  * [ ] List KB candidates needing review.
  * [ ] Mark source update pending review.
  * [ ] Detach KB article from source note where permitted.
  * [ ] Reject KB candidate with reason.
  * [ ] Approve KB candidate.
  * [ ] Publish approved KB article snapshot.

* [ ] Add Notes lifecycle hook integration.

  * [ ] On normal note created, create KB candidate if workspace KB candidate policy allows it.
  * [ ] On normal note updated, mark linked KB candidate/publication as source-updated.
  * [ ] On note archived, preserve existing KB linkage but stop automatic updates unless configured.
  * [ ] On note deleted, hide or mark linked KB candidate as source unavailable.
  * [ ] Do not process secure notes.
  * [ ] Do not process private notes unless a future explicit rule allows it.

* [ ] Add KB review queue UI.

  * [ ] Show candidates grouped by source visibility:

    * [ ] Internal
    * [ ] Workspace
    * [ ] Client-visible when enabled
  * [ ] Show source note title, source collection path, source updated date, proposed article title, visibility, review status, and whether the source changed since last review.
  * [ ] Allow reviewers to approve, reject, edit article draft, publish, or detach.
  * [ ] Make it obvious when a published KB article is behind its source note.

### Add to 0.34.3 - Knowledge Base Search, Tags, Attachments, Static Pages, and Permission Boundaries

* [ ] Add KB article chrome/window-dressing generation.

  * [ ] Generate safe table of contents.
  * [ ] Generate “What links here.”
  * [ ] Generate related articles from article links, source notes, shared tags, shared collections, and wiki-style links.
  * [ ] Show source-note linkage only to users who can access the source note.
  * [ ] Show source update/review status only to internal users with review/history permission.
  * [ ] Hide internal source data from client-visible/public outputs.
  * [ ] Backlink lists must be permission-filtered and must not leak inaccessible article titles, note titles, files, or counts.

* [ ] Add KB link index support.

  * [ ] Track article-to-article links detected from Markdown/wiki-style links.
  * [ ] Track note-to-article references where useful.
  * [ ] Track source note-to-article relationships through `kb_article_sources`.
  * [ ] Rebuild link indexes when article Markdown, note wiki links, slugs, or source links change.
  * [ ] Broken links should be allowed but clearly labeled for reviewers.

### Add to 0.34.4 - Knowledge Base Settings, Documentation, and Closeout

* [ ] Add KB automation settings.

  * [ ] Configure note-to-KB candidate behavior:

    * [ ] Disabled
    * [ ] Manual only
    * [ ] Auto-create internal/workspace candidates
    * [ ] Auto-create client-visible candidates when supported
  * [ ] Configure default candidate status for note-sourced entries.
  * [ ] Configure whether review is always required before publishing.
  * [ ] Configure whether source note updates reopen review.
  * [ ] Configure whether archived notes can continue feeding KB candidates.
  * [ ] Settings must not bypass permissions, secure-note restrictions, private-note restrictions, file safety, or publication review.

## Version 0.35.0 - Support Tickets Framework Contract

* [ ] Add Support Tickets as a first-party workflow module.

  * [ ] Module ID should be `support-tickets`.
  * [ ] Tickets are workflow records, not framework/core records.
  * [ ] Tickets should use framework-owned services for users, workspaces, permissions, tags, search, notifications, audit logging, file attachments, events/hooks, API scopes, and module lifecycle.
  * [ ] Do not hard-code ticket behavior into framework-owned app shell, search, notification, file, or permission services.
  * [ ] Support Tickets should be disableable per workspace where appropriate.
  * [ ] Disabled ticket module should block new ticket writes while preserving historical reads if `historicalReadAccess` is enabled.

* [ ] Define ticket terminology by workspace type.

  * [ ] Business workspaces should display "Support Tickets" / "Tickets".
  * [ ] Personal and Family workspaces may display "Requests" where terminology is user-facing.
  * [ ] Terminology must be display-only.
  * [ ] Stored module IDs, route names, permission IDs, API scopes, audit record types, and database fields should remain stable.

* [ ] Define core ticket record model.

  * [ ] Add `tickets` table.
  * [ ] Suggested fields:

    * [ ] `ticket_id`
    * [ ] `workspace_id`
    * [ ] `ticket_number` or `display_key`
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `requester_user_id` optional
    * [ ] `requester_name_snapshot`
    * [ ] `requester_email_snapshot`
    * [ ] `title`
    * [ ] `description`
    * [ ] `status`
    * [ ] `priority`
    * [ ] `category`
    * [ ] `source`
    * [ ] `visibility`
    * [ ] `assigned_user_id` optional
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `closed_at`
    * [ ] `archived_at`
    * [ ] `metadata_json`
  * [ ] Ticket records must always belong to one workspace.
  * [ ] Client/project links must belong to the same workspace as the ticket.
  * [ ] External/client-created tickets should snapshot requester name/email for historical context.

* [ ] Define ticket statuses.

  * [ ] Start with a small boring set:

    * [ ] `new`
    * [ ] `open`
    * [ ] `waiting_on_internal`
    * [ ] `waiting_on_client`
    * [ ] `resolved`
    * [ ] `closed`
    * [ ] `archived`
  * [ ] Keep status labels configurable/display-friendly later.
  * [ ] Do not make tags the source of truth for ticket status.

* [ ] Define ticket priorities.

  * [ ] Start with:

    * [ ] `low`
    * [ ] `normal`
    * [ ] `high`
    * [ ] `urgent`
  * [ ] Priority should be an explicit field.
  * [ ] Do not infer priority from tags.

* [ ] Define ticket sources.

  * [ ] Start with:

    * [ ] `internal`
    * [ ] `client_portal`
    * [ ] `public_api`
    * [ ] `import`
  * [ ] Reserve future source values:

    * [ ] `wordpress`
    * [ ] `shopify`
    * [ ] `email`
    * [ ] `webhook`
    * [ ] `automation`
  * [ ] Source should be metadata, not permission logic.

* [ ] Add ticket ledger foundation.

  * [ ] Add `ticket_entries` or `ticket_ledger_entries` table.
  * [ ] A ticket entry represents a visible ticket timeline item, not the security audit log.
  * [ ] Suggested fields:

    * [ ] `ticket_entry_id`
    * [ ] `workspace_id`
    * [ ] `ticket_id`
    * [ ] `entry_type`
    * [ ] `visibility`
    * [ ] `body`
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `deleted_at`
    * [ ] `metadata_json`
  * [ ] Entry visibility should be explicit:

    * [ ] `internal`
    * [ ] `client_visible`
  * [ ] Do not use the word `public` in code for client-visible ticket entries unless the entry is truly public internet visible.
  * [ ] Internal entries are visible only to internal users with appropriate ticket permissions.
  * [ ] Client-visible entries are visible to internal users and authorized client/external users who can access the ticket.
  * [ ] Ticket ledger entries should never replace audit logging.

* [ ] Define first ticket entry types.

  * [ ] `initial_request`
  * [ ] `client_reply`
  * [ ] `internal_note`
  * [ ] `status_change`
  * [ ] `assignment_change`
  * [ ] `priority_change`
  * [ ] `attachment_added`
  * [ ] `system_event`
  * [ ] Keep raw audit details out of normal ticket ledger display.

* [ ] Add ticket permissions.

  * [ ] `tickets.view`
  * [ ] `tickets.view_internal`
  * [ ] `tickets.create`
  * [ ] `tickets.create_for_client`
  * [ ] `tickets.reply_client_visible`
  * [ ] `tickets.add_internal_note`
  * [ ] `tickets.update`
  * [ ] `tickets.assign`
  * [ ] `tickets.close`
  * [ ] `tickets.archive`
  * [ ] `tickets.manage_settings`
  * [ ] `tickets.view_all`
  * [ ] Add client/external access checks separately from internal workspace role checks.
  * [ ] A client user should only see tickets explicitly associated with a client/project they can access.

* [ ] Add ticket resource definition.

  * [ ] Resource key: `tickets`.
  * [ ] Supported operations:

    * [ ] `read`
    * [ ] `create`
    * [ ] `update`
    * [ ] `archive`
    * [ ] `restore`
    * [ ] `assign`
    * [ ] `manage`

* [ ] Add ticket audit record types.

  * [ ] `ticket`
  * [ ] `ticket_entry`
  * [ ] Audit ticket creation, updates, assignment changes, status changes, priority changes, archive/restore, client-visible replies, internal notes, attachment links, and API-created tickets.
  * [ ] Audit records should remain admin/security records and should not be shown as the normal ticket timeline.

* [ ] Add ticket events.

  * [ ] `ticket.created`
  * [ ] `ticket.updated`
  * [ ] `ticket.assigned`
  * [ ] `ticket.status_changed`
  * [ ] `ticket.priority_changed`
  * [ ] `ticket.client_reply_added`
  * [ ] `ticket.internal_note_added`
  * [ ] `ticket.resolved`
  * [ ] `ticket.closed`
  * [ ] `ticket.archived`
  * [ ] `ticket.restored`
  * [ ] Event payloads should include workspace, actor, ticket ID, client/project IDs where applicable, safe previous/new values, source, and metadata.
  * [ ] Event payloads should leave room for future automations and integrations.

## Version 0.35.1 - Ticket Browser API and Services

* [ ] Add ticket service methods.

  * [ ] Create ticket.
  * [ ] Read one ticket.
  * [ ] List tickets.
  * [ ] Update ticket fields.
  * [ ] Assign ticket.
  * [ ] Change ticket status.
  * [ ] Change ticket priority.
  * [ ] Archive ticket.
  * [ ] Restore ticket where appropriate.
  * [ ] Add client-visible reply.
  * [ ] Add internal note.
  * [ ] List ticket ledger entries with permission-safe visibility filtering.

* [ ] Add browser API routes.

  * [ ] `GET /api/tickets`
  * [ ] `POST /api/tickets`
  * [ ] `GET /api/tickets/:ticketId`
  * [ ] `PUT /api/tickets/:ticketId`
  * [ ] `POST /api/tickets/:ticketId/assign`
  * [ ] `POST /api/tickets/:ticketId/status`
  * [ ] `POST /api/tickets/:ticketId/priority`
  * [ ] `POST /api/tickets/:ticketId/archive`
  * [ ] `POST /api/tickets/:ticketId/restore`
  * [ ] `GET /api/tickets/:ticketId/entries`
  * [ ] `POST /api/tickets/:ticketId/replies`
  * [ ] `POST /api/tickets/:ticketId/internal-notes`

* [ ] Enforce ticket API permissions.

  * [ ] Every route must validate active workspace.
  * [ ] Every ticket read must validate workspace membership or authorized client/external access.
  * [ ] Internal notes must never be returned to client/external users.
  * [ ] Client-visible replies must be visible only to users allowed to access that ticket.
  * [ ] Update/assign/status/priority actions must require explicit permissions.
  * [ ] Disabled ticket module must block writes.
  * [ ] Historical reads should follow module `historicalReadAccess`.

* [ ] Add ticket list filtering.

  * [ ] Status.
  * [ ] Priority.
  * [ ] Assignee.
  * [ ] Client.
  * [ ] Project.
  * [ ] Requester.
  * [ ] Source.
  * [ ] Updated date.
  * [ ] Created date.
  * [ ] Archived state.
  * [ ] Pagination.

* [ ] Add ticket number/display key generation.

  * [ ] Generate human-readable ticket keys per workspace.
  * [ ] Ensure keys do not collide inside a workspace.
  * [ ] Keep database IDs separate from user-facing ticket keys.

## Version 0.35.2 - Ticket UI MVP

* [ ] Add Tickets navigation and protected views.

  * [ ] Tickets list page.
  * [ ] Ticket detail page.
  * [ ] Create ticket dialog/page.
  * [ ] Edit ticket metadata controls.
  * [ ] Permission-aware buttons and empty states.
  * [ ] Disabled-module state.

* [ ] Add internal ticket creation workflow.

  * [ ] Internal users can create tickets.
  * [ ] Internal users can optionally assign a ticket to a client.
  * [ ] Internal users can optionally assign a ticket to a project.
  * [ ] Internal users can set title, description, priority, category, and assignee where permitted.
  * [ ] Ticket creation should create the first ledger entry.

* [ ] Add ticket detail workflow.

  * [ ] Show ticket title, status, priority, client, project, requester, assignee, created date, updated date, and source.
  * [ ] Show client-visible ledger entries.
  * [ ] Show internal ledger entries only to users with internal ticket access.
  * [ ] Visually distinguish internal notes from client-visible replies.
  * [ ] Allow permitted users to add internal notes.
  * [ ] Allow permitted users to add client-visible replies.
  * [ ] Allow permitted users to change status, priority, and assignment.
  * [ ] Preserve accessibility behavior for form controls, icon buttons, tabs/filters, and status messages.

* [ ] Add tickets list workflow.

  * [ ] Show ticket key, title, status, priority, client/project context, assignee, requester, source, and updated date.
  * [ ] Add basic filters.
  * [ ] Add pagination.
  * [ ] Add empty state.
  * [ ] Add archived filter or archived view.
  * [ ] Keep list UI simple; do not build a full helpdesk dashboard yet.

* [ ] Add client/external ticket visibility groundwork.

  * [ ] Add permission-safe service methods for client-visible ticket reads.
  * [ ] Add UI/API distinction between internal users and external/client users.
  * [ ] Client/external users should not see internal notes, internal-only status details, raw audit records, or private metadata.
  * [ ] Client-facing ticket pages can be minimal in 0.33.x but the permission model must be real.

## Version 0.35.3 - Ticket Integration Hooks

* [ ] Register tickets as searchable records.

  * [ ] Add `searchableTypes` manifest declaration for tickets.
  * [ ] Index ticket title, description, ticket key, client/project context, status, priority, requester snapshot, and safe ledger text.
  * [ ] Internal-only ledger text must only appear in search results for users allowed to see internal ticket content.
  * [ ] Client-visible search results must not expose internal notes.
  * [ ] Search indexing should use the framework search service and adapter, not ticket-specific search queries.

* [ ] Register tickets as taggable records.

  * [ ] Add `taggableTypes` declaration for tickets.
  * [ ] Allow permitted users to assign workspace tags to tickets.
  * [ ] Tags are classification metadata only.
  * [ ] Do not use tags for visibility, status, billing state, or access control.

* [ ] Register tickets as attachable records.

  * [ ] Use the framework file attachment contract.
  * [ ] Tickets should not implement separate file storage.
  * [ ] Attachments should inherit or explicitly declare ticket-entry visibility.
  * [ ] Client-visible attachments must require public/client-safe file handling.
  * [ ] Internal attachments must not be downloadable by client/external users.
  * [ ] Quarantined/pending files must not appear in normal ticket UI.

* [ ] Register ticket notification events.

  * [ ] Notify relevant users when a ticket is created.
  * [ ] Notify assignee when assigned.
  * [ ] Notify followers when status/priority/client-visible reply changes.
  * [ ] Notify internal users when a client-visible reply is added.
  * [ ] Do not notify client/external users about internal notes.
  * [ ] Add ticket follow/unfollow support through framework notification subscriptions.

* [ ] Register ticket Workbench contribution.

  * [ ] Tickets can appear as actionable Workbench items.
  * [ ] Workbench item payload should include ticket key, title, status, priority, client/project context, assignee, due/follow-up date later, source URL, and timer state if Time Tracking is enabled.
  * [ ] Workbench should remain framework-owned.

* [ ] Register ticket timer source.

  * [ ] If Time Tracking is enabled, internal users can start/resume/pause/finalize timers from tickets.
  * [ ] Ticket timers should use the shared Time Tracking active timer engine.
  * [ ] Finalized time entries should preserve ticket metadata.
  * [ ] Do not create a separate ticket timer engine.

* [ ] Add manual task creation hook.

  * [ ] If Tasks is enabled, permitted users can create a task from a ticket.
  * [ ] The created task should link back to the source ticket.
  * [ ] This should be manual in 0.33.x.
  * [ ] Automatic task creation rules should wait for the automation/rules framework in 0.4x.

## Version 0.35.4 - Client Ticket Portal MVP

* [ ] Add minimal client/external ticket creation surface.

  * [ ] Authorized client users can create tickets for their allowed client/project context.
  * [ ] Client users can provide title, description, category, and optional attachment only where file safety permits.
  * [ ] Created tickets should use source `client_portal`.
  * [ ] Created tickets should create a client-visible initial request entry.
  * [ ] Internal users should be notified when appropriate.

* [ ] Add minimal client/external ticket detail surface.

  * [ ] Client users can view tickets they are authorized to access.
  * [ ] Client users can see client-visible entries only.
  * [ ] Client users can add client-visible replies.
  * [ ] Client users can see safe status labels.
  * [ ] Client users cannot see internal notes, internal-only files, raw audit records, private metadata, internal assignment details unless explicitly allowed, or internal search results.

* [ ] Add client/external ticket list surface.

  * [ ] Show ticket key, title, safe status, created date, updated date, and project context where allowed.
  * [ ] Add basic status filtering.
  * [ ] Add pagination.
  * [ ] Keep this portal simple; do not build a full customer support portal yet.

* [ ] Add client ticket access regression tests.

  * [ ] Client users cannot access tickets from another workspace.
  * [ ] Client users cannot access tickets for another client/project.
  * [ ] Client users cannot see internal notes.
  * [ ] Client users cannot download internal-only attachments.
  * [ ] Client-visible replies are visible to the right client users and internal users.
  * [ ] Internal users with proper permission can see both internal and client-visible ledger entries.

## Version 0.35.5 - Ticket Public API Groundwork

* [ ] Add ticket API scopes.

  * [ ] `tickets:read`
  * [ ] `tickets:write`
  * [ ] `tickets:create`
  * [ ] `tickets:reply`
  * [ ] Consider separating `tickets:internal` from client-facing API scopes.
  * [ ] API scopes should be offered only when the Support Tickets module is enabled.

* [ ] Add first safe public API routes for future plugins.

  * [ ] `POST /api/v1/tickets`
  * [ ] `GET /api/v1/tickets/:ticketId` only if permission-safe.
  * [ ] `POST /api/v1/tickets/:ticketId/replies` only if permission-safe.
  * [ ] Keep public API minimal.
  * [ ] Require API keys and scopes.
  * [ ] Validate workspace, client/project context, module state, and allowed source.
  * [ ] Do not expose internal notes through public API.
  * [ ] Do not expose raw audit data through public API.

* [ ] Add source attribution for API-created tickets.

  * [ ] Store source application/plugin identifier where available.
  * [ ] Store safe request metadata.
  * [ ] Leave room for future webhook signatures, replay protection, and per-plugin rate limits.
  * [ ] Avoid building WordPress/Shopify plugins in 0.33.x.

* [ ] Add API regression tests.

  * [ ] Missing/invalid API key is rejected.
  * [ ] Missing scope is rejected.
  * [ ] Disabled ticket module blocks writes.
  * [ ] API-created ticket belongs to the correct workspace.
  * [ ] API-created ticket cannot spoof another workspace/client/project.
  * [ ] Public API cannot create internal notes unless explicitly using an internal/admin scope.
  * [ ] Public API cannot read internal ledger entries.

## Version 0.35.6 - Ticket Regression, Polish, and Closeout

* [ ] Add complete ticket regression coverage.

  * [ ] Tickets cannot cross workspace boundaries.
  * [ ] Client/project links cannot cross workspace boundaries.
  * [ ] Internal users only see tickets permitted by role/resource checks.
  * [ ] Client/external users only see authorized client-visible tickets.
  * [ ] Internal notes are hidden from client/external users.
  * [ ] Client-visible replies are visible to both authorized client users and appropriate internal users.
  * [ ] Ticket status, priority, assignment, archive, and restore actions enforce permissions.
  * [ ] Search does not expose internal ticket content to unauthorized users.
  * [ ] Tags can be assigned only by users with tag assignment permission and ticket access.
  * [ ] Attachments follow ticket and entry visibility.
  * [ ] Notifications do not expose private ticket details.
  * [ ] Disabled ticket module blocks new ticket writes and hides normal navigation.
  * [ ] Historical ticket reads work only when module policy allows them.
  * [ ] Ticket timers require Time Tracking to be enabled.
  * [ ] Create-task-from-ticket requires Tasks to be enabled.

* [ ] Add accessibility and UI regression coverage.

  * [ ] Ticket forms have labels, validation summaries, and keyboard-friendly controls.
  * [ ] Ticket ledger entries have readable structure and status labels.
  * [ ] Internal/client-visible labels are clear.
  * [ ] Icon buttons have accessible names.
  * [ ] Empty/error/loading states are clear.
  * [ ] Client portal views do not leak internal controls.

* [ ] Add documentation notes.

  * [ ] Document ticket visibility rules.
  * [ ] Document internal notes vs client-visible replies.
  * [ ] Document ticket permissions.
  * [ ] Document public API limitations.
  * [ ] Document future plugin and automation hooks.
  * [ ] Document that ticket ledger is not the same as audit log.

* [ ] Release bookkeeping.

  * [ ] Update `DECISIONS.md` or product notes with ticket visibility and ledger decisions.
  * [ ] Update `CHANGELOG.md`.
  * [ ] Bump `package.json` and `package-lock.json`.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run ticket-specific regression scripts.

## Version 0.36.0 - Calendars and Calendar Views

- [ ] Calendars
  - [ ] Year view
  - [ ] Month view
  - [ ] Week view
  - [ ] Day view
  - [ ] Filters for client (business workspace only)/project

- [ ] Calendar Events
  - [ ] Allow addition of calendar events
  - [ ] Display iCal events from shared calendars

## Version 0.36.5 - Account Home / Cross-Workspace Attention View

Add a framework-owned Account Home view for users who belong to multiple workspaces.

This view must not weaken workspace isolation. It should aggregate only permission-safe summaries from workspaces the current user can access.

Account Home should not query module tables directly. It should use framework-owned summary services, notification records, announcement records, activity-feed records, and module-declared attention providers where available.

The first version should include:

- Workspace cards showing unread/attention counts.
- Active workspace announcements.
- Current-user notifications across accessible workspaces.
- Permission-safe attention items such as overdue tasks, assigned tickets, pending reviews, and stale timers where those modules are enabled.
- Links that switch/open the correct workspace before navigating to the target record.

Do not expose raw audit records, raw event payloads, private module records, or cross-workspace administrative data. Every item must be visible only if the user could read the source record inside that workspace.

## Version 0.37.0 - Expanded Reporting and Invoicing

- [ ] Expanded reporting
- [ ] Invoicing

## Version 0.38.0 - User Account Security Upgrades and Database/Settings File Backup/Restore

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.38.1 - Passkeys

- [ ] Passkeys

### Version 0.38.2 - User Sessions

- [ ] Sessions should expire after 1 day
- [ ] Super Admins should have ability to log users out
- [ ] Workspace admins should have ability to log users out

## Version 0.38.3 - Login Security Monitoring and Risk Scoring

- [ ] Add `user_login_events` table:
  - [ ] `login_event_id`
  - [ ] `user_id`
  - [ ] `occurred_at`
  - [ ] `success`
  - [ ] `failure_reason`
  - [ ] `ip_address`
  - [ ] `ip_hash`
  - [ ] `user_agent`
  - [ ] `user_agent_hash`
  - [ ] `browser_family`
  - [ ] `os_family`
  - [ ] `device_type`
  - [ ] `country`
  - [ ] `region`
  - [ ] `risk_score`
  - [ ] `risk_reason`
  - [ ] `session_id_hash`
  - [ ] `metadata_json`
- [ ] Log authentication events:
  - [ ] Successful login.
  - [ ] Failed login.
  - [ ] Password reset requested.
  - [ ] Password reset completed.
  - [ ] 2FA challenge success/failure.
  - [ ] Passkey registration/removal.
  - [ ] New device/session.
  - [ ] Logout.
  - [ ] Admin-forced logout.
- [ ] Add login risk checks:
  - [ ] New device/browser.
  - [ ] New country or impossible travel.
  - [ ] IP reputation check if available.
  - [ ] Many failures for same account.
  - [ ] Many failures from same IP.
  - [ ] Successful login after many failures.
  - [ ] Login from TOR/VPN/proxy if detectable.
- [ ] Add risk-based responses:
  - [ ] Low risk: allow login and log event.
  - [ ] Medium risk: allow login and notify user.
  - [ ] High risk: require 2FA/passkey reauthentication if available.
  - [ ] Critical risk: temporarily block or require password reset/admin review.
- [ ] Add user-facing security tools:
  - [ ] Show recent login history in user settings.
  - [ ] Allow user to revoke sessions.
  - [ ] Email/in-app notification for new device login.
  - [ ] Email/in-app notification for suspicious login.
- [ ] Add admin security tools:
  - [ ] View recent failed login patterns.
  - [ ] Force logout user sessions.
  - [ ] Temporarily disable account.
  - [ ] Require password reset.
  - [ ] Require 2FA setup.
- [ ] Privacy rules:
  - [ ] Do not log passwords, tokens, reset tokens, or full session IDs.
  - [ ] Consider hashing or truncating IP addresses for long-term retention.
  - [ ] Define retention period for login events.
  - [ ] Restrict access to login security logs.

### Version 0.38.4

Super Admins should have a backup/restore function on the dashboard that dumps the current database into a clean file with an app meta data file that has app version stamped and datetime (UTC) of backup in it and zips it into a zip file along with any physical settings files on disk (this will be necessary after packaging for self-hosting and may not yet be necessary, but I want uniform functions for backup/restore that can be easily modified in the future)

- [ ] Create backup function to grab and zip:
  - [ ] Database dump/database file
  - [ ] App meta data file to include app version and datetime stamp of backup
  - [ ] Setup files (can be blank for now)
- [ ] Add backup to user interface for Super Admins in Settings menu
  - Label should be "App Backup"
  - Should only be visible if user is Super Admin (utilize session auth variables to keep from adding/hiding the option)
  - [ ] "Perform backup" button
    - this should then provide a link to the downloadable zip file
    - download should be a temporary file on the server in a "downloads" directory
    - backup should have checksum
    - backup shouldn't delete temporary file until checksum is confirmed
  - [ ] "Perform restore" button
    - this should only accept zip files
    - this should verify files, checksum, etc. before installing/overwriting current data

### Version 0.39.0 - Creator Studio / Content Studio Module

- [ ] Core records:
  - [ ] Content ideas.
  - [ ] Content drafts.
  - [ ] Campaigns/series.
  - [ ] Publishing channels.
  - [ ] Assets/media.
  - [ ] Content templates.
  - [ ] Repurposing tasks.
- [ ] Content idea fields:
  - [ ] Title.
  - [ ] Description/angle.
  - [ ] Workspace.
  - [ ] Client/project if applicable.
  - [ ] Channel(s).
  - [ ] Format: blog, short, long video, email, social post, product page, course material, etc.
  - [ ] Status: idea, planned, drafting, editing, scheduled, published, archived.
  - [ ] Priority.
  - [ ] Target publish date.
  - [ ] Assigned user.
  - [ ] Tags.
  - [ ] Related notes/tasks/assets.
- [ ] Editorial calendar:
  - [ ] Calendar view by publish date.
  - [ ] List view by status.
  - [ ] Kanban view by production stage.
  - [ ] Filter by brand/site/channel/project/tag.
- [ ] Publishing channels:
  - [ ] Website/blog.
  - [ ] YouTube.
  - [ ] Shorts/Reels/TikTok.
  - [ ] Newsletter.
  - [ ] Facebook/Instagram/X/LinkedIn/Mastodon.
  - [ ] Podcast if needed later.
- [ ] Asset library:
  - [ ] Attach images, video, audio, documents, thumbnails, captions, and scripts.
  - [ ] Track asset usage across content items.
  - [ ] Store alt text, captions, source/license notes, and credit requirements.
- [ ] Repurposing workflow:
  - [ ] One long-form item can spawn shorts, social posts, newsletter blurbs, blog excerpts, and follow-up tasks.
  - [ ] Track each derivative item separately but link it to the source content.
- [ ] Analytics groundwork:
  - [ ] Store published URL.
  - [ ] Store basic performance notes manually at first.
  - [ ] Later: integrate platform analytics where APIs allow.
- [ ] Permissions:
  - [ ] Creator Studio records are workspace-scoped.
  - [ ] Client/project-linked content respects existing permissions.
  - [ ] External clients may be allowed to review/comment only if explicitly enabled.

- [ ] Treat Creator Studio as an optional first-party module. 
  - [ ] The module should ship with Longtail Forge but be disabled by default for workspaces that do not need it. 
  - [ ] It should follow the same module manifest, permissions, navigation, search, tags, notification, file, task, notes, and calendar contracts as every other first-party module. 
  - [ ] Do not build it as a separate third-party plugin project yet. 
  - [ ] Use it as a real-world test case for whether Longtail Forge modules can compose shared framework services cleanly. 

- [ ] Reuse existing first-party modules where appropriate. 
  - [ ] Content ideas may start as Creator Studio records but should be linkable to notes and lists. 
  - [ ] Content drafts may hook into Notes when Notes exists. 
  - [ ] Campaigns/series should likely be Creator Studio-owned hierarchical records. 
  - [ ] Assets/media should use the framework file service. 
  - [ ] Repurposing work should be able to create/link Tasks. 
  - [ ] Publishing dates should hook into Calendar when Calendar exists. 
  - [ ] Tags and Search should apply to Creator Studio records. 
  - [ ] Notifications should support assignments, due dates, review requests, and scheduled publish reminders later. 

- [ ] Add Creator Studio workbench. 
  - [ ] Add a dedicated Creator Studio workbench page. 
  - [ ] Workbench should be accessible from a picker similar to workspace/module selection. 
  - [ ] It should support a focused content-production workflow without cluttering the basic workbench. 
  - [ ] It should optionally filter by client/project/brand/channel/campaign. 
  - [ ] It should be disabled cleanly when the Creator Studio module is disabled. 

- [ ] Define workbench areas as a framework concept. 
  - [ ] Basic workbench for general first-party modules such as timers, tasks, notes, and lists. 
  - [ ] Focused workbench for one client/project at a time. 
  - [ ] Creator Studio workbench for content planning, drafting, assets, campaigns, repurposing, and editorial calendar work. 
  - [ ] Future modules may declare their own workbench areas through the module manifest.

## Version 0.39.9 - User Documentation and 0.3x Stabilization Checkpoint 

- [ ] Create user-facing documentation for the completed 0.3x feature set. 
  - [ ] Getting started. 
  - [ ] Workspace types and workspace switching. 
  - [ ] Users, roles, and permissions. 
  - [ ] Clients and projects. 
  - [ ] Time tracking. 
  - [ ] Tasks. 
  - [ ] Notifications. 
  - [ ] Tags. 
  - [ ] Search. 
  - [ ] Files/attachments if completed in 0.32.x. 
  - [ ] Support tickets if completed in 0.33.x. 
  - [ ] Notes and knowledge base foundations if completed in 0.34.x. 
  - [ ] Calendar basics if completed in 0.35.x. 
  - [ ] Shopping/procurement lists if completed in 0.39.x. 
  - [ ] Creator/content studio if completed in 0.39.x. 
- [ ] Create admin-facing documentation for workspace/module setup. 
  - [ ] Module enable/disable behavior. 
  - [ ] Workspace-type label differences. 
  - [ ] Permission expectations. 
  - [ ] Safe file upload/download behavior. 
- [ ] Create developer-facing notes for first-party module contracts. 
  - [ ] Module manifest fields. 
  - [ ] Navigation registration. 
  - [ ] Permission declarations. 
  - [ ] Notification declarations. 
  - [ ] Taggable/searchable declarations. 
  - [ ] File attachable declarations. 
  - [ ] Workbench card/area declarations. 
- [ ] Update `docs/architecture.md` to reflect the completed 0.3x architecture. 
- [ ] Verify `ROADMAP.md`, `TODO.md`, `DECISIONS.md`, `CHANGELOG.md`, and package versions are consistent.

- [ ] Wipe existing DB migrations and create a new DB baseline

- [ ] Evaluate all existing regressions and see what can be eliminated/lightened

- [ ] Determine where efficiencies can be made in the code/Perform an efficiency refactor

- [ ] Evaluate whether TypeScript would be a useful addition for ensure module/framework contracts are adhered to

- [ ] Audit all Public API calls and make a list for review and modification. Sort by module.

- [ ] Audit all event hooks by module and make a list for review and modification.

## Version 0.40.0 - Project Tools expansion & Database extraction layer for use with SQLite or PostGRES

Now that we have the base layer of a complete project management tool, we can begin expanding actual project management with milestones, dependencies, status reporting, budgeting, estimation, views, templates, etc.

Allowing the app to run on SQLite OR PostGRES makes it more flexible for self-hosted installs; I want the database layer to be able to handle either one, based on the settings/.env file

Below is a rough road map for all of the 0.40 branch, this is not finalized yet

- [ ] Add topics to GitHub for discovery

### Project Tools expansion

- [ ] Project Milestones/Phases/Deliverables
  - Milestones belong to a workspace and optionally a client/project
  - Tasks, notes, tickets, time entries, and files may eventually link to a milestone
  - Milestones should have a title, description, status, due date, sort order, and optional completion/completed date
  - This should not block basic tasks, but the data model should leave room for it

- [ ] Task dependencies/blockers
  - Allow one task to depend on another task
  - Show blocked tasks clearly
  - Prevent circular dependencies
  - Allow blocked-by relationships across the same project, and maybe later across projects
  - More formal task workflow, such as `backlog`, `ready`, `in_progress`, `waiting`, `blocked`, `in_review`, `approved`, `complete`, `canceled`, and `archived`, often with rules about which statuses can move to which next statuses.

- [ ] Project Status/Health
  - Project status: active, paused, completed, archived
  - Project heatlh: on_track, at_risk, blocked, waiting_on_client
  - Dashboard should eventually surface project health

- [ ] Project budgeting/estimation/actuals
  - should be optional for personal/family projects
  - [ ] Add estimated hours to projects
  - [ ] Add optional budgeted hours/dollars to projects
  - [ ] Compare estimated vs actual tracked time
  - [ ] Show budget/burn progress on project pages and dashboard
  - [ ] Allow reporting by client, project, milestone, tag, and date range

- [ ] List/Kanban/Calendar views
  - [ ] Add list view for tasks
  - [ ] Add Kanban board view for tasks grouped by status
  - [ ] Add calendar view for tasks with due dates

- [ ] Project/task templates
  - should have hard-coded, initial examples that can be used as well as saved templates
  - [ ] Add task templates
  - [ ] Add project templates
  - [ ] Allow project templates to create default milestones, tasks, notes, and checklists
  - [ ] Allow workspace-level templates first
  - [ ] Later: allow client-specific templates

- [ ] Task checklists (tasks can have sub-item checklists)
  - Checklist items belong to a task
  - Items can be checked/unchecked and sorted
    - sort by: due date, importance, etc.
  - Checklist completion can optionally contribute to task progress

- [ ] Task/Project discussions
  - [ ] Add comments to tasks
  - [ ] Add comments to projects
  - [ ] Add internal comments to support tickets
  - [ ] Comments should respect permissions and visibility
  - [ ] Comments should appear in activity feeds where appropriate

- [ ] Files/attachments foundation
  - [ ] Add file attachment foundation for notes/tasks/support tickets/projects
  - [ ] Store file metadata in database
  - [ ] Decide local storage vs object storage later
  - [ ] Respect workspace/client/project permissions
  - [ ] Public-safe attachments required before public KB/client portal features

- [ ] Project Owner/Responsible-user fields
  - [ ] Workspace owner
  - [ ] Client/account owner
  - [ ] Project owner
  - [ ] Ticket owner
  - [ ] Task/ticket assignee remains separate from project ownership

- [ ] Saved views
  - people will want views like: "Tasks due this week," "Waiting on client," "Client open tickets," etc.
  - [ ] Allow users to save commenly used filters
  - [ ] Saved views may apply to tasks, time entries, tickets, notes, and dashboard sections
  - [ ] Views should be user-specific first
  - [ ] Workspace-share views can come later

- [ ] Client approvals/change requests
  - [ ] Add lightweight approval records
  - [ ] Add change request records
  - [ ] Link approvals/change requests to clients, projects, milestones, tasks, notes, or tickets
  - [ ] Track requested_by, approved_by, approved_at, status, and notes
  - [ ] Consider client-facing approvals only after permissions/client portal features exist

- [ ] Timeline/Gannt-style view

- [ ] Workload/capacity planning

- [ ] Portfolio-level reporting across clients/projects/workspaces

### Database Tools

- [ ] Configuration files for initial configuration
  - [ ] Merge all previous migrations to make unified initial SQL
- [ ] Migration tools to switch between database backends
- [ ] Export/Import database tools
  - [ ] Allow users to export their workspaces

### App Decisions

- [ ] Define archival period
- [ ] Define lifecycle of tasks, notes, tickets, etc.

## Version 0.45.0 - Phone/Tablet/TV app prep

- Prepare APIs for Phone/Tablet/TV apps

- Universal Longtail Forge app for iOS

- Universal Longtail Forge app for Android (Latest)

- Roku apps for coordinating teams/families
  - Displays Calendar/Task Lists/Current-Upcoming Day Events

## Version 0.50.0 - Production, Packaging, and Self-Hosting

- [ ] Move to a demo production environment
- [ ] Add PostgreSQL support
  - [ ] Add a database adapter layer so the app is not permanently tied to shelling out to the SQLite CLI
  - [ ] Keep SQLite support for local/self-hosted lightweight installs if practical
  - [ ] PostgreSQL should become the preferred production database
- [ ] Add file attachment abilities to notes/tasks/support tickets
- [ ] Docker Compose
- [ ] Setup wizard
- [ ] Admin docs
- [ ] Add production cookie flags
- [ ] Self-hosted release
- [ ] Expand project management tools

### Added during 0.30.6 Code Review

- Verify runtime data directory permissions for `data/`, `logs/`, and `archive/`.
- Ensure the SQLite database file is not web-served under any configuration.
- Add startup warnings when data/log directories are world-readable or world-writable on platforms where that can be checked reliably.
- Add backup/restore path validation that prevents writing outside approved runtime directories.
- Consider an install health-check endpoint or CLI command that reports filesystem lockdown status without exposing sensitive paths to normal users.

## Version 0.55.0

- [ ] Email delivery
- [ ] Invite links
- [ ] Single Sign-On (SSO)

## Version 0.60.0 - SaaS Wrapper

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL
- [ ] Tenant signup
- [ ] Billing
- [ ] Monitoring

## Version 0.70.0 - Integrations and Plugin Readiness

### Guidelines/Notes for Integrations

- [ ] Integration architecture
  - [ ] Integrations should authenticate through API keys, OAuth, or integration-specific credentials as appropriate
  - [ ] Integrations should respect workspace, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner

### Potential Integrations List

### Support tickets

- [ ] ZenDesk
- [ ] FreshDesk

### Calendars

- [ ] Google Calendar
- [ ] Outlook Calendar

### Task App Integrations

- [ ] Microsoft To Do
- [ ] Google Tasks


### File Sharing and Storage

Is it possible to get notifications from any of these sources?

- [ ] Microsoft OneDrive 
- [ ] Google Drive
- [ ] DropBox
- [ ] Microsoft SharePoint
  - File sharing
  - Knowledgebase pages
  - Input for tickets/notes/tasks/etc.

### Email integrations

Auto-routing communications/messaging

- [ ] Google Workspace email
- [ ] Outlook

### eCommerce Plugins

- [ ] Knowledge Base plugin
- [ ] Support ticket plugin
  - Would include notes plugin for Shopify Admin
- [ ] Automated task creation from:
  - Front-end support tickets
  - Order issues (fulfillment failure, etc.)

- [ ] WordPress/WooCommerce
- [ ] Shopify
- [ ] Magento
- [ ] BigCommerce

### Personal/Family Workspace Integrations

- [ ] Create grocery/shopping list items from Home Assistant (voice commands inputs)
- [ ] Update/create project tasks from Home Assistant (voice commands inputs)

- [ ] Home Assistant
- [ ] Apple Home
- [ ] Google Assistant (Google Home?)

### Analytics (Creator Studio)

- [ ] WordPress
- [ ] YouTube
- [ ] TikTok
- [ ] Twitch
- [ ] Facebook
- [ ] Instagram
- [ ] Threads
- [ ] X
- [ ] BlueSky
- [ ] Mastodon
- [ ] Buffer

### Publishing (Creator Studio)

The Creator studio tool can be much richer if it pushes content out to these platforms, or stores them there until ready for publishing.

- [ ] WordPress (Posts first, the Custom Post Types)
- [ ] Shopify (Blogs)
- [ ] Social Media
  - [ ] YouTube
  - [ ] TikTok
  - [ ] Twitch
  - [ ] Facebook
  - [ ] Instagram
  - [ ] Threads
  - [ ] X
  - [ ] BlueSky
  - [ ] Mastodon
  - [ ] Buffer

## Version 0.71.0

- [ ] Buy domain name
  - [ ] Launch website

- [ ] Launch Social Media
