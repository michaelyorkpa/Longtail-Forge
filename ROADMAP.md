# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.32.7 - Search Indexing and Rebuild Tools

### Questions and Design Decisions

- [x] Confirm that 0.32.7 stops at indexing, event synchronization, rebuild/repair tooling, and regression coverage; global search API routes and browser UI remain in 0.32.8.
  - Confirmed. 0.32.7 should populate and maintain the search index, add rebuild/repair tooling, and prove the indexing lifecycle with tests. Browser-facing search routes, global search UI, result pages, and public API search remain in 0.32.8.
- [x] Decide whether the first protected rebuild entry point should be admin-only HTTP, a local server script, or both.
  - Use both, but keep them scoped differently. Add a local maintenance script for app-wide rebuild/repair and emergency recovery. Add an admin-only protected server entry point for workspace/module rebuilds only. Do not expose app-wide rebuild through normal browser/admin UI yet.
- [x] Decide whether disabled-module records should remain in canonical `search_index` rows but be hidden by active module filters, or be removed during module disable and rebuilt on re-enable.
  - Keep disabled-module records in canonical search_index rows. Disabled modules should stop contributing active searchable types, so normal active search requests hide those records through module filters. Do not delete canonical search rows just because a module is disabled. Re-enabled modules should be eligible for rebuild/repair. Any future historical/admin search behavior should be explicit, permission-restricted, and not accidental.
- [x] Decide whether app-wide rebuilds are exposed only as local maintenance tooling at first, with workspace/module rebuilds as the first admin UI/API surface.
  - Confirmed. App-wide rebuilds should be local maintenance/super-admin tooling at first. The first protected admin surface should be workspace-scoped and module-scoped rebuilds, with active workspace context, module validation, audit logging, and summary counts.
- [x] Confirm that 0.32.7 does not add fuzzy search, synonyms, external search engines, or advanced relevance tuning.
  - Confirmed. 0.32.7 should keep indexing boring: canonical search_index writes, SQLite FTS synchronization/repair where available, indexed LIKE fallback, rebuild tooling, and regression coverage only. Fuzzy search, synonyms, external engines, and advanced relevance tuning remain future work.

### Version 0.32.7.1 - Indexing Service Write Methods

- [x] Add framework-owned search indexing write methods.
  - [x] Index one normalized search document.
  - [x] Remove one indexed record by workspace, module, record type, and record ID.
  - [x] Re-index one record by resolving the module-owned indexer and upserting the normalized document.
  - [x] Keep `search_index` as the canonical write target.
  - [x] Keep SQLite FTS synchronization adapter-owned.
- [x] Add predictable write semantics.
  - [x] Upserts should not duplicate `search_index` rows.
  - [x] Removed records should remove matching FTS rows when FTS5 is available.
  - [x] Empty or non-searchable module indexer results should remove stale index rows.
  - [x] Indexing failures should return structured errors that rebuild tooling can report.
- [x] Add focused regression coverage.
  - [x] Single-record upsert updates the canonical row.
  - [x] Single-record removal clears canonical and FTS rows.
  - [x] Re-indexing the same record is idempotent.
  - [x] FTS fallback behavior still works when FTS5 is unavailable.

### Version 0.32.7.2 - Initial Module Indexers

- [x] Add first module-owned indexers.
  - [x] Tasks.
  - [x] Time entries.
  - [x] Clients.
  - [x] Projects.
- [x] Keep module ownership clear.
  - [x] Module indexers should read their own records through module services/repositories.
  - [x] Module indexers should return normalized framework search documents.
  - [x] Module indexers should not write directly to `search_index` or FTS tables.
  - [x] Module indexers should map title, summary, body, tags text, client/project scope, visibility, record status, source label, and record timestamps consistently.
- [x] Preserve permission and lifecycle semantics.
  - [x] Archived/inactive records should receive a searchable `record_status` instead of inventing a new workflow state.
  - [x] Client/project scope should match the underlying record's real scope.
  - [x] Tag text may be denormalized for matching, while exact tag filtering remains canonical.
- [x] Add module indexer regressions.
  - [x] Each initial module can produce normalized documents.
  - [x] Missing optional fields fall back consistently.
  - [x] Archived/inactive/completed records map to expected search metadata.

### Version 0.32.7.3 - Event-Driven Index Synchronization

- [x] Connect indexing to existing framework/module events where stable.
  - [x] Index records on create.
  - [x] Update index records on update.
  - [x] Update or remove index records on archive/inactivate.
  - [x] Restore or re-index records on restore/reactivate where stable service flows exist.
  - [x] Remove stale index rows when records are hard-deleted by current module code.
- [x] Keep event wiring boring and traceable.
  - [x] Prefer service-owned indexing calls after successful record mutations.
  - [x] Do not index failed or rolled-back writes.
  - [x] Keep indexing side effects out of browser code.
  - [x] Log indexing failures clearly without hiding the primary record mutation result unless search consistency would be unsafe.
- [x] Handle module lifecycle.
  - [x] Disabled modules should not contribute active searchable types.
  - [x] Re-enabled modules should be eligible for rebuild.
  - [x] Historical disabled-module search behavior remains explicit, not accidental.
- [x] Add synchronization regressions.
  - [x] Create/update/archive/restore flows update the index for initial searchable modules.
  - [x] Module-disabled records do not appear through active search request targets.
  - [x] Failed indexing paths are observable in logs or structured results.

### Version 0.32.7.4 - Rebuild Service and Admin Tooling

- [x] Add safe server-side rebuild methods.
  - [x] Re-index all records for one module.
  - [x] Re-index all records for one workspace.
  - [x] Re-index all records for the app through local maintenance tooling if needed.
  - [x] Support dry-run or summary mode if practical.
  - [x] Return counts for scanned, indexed, skipped, removed, failed, and repaired records.
- [x] Add a protected rebuild entry point.
  - [x] Admin-only endpoint or script for module/workspace rebuilds.
  - [x] App-wide rebuild should be super-admin/local-maintenance only at first.
  - [x] Do not expose broad rebuild tools to normal users.
  - [x] Require active workspace context for workspace rebuilds.
  - [x] Validate module IDs against enabled/known modules before rebuild.
- [x] Log rebuild activity clearly.
  - [x] Audit who started protected rebuilds.
  - [x] Record workspace/module scope.
  - [x] Record rebuild counts and failure summaries.
  - [x] Avoid logging private record body content.
- [x] Add rebuild regressions.
  - [x] Workspace rebuild does not duplicate rows.
  - [x] Module rebuild stays scoped to the requested module.
  - [x] Unauthorized users cannot trigger rebuilds.
  - [x] Rebuild summaries report useful counts.

### Version 0.32.7.5 - FTS Rebuild and Repair

- [x] Add FTS rebuild support.
  - [x] Rebuild FTS rows from canonical `search_index`.
  - [x] Detect and repair missing FTS rows.
  - [x] Detect and remove orphaned FTS rows.
  - [x] Keep FTS rebuild logic inside the SQLite adapter boundary.
  - [x] Keep rebuild admin/tooling permission-restricted.
- [x] Preserve adapter fallback behavior.
  - [x] FTS repair should be skipped safely when FTS5 is unavailable.
  - [x] Indexed `LIKE` fallback should continue to use canonical `search_index`.
  - [x] FTS repair should not mutate permission, visibility, workspace, module, or lifecycle metadata.
- [x] Add FTS repair regressions.
  - [x] Missing FTS rows are recreated from canonical rows.
  - [x] Orphaned FTS rows are removed.
  - [x] Unsupported FTS5 builds report skipped repair instead of failing broad rebuilds.

### Version 0.32.7.6 - Tests, Documentation, and Release Closeout

- [x] Add end-to-end search indexing regressions.
  - [x] Initial searchable modules populate index rows.
  - [x] Search index rebuild does not duplicate records.
  - [x] Search results update after record edits.
  - [x] Search results hide disabled-module records through active search targets.
  - [x] Search indexing remains workspace-scoped.
  - [x] Permission-sensitive search filters still apply before results are returned.
- [x] Update documentation.
  - [x] Record 0.32.7 indexing/rebuild decisions in `DECISIONS.md`.
  - [x] Update architecture notes for indexer ownership, event synchronization, rebuild scope, and FTS repair.
  - [x] Update module development docs for implementing module-owned search indexers.
  - [x] Keep README cursory unless the current-state overview needs a one-line indexing note.
  - [x] Add 0.32.7 changes to `CHANGELOG.md` with date/time.
- [x] Update release bookkeeping when implementation is complete.
  - [x] Bump `package.json` and `package-lock.json` to the completed 0.32.7 sub-version.
  - [x] Verify `/api/app-info` reports the completed 0.32.7 sub-version.
  - [x] Move all but the most recently completed ROADMAP section to `ROADMAP-ARCHIVE.md`.
- [x] Run verification.
  - [x] Run focused search indexing/rebuild regressions.
  - [x] Run `npm run check`.
  - [x] Run `npm run test:permissions` because search indexing and rebuild tools are permission-sensitive.
  - [x] Run SQLite integrity check after rebuild tests.

## Version 0.32.8 - Search API and Global Search UI

* [ ] Add browser API search endpoint

  * [ ] `GET /api/search`
  * [ ] Support query text
  * [ ] Support module filter
  * [ ] Support record type filter
  * [ ] Support client filter
  * [ ] Support project filter
  * [ ] Support tag filter
  * [ ] Support pagination
  * [ ] Respect workspace and permissions

- [ ] Use the search service adapter from the API layer. 
  - [ ] API routes should not query SQLite FTS tables directly. 
  - [ ] API routes should call the framework search service. 
  - [ ] Search results must still be permission-filtered after full-text matching. 
  - [ ] FTS ranking can be basic at first.

* [ ] Add public API search endpoint only if safe

  * [ ] Consider `GET /api/v1/search`
  * [ ] Require API key scopes
  * [ ] Respect workspace and module permissions
  * [ ] Do not expose records from disabled modules unless explicitly allowed
  * [ ] This can be deferred if browser search is enough for now

* [ ] Add global search UI

  * [ ] Add simple search box to the authenticated app shell
    * [ ] Searchbox should have a selector drop-down to select record type based on hooked modules
  * [ ] Show grouped results by record type on new search page
  * [ ] Show record title
  * [ ] Show short summary/snippet
  * [ ] Show module/source label
  * [ ] Show client/project context where useful
  * [ ] Show tags where useful
  * [ ] Link search result to the registered record URL when available
  * [ ] Keep global search UI framework-owned

* [ ] Add search results page

  * [ ] Support filters
  * [ ] Support pagination
  * [ ] Support empty states
  * [ ] Support permission-safe result display
  * [ ] Avoid making dashboard search too complex

## Version 0.32.9 - Framework Integration Tests and Reporting Hooks

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

## Version 0.32.10 - File Storage and Attachment Framework Foundation

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

## Version 0.32.11 - File Upload, Download, Safety, and API

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

## Version 0.32.12 - File Attachment UI and Module Hooks

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

## Version 0.32.13 - Final Tweaks for 0.32.x branch

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

## Version 0.32.14 - Final 0.32.x review for modularization for first-party modules

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
