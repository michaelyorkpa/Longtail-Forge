# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.32.8 - Search API and Global Search UI

### Questions and Design Decisions

- [x] Confirm that 0.32.8 should expose browser-facing search without adding fuzzy search, synonyms, saved searches, external search engines, or advanced relevance tuning.
  - Proposed default: keep 0.32.8 focused on exact query/filter execution, basic adapter-provided ranking, result shaping, and global UI. Advanced search behavior remains future work.
  - Go with the proposed default.
- [x] Confirm whether the app-shell search box should submit to a full results page first, instead of adding typeahead/autocomplete in the first pass.
  - Proposed default: submit to `search.html` with query/filter parameters. Typeahead can follow after the permission-safe result contract is proven.
  - Header search submits to search.html; no typeahead yet.
- [x] Confirm the first global search placement in the authenticated shell.
  - Proposed default: add a compact search control to the shared authenticated header/top navigation where it is visible across module pages without crowding page-specific actions.
  - Place the compact search box in the authenticated shared header/top nav.
- [x] Decide whether public API search belongs in 0.32.8 or should be explicitly deferred.
  - Proposed default: defer `GET /api/v1/search` unless the browser API and permission tests finish cleanly before closeout. Browser search is the primary user workflow for this version.
  - Defer GET /api/v1/search from 0.32.8. No ifs.
- [x] Confirm result links should prefer module-registered record URLs/actions and fall back to a safe module page when a direct record URL is unavailable.
  - Proposed default: use the registered URL/action when available, and do not invent direct links that bypass module routing or permissions.
  - Use module-registered URLs/actions; fall back safely; never invent direct record links

### Version 0.32.8.1 - Browser Search API Contract

- [x] Add protected browser search endpoint.
  - [x] Add `GET /api/search`.
  - [x] Require an authenticated session and active workspace.
  - [x] Accept query text.
  - [x] Accept module filter.
  - [x] Accept record type filter.
  - [x] Accept client filter.
  - [x] Accept project filter.
  - [x] Accept exact tag filter.
  - [x] Accept pagination parameters.
  - [x] Return backend-neutral result metadata and paging metadata.
- [x] Keep API routing framework-owned.
  - [x] Route through the framework search service.
  - [x] Do not query SQLite FTS tables directly from routes.
  - [x] Keep SQLite FTS and indexed `LIKE` fallback hidden behind the adapter.
  - [x] Keep FTS ranking basic and adapter-provided for now.
- [x] Add focused API contract regressions.
  - [x] Authenticated users can search the active workspace.
  - [x] Unauthenticated requests are rejected.
  - [x] Invalid filters return structured validation errors.
  - [x] Pagination returns stable metadata.

### Version 0.32.8.2 - Permission-Safe Result Shaping

- [x] Apply permission and lifecycle filtering after full-text matching.
  - [x] Respect active workspace scope.
  - [x] Respect module read permissions from searchable type declarations.
  - [x] Hide disabled-module records from normal active search.
  - [x] Respect record visibility rules already modeled by the search service.
  - [x] Preserve canonical client/project/tag filters.
- [x] Normalize browser-facing result payloads.
  - [x] Include record ID, module ID, record type, title, summary/snippet, source label, status, score/rank when available, and updated timestamp.
  - [x] Include client/project context where available.
  - [x] Include tags where useful and permission-safe.
  - [x] Include registered record URL/action data when available.
  - [x] Avoid exposing private body text beyond the intended snippet/summary.
- [x] Add permission/filter regressions.
  - [x] Users without a module read permission do not receive matching records from that module.
  - [x] Disabled-module records stay hidden in active browser search.
  - [x] Client, project, and tag filters narrow results correctly.
  - [x] Result payloads do not expose fields outside the browser search contract.

### Version 0.32.8.3 - Authenticated Shell Search Entry

- [x] Add global search entry to the authenticated app shell.
  - [x] Add a compact search box to the shared authenticated header/top navigation.
  - [x] Add a selector for searchable record type or all record types based on active module declarations.
  - [x] Preserve normal page-specific actions and avoid crowding dense pages.
  - [x] Submit to the full search results page with URL query parameters.
- [x] Keep the shell control lightweight.
  - [x] Do not add typeahead/autocomplete in this pass.
  - [x] Do not make dashboard search more complex.
  - [x] Use existing shared browser JavaScript patterns with no build step.
  - [x] Keep the UI framework-owned and module-aware through registered searchable types.
- [x] Add browser-level smoke coverage where practical.
  - [x] Shell search appears on authenticated pages.
  - [x] Record-type options reflect active searchable types.
  - [x] Submitting a query navigates to the search page with expected parameters.

### Version 0.32.8.4 - Search Results Page

- [x] Add framework-owned global search results page.
  - [x] Add `search.html` and matching browser script/style hooks.
  - [x] Read query/filter/page parameters from the URL.
  - [x] Fetch results from `GET /api/search`.
  - [x] Show grouped results by record type or module where useful.
  - [x] Show title, short summary/snippet, source label, client/project context, tags, status, and updated timestamp.
  - [x] Link results to registered record URLs/actions when available.
- [x] Add results-page controls and states.
  - [x] Support query text editing.
  - [x] Support module and record type filters.
  - [x] Support client, project, and tag filters where available.
  - [x] Support pagination.
  - [x] Support loading, empty, error, and permission-safe display states.
  - [x] Keep mobile and desktop layouts scannable without card-in-card nesting.
- [x] Add page behavior regressions.
  - [x] Search page loads from URL parameters.
  - [x] Filter changes update results and URL state.
  - [x] Empty and no-permission results are clear without leaking hidden result counts.
  - [x] Result links route through registered module URLs/actions.

### Version 0.32.8.5 - Tests, Documentation, and Release Closeout

- [x] Add end-to-end search workflow regressions.
  - [x] Indexed Tasks, Time Entries, Clients, and Projects are discoverable through browser search.
  - [x] Search results update after indexed record edits.
  - [x] Pagination remains stable across repeated requests.
  - [x] Permission-sensitive filtering still applies before results are returned.
  - [x] The global search UI handles loading, empty, error, filtered, and paginated states.
- [x] Update documentation.
  - [x] Record 0.32.8 API/UI decisions in `DECISIONS.md`.
  - [x] Update architecture notes for browser search routing, result shaping, and adapter boundaries.
  - [x] Update module development docs for registered result URLs/actions if needed.
  - [x] Keep README cursory unless the current-state overview needs a one-line global search note.
  - [x] Add 0.32.8 changes to `CHANGELOG.md` with date/time.
- [x] Update release bookkeeping when implementation is complete.
  - [x] Bump `package.json` and `package-lock.json` to the completed 0.32.8 sub-version.
  - [x] Verify `/api/app-info` reports the completed 0.32.8 sub-version.
  - [x] Move all but the most recently completed ROADMAP section to `ROADMAP-ARCHIVE.md`.
- [x] Run verification.
  - [x] Run focused search API/UI regressions.
  - [x] Run `npm run check`.
  - [x] Run `npm run test:permissions` because search result access is permission-sensitive.
  - [x] Run SQLite integrity check after search workflow tests.

### Version 0.32.8.6 - Notifications and Search UI Clean up

- [x] Move notifications interface into a bell icon; Retain all other functionality
  - [x] Move bell icon to end of navigation (right of "Settings")
  - [x] Header width can be wider if necessary

- [x] Move search into openable magnifier icon
  - [x] This icon should be placed just before "Dashboard"
  - [x] Icon simply opens downward a small search text input box and the type filter drop down

### Version 0.32.9 - Help Page Framework and UI

Decision:
Help Center is framework-owned, not a normal disable-able first-party workflow module.

Implementation shape:
- Add a framework-owned Help Center page/surface.
- Add a validated module manifest contribution for help/docs.
- Index help articles as searchable records.
- Add "Help" as a global search type/source filter.
- Allow first-party and future third-party modules to contribute docs through manifest metadata.
- Keep user-authored Knowledge Base separate as a first-party module.

### Help Center / Documentation Search Decision

- [ ] Confirm Help Center ownership.
  - Proposed default: Help Center UI, routes, search integration, and docs contribution validation are framework-owned. Help is not a normal disable-able workflow module.

- [ ] Add module-declared help/documentation contributions.
  - Proposed default: modules may declare help sections/articles through the manifest. The framework validates these declarations and exposes them in the Help Center.

- [ ] Add Help as a searchable result type/source.
  - Proposed default: index framework and module help articles into `search_index` with `record_type = help_article`, `source = Help`, module ownership metadata, and permission/module visibility filters.

- [ ] Keep product Help separate from user-authored Knowledge Base.
  - Proposed default: Help Center documents how to use Longtail Forge and installed modules. The future Knowledge Base module stores workspace-authored operational knowledge.

## Version 0.32.10 - Framework Integration Tests and Reporting Hooks

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

## Version 0.32.10.2

* [ ] Add tag filters to reporting where useful

  * [ ] Filter time reports by direct time-entry tags
  * [ ] Filter task lists/reports by direct task tags
  * [ ] Consider client/project tag filters as optional context filters
  * [ ] Do not automatically treat client/project tags as tags on child records unless explicitly selected

* [ ] Add search-aware reporting helpers

  * [ ] Allow reports to link to filtered search results where useful
  * [ ] Allow dashboard sections to link to search results where useful
  * [ ] Keep reporting calculations based on real records, not the search index

* [ ] Add notification-aware dashboard helpers

  * [ ] App shell can show unread notification count
  * [ ] Dashboard can eventually show user-specific notification summaries
  * [ ] Notification summaries should respect permissions
  * [ ] Notification summaries should not expose raw audit JSON
  * [ ] Do not build full activity feed here unless already stable

* [ ] Add saved filter groundwork if useful

  * [ ] This does not need full saved views yet
  * [ ] Leave room for future saved views in the project-management expansion
  * [ ] Search filters and report filters should use compatible naming where practical

* [ ] Add regression tests

  * [ ] Tags cannot cross workspace boundaries
  * [ ] Tags cannot be assigned to records the user cannot access
  * [ ] Search does not return records the user cannot access
  * [ ] Search does not return disabled-module records unless historical access allows it
  * [ ] Search results update after record edits
  * [ ] Search index rebuild does not duplicate records
  * [ ] Reporting tag filters return expected records
  * [ ] Notifications cannot cross workspace boundaries
  * [ ] Notifications are only visible to intended recipients
  * [ ] Notifications do not expose records the user cannot access
  * [ ] Disabled modules do not create new notifications

## Version 0.32.11 - File Storage and Attachment Framework Foundation

- [ ] Add framework-owned file storage foundation.
  - [ ] File handling should be a shared framework service, not separately implemented by Tasks, Tickets, Notes, Knowledge Base, Creator Studio, or future modules.
  - [ ] Individual modules should attach files through a registered file attachment contract.
  - [ ] The framework owns file metadata, storage location, scan/quarantine status, download routing, deletion rules, audit events, and storage adapters.
  - [ ] Modules own the meaning of the attachment in their own record context.

- [ ] Add `files` table for stored file metadata.
  - [ ] `file_id`
  - [ ] `workspace_id`
  - [ ] `storage_provider`
  - [ ] `storage_key`
  - [ ] `original_filename`
  - [ ] `stored_filename`
  - [ ] `display_name`
  - [ ] `extension`
  - [ ] `mime_type_claimed`
  - [ ] `mime_type_detected`
  - [ ] `file_size_bytes`
  - [ ] `sha256_hash`
  - [ ] `status`
  - [ ] `scan_status`
  - [ ] `quarantine_reason`
  - [ ] `uploaded_by_user_id`
  - [ ] `created_at`
  - [ ] `updated_at`
  - [ ] `deleted_at`
  - [ ] `metadata_json`

- [ ] Add `file_attachments` table to link files to module records.
  - [ ] `file_attachment_id`
  - [ ] `workspace_id`
  - [ ] `file_id`
  - [ ] `module_id`
  - [ ] `target_type`
  - [ ] `target_id`
  - [ ] `client_id` optional
  - [ ] `project_id` optional
  - [ ] `attachment_role`
  - [ ] `caption`
  - [ ] `sort_order`
  - [ ] `attached_by_user_id`
  - [ ] `created_at`
  - [ ] `removed_at`

- [ ] Add file statuses.
  - [ ] `pending`
  - [ ] `available`
  - [ ] `quarantined`
  - [ ] `deleted`

- [ ] Add scan statuses.
  - [ ] `not_required`
  - [ ] `pending`
  - [ ] `passed`
  - [ ] `failed`
  - [ ] `error`

- [ ] Add file attachment indexes.
  - [ ] Workspace + file ID.
  - [ ] Workspace + module ID.
  - [ ] Workspace + target type + target ID.
  - [ ] Workspace + client ID.
  - [ ] Workspace + project ID.
  - [ ] Workspace + status.
  - [ ] Workspace + hash.
  - [ ] Prevent duplicate active attachment of the same file to the same target where practical.

- [ ] Add module-declared attachable type contract.
  - [ ] Modules declare which record types can accept files.
  - [ ] Attachable declarations should include:
    - [ ] `targetType`
    - [ ] `moduleId`
    - [ ] `idField`
    - [ ] `labelField`
    - [ ] `workspaceField`
    - [ ] `clientField` if applicable
    - [ ] `projectField` if applicable
    - [ ] required read/download permission
    - [ ] required upload/attach permission
    - [ ] allowed file categories
    - [ ] max files per record if applicable
    - [ ] max file size override if applicable
  - [ ] Framework should not maintain a permanent hard-coded list of attachable target types.

- [ ] Add storage adapter contract.
  - [ ] Start with protected local filesystem storage outside the webroot.
  - [ ] Store files in workspace-safe protected directories.
  - [ ] Never trust user-provided filenames for stored paths.
  - [ ] Generate server-side filenames/storage keys.
  - [ ] Keep original filename only as metadata.
  - [ ] Leave room for future adapters:
    - [ ] Local protected filesystem.
    - [ ] OneDrive.
    - [ ] Google Drive.
    - [ ] Dropbox.
    - [ ] AWS S3.
    - [ ] DigitalOcean Spaces/CDN.
    - [ ] Other S3-compatible storage.
  - [ ] Storage providers should use the same file metadata and permission layer.

- [ ] Add core file permissions.
  - [ ] `files.view`
  - [ ] `files.upload`
  - [ ] `files.download`
  - [ ] `files.delete`
  - [ ] `files.manage_quarantine`
  - [ ] `files.manage_workspace_settings`

## Version 0.32.12 - File Upload, Download, Safety, and API

- [ ] Add secure upload handling.
  - [ ] Allowlist file extensions by business need.
  - [ ] Validate actual file type/signature; do not trust browser-provided MIME type alone.
  - [ ] Generate server-side filenames/storage keys.
  - [ ] Enforce file size limits.
  - [ ] Store uploaded files outside the webroot or in isolated object storage.
  - [ ] Require authentication and authorization before upload.
  - [ ] Validate target module and target record before accepting an attachment.
  - [ ] Validate target record belongs to active workspace.
  - [ ] Validate user can attach files to the target record.
  - [ ] Block uploads to disabled modules unless explicitly allowed.
  - [ ] Log upload attempts, successful uploads, rejected uploads, deletion, quarantine, and scan events.

- [ ] Add upload quarantine workflow.
  - [ ] New files enter `pending` or `pending/scanning` state where applicable.
  - [ ] Files are not publicly accessible until cleared.
  - [ ] Failed or suspicious files are quarantined.
  - [ ] Quarantined files are not shown in normal app UI.
  - [ ] Admin access to quarantined files is tightly restricted and audited.
  - [ ] Do not build a DIY CSAM review gallery.
  - [ ] Do not require normal admins to manually inspect suspected CSAM.

- [ ] Add antivirus/safety scanning hooks.
  - [ ] Add scanner adapter contract.
  - [ ] Allow local installs to start with a no-op scanner only when uploads are limited to trusted/admin users.
  - [ ] Leave room for ClamAV or similar antivirus scanning.
  - [ ] Leave room for external scanning/sandboxing providers.
  - [ ] Store scan result metadata without exposing sensitive details to normal users.

- [ ] Add CSAM prevention planning before broad public/user-generated uploads.
  - [ ] Do not enable public image/video uploads until a specialized detection/reporting plan exists.
  - [ ] Evaluate specialized CSAM detection providers such as Thorn Safer, PhotoDNA access, or an equivalent.
  - [ ] Add known-CSAM hash matching where available.
  - [ ] Add policy for suspected novel CSAM escalation.
  - [ ] Add written NCMEC CyberTipline reporting procedure.
  - [ ] Add retention/preservation policy reviewed by legal counsel.
  - [ ] Do not make normal workspace admins responsible for reviewing suspected CSAM.

- [ ] Add secure download handling.
  - [ ] Do not expose protected files through direct static URLs.
  - [ ] All protected downloads go through an authenticated app route.
  - [ ] Validate file belongs to active workspace.
  - [ ] Validate the file is attached to a record the user can access.
  - [ ] Validate the target module is enabled.
  - [ ] Validate file status is available and scan status permits download.
  - [ ] Return safe content headers.
  - [ ] Use attachment disposition for risky file types.
  - [ ] Consider short-lived signed download tokens later, but keep first implementation simple and server-checked.
  - [ ] Log download events where appropriate.

- [ ] Add abuse reporting for uploaded files.
  - [ ] Users can report illegal, abusive, or inappropriate uploaded content.
  - [ ] Reports create security/audit events.
  - [ ] Reports can hide or disable public access to the file while reviewed.
  - [ ] Reports should not expose quarantined files to normal admins.

- [ ] Add browser API routes for files.
  - [ ] `POST /api/files`
  - [ ] `GET /api/files/:fileId`
  - [ ] `GET /api/files/:fileId/download`
  - [ ] `POST /api/files/:fileId/delete`
  - [ ] `GET /api/files/attachments`
  - [ ] `POST /api/files/attachments`
  - [ ] `POST /api/files/attachments/:fileAttachmentId/remove`
  - [ ] `POST /api/files/:fileId/report`
  - [ ] Admin-only quarantine routes if needed.

- [ ] Add audit logging for file events.
  - [ ] File uploaded.
  - [ ] File attached to target.
  - [ ] File downloaded where appropriate.
  - [ ] File removed from target.
  - [ ] File deleted.
  - [ ] File quarantined.
  - [ ] File scan failed.
  - [ ] File reported.
  - [ ] File restored from quarantine if that is ever allowed.

## Version 0.32.13 - File Attachment UI and Module Hooks

- [ ] Add reusable file attachment UI helper.
  - [ ] File picker/upload component.
  - [ ] Attachment list component.
  - [ ] Download button/link component.
  - [ ] Remove attachment action.
  - [ ] File status display.
  - [ ] Quarantine/pending status handling.
  - [ ] Empty state.
  - [ ] Error state.
  - [ ] Permission-aware controls.

- [ ] Add initial Files/Attachments module surface.
  - [ ] Add optional first-party Files area for browsing workspace files if useful.
  - [ ] Keep the first version simple.
  - [ ] Do not turn the Files area into a full document-management system yet.
  - [ ] Allow users to find files by module, target record, client, project, filename, and status where permissions allow.
  - [ ] Keep actual record-specific attachment management inside the owning module screens.

- [ ] Add file hooks for planned modules.
  - [ ] Tasks should be able to attach files later.
  - [ ] Support tickets should be able to attach files when built.
  - [ ] Notes should be able to attach files when built.
  - [ ] Knowledge Base entries should be able to attach public-safe files when built.
  - [ ] Creator Studio should be able to use files as assets/media when built.
  - [ ] Projects and clients may support attachments later if useful.

- [ ] Add public-safe file groundwork.
  - [ ] Protected internal files are the default.
  - [ ] Public/client-visible files require explicit visibility fields and permission checks.
  - [ ] Public-safe attachments are required before public KB/client portal features.
  - [ ] Do not use tags as the source of truth for public/private file access.

- [ ] Add regression tests.
  - [ ] Files cannot cross workspace boundaries.
  - [ ] Users cannot upload to records they cannot access.
  - [ ] Users cannot download files attached to records they cannot access.
  - [ ] Disabled modules cannot receive new file attachments.
  - [ ] Quarantined files do not appear in normal attachment lists.
  - [ ] Quarantined files cannot be downloaded by normal users.
  - [ ] File paths cannot escape approved storage directories.
  - [ ] Original filenames cannot overwrite server files.
  - [ ] File metadata remains after attachment removal unless the file itself is deleted.

## Version 0.32.14 - Final Tweaks for 0.32.x branch

### General UI Fixes/Tweaks

- UI size standardization
  - This needs to be worked into a view helper/screen creator update. All of these screens should have the same standard width and easily navigable layout
  - Many UI pieces are still different sizes. For now, I'm targeting desktop use and I need this to all be standard sizes, with the ability to easily tweak for mobile down the road. The following are the pages that don't conform to the Dashboard/Workspace width:
    - [ ] Projects -> Tasks
    - [ ] Projects -> Projects Settings
    - [ ] Settings -> Workspace -> Workspace Settings
    - [ ] Settings -> Workspace -> Clients
    - [ ] Settings -> Workspace -> Tags
    - [ ] Settings -> Workspace -> User Admin
    - [ ] Settings -> Workspace -> Modules -> Tasks Settings
    - [ ] Settings -> Workspace -> Modules -> Time Tracking Settings
    - [ ] Settings -> Workspace -> API Keys
    - [ ] Settings -> User Settings

- [ ] If a client filter is selected on Projects in a business workspace, there's no need to have the client name in Parenthesis behind the project name. This goes for all places in business workspaces list {{projectName}} ({{clientName}})

- Reporting -> Time Reports -> "Reporting Scope"
  - Doesn't properly nest child clients
  - Doesn't have parent client properly total child client records
  - Reporting by project is incorrect if there's a parent/child relationship
    - Children and parents both factor into the total (instead of being one or the other)
  - Children aren't properly nested under parents in reporting

### Admin/User Settings

- [ ] Need a way for properly authenticated users to see active/running timers
  - [ ] Appropriate admins should be able to stop/pause timers with explicit warning

- [ ] Add Workspace level date format display settings

- [ ] Add Workspace level time format display settings

- [ ] Add user level setting for timezone display "Local Timezone or UTC"

- [ ] Add Workspace option to set default screen when switching into that workspace, per user.
  - Current behavior keeps it on Time Tracker, for example, but perhaps a user would always want to default to the dashboard. So, make the starting page selectable and provide a "Stay on Current Workspace's page" option as well (so when a new workspace opens it remains in the time tracker, or tasks, or whatever)

### Notification Fixes/Tweaks

- [ ] Move notifications to a Bell icon, to the right of "Settings" menu
  - On mobile, this can be in mobile hamburger menu, but will need to apply the notifications number alert to the hamburger menu

- [ ] Create Notification grouping options
  - [ ] Notifications in Business workspaces should be grouped by Client
  - [ ] Notifications in Personal/Family workspaces should be grouped by Project

## Version 0.32.15 - Final 0.32.x Review for modularization for first-party modules and Addition of initial Help Pages for Existing modules

- Perform a thorough check to ensure all current and existing modules are properly isolated and related data is owned by the appropriate module (there should be no timer tables in the Tasks module, for example)
- Ensure proper isolation of core/framework from first-party modules

## Version 0.33.0 - Support Tickets Framework Contract

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

## Version 0.33.1 - Ticket Browser API and Services

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

## Version 0.33.2 - Ticket UI MVP

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

## Version 0.33.3 - Ticket Integration Hooks

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

## Version 0.33.4 - Client Ticket Portal MVP

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

## Version 0.33.5 - Ticket Public API Groundwork

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

## Version 0.33.6 - Ticket Regression, Polish, and Closeout

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

## Version 0.34.0 - Notes Module Foundation 

- [ ] Add Notes as a first-party module. 
  - [ ] Notes are dynamic working records. 
  - [ ] Notes may be workspace-level, client-level, project-level, task-linked, ticket-linked, or user-linked. 
  - [ ] Notes should support internal visibility first. 
  - [ ] Notes should support markdown or wiki-style linking. 
  - [ ] Notes should support tags once tagging is stable. 
  - [ ] Notes should be searchable once search is stable. 
  - [ ] Notes should support file attachments once the file framework is stable. 
  - [ ] Notes should have persistent revision/changelog support. 
  - [ ] Note visibility and edit access should respect roles and permissions. 
  - [ ] Do not make tags the source of truth for public/private access. 
  
## Version 0.34.1 - Knowledge Base Module Foundation 

- [ ] Add Knowledge Base as a separate first-party module/concept. 
  - [ ] Knowledge Base is a publishing and curation layer, not just "notes with public enabled." 
  - [ ] KB entries may be created from notes, linked to notes, or written directly. 
  - [ ] KB entries should support static/published pages. 
  - [ ] KB entries should have explicit visibility fields. 
  - [ ] KB entries should support draft/review/published/archived states. 
  - [ ] KB entries should support internal-only, workspace-visible, client-visible, and public-visible modes later. 
  - [ ] KB entries should support tags, search, attachments, and revision history. 
  - [ ] Public/client-visible KB behavior should wait until permissions and public-safe file handling are stable. 

- [ ] Define relationship between Notes and Knowledge Base. 
  - [ ] Notes can be source material for KB entries. 
  - [ ] KB entries can link back to source notes. 
  - [ ] Updating a note should not automatically publish a KB change. 
  - [ ] Publishing should be explicit. 
  - [ ] KB should not automatically publish tasks, tickets, or notes without review. 
  - [ ] Public KB pages should not expose internal comments, audit data, private attachments, or hidden source notes.

## Version 0.35.0 - Calendars and Calendar Views

- [ ] Calendars
  - [ ] Year view
  - [ ] Month view
  - [ ] Week view
  - [ ] Day view
  - [ ] Filters for client (business workspace only)/project

- [ ] Calendar Events
  - [ ] Display iCal events from shared calendars

## Version 0.36.0 - Dashboard and Workbench Formalization as Project hub and work center

- [ ] Dashboard should become the hub for managing projects
  - [ ] Add "Past Due/Due Soon" section that shows past due and upcoming tasks sorted by client and project
  - [ ] Add "Latest Updates" section
    - [ ] Newest clients
    - [ ] Newest projects
    - [ ] Newest tasks
    - [ ] Newest notes
    - [ ] Newest support tickets
    - [ ] Recent time entries if useful
- [ ] Add activity feed support (can be built onto notifications hooks)
  - [ ] Activity feed may be derived from audit events where appropriate
  - [ ] Activity feed should not expose sensitive audit JSON by default
  - [ ] Activity feed should be user-friendly and dashboard-focused
  - [ ] Keep audit log as the authoritative admin/security record
- [ ] Dashboard sections should respect permissions
  - [ ] Users should only see clients/projects/tasks/notes/tickets they are allowed to see
  - [ ] External client users should not see internal-only notes or admin-only audit details

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
  - [ ] Database dump
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

### Version 0.39.0 - Shopping / Procurement Lists Module

- [ ] Treat this as an official first-party module. 
  - [ ] The module should ship with Longtail Forge. 
  - [ ] It should be enable/disable capable per workspace. 
  - [ ] Personal/family workspaces should label it as "Shopping Lists." 
  - [ ] Business workspaces should label it as "Procurement Lists." 
  - [ ] The underlying module ID should remain stable regardless of label. 
  - [ ] Suggested module ID: `lists` or `procurement-lists`; prefer `lists` if it will cover personal/family shopping use cases cleanly.

- [ ] Add optional first-party lists module for personal/family and business workspaces.
- [ ] Use workspace-aware labels:
  - [ ] Personal/family workspaces: "Shopping Lists"
  - [ ] Business workspaces: "Procurement Lists"
- [ ] Core list fields:
  - [ ] `list_id`
  - [ ] `workspace_id`
  - [ ] `client_id` optional
  - [ ] `project_id` optional
  - [ ] `title`
  - [ ] `description`
  - [ ] `list_type`
  - [ ] `status`
  - [ ] `created_by_user_id`
  - [ ] `created_at`
  - [ ] `updated_at`
- [ ] List item fields:
  - [ ] Item name.
  - [ ] Quantity.
  - [ ] Unit.
  - [ ] Needed by date.
  - [ ] Vendor/store.
  - [ ] URL.
  - [ ] Estimated cost.
  - [ ] Actual cost.
  - [ ] Purchase/order status.
  - [ ] Notes.
  - [ ] Assigned user.
  - [ ] Sort order.
  - [ ] Checked/completed state.
- [ ] Business use cases:
  - [ ] Project parts list.
  - [ ] R&D purchasing list.
  - [ ] Office supply list.
  - [ ] Client/project procurement checklist.
- [ ] Personal/family use cases:
  - [ ] Grocery list.
  - [ ] Household shopping list.
  - [ ] Trip packing/shopping list.
  - [ ] Family project supply list.
- [ ] Integrations:
  - [ ] Lists should support tags once tagging is stable.
  - [ ] Lists should be searchable once framework search is stable.
  - [ ] List activity should be able to appear in dashboard/activity feed later.

### Version 0.39.1 - Creator Studio / Content Studio Module

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

## Version 0.71.0

- [ ] Buy domain name
  - [ ] Launch website

- [ ] Launch Social Media
