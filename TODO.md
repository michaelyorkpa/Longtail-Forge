# Longtail Forge TODO

This file is a scratchpad for loose notes, quick fixes, and ideas that have **not yet been promoted into `ROADMAP.md`**.

The versioned implementation plan lives in `ROADMAP.md`. Once an item is assigned to a version there, remove it from this file so the two documents do not drift apart.

# Notes for Maintaining This File

- Use this file for rough ideas before they are ready for the versioned roadmap.
- Keep implementation-ready work in `ROADMAP.md`, grouped by version.
- When promoting a TODO item into `ROADMAP.md`, remove it from this file.
- Avoid duplicating full feature specs here once they are already represented in the roadmap.

# Short Term

## Mobile Tweaks - Fill this section out after the above section standardizes the modal display

- Projects -> Tasks
  - Get rid of "Task Details" heading (mobile & desktop)
    - It's right aligned and isn't necessary
  - Meta data should each get its own line on mobile (keep line spacing tight)
  - Task name doesn't wrap and gets cut off
    - Should truncate after a character limit

- Projects -> Notes
  - On mobile, everything stacks neatly, but the collections selector and notes list makes it tough to find the actual content
    - On desktop, make the collections box and notes list right aligned and put the content viewpane on the left
    - On mobile, hide the content viewpane unless content is loaded

## Views/Lists/Queries/etc.

- Audit the code sometime before the start of the Knowledge Base to ensure all front end/UI/views and lists/queries are owned by the proper modules and not hard-coded anywhere; I want total seperation of duties

## Administration/Settings

- Many modules aren't exposing admin/settings properly
  - Perform an audit and figure out what settings are missing and how to get them where they need to be

## Theme

- Make dark mode prettier (manual color adjustments)

- Create dark mode automation based on timezone and sunrise/sunset

## Client/Projects Fixes/Tweaks

- Review whether the User Settings "Remove Workspace" flow needs clearer wording now that it removes the signed-in user's membership rather than deleting the workspace record.

## Near Term Ideas

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

## "What are you trying to do right now?"

- Dashboard opens with all of the overview stuff has the QAC utility rail, and, somewhere, presents the question:
  "What do you want to do right now?"
  Which is answered with one of the following work/focus modes in Workbench:

  - Focus modes:
    - Start my day
    - Pick up where I left off
    - Show what's due next
    - Work this week
    - Review blocked work
    - Focus on a project
    - Focus on a client

## Project Updates

- [ ] Add project types
  - Short Term/Defined End
  - Phase (Larger/Longer)
  - On-Going (Social Media Management/On-going Support)

- [ ] Add project completion
  - Only for short and medium term projects
  - [ ] Status bar / Percentage completed for projects
    - [ ] Totals from tasks within 

## Version 0.32.10.1 - TypeScript Contract Checking Foundation

This version should introduce TypeScript as a framework contract-checking tool without forcing a full rewrite or changing runtime behavior. Longtail Forge should remain a Node/ESM app, but shared framework contracts should begin moving toward typed definitions so future modules, files, tickets, notes, public API routes, search results, and plugin-style extension points have safer shapes.

### Questions and Design Decisions

- [x] Confirm that TypeScript is introduced incrementally, not as a full immediate rewrite.
  - Add TypeScript as a dev-time type checker first, allow existing JavaScript to continue running, and convert files only where the contract benefit is clear.

- [x] Confirm that `npm run start` should not run TypeScript compilation or type checking.
  - Keep runtime startup fast and predictable. Type checking belongs in `npm run typecheck`, `npm run check`, CI, and Codex verification, not normal app boot.

- [x] Decide whether the first TypeScript pass should use JS checking with JSDoc, `.d.ts` contract files, or selective `.ts` conversion.
  - Start with `allowJs`, `checkJs` in a controlled/limited scope, shared `.d.ts` or `.ts` contract files, and selective conversion of framework contract modules only.

- [x] Confirm that TypeScript should protect framework/module contracts before browser UI conversion.
  - Type backend and shared framework contracts first. Browser scripts can remain JavaScript until the backend contracts stabilize.

### Version 0.32.10.1.1 - TypeScript Tooling Setup

- [ ] Add TypeScript dev dependency.
- [ ] Add `tsconfig.json`.
  - [ ] Use Node/ESM-compatible compiler settings.
  - [ ] Enable `allowJs` so existing JavaScript can stay in place.
  - [ ] Start with strictness settings that reveal useful contract issues without blocking the whole project immediately.
  - [ ] Use `noEmit` for the first pass so TypeScript checks code without producing runtime files.
- [ ] Add package scripts.
  - [ ] `npm run typecheck`
  - [ ] Do not change `npm run start`.
  - [ ] Decide whether `npm run check` runs `npm run typecheck` immediately or after the first cleanup pass.
- [ ] Add TypeScript ignores/exclusions for runtime data, generated files, archives, and vendor/build output.

### Version 0.32.10.1.2 - Framework Contract Types

- [ ] Add shared framework type definitions for module contracts.
  - [ ] Module manifest.
  - [ ] Module routes.
  - [ ] Protected/public views.
  - [ ] Browser assets.
  - [ ] Navigation contributions.
  - [ ] Settings contributions.
  - [ ] Permission descriptors.
  - [ ] API scope descriptors.
  - [ ] Event descriptors.
  - [ ] Notification descriptors.
  - [ ] Taggable type descriptors.
  - [ ] Searchable type descriptors.
  - [ ] Workbench contributions.
  - [ ] Timer source contributions.
- [ ] Add shared search contract types.
  - [ ] Search request shape.
  - [ ] Search filters.
  - [ ] Search result shape.
  - [ ] Search document/indexer shape.
  - [ ] Search adapter capability shape.
  - [ ] Rebuild/repair summary shape.
- [ ] Add shared API response helpers/types where useful.
  - [ ] Standard success response.
  - [ ] Standard error response.
  - [ ] Pagination metadata.
  - [ ] Permission-denied response shape.

### Version 0.32.10.1.3 - Selective Type Checking of High-Value Files

- [ ] Add `// @ts-check` and JSDoc typing to selected framework files first.
  - [ ] Module registry and manifest validation.
  - [ ] Search service and search adapter boundary.
  - [ ] Notification service contracts.
  - [ ] Tag service contracts.
  - [ ] Settings/app-shell bootstrap payloads.
- [ ] Avoid broad UI conversion in this version unless a file is already being touched for contract cleanup.
- [ ] Avoid converting every route file in one pass.

### Version 0.32.10.1.4 - Codex and Regression Workflow

- [ ] Update `AGENTS.md` or development docs.
  - [ ] Codex should run `npm run typecheck` when changing framework contracts, module manifests, search, tags, notifications, files, permissions, public API routes, or shared API payloads.
  - [ ] Codex should not silence type errors with broad `any` unless the roadmap explicitly allows it.
  - [ ] New framework contracts should include type definitions or JSDoc-backed shapes.
- [ ] Add focused regression coverage where type contract changes expose existing weak spots.
- [ ] Document the difference between runtime validation and TypeScript checking.
  - [ ] TypeScript helps developers catch wrong shapes before runtime.
  - [ ] API input, database rows, uploaded files, module manifests, and user data still require runtime validation.

### Version 0.32.10.1.5 - Release Closeout

- [ ] Update documentation.
  - [ ] Add TypeScript migration notes to architecture/module development docs.
  - [ ] Note that TypeScript is dev-time checking only in this version.
- [ ] Update changelog.
- [ ] Run verification.
  - [ ] `npm run typecheck`
  - [ ] `npm run check`
  - [ ] `npm run test:permissions`

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
