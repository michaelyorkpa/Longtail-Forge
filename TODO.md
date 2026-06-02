# Longtail Forge TODO

This file is a scratchpad for loose notes, quick fixes, and ideas that have **not yet been promoted into `ROADMAP.md`**.

The versioned implementation plan lives in `ROADMAP.md`. Once an item is assigned to a version there, remove it from this file so the two documents do not drift apart.

# Short Term

## Fixes

- [ ] How is the "Remove Workspace" button wired, currently on User Settings page

- [ ] Adjust links in Audit log table

- [ ] Clients still shows up on the time reporting page in Personal workspaces, instead of being hidden and defaulting to "Workspace Projects"

- [ ] Move Projects Settings link from "Projects" under the "Projects" main menu heading back to "Projects" under Settings
  - [ ] Move "Add Project" to be in-line with "Projects" heading on "Projects" settings page (right at the very top right)
  - [ ] Add "Filter List" above the "Client" and "Status" filters
  - [ ] Add "Bulk Changes" above the bulk status/bulk client/bulk billable boxes

- Settings -> Workspaces -> User Admin -> Edit User modal
  - [ ] "Configure Permissions" button needs to be above "Add Role" button
  - [ ] "Add Role" button needs to be centered at bottom of "Role Assignments" box
  - [ ] Current roles needs to be moved to its own box with "Current Assignments" as the heading

- What happens when a user is removed from all workspaces?
- What happens to a Workspace/project/client when the creator/owner is removed from it?

### Audit Log UI

- [ ] Logins are not tracked in the audit log
- [ ] Truncate user, client, project, and record type to keep all columns on screen
  - [ ] Add title to each of the above fields so when user hovers, it displays the full item
- [ ] Add client filter (business workspaces only)
  - [ ] Make client in list clickable to set filter
- [ ] Add project filter 
  - [ ] Make project in list clickable to set filter
- [ ] Make Record Type in list clickable to set filter

### Audit Log Functionality

- [ ] Audit log needs to start tracking IP address of users on each log entry

## Tweaks

### Records Maintenance

- [ ] If a project is moved to a different client/becomes a workspace project
  - [ ] All associated records should be updated to reflect this
    - [ ] Time entries
    - [ ] Tasks
    - [ ] Notes
    - [ ] Knowledge Base
  - [ ] Users should be notified with in-app dialog with explicit confirmation before completing this

- What should happen to records when a client/project becomes completed or archived?

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
