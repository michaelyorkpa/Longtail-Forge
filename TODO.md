# Longtail Forge TODO

This file is a scratchpad for loose notes, quick fixes, and ideas that have **not yet been promoted into `ROADMAP.md`**.

The versioned implementation plan lives in `ROADMAP.md`. Once an item is assigned to a version there, remove it from this file so the two documents do not drift apart.

# Notes for Maintaining This File

- Use this file for rough ideas before they are ready for the versioned roadmap.
- Keep implementation-ready work in `ROADMAP.md`, grouped by version.
- When promoting a TODO item into `ROADMAP.md`, remove it from this file.
- Avoid duplicating full feature specs here once they are already represented in the roadmap.

# Short Term

## Playwright needs to include additional browsers

Specifically, Firefox/Mozilla and Webkit for further, future testing.

## Workbench

### Manual timer Recovery chip

Investigate why a manually created timer can display a `Recovery` chip in **Other Active Timers**. Confirm whether recovery state or metadata is being assigned incorrectly, or whether the chip renderer is classifying a normal manual timer incorrectly.

### Parent/Child Task identification

The inspector should specify "Child" when the task context shows a child task of the current, focused task. This should be done in a chip. Same goes the opposite way. When a child task is in focus, the parent task should be displayed with "Parent" in a chip in the inspector.

### Algorithm

Blocked tasks should not show up anywhere other than "Review blocked work".

> The 2026-07-22 promotion batch moved the following Short Term sections into `ROADMAP.md` and removed them from this file to prevent drift: Mobile Tweaks -> **0.33.21.10** (children .10.1 notification/search out of the hamburger drawer, .10.2 mobile Day-default calendar with a User App Preferences per-user preference, .10.3 Workbench Inspector mobile slide-out, .10.4 Workbench Task Focus / Other Active Timers chip layout); Clients, Projects, and Tasks -> **0.33.21.11** (children .11.1 Business-only Client exposure in the Project Settings list and project modals, .11.2 Edit Project defaults reorganization, .11.3 Tasks bulk Project assignment, .11.4 Task editor parent-hierarchy ordering + Save-in-place, .11.5 parent-task Project cascade to child tasks); Personal Workspace Module Scope -> **0.33.21.12** (Notes visibility scoped by workspace type). The "Knowledge Base should not be included in personal workspaces" line stayed a forward reference — it is owned by the future 0.35 Knowledge Base work and was recorded as the forward note in 0.33.21.12 rather than an actionable item.

> The 2026-07-21 promotion batch moved the following Short Term sections into `ROADMAP.md` and removed them from this file to prevent drift: Calendar (read-only active-task defaults + status multi-selector) -> **0.33.21.9**; Notes -> Bulk Actions tag picker -> **0.33.21.1** (retitled "Reporting and Notes tag-control refinements"); Reporting module disable-ability -> the **0.37.0** opening slice (convert Reporting from framework core into a registered `canDisable` module); Permissions/Warnings (in-app 403 modal) -> **0.33.25.2**; Permissions/Issues (child-client creation scope, Project Settings access for scoped admins) -> the new **0.33.28 - Permissions Role-Capability Alignment** branch, which also owns the additional gaps found in the 2026-07-21 permissions code review (scope-aware nav/hints, client-side `requiredPermissions` wiring, `project_admin` seed drift, `roles.assign` reconciliation); Permissions/Notifications (permission-change and workspace-removal notices) -> **0.36.5** Account Home, which owns the required cross-workspace delivery.

> The 0.33.17.7 pre-preview review batch (2026-07-16) promoted the following Short Term sections into `ROADMAP.md` and removed them from this file to prevent drift: Deletion/Edge Cases -> **0.33.17.7.10 and 0.33.17.7.12-.15**; Timer project ordering -> **0.33.17.7.16**; Login throttling persistence -> **0.33.17.7.17**; Workbench (algorithm, In Progress, URL annoyance) and Workbench Timers Tweak -> **0.33.19.3**; Task Reminders and Tasks Status Tweak -> **0.33.19.4**; Secure Catalogs -> the **Committed before 0.4x** unversioned backlog. The prior 0.33.19 calendar branch moved to **0.33.20** in the same batch.
>
> Renumber note (2026-07-20): a Workbench/API load-performance branch was inserted as **0.33.19**, moving the former 0.33.19-0.33.24 branches down one to **0.33.20-0.33.25**. The promoted Workbench and Tasks slices above remain owned only by the post-preview UX branch (**0.33.21.3** and **0.33.21.4** in the current numbering), and the calendar branch is **0.33.22**; the subsequently reused **0.33.19.3-0.33.19.5** numbers belong to the Developer Verification Throughput follow-ups in `ROADMAP.md`. (Corrected 2026-07-21: this note previously cited 0.33.20.3/.4 and 0.33.21, which drifted from the ROADMAP's current numbering where 0.33.20 is the load-performance branch.)

## Regression fixture seeding hygiene

Regression fixtures must not seed states the product cannot produce; seeding should happen through real routes/services (or repositories where no route exists), not raw SQL table writes. Raw-SQL seeding can construct impossible states that silently mask contract drift: the 0.33.20.2 slice found the lists API regression seeding a workspace with zero `workspace_modules` rows (a state workspace creation can never produce) and depending on the removed lazy write-on-read backfill to function, and the tag core-records regression asserting that backfill as the contract. Roughly 35 scripts write `workspace_modules` directly today, and many more seed other tables raw. A cleanup pass should convert fixture seeding to the product paths (workspace creation via `workspacesRepository.createWorkspace`/`syncModuleRegistry`, module status via `setModuleStatus`, records via their services or HTTP routes), keeping raw SQL only where a test deliberately constructs corruption/drift to prove a repair. This also feeds the 0.40.0 dual-backend contract suite, which requires provider-neutral seeding anyway. Sequencing thought: batch the conversion by fixture family and watch suite wall-time, since direct SQL seeding is part of why the suite is fast.

## Fix logo for Dark Mode Visibility

Current logo disappears in dark mode. Need to fix this.

> The Calendar/Dashboard/Tasks tweaks captured here after 0.33.10 shipped were promoted to **ROADMAP.md 0.33.10 follow-up slices 0.33.10.6 - 0.33.10.9** and removed from this file to prevent drift.
>
> The remaining Short Term notes are intentionally deferred rather than implementation-ready: the undated-task Wishlist needs a deliberate scheduling design; the Lists UI/UX overhaul was promoted to 0.33.13 and removed; Suggested Library waits for a later Notes pass; Testing Goals remain human verification; Knowledge Base belongs to 0.35; Mobile Tweaks wait for a fresh current-surface audit; and Administration/Settings is larger than a cleanup slice. Executable near-term ideas start under the separate `# Near Term Ideas` heading.

## Wishlist

One thing I've always wanted and really want to figure out how to make happen, is having this app figure out where to fit in tasks that don't have due dates.

This will require some thinking and some idea of how long tasks will take.

It will also require a "business/working hours" put in the app somewhere so the app knows how long someone works each day.

But this will aid in planning out the user's day.

> Concrete Short Term cleanup items (inactive users, session-warning modals, Workbench parent rollup, Tasks blocked-state behavior, and the Tasks/Notes/Timers/Workspace/Misc/Client-Projects quick fixes) were promoted to **ROADMAP.md 0.33.11 - Short-Term Critical Cleanup Sweep** and removed from here to prevent drift. Items still listed below are intentionally deferred, belong to another version (KB -> 0.35; the Lists UI/UX overhaul was promoted to 0.33.13 and removed), are human testing goals, or are larger than a quick fix.

> The Lists UI/UX Overhaul notes were promoted to **ROADMAP.md 0.33.13 - Lists Module UI/UX Overhaul** (slices 0.33.13.1 - 0.33.13.5) and removed from this file to prevent drift. The four scoping decisions were settled during promotion: filters + List Selector move into the standard bottom-left filter drawer (slide-out sidebar), one combined collapsible "List Details" box holds the description plus a read-only linked-records list, all link add/remove moves into the Edit List modal via the shared Linked Context picker, and both Lists modals get a full view-guideline pass.

## Notes - Suggested Library

- Revisit this once the app is built more (not quite medium term, but not today 2026/06/18)
  - Library suggestion should be directly below the Library drop down in Note Details, not in Linked context
  - Revisit the logic that builds this and refine the algorithm

## Testing Goals

This section is to define a series of human testing goals for different sections of the app.

### Permissions

- Create various users and test their functionality
  - Client admin
  - Project admin
  - Client user
  - Project user
  - External Client user

### Notifications

- Make sure follow notifications work for all users (the creator, and other users)
- Make sure reminders are actually going into notifications

## Knowledge Base Make Good Smart

- Use context of current Workbench focus to display knowledge base article suggestions
  - Context includes:
    - Client (Business only)
    - Project
    - Tags
    - Keywords pulled from titles/descriptions/note bodies
  - Should be similar to context around displaying notes within workspace
  - Maybe just displays headings/titles?

## Administration/Settings

- Many modules aren't exposing admin/settings properly
  - Perform an audit and figure out what settings are missing and how to get them where they need to be

## Mobile Tweaks

The 2026-07-22 re-audit of the current rendered surfaces produced the concrete near-term tweaks now promoted to **ROADMAP.md 0.33.21.10** (app-shell notification/search relocation, mobile Day-default calendar, Workbench Inspector slide-out, Workbench chip layout). Broader mobile-polish work beyond those items stays deferred to a future pass: re-audit the current rendered surfaces first, and do not revive layout requests written against retired page anatomy.

# Near Term Ideas

## User controls

For SaaS and even self-hosted purposes, we're going to need to limit the number of workspaces an individual user can create. Storage needs to be shared across all workspaces per user. User data backup/restore is going to be necessary but needs to have granular permissions to make it effective (we don't want to give anyone the ability to exfiltrate data).

## Questions/Thoughts

- We need a way to define "default settings" for first and third party modules. e.g. default sort order, default filtering, etc.
  - These are settings that apply module-wide and can affect the default module behavior.

- What should happen to records when a client/project becomes completed or archived?

- How long does archiving last?
  - There should be some mechanism to export archived records for storage to keep database light

- Add proper billing detalis for: 
  - Clients
  - Business Workspaces

## Admin/User Settings

- [ ] Need a way for properly authenticated users to see active/running timers
  - [ ] Appropriate admins should be able to stop/pause timers with explicit warning

- [ ] Add Workspace option to set default screen when switching into that workspace, per user.
  - Current behavior keeps it on Time Tracker, for example, but perhaps a user would always want to default to the dashboard. So, make the starting page selectable and provide a "Stay on Current Workspace's page" option as well (so when a new workspace opens it remains in the time tracker, or tasks, or whatever)

## UI clean up/clarification

- [ ] There should be something in the views/models that indicates whether a field needs to be required so the * becomes automatic as views happen (if this is best practice)
  - [ ] Create list of every form for required entry fields
    - User Settings
      - Every field except Alternate Email address

## UI/Workspace tweaks for better generalized use

- Timer Concurrency

- Expand tagging infrastructure to: 
  - normalize capitalization (on input)
    - This should be a default setting ("Normalize/Standardize capitalization?")
  - 

# Medium Term

## Diagnostics and Support

- Settings -> Help -> Report a Bug
  - Need to create a diagnostics script
    - Create a list of environment details
    - Include relevant log files
  - Should also have a "Support" option for paid private hosting

## Project Updates

- [ ] Add project types
  - Short Term/Defined End
  - Phase (Larger/Longer)
  - On-Going (Social Media Management/On-going Support)

- [ ] Add project completion
  - Only for short and medium term projects
  - [ ] Status bar / Percentage completed for projects
    - [ ] Totals from tasks within 

## TypeScript Contract Checking — promoted to ROADMAP

Promoted into `ROADMAP.md` as **Version 0.33.8 - TypeScript Contract Checking Foundation** with sub-slices
**0.33.8.1 – 0.33.8.5** (tooling setup, framework contract types, selective `@ts-check` of high-value files,
Codex/Claude + regression workflow, and release closeout). The four design decisions were carried over as
settled, the framework-contract-type list was expanded to cover all cross-module contracts created/updated
since 0.32.10 (module manifest + view-descriptor system, work/Workbench/resume, search, notifications, tags,
files, permissions, public API, jobs, database seam, and per-module record shapes), and Reporting moved to
0.33.9 to make room (the tentative advanced-search overhaul reference shifted to 0.33.10).

## Search Capability Expansion

- Add public API search after browser search has settled.
  - Deferred from 0.32.8 by design decision; browser search remains the only 0.32.8 search API surface.
  - Future endpoint candidate: `GET /api/v1/search`.
  - Require API key authentication.
  - Require explicit search/read scopes.
  - Respect workspace and module permissions.
  - Hide disabled-module records unless a future explicit administrative API says otherwise.
  - Use the same framework search service and adapter boundary as browser search.
  - Return a stable public response shape without browser-only navigation/action data.
  - Add public API regressions when implemented:
    - API keys without search scope are rejected.
    - API keys cannot see records outside their workspace/module permissions.
    - Disabled-module records remain hidden.

- Add file search indexer tool to search index approved, uploaded files
  - Should index only text
  - Should be able to handle:
    - [ ] .txt
    - [ ] .rtf
    - [ ] .doc
    - [ ] .docx
    - [ ] .pdf
    - [ ] Identify additional file types to index
  - Indexing of files should be a deferred service and should factor in active sessions and server load

## 0.4x Expansion Targets - Support Tickets

### 0.40.x - Ticket Automations and Rules

* [ ] Add framework-owned automation/rules foundation before ticket-specific automations.

  * [ ] Rules should be framework-owned.
  * [ ] Tickets should contribute rule triggers, conditions, and actions.
  * [ ] Do not hard-code automation behavior only inside Support Tickets.

* [ ] Add ticket rule triggers.

  * [ ] Ticket created.
  * [ ] Ticket source is client portal/API/WordPress/Shopify/email.
  * [ ] Ticket category changed.
  * [ ] Ticket priority changed.
  * [ ] Ticket status changed.
  * [ ] Ticket assigned.
  * [ ] Client reply added.
  * [ ] Internal note added.
  * [ ] Ticket idle for X time.
  * [ ] Ticket overdue or waiting too long.

* [ ] Add ticket rule conditions.

  * [ ] Workspace.
  * [ ] Client.
  * [ ] Project.
  * [ ] Source.
  * [ ] Category.
  * [ ] Priority.
  * [ ] Status.
  * [ ] Assignee.
  * [ ] Tags.
  * [ ] Requester.
  * [ ] Business hours later.
  * [ ] SLA target later.

* [ ] Add ticket rule actions.

  * [ ] Assign ticket.
  * [ ] Change priority.
  * [ ] Change status.
  * [ ] Add internal note.
  * [ ] Add tag.
  * [ ] Notify user/role.
  * [ ] Create task.
  * [ ] Create follow-up reminder later.
  * [ ] Call webhook later.

### 0.41.x - WordPress and Shopify Ticket Intake Plugins

* [ ] Add external plugin integration plan.

  * [ ] WordPress plugin creates tickets through scoped public API.
  * [ ] Shopify app/plugin creates tickets through scoped public API.
  * [ ] Plugins should not receive broad workspace/admin API keys.
  * [ ] Each plugin should have minimal API scopes.
  * [ ] Each plugin should identify source application and install context.

* [ ] Add intake-specific API hardening.

  * [ ] Per-token rate limits.
  * [ ] Replay protection/signature support.
  * [ ] Origin/source metadata.
  * [ ] Spam/abuse throttling.
  * [ ] Optional CAPTCHA or challenge support on public forms.
  * [ ] Safe attachment policy for public intake.
  * [ ] Clear error responses for plugin users.

* [ ] Add WordPress plugin MVP.

  * [ ] Admin settings for LTF URL and API key.
  * [ ] Shortcode/block for ticket form.
  * [ ] Optional logged-in WordPress user mapping.
  * [ ] Basic category/project routing.
  * [ ] Success/error state.
  * [ ] No internal note support.

* [ ] Add Shopify plugin/app MVP.

  * [ ] Admin settings for LTF URL and API key.
  * [ ] Ticket form from order/customer context where permitted.
  * [ ] Include order ID/customer snapshot as metadata where safe.
  * [ ] Optional category routing.
  * [ ] No internal note support.

### 0.42.x - SLA, Queues, and Service Desk Views

* [ ] Add Post Ticket Surveys as an option

* [ ] Add ticket queue views.

  * [ ] My assigned tickets.
  * [ ] Unassigned tickets.
  * [ ] Waiting on internal.
  * [ ] Waiting on client.
  * [ ] High/urgent tickets.
  * [ ] Recently updated.
  * [ ] Stale tickets.

* [ ] Add saved ticket views if saved filters are stable.

  * [ ] Personal saved views.
  * [ ] Workspace/shared saved views later.
  * [ ] Permission-safe filters only.

* [ ] Add SLA groundwork.

  * [ ] First response target.
  * [ ] Next response target.
  * [ ] Resolution target.
  * [ ] Business hours calendar later.
  * [ ] Pause while waiting on client.
  * [ ] SLA status fields should be explicit, not inferred from tags.

* [ ] Add escalation hooks.

  * [ ] Notify assignee.
  * [ ] Notify workspace admins.
  * [ ] Raise priority.
  * [ ] Create task.
  * [ ] Trigger automation rule.

### 0.43.x - Email-to-Ticket and Ticket Replies

* [ ] Add email intake planning.

  * [ ] Inbound mailbox adapter.
  * [ ] Message threading.
  * [ ] Reply token or ticket key parsing.
  * [ ] Safe sender matching.
  * [ ] Attachment safety scanning.
  * [ ] Spam handling.
  * [ ] Loop prevention.

* [ ] Add outbound email notifications/replies only after notification delivery channels are stable.

  * [ ] Client-visible replies can send email.
  * [ ] Email replies can add client-visible ticket entries.
  * [ ] Internal notes should never be emailed to clients.
  * [ ] Redaction/private metadata rules must be enforced.

### 0.44.x - Advanced Ticket Relationships

* [ ] Add ticket linking.

  * [ ] Related tickets.
  * [ ] Duplicate tickets.
  * [ ] Parent/child tickets.
  * [ ] Blocked by / blocking.
  * [ ] Linked task.
  * [ ] Linked note.
  * [ ] Linked KB article.

* [ ] Add ticket-to-knowledge-base flow.

  * [ ] Create note from ticket.
  * [ ] Create KB draft from resolved ticket.
  * [ ] Link ticket to existing KB article.
  * [ ] Suggest KB articles from ticket text using search later.
  * [ ] Keep KB publishing separate from ticket replies.

### 0.45.x - Reporting and Analytics

* [ ] Add ticket reports.

  * [ ] Tickets created by period.
  * [ ] Tickets resolved by period.
  * [ ] Open ticket aging.
  * [ ] Average first response time.
  * [ ] Average resolution time.
  * [ ] Tickets by client.
  * [ ] Tickets by project.
  * [ ] Tickets by category.
  * [ ] Tickets by source.
  * [ ] Tickets by assignee.
  * [ ] Time tracked from tickets if Time Tracking is enabled.

* [ ] Add dashboard cards.

  * [ ] Open ticket count.
  * [ ] Urgent ticket count.
  * [ ] My assigned tickets.
  * [ ] Waiting on client.
  * [ ] Waiting on internal.
  * [ ] SLA risk later.

### 0.46.x - Multi-Channel Support and Webhooks

* [ ] Add webhook events for ticket integrations.

  * [ ] Ticket created.
  * [ ] Ticket updated.
  * [ ] Ticket assigned.
  * [ ] Ticket status changed.
  * [ ] Ticket client reply added.
  * [ ] Ticket resolved.
  * [ ] Ticket closed.

* [ ] Add webhook delivery safety.

  * [ ] Signing secret.
  * [ ] Retry policy.
  * [ ] Delivery logs.
  * [ ] Failure backoff.
  * [ ] Disable broken endpoints.
  * [ ] Per-workspace webhook permissions.

* [ ] Add future intake channels only after the ticket API and abuse controls are stable.

  * [ ] Static web forms.
  * [ ] WordPress.
  * [ ] Shopify.
  * [ ] Email.
  * [ ] Webhooks.
  * [ ] Other first-party or third-party modules.

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

## Prepare for Internationalization

- Add user locale preference
  - default to 'en' NOT NULL
- Add workspace locale preference
  - default to 'en' NOT NULL

- Make HTML lang dynamic
  - default to 'en'

- Begin adding translations to server-provided navigation

- Extract static page strings
  - Being using data-i18n attributes

- Translate runtime messages
  - rather than returning raw error.message text, it should be sending back something like:
  {
    code: "search.results_unavailable",
    message: t(locale, "errors.search.results_unavailable")
  }

- User data should never be touched in translations

### Phase 1

- Add locale:
  - storage
  - negotiation
  - translation loader
  - t() helper
  - browser window.LongtailForge.i18n

### Phase 2

- Translate:
  - Navigation
  - Footer
  - Search shell
  - Notification bell/panel
  - Common buttons: Save, Cancel, Delete, Clear, Search, Previous, Next
  - Status messages
  - Error messages

### Phase 3

- Module Manifest Labels
  - Update module contracts so manifests can provide keys, not only literal labels

### Phase 4

- Pages and Modules
  - First-part pages:
    - Login/public splash
    - Dashboard
    - Workbench
    - Search
    - Notifications
    - Tasks
    - Time tracking
    - Clients/Projects
    - Tags
    - Settings
    - Reporting
    - Audit Log
    - API Keys
    - User admin

### Phase 5

- Locale formatting
  - Dates
  - Times
  - Relative time
  - Durations
  - Numbers
  - Currency
  - Lists

## Version 0.4x.x - Localization Foundation

- Add framework-owned i18n service.
- Add locale preference to users.
- Add optional workspace default locale.
- Add locale to app-shell bootstrap.
- Add browser translation helper.
- Add English locale catalog.
- Convert app shell, footer, global search shell, notification shell, and common status/error strings to translation keys.
- Add manifest support for labelKey/descriptionKey or i18n keys.
- Add pseudo-locale regression coverage.
- Do not translate user-created content.

## Version 0.4x.x+1 - First Translation Extraction Pass

- Convert static protected/public HTML strings to data-i18n attributes.
- Convert shared browser JS strings to translation keys.
- Convert first-party module manifest labels/descriptions/actions to translation keys.
- Add Spanish, French, Portuguese, and Dutch catalogs.
- Add missing-key regression checks.

## At the end of 0.4x branch

- Add framework-owned HTTP route contract and adapter boundary so Longtail Forge routes are not permanently coupled to Express. Keep Express as the first adapter; preserve the option to add a Fastify adapter later.

# Long Term

## SaaS File Storage

- File storage on disk should be kept to an absolute minimum
- Users should be able to add their own storage integrations for files
- Users should have option to purchase file storage from LTF using DigitalOcean Spaces
  - This should be an automated process to spin up/spin down a storage space for them
    - Evaluate whether a volume should be attached to the server for them or if it makes more sense for each person to have their own "spaces" or if I should offer it in 250GB blocks to spread out Spaces usage

## Automation Engine Module

- Should be able to create rules for automations across the entire framework, first-party modules, and third-party plugins
- Framework, modules, and plugins should expose: 
  - Triggers
  - Actions
  - Metadata (for decisions)

### Conceptual Flow

Automation Engine should be a visual/simple way of creating rules and autoamtions within the LTF framework and all modules and plugins.

In the most basic terms, a rule should perform this: 
  - If {{trigger}} == true then perform {{action}}

### Examples of Triggers

- Note created in Project
- Sub-task created

### Examples of Actions

- 

## Home Assistant Tickets/Requests Integration

- Once Home Assistant integration has begun, create a plugin that:
  - Identifies when a device goes down
    - Length of time device is down
      - Length of time should be configurable by user in plugin settings
    - Opens a ticket/request for repair
      - Marks ticket as automated
      - Marks it as Home Assistant
      - Identifies the device

## Figure out "Family calendar" or "Family chore" or "Digital kanban board" configuration

- Ideally I'd like to be able to have a view-only user that can be used for display/kiosk use in all workspace contexts

- Would be able to display a month/week/day view

- Would be able to display either a chore list (for Family/Personal) or Group task list

- Possibly some sort of Kanban board for larger teams/groups in shared office settings

- All of this would be available to each user in the app too, already, but I'd like to figure out the permissions, access, and naming around what this would be for display/kiosk use

- It'd be super cool if it worked with an eInk display too (Special theme, maybe?)

## Shareable Templates

I'd love to have a system that allows templates to be shareable (think Steam workshop, but for projects, tasks, lists, etc.)

## Secrets and Credential Registry

- Start with metadata and external-vault references. 
- Do not store secret values in LTF until secure notes, 2FA/passkeys, account recovery, audit-safe redaction, encryption/key-management design, and backup/restore protections are mature.

## Estimation build out

- Build out of estimatation module
  - Estimate creation from existing time entries
    - Take similar, existing time entries (tagged entries?) and use that to create estimates
    - Not an AI estimate, but one that builds an estimate from existing data

## Employee hour tracking for Payroll/HR purposes

## Version 0.40.0 - CRM Foundation

- [ ] Add CRM as a first-party Business workspace module.
- [ ] CRM should extend Clients and Projects, not replace them.
- [ ] Add Contacts as proper records.
- [ ] Add contact methods and client/contact relationships.
- [ ] Add contact roles per client/project.
- [ ] Add CRM permissions.
- [ ] Register CRM records with tags, search, files, notes, tasks, and activity hooks.
- [ ] Add client/contact timeline views.
- [ ] Add manual interaction logging.
- [ ] Add follow-up task integration.
- [ ] Keep email/calendar sync out of the first CRM version.

## Version 0.40.1 - CRM Opportunities and Pipeline

- [ ] Add leads.
- [ ] Add opportunities/deals.
- [ ] Add configurable pipeline stages.
- [ ] Add estimated value, probability, expected close date, owner, and next action.
- [ ] Add won/lost status and reason fields.
- [ ] Allow won opportunities to become projects.
- [ ] Add basic pipeline dashboard.

## Browser Extensions

- Add products/items to list

- Create notes from highlight

## Parking Lot / Open Questions

- [ ] File viewer?

- [ ] Add hotkeys for menus/functions

- [ ] Should/can I build a password vault?

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
