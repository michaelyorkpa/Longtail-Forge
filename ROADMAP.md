# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.32.5.4 - Notification UI Fixes

This section should fix the first-pass notification UI regressions and make notification preferences usable from the framework-owned notification surfaces. Keep notification UI framework-owned; modules declare event types and target metadata, but should not render separate inboxes, bells, or duplicate preference screens.

### Pass 1 - Notification dropdown display and dismissal fixes

- [x] Reduce the work item title size in the notification dropdown.
  - [x] Keep the title readable, but scale it like a compact dropdown row title instead of a page/card heading.
  - [x] Preserve visible target context such as client/project or project-only labels where already available.
  - [x] Verify long titles wrap or truncate cleanly without stretching the dropdown.
- [x] Fix dropdown dismiss behavior.
  - [x] Dismissing a notification from the dropdown should remove it from the visible dropdown list immediately after a successful save.
  - [x] Dismissing the last visible notification should update the empty state.
  - [x] Dismissal should update the unread/count indicator consistently.
  - [x] Failed dismiss requests should leave the notification visible and show a useful status message.
- [x] Fix dropdown-to-inbox consistency.
  - [x] "See all notifications" should show the same active notification that appears in the dropdown when it has not been dismissed or archived.
  - [x] The dropdown and full notification inbox should use compatible status filters for unread/read/dismissed visibility.
  - [x] Verify the notification that currently will not clear appears in the full inbox before dismissal and disappears or moves state after dismissal.

### Pass 2 - Notification preferences in both notification surfaces

- [x] Add notification preference controls to the full Notifications screen.
  - [x] Show preferences in a dedicated section or tab on `notifications.html`.
  - [x] Group preferences by module.
  - [x] Render checkbox controls for each configurable notification event type.
  - [x] Keep labels user-readable while storing preferences by stable event type IDs.
  - [x] Respect workspace-level notification defaults when deciding whether a user can enable or mute an event.
- [x] Add the same user notification preferences to User Settings.
  - [x] Reuse the same framework-owned preference data and rendering contract as the Notifications screen.
  - [x] Avoid creating a second preference model in User Settings.
  - [x] Keep notification preferences separate from module enablement/settings controls.
- [x] Save preference changes through the framework notification preference API.
  - [x] Save per-user, per-workspace, per-event preferences.
  - [x] Refresh visible preference state after save.
  - [x] Show success and error status messages.
  - [x] Audit preference changes where the existing notification decisions require it.

### Pass 3 - Per-work-item notification follow hooks

- [x] Design a framework-owned per-target notification subscription contract.
  - [x] Let an individual user follow a specific work item and receive notifications for that target even when their broader preferences would otherwise be muted.
  - [x] Keep subscriptions scoped to one workspace, one user, one module, one target type, and one target ID.
  - [x] Keep module ownership limited to declaring followable target types and relevant event types.
  - [x] Ensure target access is checked before a user can follow or receive notifications for that target.
- [x] Add follow/unfollow hooks for task/work-item surfaces.
  - [x] A user should be able to turn on notifications for a specific task or work item.
  - [x] Example flow: one user creates a task, assigns it to someone else, then follows that task so they receive update notifications.
  - [x] Following a work item should apply only to the user who turned it on.
  - [x] Unfollowing should stop that user's per-target override without changing workspace defaults or other users' preferences.
- [x] Decide whether this pass needs a new database table before implementation.
  - [x] Consider a `notification_subscriptions` or similarly named framework table.
  - [x] Store workspace, user, module, target type, target ID, status, created/updated timestamps, and optional event-type filtering.
  - [x] Add indexes for workspace/user and workspace/target lookup.
  - [x] Preserve future room for email/push delivery without implementing those channels here.

### Pass 4 - Regression and verification

- [x] Add regression coverage for dropdown dismissal.
  - [x] Dismiss removes the notification from the dropdown after success.
  - [x] Dismiss updates unread/count state.
  - [x] Failed dismiss keeps the notification visible.
- [x] Add regression coverage for dropdown/full-inbox consistency.
  - [x] A visible dropdown notification is present in the full inbox under the appropriate active filter.
  - [x] Read/dismissed status handling is consistent between both surfaces.
- [x] Add regression coverage for user notification preferences.
  - [x] Preferences render grouped by module.
  - [x] Preference changes save per workspace/user/event type.
  - [x] User Settings and the Notifications screen read/write the same preference source.
- [x] Add regression coverage for per-target subscriptions if implemented in this version.
  - [x] Only the subscribing user receives the override.
  - [x] Target permission checks are enforced before follow and before delivery.
  - [x] Unfollow removes the override without mutating broader preferences.

## Version 0.32.5.5 - Tags Fixes

- [ ] Make tagging feel more like WordPress tags: users should be able to type, select, create, and assign tags without leaving the record they are editing.
  - [x] Treat the existing Tags page as the bulk/admin cleanup surface, not the required first stop for everyday tagging.
  - [x] Keep tags as shared workspace tag records with assignment rows; do not store comma-separated tag text directly on tasks, time entries, clients, or projects.
  - [x] Keep record modules integrated through the shared browser tag helper and generic tag services.

### Pass 1 - Shared Inline Tag Entry Control

- [x] Upgrade the shared tag picker into a WordPress-like token entry control.
  - [x] Let users type tag names directly into the field.
  - [x] Show matching existing workspace tags while the user types.
  - [x] Add selected tags as removable chips/tokens.
  - [x] Support Enter, comma, and selection from the suggestion list.
  - [x] Prevent duplicate chips for the same tag.
  - [x] Preserve keyboard navigation and screen-reader labels.
- [x] Support inline tag creation through the shared helper.
  - [x] If the typed value does not match an existing tag, offer to create it inline.
  - [x] Normalize tag names the same way the Tags page does.
  - [x] Reuse existing tags when the normalized name/slug already exists.
  - [x] Create the tag record before assigning it to the target record.
  - [x] Surface validation errors without losing the user's selected tags.

### Pass 2 - Record Workflow Integration

- [x] Add inline tag creation to task add/edit workflows.
  - [x] Users can create and assign tags from the task dialog.
  - [x] Existing task tag loading, saving, and filtering continue to work.
- [x] Add inline tag creation to time entry workflows.
  - [x] Users can create and assign tags from stopwatch save/finalize flows where tags are editable.
  - [x] Users can create and assign tags from manual/add/edit time entry dialogs.
  - [x] Time entry reporting filters continue to match direct time-entry tags only.
- [x] Add inline tag creation to client/project workflows where tag editing already appears.
  - [x] Client/project tags remain context metadata.
  - [x] Client/project tags are not copied automatically onto child tasks or time entries.
- [x] Keep read-only/history surfaces display-only.
  - [x] Tag lists render normally on non-editing views.
  - [x] Inline creation is only available in explicit add/edit contexts.

### Pass 3 - Tags Management Page Improvements

- [x] Keep the Tags page useful for workspace-level tag cleanup.
  - [x] Show tag search/filtering prominently.
  - [x] Show enough metadata to distinguish similar tags.
  - [x] Show usage counts if the service can provide them without expensive page loads.
  - [x] Make duplicate-name and normalized-slug conflicts obvious.
- [x] Keep advanced cleanup out of the inline picker.
  - [x] Renaming, disabling, deleting, merging, or auditing tags should stay on the Tags page.
  - [x] Inline record workflows should focus on fast create/select/assign behavior.

### Pass 4 - Permissions, Module State, and Regression Coverage

- [x] Enforce tag permissions consistently.
  - [x] Users with assignment permission can assign existing tags where the target record permits tagging.
  - [x] Users without tag definition management permission cannot create new tags inline.
  - [x] Users without assignment permission cannot add or remove record tags inline.
  - [x] Permission failures show clear inline feedback.
- [x] Respect the disableable first-party Tags module.
  - [x] When the Tags module is disabled, inline tag creation and assignment controls are hidden or disabled.
  - [x] Existing tag displays remain stable where historical/read-only display is allowed.
  - [x] Tag APIs remain blocked through the existing service-level guards.
- [x] Add regression checks for the WordPress-like tag workflow.
  - [x] Creating a new tag inline creates one workspace tag definition and assigns it to the record.
  - [x] Selecting an existing suggestion assigns the existing tag without creating a duplicate.
  - [x] Enter and comma tokenization work without submitting the surrounding form unexpectedly.
  - [x] Removing a chip removes only that record assignment.
  - [x] Module-disabled and permission-denied states block creation/assignment.

### Version 0.32.5.5.1 - Add update type to notifications, Fix all notifications screen

### Pass 1 - Restore the Full Notifications Page

- [x] Reproduce the blank `notifications.html` behavior against the running app.
  - [x] Confirm whether the page script is loading and running.
  - [x] Confirm whether `/api/notifications` is returning records for the active user.
  - [x] Confirm whether browser console/API errors are preventing rendering.
- [x] Fix the page wiring so the full notification inbox renders again.
  - [x] Ensure the initial Active filter loads notifications by default.
  - [x] Ensure empty states only show when the API returns an empty result.
  - [x] Ensure preference loading failures do not prevent the notification list from rendering.
  - [x] Ensure missing optional helpers fail gracefully instead of stopping the page script.
- [x] Fix filter interaction on `notifications.html`.
  - [x] Active, Unread, Read, and Dismissed buttons should visibly update `aria-pressed`.
  - [x] Each filter should reload `/api/notifications` with the correct status.
  - [x] The list should refresh after filter changes.
  - [x] The module/source filter should continue to filter the currently loaded status set.
- [x] Preserve existing notification actions.
  - [x] Mark Read should still update the selected notification and refresh the list.
  - [x] Mark All Read should still refresh counts and the current filter.
  - [x] Dismiss should still move notifications out of Active and into Dismissed.

### Pass 2 - Add Plain-English Update Type Labels

- [x] Add a notification update type display contract.
  - [x] Prefer a stable API-decorated field such as `displayType` or `updateTypeLabel`.
  - [x] Keep raw `event_type` available for preferences, APIs, tests, and debugging.
  - [x] Use module/event declarations where available instead of hardcoding labels only in the browser.
- [x] Define first task notification labels.
  - [x] `task.created` should display as "Task Created".
  - [x] `task.updated` should display a more specific label when metadata identifies the changed field.
  - [x] Description changes should display as "Description Added", "Description Updated", or similar plain English wording based on available metadata.
  - [x] Status, priority, assignment, due date, recurrence, and reminder changes should have readable labels when metadata can identify them.
  - [x] Unknown task updates should fall back to "Task Updated".
- [x] Render the update type prominently in notification UI.
  - [x] Full notifications page rows should show the plain-English update type.
  - [x] Notification bell/dropdown rows should show the same plain-English update type.
  - [x] The label should be distinct from unread/read/dismissed status.
  - [x] Existing target title/context behavior should remain intact.
- [x] Keep labels consistent across notification surfaces.
  - [x] Full page, dropdown, and API responses should agree on the same label.
  - [x] Labels should remain readable if the target record is no longer accessible.
  - [x] Labels should not expose private target details when target access is denied.

### Pass 3 - Regression and Documentation Closeout

- [x] Add regression coverage for the restored full notifications page.
  - [x] Protected `notifications.html` includes the required list, filter, status, and script hooks.
  - [x] Page script initializes the list even if preferences fail.
  - [x] Filter buttons update pressed state and reload the API with the selected status.
  - [x] Active/read/unread/dismissed API filters still return the expected records.
- [x] Add regression coverage for update type labels.
  - [x] Created task notifications expose and render "Task Created".
  - [x] Updated task notifications expose and render a field-specific plain-English label when metadata supports it.
  - [x] Unknown update metadata falls back to "Task Updated".
  - [x] Dropdown and full-page rendering use the same label source.
- [x] Update release bookkeeping.
  - [x] Record the 0.32.5.5.1 decisions in `DECISIONS.md`.
  - [x] Add 0.32.5.5.1 changes to `CHANGELOG.md` with date/time.
  - [x] Bump `package.json` and `package-lock.json` to `0.32.5.5.1`.
  - [x] Verify `/api/app-info` reports `0.32.5.5.1`.
- [x] Run verification.
  - [x] Run focused notification regressions.
  - [x] Run `npm run check`.
  - [x] Run `npm run test:permissions` if permission-sensitive notification paths change.

## Version 0.32.6 - Search Framework Contract

* [ ] Add framework-owned search service

  * [ ] Search should be a framework service, not a feature owned by Tasks, Notes, Tickets, Messaging, or Time Tracking
  * [ ] Search should be permission-aware
  * [ ] Search should be workspace-aware
  * [ ] Search should be module-aware
  * [ ] Search should be tag-aware
  * [ ] Search should be notification-aware only where notification records themselves are searchable later

* [ ] Add search backend adapter contract

  * [ ] Start with a simple database-backed adapter
  * [ ] Leave room for SQLite FTS5
  * [ ] Leave room for PostgreSQL full-text search
  * [ ] Leave room for external search engines later
  * [ ] Do not require Elasticsearch/OpenSearch at this stage

- [ ] Add SQLite FTS5 as the first real full-text backend where available. 
  - [ ] Detect whether the active SQLite build supports FTS5. 
  - [ ] Add a safe fallback to indexed `LIKE` search if FTS5 is unavailable. 
  - [ ] Prefer FTS5 for local/self-hosted SQLite installs before considering external search services. 
  - [ ] Keep the search service behind an adapter so PostgreSQL full-text search can be added later. 
  - [ ] Do not require Elasticsearch/OpenSearch at this stage. 
- [ ] Add `search_index` as the canonical framework search metadata table. 
  - [ ] Keep permission, workspace, module, client, project, status, and visibility metadata in normal tables. 
  - [ ] Use the normal `search_index` table as the source of truth for what records are searchable. 
  - [ ] Use FTS5 virtual tables only as the full-text lookup engine. 
  - [ ] Do not use FTS5 as the source of truth for permissions or record visibility. 
- [ ] Add SQLite FTS5 virtual table/migration if supported. 
  - [ ] Index searchable text fields such as title, summary, body, tags text, and module/source label. 
  - [ ] Store enough reference fields to map FTS results back to `search_index`. 
  - [ ] Keep FTS rows synchronized when `search_index` records are created, updated, removed, or rebuilt. 
  - [ ] Add rebuild tooling that can regenerate FTS rows from `search_index`. 
  - [ ] Add tests for FTS availability and fallback behavior.

* [ ] Add initial `search_index` table

  * [ ] `search_index_id`
  * [ ] `workspace_id`
  * [ ] `module_id`
  * [ ] `record_type`
  * [ ] `record_id`
  * [ ] `title`
  * [ ] `summary`
  * [ ] `body`
  * [ ] `tags_text`
  * [ ] `client_id`
  * [ ] `project_id`
  * [ ] `visibility`
  * [ ] `record_status`
  * [ ] `source`
  * [ ] `record_created_at`
  * [ ] `record_updated_at`
  * [ ] `indexed_at`

* [ ] Add indexes for basic search/filtering

  * [ ] Workspace + record type
  * [ ] Workspace + module ID
  * [ ] Workspace + client ID
  * [ ] Workspace + project ID
  * [ ] Workspace + record status
  * [ ] Workspace + indexed timestamp
  * [ ] Basic title/body lookup appropriate for current SQLite approach

* [ ] Add module-declared searchable type contract

  * [ ] Modules should declare which record types are searchable
  * [ ] Searchable type declarations should include:

    * `recordType`
    * `moduleId`
    * `idField`
    * `titleField`
    * `summaryField`
    * `bodyFields`
    * `workspaceField`
    * `clientField` if applicable
    * `projectField` if applicable
    * required read permission
    * indexer function/reference
  * [ ] Framework should not maintain a permanent hard-coded list of searchable record types

## Version 0.32.7 - Search Indexing and Rebuild Tools

* [ ] Add search indexing methods

  * [ ] Index one record
  * [ ] Remove one record from index
  * [ ] Re-index one record
  * [ ] Re-index all records for one module
  * [ ] Re-index all records for one workspace
  * [ ] Re-index all records for the app if needed

* [ ] Connect search indexing to framework events

  * [ ] Index records on create
  * [ ] Update index records on update
  * [ ] Update or remove index records on archive
  * [ ] Restore index records on restore
  * [ ] Remove index records when a module is disabled if historical search should be hidden
  * [ ] Rebuild index records when a module is re-enabled

* [ ] Add initial searchable records

  * [ ] Tasks
  * [ ] Time entries
  * [ ] Clients
  * [ ] Projects

* [ ] Add search rebuild admin/tooling path

  * [ ] Add safe server-side method to rebuild search index
  * [ ] Add admin-only endpoint or script for rebuilding search index
  * [ ] Do not expose broad rebuild tools to normal users
  * [ ] Log rebuild activity clearly

- [ ] Add FTS rebuild support. 
  - [ ] Rebuild FTS rows from `search_index`. 
  - [ ] Detect and repair missing FTS rows. 
  - [ ] Detect and remove orphaned FTS rows. 
  - [ ] Keep rebuild admin/tooling permission-restricted.

* [ ] Keep search indexing boring at first

  * [ ] No external search engine yet
  * [ ] No fuzzy search yet
  * [ ] No synonyms yet
  * [ ] No advanced relevance tuning yet
  * [ ] Build the contract first so the backend can improve later

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
  * [ ] Show grouped results by record type
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

## Version 0.33.0 - Support Tickets

- [ ] Support tickets
  - [ ] Consult with existing support ticket solutions for best path here
  - [ ] Tickets should be assignable to clients and projects in Business workspaces
  - [ ] Tickets should support internal notes
  - [ ] Tickets should support external/client-visible responses later
  - [ ] Ticket visibility and edit access should respect the roles/permissions system
  - [ ] Support tickets become requests in Personal/Family workspaces

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
