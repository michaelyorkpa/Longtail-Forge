# Longtail Forge TODO

This file is a scratchpad for loose notes, quick fixes, and ideas that have **not yet been promoted into `ROADMAP.md`**.

The versioned implementation plan lives in `ROADMAP.md`. Once an item is assigned to a version there, remove it from this file so the two documents do not drift apart.

# Notes for Maintaining This File

- Use this file for rough ideas before they are ready for the versioned roadmap.
- Keep implementation-ready work in `ROADMAP.md`, grouped by version.
- When promoting a TODO item into `ROADMAP.md`, remove it from this file.
- Avoid duplicating full feature specs here once they are already represented in the roadmap.

# Short Term

## Fixes

- Add new photo dispatch task did not move to "Overdue" at 4pm
- Make "Reminders" in Add/Edit Task modal collapsible
- Bulk Actions doesn't open when a selected
- Remove the "Bulk Action" drop down and keep the "Status" "Priority" and "Assignees"
  - Add "-" to Status and Priority boxes
  - Perform the bulk action, after user clicks apply, based on what is selected in Status, Priority, and/or Assignees
  - If only a Status is selected, only change the status on the selected tasks
  - If only a Priority is selected, only change the priority on the selected tasks
  - If one or more assignees are selected, but nothing else change the assignees on the selected tasks
  - If any combination of the above are selected, change the selected bulk actions on the selected tasks
  - Doing this will speed up bulk changes and reduce time spent making them

### Tasks

- [ ] In Add Task modal, "All Projects" exists, but we've lost the "{{workspaceName}} Projects" to sort by.

- [ ] In Projects -> Tasks the task list should move the buttons to the bottom of each list item, side-by-side
  - Drop the "Actions" column
  - Truncate Scope, but add hover over reveal for full detail

- [ ] Add a "Duplicate" button to create a new task from a completed/existing task

- How is the "Remove Workspace" button wired, currently on User Settings page?

- What happens when a user is removed from all workspaces?
  - It's disallowed. Need a transfer mechanism.
- What happens to a Workspace/project/client when the creator/owner is removed from it?
  - It's disallowed. Need a transfer mechanism.

## Tweaks

- [ ] Do partial Dashboard modification to bring it closer to final dashboard appearance

- [ ] Move notifications up in the ROADMAP?

- [ ] Identify and use an accessibility checker for best accessibility practices. Do this early.

- [ ] Make all footers float at the bottom of modal windows (Save/Cancel/etc.) so users don't have to scroll all the way to the bottom every time

- Should task timers show up as options to run on the Time tracker?

- Do task timers pause when regular timers are started?
  - Needs to have a backend setting to control this. "Timer Concurrency"

- What should happen to records when a client/project becomes completed or archived?

- How long does archiving last?
  - There should be some mechanism to export archived records for storage to keep database light

- Add Workspace option to set default screen when switching into that workspace.
  - Current behavior keeps it on Time Tracker, for example, but perhaps a user would always want to default to the dashboard. So, make the starting page selectable and provide a "Stay on Current Workspace's page" option as well (so when a new workspace opens it remains in the time tracker, or tasks, or whatever)

### UI clean up/clarification

- [ ] Create list of every form for required entry fields
  - User Settings
    - Every field except Alternate Email address

### UI/Workspace tweaks for better generalized use

- [ ] Should there be a workspace setting to de-couple timers?
  - Should timers only be allowed to auto-pause when a different one is started or should there be a Workspace switch that allows timers to run concurrently?

### Security tracking and considerations

- Should user's IP, browser, useragent, etc. be tracked anywhere? This could be added to security checks. Most likely place: users table. "mostRecentIP" "mostRecentBrowser" "mostRecentUseragent" etc.
  - What other things should be tracked/monitored to enhance security?

# Medium Term

- [ ] "Focus" mode, allows dashboard/entire interface to switch to being focused on a single project/client for Business workspaces

- [ ] Determine what code changes nee to happen to create phone/tablet/TV apps

- [ ] Create a dashboard/workspace view that shows users all workspaces view

- [ ] Create app-level settings for:
  - [ ] Total number of personal workspaces per users
  - [ ] Total number of family workspaces per user
  - [ ] Total number of business workspaces per user

- [ ] Add delete option for workspaces

- [ ] Add workspace transfer screens

- [ ] Lists (Shopping/Grocery)
  - could be useful for physical project planning
  - definitely useful in Personal/Family workspaces
  - eventual functionality could include scanning barcodes to add items to lists

- [ ] Add workspace creation permission per user in the User Admin settings modal

  - [ ] Add self-hosted install setting to limit/select workspace types
    - [ ] Allow self-hosted installs to be business-only, personal, or personal and family only if desired
    - [ ] This can start as a config value or setup-wizard option

- [ ] Allow moving of projects from personal workspaces to family workspaces, provided user has sufficient permissions

- [ ] Create about page

- [ ] Fix splash page box sitting low on screen

- [ ] Add "Keep me Logged In" checkbox to log in form

- [ ] Create Audit Log "Timeline" report
  - makes an easily human readable report that is chronologically organized
  - make it respect filters

### Time Tracking / Work Item Timer Integration

- [ ] Keep Time Tracking usable as a simple standalone module for users who do not use Tasks.
- [ ] Add a Time Tracking “Work Queue” panel that can show trackable items from enabled modules.
- [ ] Allow Tasks to expose eligible tasks to the Time Tracking screen without hardcoding task-specific UI into the Time Tracking module.
- [ ] Show active and paused task timers alongside general active timers for quick task switching.
- [ ] Add a shared timer-source/trackable-item contract so future modules, including Support Tickets, can expose timer-ready records.
- [ ] Ensure only one timer can actively run per user across general timers, task timers, and future ticket timers.
- [ ] Finalized task/ticket timers should create normal time entries with source references such as task_id or ticket_id.
- [ ] Consider a later migration from separate active timer tables to a generalized active_work_timers table with source_type/source_id.

## Tagging Phase 4

- [ ] Phase 4: System/automatic tags
  - Add optional system tags only after manual tagging works
  - Use real fields for behavior/security, then optionally expose them as system tags
  - Example: note visibility should be stored as `visibility`, not enforced by `#public`
  - System tags should be locked or protected from accidental deletion

# Long Term

## Employee hour tracking for Payroll/HR purposes

## CRM Features?

- Should CRM features be an additional module?

## Parking Lot / Open Questions

- [ ] Add hotkeys for menus/functions

- [ ] Should plugins/externally developed modules use the public API or internal/browser API?

- [ ] Should I add a CRM module?

- [ ] What other team tools would be beneficial beyond groups/permissions, assignments, messaging/comments, notifications, and activity feeds?

- [ ] Architecture decision guide: when should Longtail Forge outgrow the current simple stack?
  - [ ] Database:
    - Stay on SQLite while the app is single-server, low-concurrency, and still changing quickly.
    - Before serious multi-user/hosted use, replace the current SQLite command-wrapper approach with a proper database adapter and parameterized queries.
    - Revisit PostgreSQL/MySQL when the app has real multi-organization use, public API usage, background jobs, heavier reporting, concurrent writes, or multiple app instances.
    - Prefer PostgreSQL long term unless MySQL is chosen for operational familiarity.
  - [ ] Front end:
    - Keep plain browser JavaScript for now.
    - Revisit React/Vue/Next only after roles, API foundation, module-ready structure, tasks, tickets, notes, and project-management screens make the UI hard to maintain.
    - Prefer React + Vite or Vue + Vite before considering NextJS, unless server-rendered public pages become important.
  - [ ] Search:
    - Start with normal indexed database search.
    - Use SQLite FTS5 or PostgreSQL full-text search before adding a separate search server.
    - Revisit Elasticsearch/OpenSearch only if search becomes a major feature with advanced relevance, fuzzy matching, synonyms, huge text volume, or cross-object search at scale.
