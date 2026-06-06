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

- [ ] Need a way for properly authenticated users to see active/running timers, but not change them

- Review whether the User Settings "Remove Workspace" flow needs clearer wording now that it removes the signed-in user's membership rather than deleting the workspace record.

## Tweaks

- Add Workspace level date format display settings
- Add Workspace level time format display settings
- Add user level setting for timezone display "Local Timezone or UTC"
  - Does this make sense on a lower level too? (May be useful when freelancers have clients in different timezones)

- The workbench should be your daily workspace. The dashboard is where you go to focus/refocus.
  - Workbench should have a focus mode selector: 
    - Week
    - Day
    - Open/In Progress Tasks
    - Blocked tasks
    - Workload view (all clients, projects, tasks, etc.)
    - Client (for business)
    - Project
    - Ticket (Eventually)
  - Workbench uses tags and hard connected records to create the focus
    - If in project focus mode, all tasks from that project that are open/in progress
  - Clicking on task chips should open selector to adjust it (status/priority)

- We need a way to define "default settings" for first and third party modules. e.g. default sort order, default filtering, etc.
  - These are settings that apply module-wide and can affect the default module behavior.

- What should happen to records when a client/project becomes completed or archived?

- How long does archiving last?
  - There should be some mechanism to export archived records for storage to keep database light

- Add Workspace option to set default screen when switching into that workspace.
  - Current behavior keeps it on Time Tracker, for example, but perhaps a user would always want to default to the dashboard. So, make the starting page selectable and provide a "Stay on Current Workspace's page" option as well (so when a new workspace opens it remains in the time tracker, or tasks, or whatever)

- Add proper billing detalis for: 
  - Clients
  - Business Workspaces

## UI clean up/clarification

- [ ] Create list of every form for required entry fields
  - User Settings
    - Every field except Alternate Email address

- [ ] There should be something in the views/models that indicates whether a field needs to be required so the * becomes automatic as views happen (if this is best practice)

## UI/Workspace tweaks for better generalized use

- Timer Concurrency

# Medium Term

- Expand tagging infrastructure to: 
  - normalize capitalization (on input)
    - This should be a default setting ("Normalize/Standardize capitalization?")
  - 

## Storage Security Foundation

- [ ] Add documented threat models:
  - [ ] Stolen device
  - [ ] Copied database file
  - [ ] Copied backup
  - [ ] Compromised app account
  - [ ] Compromised server admin

- [ ] Add install documentation recommending OS-level disk encryption for local/self-hosted installs:
  - [ ] Linux: LUKS
  - [ ] Windows: BitLocker
  - [ ] macOS: FileVault

- [ ] Add encrypted backup/export support before full database encryption:
  - [ ] Encrypt generated backup files
  - [ ] Document where backup keys should be stored
  - [ ] Ensure backup exports do not leak sensitive records into plaintext files
  - [ ] Add restore testing for encrypted backups

- [ ] Add database adapter planning for encrypted and future storage backends:
  - [ ] Standard SQLite
  - [ ] SQLCipher-backed SQLite
  - [ ] PostgreSQL
  - [ ] Leave room for future managed database/storage providers

- [ ] Add a sensitive-record/module manifest flag:
  - [ ] Do not index body text by default
  - [ ] Require stricter audit logging
  - [ ] Require explicit export permission
  - [ ] Optionally require encrypted storage
  - [ ] Prevent sensitive body text from being copied into normal search indexes
  - [ ] Prevent sensitive values from appearing in logs, event summaries, notifications, or activity feeds

- [ ] Add key management documentation:
  - [ ] Never store encryption keys in the database
  - [ ] Never commit encryption keys to Git
  - [ ] Support `.env` for local development only
  - [ ] Document production-safe options such as OS keychain, systemd credentials, Vault, 1Password CLI, or provider KMS later
  - [ ] Document key rotation expectations
  - [ ] Document recovery risks if keys are lost

- [ ] Add SQLite encryption planning:
  - [ ] Research SQLCipher integration
  - [ ] Ensure encrypted SQLite connections are keyed before any query runs
  - [ ] Keep encryption behind the database adapter/helper layer
  - [ ] Verify current SQLite helper/process model can support encrypted connections cleanly
  - [ ] Document that normal SQLite database files are not encrypted by default

- [ ] Add PostgreSQL encryption planning:
  - [ ] Recommend disk/volume encryption for the PostgreSQL data directory
  - [ ] Require encrypted backups
  - [ ] Support TLS for app-to-database connections when database is remote
  - [ ] Evaluate `pgcrypto` for field-level encryption where appropriate
  - [ ] Prefer app-level/client-side encryption when database administrators should not be able to read sensitive values

- [ ] Add search/indexing safety rules for sensitive records:
  - [ ] Sensitive modules should declare what fields are searchable
  - [ ] Sensitive body text should not be indexed by default
  - [ ] Search results should remain permission-aware and workspace-aware
  - [ ] FTS tables should not become the source of truth for permissions or visibility
  - [ ] Rebuild tools should respect sensitive-record indexing rules

- [ ] Add storage security regression tests:
  - [ ] Wrong SQLite encryption key fails safely
  - [ ] Encrypted SQLite database cannot be opened by normal `sqlite3`
  - [ ] Encrypted backups can be restored with the correct key
  - [ ] Encrypted backups fail safely with the wrong key
  - [ ] Search index does not leak sensitive body text
  - [ ] Logs do not contain decrypted sensitive values
  - [ ] Notifications/event summaries do not expose sensitive values
  - [ ] Export permissions are enforced for sensitive records

## Estimation Assistant / Historical Time Estimation

- [ ] Add future estimation helper after tags, search, and time-entry reporting are stable.
- [ ] Estimation should use real historical time entries, not guesses.
- [ ] Inputs:
  - [ ] Workspace.
  - [ ] Client optional.
  - [ ] Project optional.
  - [ ] Task/project title.
  - [ ] Description.
  - [ ] Selected tags.
  - [ ] Date range.
  - [ ] User/team filter optional.
  - [ ] Billable/non-billable filter.
- [ ] Matching logic:
  - [ ] Match by direct time-entry tags.
  - [ ] Match by project/client context where selected.
  - [ ] Match by task/project title keywords where useful.
  - [ ] Allow user to include/exclude individual comparison records.
  - [ ] Remove obvious outliers or show them separately.
- [ ] Output:
  - [ ] Suggested estimated hours.
  - [ ] Low/typical/high range.
  - [ ] Number of matching records used.
  - [ ] Similar past entries list.
  - [ ] Confidence level.
  - [ ] Notes explaining why the estimate was suggested.
- [ ] Project integration:
  - [ ] Allow estimate to be saved to task estimated hours.
  - [ ] Allow estimate to be saved to project estimated hours.
  - [ ] Compare estimated vs actual tracked time.
  - [ ] Support reporting by estimate accuracy over time.
- [ ] Guardrails:
  - [ ] Do not generate estimates from too few records without warning.
  - [ ] Do not compare across inaccessible records.
  - [ ] Respect workspace, module, client/project, and permission boundaries.
  - [ ] Clearly label estimates as historical suggestions, not guarantees.

## User Interface 

- [ ] Create a dashboard/workspace view that shows users all workspaces view

- [ ] "Focus" mode, allows dashboard/entire interface to switch to being focused on a single project/client for Business workspaces

- [ ] Determine what code changes need to happen to create phone/tablet/TV apps

## Administration and Settings

- Is there a way to encrypt/secure the data in the database?

- [ ] Create app-level settings for:
  - [ ] Total number of personal workspaces per users
  - [ ] Total number of family workspaces per user
  - [ ] Total number of business workspaces per user

- [ ] Add delete option for workspaces

- [ ] Add workspace transfer screens
  - Owner transfer exists as a backend safety rule; this item is for explicit admin UI.

- [ ] Add workspace creation permission per user in the User Admin settings modal
  - App-level and per-user storage exists; this item is for the management UI.

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

# Long Term

## Estimation build out

- Build out of estimatation module
  - Estimate creation from existing time entries
    - Take similar, existing time entries (tagged entries?) and use that to create estimates
    - Not an AI estimate, but one that builds an estimate from existing data

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
