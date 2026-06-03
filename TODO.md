# Longtail Forge TODO

This file is a scratchpad for loose notes, quick fixes, and ideas that have **not yet been promoted into `ROADMAP.md`**.

The versioned implementation plan lives in `ROADMAP.md`. Once an item is assigned to a version there, remove it from this file so the two documents do not drift apart.

# Short Term

## Fixes

- [ ] Add Table of Contents to README.md
- [ ] Add an about section to GitHub


- How is the "Remove Workspace" button wired, currently on User Settings page?

- What happens when a user is removed from all workspaces?
- What happens to a Workspace/project/client when the creator/owner is removed from it?

## Tweaks

- What should happen to records when a client/project becomes completed or archived?

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

- [ ] Create a dashboard/workspace that shows users all workspaces view

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

## Tagging Phase 4

- [ ] Phase 4: System/automatic tags
  - Add optional system tags only after manual tagging works
  - Use real fields for behavior/security, then optionally expose them as system tags
  - Example: note visibility should be stored as `visibility`, not enforced by `#public`
  - System tags should be locked or protected from accidental deletion

# Long Term

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

# Notes for Maintaining This File

- Use this file for rough ideas before they are ready for the versioned roadmap.
- Keep implementation-ready work in `ROADMAP.md`, grouped by version.
- When promoting a TODO item into `ROADMAP.md`, remove it from this file.
- Avoid duplicating full feature specs here once they are already represented in the roadmap.
