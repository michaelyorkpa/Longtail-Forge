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

- Review whether the User Settings "Remove Workspace" flow needs clearer wording now that it removes the signed-in user's membership rather than deleting the workspace record.

## Tweaks

- What should happen to records when a client/project becomes completed or archived?

- How long does archiving last?
  - There should be some mechanism to export archived records for storage to keep database light

- Add Workspace option to set default screen when switching into that workspace.
  - Current behavior keeps it on Time Tracker, for example, but perhaps a user would always want to default to the dashboard. So, make the starting page selectable and provide a "Stay on Current Workspace's page" option as well (so when a new workspace opens it remains in the time tracker, or tasks, or whatever)

## UI clean up/clarification

- [ ] Create list of every form for required entry fields
  - User Settings
    - Every field except Alternate Email address

## UI/Workspace tweaks for better generalized use

- Timer Concurrency

## User Upload Safety and CSAM Prevention

- [ ] Treat user-uploaded files as a security-sensitive framework feature.
- [ ] Build secure upload handling before allowing broad file uploads:
  - [ ] Allowlist file extensions by business need.
  - [ ] Validate actual file type/signature; do not trust browser-provided MIME type alone.
  - [ ] Generate server-side filenames.
  - [ ] Enforce file size limits.
  - [ ] Store uploaded files outside the webroot or in isolated object storage.
  - [ ] Require authentication and authorization before upload/download.
  - [ ] Scan uploads with antivirus/sandbox tooling where practical.
  - [ ] Log upload, download, deletion, quarantine, and scan events.
- [ ] Add upload quarantine workflow:
  - [ ] New files enter pending/scanning state.
  - [ ] Files are not publicly accessible until cleared.
  - [ ] Failed or suspicious files are quarantined.
  - [ ] Quarantined files are not shown in normal app UI.
  - [ ] Admin access to quarantined files is tightly restricted and audited.
- [ ] Add abuse reporting:
  - [ ] Users can report illegal or abusive uploaded content.
  - [ ] Reports create security/audit events.
  - [ ] Reports can disable public access to the file while reviewed.
- [ ] Before enabling public/user-generated image or video uploads:
  - [ ] Evaluate a specialized CSAM detection provider such as Thorn Safer, PhotoDNA access, or equivalent.
  - [ ] Add known-CSAM hash matching where available.
  - [ ] Add policy for suspected novel CSAM escalation.
  - [ ] Add written NCMEC CyberTipline reporting procedure.
  - [ ] Add retention/preservation policy reviewed by legal counsel.
- [ ] Do not build a DIY CSAM review gallery.
- [ ] Do not require normal admins to manually inspect suspected CSAM.

# Medium Term

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

- [ ] Lists (Shopping/Grocery)
  - could be useful for physical project planning
  - definitely useful in Personal/Family workspaces
  - eventual functionality could include scanning barcodes to add items to lists
  - What would a shopping/grocery list be called in a business context?

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
