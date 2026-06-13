# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.33.5.9 - Work Resume State Foundation

Decision:
Work resume state is framework-owned recovery infrastructure. It records where a user left off across enabled modules without making Dashboard, Workbench, Tasks, Lists, Notes, Files, Time Tracking, or future Tickets own separate resume systems.

This release should add backend storage, service contracts, safe update hooks, a protected browser read API, and regressions only. The user-facing guided Workbench, "Where I left off" cards, focus-mode UI, and ranking polish remain deferred to 0.33.7.

### Questions and Design Clarifications

- [x] Confirm whether resume state rows are created only for the current user who performed the work in 0.33.5.9, with assigned/shared/follower-based resume suggestions deferred until Workbench ranking matures.
- [x] Confirm whether dismissing a resume candidate hides that row until the producer writes a newer `last_worked_at`/`updated_at`, instead of permanently muting the underlying record.
- [x] Confirm whether initial ranking should be deterministic and rule-based only: active timers first, blocked/stale work when explicitly requested, then recent updated work by due date, priority, and last-worked time. No AI or opaque scoring in this foundation pass.
- [x] Confirm whether producer updates should flow through framework event subscriptions where events already exist, with direct service calls allowed only where no safe event exists yet.
- [x] Confirm whether private Notes are excluded from global resume-state storage entirely in 0.33.5.9, even for the note owner, to keep the first contract conservative.
- [x] Confirm whether `handoff_note`, `next_action`, and `blocked_reason` snapshots are allowed only when supplied by the source module as already permission-safe fields, not copied from freeform private/secure note body text.

Use these decisions for 0.33.5.9:

1. Resume state rows should be created only for the current user who performed the work in this foundation pass.

   Do not create resume-state rows for assignees, followers, watchers, shared users, client users, or other collaborators yet. Assigned/shared/follower-based resume suggestions should be deferred until Workbench ranking and notification semantics mature in 0.33.7 or later.

   For now, resume state means: “where this user appears to have left off,” not “all work this user might care about.”

2. Dismissing a resume candidate should hide the current row until the source record receives a newer producer update.

   Dismissal should not permanently mute the underlying task/list/note/timer/source record. Treat dismissal as “not this stale suggestion anymore,” not “never show this record again.”

   Implementation guidance:
   - Store `dismissed_at`.
   - Default `left_off` results should hide dismissed rows.
   - A producer update with newer `last_worked_at` and/or `updated_at` should make the row eligible again.
   - If needed, store a dismissal comparison value such as `dismissed_source_updated_at` or compare against the row’s producer-maintained `last_worked_at`.

3. Initial ranking should be deterministic and rule-based only.

   Do not add AI ranking, opaque scoring, embeddings, inferred intent, or “smart” priority math in 0.33.5.9. The first pass should be debuggable and explainable.

   Use a simple foundation order:
   - Active timers first.
   - Blocked/stale work only when explicitly requested by mode/filter.
   - Then recent updated work, shaped by due date, priority, and last-worked time.
   - Completed, archived, finalized, deleted, disabled-module, and permission-denied records should not appear in primary left-off results.

   `resume_rank_hint` may exist as a producer hint, but it should not become an opaque global scoring system yet.

4. Producer updates should prefer framework event subscriptions wherever safe events already exist.

   Resume state should listen to existing module lifecycle events when those events already contain permission-safe, recovery-safe context.

   Direct service calls are allowed only where no safe event exists yet. When direct calls are used, leave a clear TODO to replace them with event-based producer wiring once the owning module emits an appropriate event.

   The goal is to avoid each module inventing its own resume subsystem while still allowing this release to ship without waiting on perfect event coverage.

5. Private Notes should be excluded from global resume-state storage entirely in 0.33.5.9.

   Exclude private Notes even for the note owner in this foundation pass. This keeps the first resume contract conservative and avoids turning global recovery infrastructure into a second private-note surface.

   Non-private Active Work notes may participate as safe supporting resume context where permitted. Private Notes should not create global resume rows, title snapshots, body previews, hidden counts, or “something private exists” hints.

6. `handoff_note`, `next_action`, and `blocked_reason` snapshots are allowed only when supplied by the source module as already permission-safe fields.

   Do not mine, summarize, copy, or infer these fields from freeform private note bodies, secure note bodies, encrypted content, note excerpts, rendered HTML, comments, attachments, or other unstructured private/secure text.

   These fields should come from explicit producer-owned fields that are already safe for browser display to the current user. The resume service may truncate and normalize them, but it should not decide that arbitrary note/body content is safe.

### Implementation Boundaries

- [x] Keep resume state framework-owned under a stable service/route boundary.
- [x] Keep producer modules responsible for deciding which record changes are resumable and for shaping safe source payloads.
- [x] Keep read-time permission checks authoritative; resume state snapshots are recovery hints, not access grants.
- [x] Keep Dashboard and Workbench UI consumption deferred to 0.33.7, except for API smoke/regression fixtures needed to prove the contract.
- [x] Do not add public API routes in this release.
- [x] Do not make Tags, Search, Notifications, Files, or Help infer resume behavior from metadata alone.

### Version 0.33.5.9.1 - Resume State Storage

- [x] Add framework-owned `work_resume_state` storage.
- [x] Each row represents one resumable record for one user in one workspace.
- [x] Add a unique active-row constraint for `workspace_id`, `user_id`, `module_id`, `record_type`, and `record_id` where practical.
- [x] Add indexes for workspace/user default listing, module/record cleanup, client/project filtering, dismissed filtering, and last-worked sorting.
- [x] Suggested fields:
  - [x] `resume_state_id`
  - [x] `workspace_id`
  - [x] `user_id`
  - [x] `module_id`
  - [x] `record_type`
  - [x] `record_id`
  - [x] `client_id` optional
  - [x] `project_id` optional
  - [x] `source_url`
  - [x] `title_snapshot`
  - [x] `context_label_snapshot`
  - [x] `last_action_type`
  - [x] `last_action_label`
  - [x] `last_worked_at`
  - [x] `handoff_note`
  - [x] `next_action`
  - [x] `blocked_reason`
  - [x] `status_snapshot`
  - [x] `priority_snapshot`
  - [x] `due_at_snapshot`
  - [x] `resume_rank_hint`
  - [x] `metadata_json`
  - [x] `created_at`
  - [x] `updated_at`
  - [x] `dismissed_at` optional
  - [x] `dismissed_source_updated_at` optional

### Version 0.33.5.9.2 - Resume State Service and Read Guards

- [x] Add framework-owned resume state service.
- [x] Add service methods:
  - [x] `upsertResumeState(session, payload)`
  - [x] `dismissResumeState(session, resumeStateId)`
  - [x] `listResumeState(session, query)`
  - [x] `removeResumeStateForRecord(workspaceId, moduleId, recordType, recordId)`
- [x] Validate workspace/user ownership on every write.
- [x] Normalize producer payloads so optional text snapshots are length-limited and safe for browser display.
- [x] Treat unknown modules, disabled modules, missing records, deleted records, and permission-denied records as hidden from active default results.
- [x] Let archived/completed/finalized records appear only in explicit recent/history-style modes, not primary left-off results.
- [x] Add a module-owned read-check resolver contract so Tasks, Lists, Notes, Time Tracking, and future modules can verify target visibility without framework table knowledge.
- [x] Ensure resume state never grants access to linked client/project/task/note/list/file labels the reader could not otherwise see.

### Version 0.33.5.9.3 - Producer Contract and Event Wiring

- [x] Add a framework producer helper or contract for safe resume-state payloads.
- [x] Define allowed source fields, forbidden fields, truncation rules, status normalization, and deletion/removal behavior.
- [x] Prefer subscribing to existing safe module events for create/update/status/timer/link lifecycle changes.
- [x] Add direct producer integration only where no safe event exists yet, and leave TODOs to replace it with events when the owning module emits them.
- [x] Reuse existing event summary/context helpers where they already produce recovery-safe labels.
- [x] Add defensive no-op behavior when a producer module is disabled, absent, or unable to shape a safe payload.

### Version 0.33.5.9.4 - Initial Resume State Producers

- [x] Tasks should update resume state when:
  - [x] Task is created or updated by the current user.
  - [x] Task status changes.
  - [x] Task timer starts, pauses, finalizes, or is discarded.
  - [x] Task checklist changes.
  - [x] Task `next_action`, `blocked_reason`, or `handoff_note` changes.
- [x] Lists should update resume state when:
  - [x] List is created or updated.
  - [x] List item is checked/unchecked/completed/updated/reordered.
  - [x] List is linked to or unlinked from a task/project/client/note.
  - [x] List is completed/reopened/finalized/archived/restored/deleted.
- [x] Notes should update resume state when:
  - [x] Active Work note is created or edited.
  - [x] Note is linked to a task/project/list/client.
  - [x] Note is archived/restored/deleted.
  - [x] Secure/private notes must not write body/excerpt content into resume state.
- [x] Time Tracking should update resume state when:
  - [x] Manual timer starts/pauses/finalizes/discards.
  - [x] Sourced task timer starts/pauses/finalizes/discards.
  - [x] Resume state preserves source metadata without making Time Tracking own the source record.
  - [x] Active timer rows remain Time Tracking-owned; resume state stores only recovery snapshots and source references.

### Version 0.33.5.9.5 - Protected Resume State API

- [x] Add protected browser API route for resume state reads.
  - [x] Suggested route: `GET /api/work-resume`
  - [x] Support filters:
    - [x] `mode=recent`
    - [x] `mode=left_off`
    - [x] `mode=active`
    - [x] `module_id`
    - [x] `client_id`
    - [x] `project_id`
    - [x] `record_type`
  - [x] Return permission-shaped rows only.
  - [x] Do not add public API routes in this release.
- [x] Add protected browser API route to dismiss a resume candidate.
  - [x] Suggested route: `POST /api/work-resume/:resumeStateId/dismiss`
- [x] Add browser-safe response fields for future Workbench consumers without building the Workbench UI in this pass.
- [x] Keep empty states generic so inaccessible private/secure/deleted/disabled records do not leak existence.

### Version 0.33.5.9.6 - Regressions, Docs, and Closeout

- [x] Resume state cannot cross workspace boundaries.
- [x] Resume state cannot expose records the user can no longer read.
- [x] Disabled modules hide active resume state safely.
- [x] Deleted records are removed from active resume results.
- [x] Completed/archived/finalized records are not ranked as primary active work.
- [x] Private notes do not leak title/body/counts to unauthorized users.
- [x] Secure notes never write decrypted body, excerpt, rendered HTML, or encryption metadata into resume state.
- [x] List access does not grant linked task/note/project/client access through resume state.
- [x] Task/list/note/timer updates produce deterministic resume state rows.
- [x] Dismissed resume rows do not appear in default "left off" results.
- [x] Dismissed rows become eligible again after a newer producer update if that clarification is accepted.
- [x] Update developer/module docs for the resume-state producer contract and read-check resolver boundary.
- [x] Update `DECISIONS.md`, `CHANGELOG.md`, package metadata, and roadmap archive only during the actual implementation/closeout pass.

## Version 0.33.5.10 - Help Center Re-work

### Questions and Design Clarifications

- [ ] Confirm the editable Help source root should be `help/` at the repo root, with framework articles under `help/framework/` and first-party module articles under `help/modules/<module-id>/`.
- [ ] Confirm `help/toc.md` should own the left navigation order, nesting, collapsible groups, and default first article instead of deriving the visible order only from manifest `sortOrder` values.
- [ ] Confirm whether `toc.md` links should point to article Markdown files directly, for example `- [Getting Started](framework/getting-started.md)`, while headings without links act as collapsible navigation groups.
- [ ] Confirm the first non-empty line of `help/toc.md` should identify the default opening article by link or article path. If omitted or invalid, Help should fall back to Help Center, then Getting Started, then the first readable article.
- [ ] Confirm Markdown support should stay intentionally simple in this pass: headings, paragraphs, lists, links, inline code, code fences, emphasis, and tables if the existing Markdown helper can support them safely.
- [ ] Confirm Help content remains repo-authored product/module documentation only. In-app editing, rich authoring, version history, workspace-authored articles, and publishing workflows remain future Knowledge Base or later Help work.
- [ ] Confirm Help search should index the Markdown-derived article text and re-index when Help search rebuilds run, without adding live file watching in this pass.

### Accepted Planning Constraints

- Make Help Center content easy to edit by moving article bodies out of JavaScript and into Markdown files.
- Keep the backend change small and framework-owned: the Help service should read Markdown files, preserve the existing protected `/api/help` routes, and preserve the current manifest contribution boundary where practical.
- Keep framework, first-party module, and future third-party module ownership clear. Modules may still declare Help metadata, but article body content should be file-backed.
- Search must read the Markdown-backed Help content through the Help service and index the current article text during Help search indexing/rebuilds.
- Help Center remains current-state product guidance. Roadmap promises stay in `ROADMAP.md`, and workspace-authored knowledge remains reserved for the future Knowledge Base module.

Use these decisions for 0.33.5.10:

1. Confirmed: the editable Help source root should be `help/` at the repo root.

   Use:
   - `help/framework/` for framework-owned Help articles.
   - `help/modules/<module-id>/` for first-party module Help articles.

   Keep this content repo-authored and version-controlled. This is product documentation, not workspace data.

2. Confirmed: `help/toc.md` should own the visible left navigation order, nesting, collapsible groups, and default first article.

   Manifest `sortOrder` values should remain useful as metadata/fallback ordering, but the visible Help navigation should come from `help/toc.md` when present and valid.

   This keeps Help authoring predictable and avoids forcing navigation structure to emerge from scattered module manifests.

3. Confirmed: `toc.md` article links should point directly to article Markdown files.

   Example:

   ```md
   # Longtail Forge
   - [Help Center](framework/help-center.md)
   - [Getting Started](framework/getting-started.md)

   # Modules
   ## Tasks
   - [Tasks Basics](modules/tasks/tasks-basics.md)

4. Confirmed with clarification: `help/toc.md` should be able to identify the default opening article, but use an explicit first-line directive instead of treating any first non-empty line as the default.

   Preferred format:

   ```md
   default: framework/help-center.md

   # Longtail Forge
   - [Help Center](framework/help-center.md)
   - [Getting Started](framework/getting-started.md)
   ```

   Also acceptable:

   ```md
   default: framework/getting-started.md
   ```

   If the default directive is omitted, invalid, unreadable, disabled by module state, or not visible to the current user, Help should fall back in this order:

   1. Help Center
   2. Getting Started
   3. First readable active article from the ToC
   4. First readable active article from fallback discovery

   Do not let default article selection leak hidden disabled-module or permission-denied articles.

5. Confirmed: Markdown support should stay intentionally simple in this pass.

   Support:
   - Headings
   - Paragraphs
   - Ordered and unordered lists
   - Links
   - Inline code
   - Code fences
   - Emphasis
   - Tables only if the existing Markdown helper can render them safely without expanding scope

   Do not add raw HTML support, embedded scripts, iframes, custom components, Mermaid diagrams, wiki-linking, comments, callouts, image upload handling, rich embeds, or a WYSIWYG editor in this pass.

   Render Markdown through a safe allowlist. Article output should remain browser-safe.

6. Confirmed: Help content remains repo-authored product/module documentation only.

   Do not add:
   - In-app Help editing
   - Rich authoring
   - Version history UI
   - Workspace-authored Help articles
   - Client-authored Help articles
   - Approval/publishing workflows
   - Knowledge Base-style article storage

   Help is the product manual. Knowledge Base is the future workspace/client knowledge system. Keep those boundaries separate.

7. Confirmed: Help search should index Markdown-derived article text.

   Search rebuilds should re-read the current Markdown-backed Help content through the Help service. Do not add live file watching in this pass.

   Keep:
   - `record_type = help_article`
   - `source = Help`
   - Existing framework/module ownership metadata
   - Existing permission-shaped Help search behavior
   - Disabled-module hiding/cleanup behavior

   Rebuild-time indexing is enough for 0.33.5.10. Live watching can be reconsidered later if Help authoring becomes more dynamic.

### Version 0.33.5.10.1 - Help Markdown Source Layout

- [x] Add a repo-owned `help/` content directory.
- [x] Add `help/toc.md` as the editable Help navigation source.
- [x] Add `help/framework/` for framework-owned Help articles.
- [x] Add `help/modules/<module-id>/` directories for first-party module Help articles.
- [x] Convert existing framework Help article bodies from `src/services/help.service.js` into Markdown files.
- [x] Convert existing first-party module Help article bodies from module manifest JavaScript into Markdown files.
- [x] Keep article IDs, slugs, source labels, ownership metadata, and current Help URLs stable during the conversion.

### Version 0.33.5.10.2 - Help Content Loader and Metadata Contract

- [ ] Add a small framework Help content loader for safe repo-relative Markdown reads.
- [ ] Preserve existing Help contribution validation for IDs, slugs, ownership, section references, permissions, workspace capabilities, and required modules.
- [ ] Allow framework and module Help article declarations to point to Markdown content paths instead of inline `body` strings.
- [ ] Reject unsafe paths, missing files, unsupported extensions, duplicate article paths, and content outside the Help root.
- [ ] Keep disabled-module Help hidden from active Help discovery.
- [ ] Keep Help separate from Knowledge Base and avoid adding user-authored Help storage.

### Version 0.33.5.10.3 - ToC-Driven Navigation

- [ ] Parse `help/toc.md` into a browser-safe navigation tree.
- [ ] Treat headings as collapsible groups that map to Help directory structure.
- [ ] Support nested headings as nested collapsible groups.
- [ ] Support linked headings or list items as article targets.
- [ ] Use the first configured/default article from `toc.md` as the initial Help Center article.
- [ ] Preserve a fallback section for readable active articles that are valid but missing from `toc.md`.
- [ ] Update `public/js/help.js` and Help page markup/styles only as much as needed to render nested collapsible navigation cleanly.

### Version 0.33.5.10.4 - Markdown Rendering and Article API Shape

- [ ] Render Markdown-backed article bodies safely in the Help Center.
- [ ] Keep article detail payloads browser-safe and permission-shaped.
- [ ] Preserve source metadata so framework, first-party module, and future third-party module articles are visibly distinct where useful.
- [ ] Keep the current `help.html?article=<slug-or-id>` routing behavior.
- [ ] Add or update Help regressions for default article selection, nested ToC rendering, disabled-module hiding, and article route stability.

### Version 0.33.5.10.5 - Help Search Re-indexing

- [ ] Update Help search indexing so indexed Help documents use Markdown-derived article text.
- [ ] Ensure Help search rebuilds re-read Markdown files instead of stale inline JavaScript bodies.
- [ ] Keep `record_type = help_article`, `source = Help`, and framework/module ownership metadata stable.
- [ ] Preserve disabled-module cleanup and permission-safe Help result shaping.
- [ ] Update search rebuild/lifecycle regressions for Markdown-backed Help article counts and content.

### Version 0.33.5.10.6 - Help Content Pass and Closeout

- [ ] Add or revise Help Center and Getting Started Markdown articles.
- [ ] Help Center should explain what framework, first-party modules, and third-party modules are.
- [ ] Getting Started should explain the key Longtail Forge concepts, how they are linked, and what makes the product context-preserving.
- [ ] Review framework Help articles for current behavior only.
- [ ] Review Time Tracking, Tasks, Lists, Notes, Files, Tags, Search, Notifications, Settings, and module Help coverage where articles already exist.
- [ ] Update developer docs for the Markdown Help contribution workflow.
- [ ] Update `DECISIONS.md`, `CHANGELOG.md`, package metadata, and roadmap archive only during the actual implementation/closeout pass.

### Potential Help Directory Structure

```text
help/
  toc.md
  framework/
    help-center.md
    getting-started.md
    workspaces-and-switching.md
    users-roles-and-permissions.md
    clients-and-projects.md
    notifications.md
    search.md
    tags.md
    files-and-attachments.md
    settings-and-user-preferences.md
    modules-and-optional-features.md
  modules/
    time-tracking/
      time-tracking-basics.md
      time-entries-editing.md
      manual-time-entries.md
    tasks/
      tasks-basics.md
      task-recurrence.md
      resume-context.md
    notes/
      using-notes.md
      notes-library.md
      active-work.md
      ongoing-area.md
      reference-library.md
      archive.md
      notes-collections.md
      markdown.md
      note-linking.md
      note-revisions.md
      secure-notes.md
      notes-files-and-search.md
    lists/
      using-lists.md
      items-and-statuses.md
      reusable-workflows.md
```

## Version 0.33.5.12 - UI Clean up Pass

### Settings -> Workspace -> Clients

- [ ] Need a filter for Parent/Top-Level clients

#### Clients Edit Modal

- "Save Client" and "Edit Projects" buttons need to be moved to modal footer

- Removing parent tags from child clients by opening the client edit modal, clicking on the tags you want removed, then clicking save client, doesn't actually remove those tags
  - Example: Appaloosa News, a child of Dr. Jennifer Weeks client should not have the "Mental Health Provider" or "Healthcare Provider" tags, as this is a personal project I manage for Dr. Weeks

## Task Tweaks / Potential UI/Modal Overhaul

- Projects -> Tasks
  - Things I'd like to be able to bulk edit (Add and Remove), in addition to what I can already change:
    - If there's a multi-select and the due dates/due times/tags are different before the bulk edit, be sure to warn the user with an in-app warning about 
    - [ ] Due date & Time (Can be clearable/set to NULL through bulk; Time should be optional/clearable as well)
    - [ ] Tags

- Add/Edit Tasks Modal Appearance Fixes

  - While doing the documentation step for this portion of the tasks modals, create an appropriate ROADMAP entry to standardize the headings, boxes, and other visual styles across the entire framework for main screens, modals, drawers, slideouts, etc.
    - Convert all footer buttons to icons on all modals
      - Save/Close/Cancel/etc.
    - Taggable work items should have a Tags button to open a tiny tag modal centered in the current modal
    - Work items with file attachment abilities should have a Files button to open a tiny files modal centered in the current modal

  - Tighten up overall white space between all fields

  - Modal internal headings need to be standardized 
    - Checklist is different from Assignees
    - Recurrence is different from reminders
    - Assignees and Checklist are different from Reminders
    - Make all internal headings for sub-boxes match Reminders
  
  - Internal boxes need to be standardized
    - Notifications and task timer are dark and square
    - Checklist is light and rounded
  
  - Horizontal Rules around Reminders
    - Horizontal rules should only be at the top of the option that's being toggled.

  - Notifications should be moved to a single bell icon at the top; this isn't important enough to warrant using as much real estate as it does
    - Put the bell right-aligned across from the Add/Edit Task heading

  - Between the title box and the Heading should be a small, full-modal-width chip ribbon
    - Should contain: Status, Priority, Client, Project, Due Date + time (if applicable) and any additions below as applicable

  - Time to completion should only appear when the task is marked complete
      - Time to completion should be moved into a chip ribbon below the heading/notification bell
      - Time to completion can be abbreviated "TTC: "
      - Chip should, initially, read: "TTC: 4:3:15:30" for days:hours:minutes:seconds

  - Maximize the visual efficiency of the two-column layout of the current Add/Edit Task modal
    - Any item that needs more space than the tightened two-column layout can provide can open a pop over that uses the full width of the modal until focus is changed; This piece might need some more brainstorming
    - Title should remain full width across both columns
    - Collapsible two-column box with "Task Details" as heading 
      - Box should start off open if this is an "Add Task" modal and collapsed if an "Edit Task" modal
      - This box should contain:
        - Parent Task (Across both columns! Currently Missing as of 0.33.5.2.3)
        - Column 1 should contain (in order):
          - Status
          - Client
          - Due Date
        - Column 2 should contain (in order):
          - Priority
          - Project
          - Due Time
    - Below the two column box, in two columns:
      - Resume Note
      - Next Action
    - Move back to single column layout (full modal width minus space for scroll bar) for remaining items
      - Blocked Reason (Full width; Should only appear when Status is "Blocked")
      - Checklist (Collapsible, starts open)
      - Assignees (Collapsible, starts open)
      - Recurrence (Collapsible, starts closed)
      - Reminders (Collapsible, starts closed)
    - Tags and "Task Files" should be moved to buttons in the footer (icon described buttons)

## Perrsonal / Family Workspace issues

- There should be no API access for clients in Personal or Family Workspaces
  - I see both read and write Public API access for clients in a Personal workspace right now (0.33.5.4.1)

- There are still no notes or lists public API key options listed.

- Files listings in a Family workspace still surfaces Client as an attachment point

- Files listings in a family workspace show UUIDs, not the human readable names

- Client is showing up as a choice in the Create Lists dialog
  - The only option is workspace, but it shouldn't be there at all and should just automatically set to Client
  - No projects show up in the project selector
    - I believe this issue is related to clients showing up
    - I think the projects display is linked to clients and client isn't properly setting the workspace projects as the filter

## Lists

- The UI is a mess.
  - On a laptop screen (1366 wide) Duplicate, edit, complete, finalize, etc. buttons go way out of bounds
  - Next, Source, Costs boxes do not respect dark mode, they have light colored backgrounds
  - Items entry goes way off the screen as well
  - List selector box needs to be moved above the list view and directly below fliters
  - List selector box needs to be collapsible
    - Should start off open
    - Once a list is selected, the box should collapse

## Version 0.33.6 - Reports Module

- Create a Reports module
  - I believe, currently, reporting is hard coded. This needs to be fixed and aligned with the current product models and philosophies.
  - For starters, only time tracking and billing needs to be dealt with within reporting, additional reporting is scheduled for later in the ROADMAP

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

### Version 0.33.7.4 - Resume State Consumption / Where I Left Off UI

- [ ] Consume the framework-owned resume state service introduced in 0.33.5.9.
- [ ] Workbench "Pick up where I left off" should use `/api/work-resume` first.
- [ ] Fall back to recent activity only when no active resume rows exist.
- [ ] Show one recommended resume candidate first.
- [ ] Keep secondary candidates available but visually subordinate.
- [ ] Allow users to dismiss stale resume candidates.
- [ ] Preserve permission checks, disabled-module behavior, deleted-record handling, and private/secure content boundaries.

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
  - If a modal action does not exist yet, the QAC action may be hidden, disabled with a clear tooltip, or temporarily link to the existing module page as an explicitly temporary fallback.
  - Temporary navigation fallbacks must be removed once the modal action exists.

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
- [ ] GitHub Issues

### Calendars

- [ ] Google Calendar
- [ ] Outlook Calendar

### Task/To Do App Integrations

- [ ] Microsoft To Do
- [ ] Google Tasks
- [ ] Identify others in the marketplace

### File Sharing and Storage

Is it possible to get notifications from any of these sources?

- [ ] DigitalOcean Spaces
- [ ] AWS
- [ ] Microsoft Azure
- [ ] Microsoft OneDrive 
- [ ] Google Drive
- [ ] DropBox
- [ ] Microsoft SharePoint
  - File sharing
  - Knowledgebase pages
  - Input for tickets/notes/tasks/etc.
- [ ] GitHub (Repository Linking)

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

