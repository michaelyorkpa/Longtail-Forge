# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.32.9 - Help Page Framework and UI

Decision:
Help Center is framework-owned, not a normal disable-able first-party workflow module. Modules provide their own help pages through validated manifest contributions. Help pages are their own record type and are searchable separately from user-authored Knowledge Base content.

Implementation shape:
- Add a framework-owned Help Center page/surface.
- Add a validated module manifest contribution for help/docs.
- Index help articles as searchable records.
- Add "Help" as a global search type/source filter.
- Allow first-party and future third-party modules to contribute docs through manifest metadata.
- Keep user-authored Knowledge Base separate as a first-party module.
- Help Center link belongs in the Settings menu between User and Log Out.

### Help Center / Documentation Search Decisions

- [x] Confirm Help Center ownership.
  - Help Center UI, routes, search integration, and docs contribution validation are framework-owned. Help is not a normal disable-able workflow module.
- [x] Add module-declared help/documentation contributions.
  - Modules may declare help sections/articles through the manifest. The framework validates these declarations and exposes them in the Help Center.
- [x] Add Help as a searchable result type/source.
  - Index framework and module help articles into `search_index` with `record_type = help_article`, `source = Help`, module ownership metadata, and permission/module visibility filters.
- [x] Keep product Help separate from user-authored Knowledge Base.
  - Help Center documents how to use Longtail Forge and installed modules. The future Knowledge Base module stores workspace-authored operational knowledge.
- [x] Confirm first navigation placement.
  - Add the Help Center link to the Settings menu between User and Log Out.

### Version 0.32.9.1 - Help Contribution Contract

- [x] Add framework-owned help contribution validation.
  - [x] Extend module manifest validation with an optional `help` contribution block.
  - [x] Support module-declared help sections.
  - [x] Support module-declared help articles/pages.
  - [x] Require stable article IDs or slugs.
  - [x] Require title, summary/description, and body/content source.
  - [x] Support optional ordering, category/section, audience, tags, and related article metadata.
  - [x] Support framework-owned help articles without pretending they belong to a disable-able module.
  - [x] Reject invalid, duplicate, or unsafe article declarations with structured startup/validation errors.
- [x] Keep ownership boundaries clear.
  - [x] Framework owns Help Center routes, rendering shell, contribution validation, indexing, and search exposure.
  - [x] Modules own the content of their own help pages.
  - [x] Disabling a module hides its normal active module help from the Help Center and active Help search unless later historical/admin behavior explicitly needs otherwise.
  - [x] Do not create Knowledge Base tables, authoring workflows, or user-authored article editing in 0.32.9.
- [x] Add focused contract regressions.
  - [x] Valid help contributions are accepted from first-party module manifests.
  - [x] Invalid help declarations fail predictably.
  - [x] Duplicate article IDs/slugs are rejected.
  - [x] Disabled-module help is excluded from active Help Center discovery.

### Version 0.32.9.2 - Framework-Owned Help Center Surface

- [x] Add protected Help Center page and route.
  - [x] Add a framework-owned protected `help.html` view.
  - [x] Add matching browser script and CSS hooks using existing plain browser JavaScript patterns.
  - [x] Add a protected API endpoint for Help Center content discovery.
  - [x] Return framework and active-module help sections/articles in a browser-safe shape.
  - [x] Support article detail loading by stable ID/slug.
  - [x] Support category/section navigation.
  - [x] Support loading, empty, error, and no-visible-content states.
- [x] Add Help Center navigation.
  - [x] Add Help to the Settings menu between User and Log Out.
  - [x] Keep Help visible as a framework surface even though normal workflow modules can be disabled.
  - [x] Preserve existing Settings menu behavior and responsive navigation.
- [x] Add page behavior regressions.
  - [x] Authenticated users can open the Help Center.
  - [x] The Settings menu shows Help between User and Log Out.
  - [x] Framework help appears even when optional modules are disabled.
  - [x] Module help appears only for active/visible modules.
  - [x] Article navigation loads the expected content without a full app reload where practical.

### Version 0.32.9.3 - Help Search Indexing and Filters

- [x] Add Help as a first-class searchable record type/source.
  - [x] Use `record_type = help_article`.
  - [x] Use `source = Help`.
  - [x] Include framework/module ownership metadata.
  - [x] Include section/category metadata where useful.
  - [x] Include permission and module visibility metadata for active Help search.
  - [x] Keep help body indexing body-safe for browser snippets.
- [x] Add framework-owned help indexing.
  - [x] Index framework help articles.
  - [x] Index active module-declared help articles.
  - [x] Rebuild Help search rows through the existing search rebuild/repair boundary.
  - [x] Remove stale Help rows when declarations change or modules are disabled.
  - [x] Keep SQLite FTS/fallback behavior adapter-owned.
- [x] Integrate Help into global search UI.
  - [x] Add Help to the search type/source filter.
  - [x] Allow Help results to route to the Help Center article view.
  - [x] Keep Help results separate from future Knowledge Base results.
  - [x] Do not add typeahead/autocomplete in this pass.
- [x] Add search regressions.
  - [x] Framework Help articles are discoverable through `GET /api/search`.
  - [x] Module Help articles are discoverable only when their module is active/visible.
  - [x] The Help filter returns only Help articles.
  - [x] Help result links route to Help Center article URLs/actions.
  - [x] Knowledge Base is not conflated with Help search metadata.

### Version 0.32.9.4 - Initial Framework Help Articles

- [x] Create baseline framework-owned help pages and identify them as framework help.
  - [x] Getting Started.
  - [x] Workspaces and Workspace Switching.
  - [x] Users, Roles, and Permissions.
  - [x] Clients and Projects.
  - [x] Time Tracking Basics.
  - [x] Tasks Basics.
  - [x] Notifications.
  - [x] Tags.
  - [x] Search.
  - [x] Settings and User Preferences.
  - [x] Modules and Optional Features.
- [x] Keep initial content intentionally basic.
  - [x] Cover current app behavior, not future roadmap promises.
  - [x] Prefer short, task-oriented pages over long docs dumps.
  - [x] Mark framework-owned pages with a framework source/owner label.
  - [x] Keep module-specific pages ready to move into module declarations when those modules provide richer docs.
  - [x] Avoid replacing developer docs in `docs/` or detailed roadmap history.
- [x] Add content regressions.
  - [x] Framework-owned help pages are returned by Help Center APIs.
  - [x] Framework-owned help pages are indexed as Help articles.
  - [x] Framework source/owner metadata appears in Help Center and search results.
  - [x] Basic article links and headings are valid.

### Version 0.32.9.5 - Documentation, Tests, and Release Closeout

- [x] Add end-to-end Help Center workflow regressions.
  - [x] Help Center route and API require authentication.
  - [x] Help Center lists framework and active-module help articles.
  - [x] Disabled-module help stays hidden from normal Help Center and active Help search.
  - [x] Help article pages are searchable separately from other record types.
  - [x] Global search Help filter returns Help articles with safe snippets and Help Center links.
  - [x] Settings menu placement remains stable.
- [x] Update documentation.
  - [x] Record 0.32.9 Help Center decisions in `DECISIONS.md`.
  - [x] Update architecture notes for framework-owned Help Center routing, content contribution validation, and search indexing.
  - [x] Update module development docs for manifest-declared help pages.
  - [x] Keep README cursory unless the current-state overview needs a one-line Help Center note.
  - [x] Add 0.32.9 changes to `CHANGELOG.md` with date/time.
- [x] Update release bookkeeping when implementation is complete.
  - [x] Bump `package.json` and `package-lock.json` to the completed 0.32.9 sub-version.
  - [x] Verify `/api/app-info` reports the completed 0.32.9 sub-version.
  - [x] Move all but the most recently completed ROADMAP section to `ROADMAP-ARCHIVE.md`.
- [x] Run verification.
  - [x] Run focused Help Center API/UI/search regressions.
  - [x] Run `npm run check`.
  - [x] Run `npm run test:permissions` because Help search and module visibility are permission-sensitive.
  - [x] Run SQLite integrity check after Help indexing workflow tests.

## Version 0.32.9.6 - Interim Tweaks for 0.32.x branch

### General UI Fixes/Tweaks

- UI size standardization
  - This needs to be worked into a view helper/screen creator update. All of these screens should have the same standard width and easily navigable layout
  - Many UI pieces are still different sizes. For now, I'm targeting desktop use and I need this to all be standard sizes, with the ability to easily tweak for mobile down the road. The following are the pages that don't conform to the Dashboard/Workspace width:
    - [x] Projects -> Tasks
    - [x] Projects -> Projects Settings
    - [x] Settings -> Workspace -> Workspace Settings
    - [x] Settings -> Workspace -> Clients
    - [x] Settings -> Workspace -> Tags
    - [x] Settings -> Workspace -> User Admin
    - [x] Settings -> Workspace -> Modules -> Tasks Settings
    - [x] Settings -> Workspace -> Modules -> Time Tracking Settings
    - [x] Settings -> Workspace -> API Keys
    - [x] Settings -> User Settings
    - [x] Settings -> Help

- [x] If a client filter is selected on Projects in a business workspace, there's no need to have the client name in Parenthesis behind the project name. This goes for all places in business workspaces list {{projectName}} ({{clientName}})

- Reporting -> Time Reports -> "Reporting Scope"
  - [x] Doesn't properly nest child clients
  - [x] Doesn't have parent client properly total child client records
  - [x] Reporting by project is incorrect if there's a parent/child relationship
    - [x] Children and parents both factor into the total (instead of being one or the other)
  - [x] Children aren't properly nested under parents in reporting

### Search Fixes

- [x] It doesn't appear everything has been indexed yet
  - When I search "Longtail Forge" only one time record shows up. It doesn't show the: 
    - [x] project
    - [x] previous time entries
    - [x] or anything else
  - How does indexing happen? Is it a manual process? Or is it continually updating?
    - [x] How do we automate it?

## Version 0.32.10 - File Framework Contract, Storage Model, and Module Hooks

Decision:
File handling is a framework-owned service. First-party and future modules declare attachable record types and use framework APIs, lifecycle events, and shared UI helpers instead of implementing their own storage, metadata, scan, quarantine, download, or deletion logic.

Implementation shape:
- Build the durable file framework first: metadata schema, attachment schema, storage adapter contract, attachable manifest validation, core permissions, and lifecycle event names.
- Keep Tasks, Support Tickets, Notes, Knowledge Base, Creator Studio, Projects, Clients, and future modules on the same attachable-record contract.
- Leave upload/download UI and broad module integration for later passes so the foundation can be verified before user-facing workflows depend on it.

- [ ] Add framework-owned file storage foundation.
  - [ ] File handling is a shared framework service, not separately implemented by Tasks, Tickets, Notes, Knowledge Base, Creator Studio, or future modules.
  - [ ] Individual modules attach files through a registered file attachment contract.
  - [ ] The framework owns file metadata, storage location, scan/quarantine status, download routing, deletion rules, audit events, lifecycle events, and storage adapters.
  - [ ] Modules own the meaning of the attachment in their own record context.
  - [ ] Framework code must not hard-code permanent lists of attachable module record types.

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
  - [ ] `visibility`
  - [ ] `attachment_role`
  - [ ] `caption`
  - [ ] `sort_order`
  - [ ] `attached_by_user_id`
  - [ ] `created_at`
  - [ ] `removed_at`
  - [ ] `metadata_json`

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
  - [ ] Modules declare attachable record types in their manifest.
  - [ ] Attachable declarations include:
    - [ ] `targetType`
    - [ ] `moduleId`
    - [ ] `idField`
    - [ ] `labelField`
    - [ ] `workspaceField`
    - [ ] `clientField` if applicable
    - [ ] `projectField` if applicable
    - [ ] required read/download permission
    - [ ] required upload/attach permission
    - [ ] required delete/remove permission if different from upload
    - [ ] allowed file categories
    - [ ] allowed visibility values
    - [ ] max files per record if applicable
    - [ ] max file size override if applicable
    - [ ] lifecycle hook subscriptions if the module needs attachment events
  - [ ] Validate duplicate target types, unsafe field declarations, unknown permissions, disabled-module behavior, and invalid hook names at startup.
  - [ ] Expose active attachable targets through the module registry for framework routes, UI helpers, search, audit, and later public API work.

- [ ] Add storage adapter contract.
  - [ ] Start with protected local filesystem storage outside the webroot.
  - [ ] Store files in workspace-safe protected directories.
  - [ ] Never trust user-provided filenames for stored paths.
  - [ ] Generate server-side filenames/storage keys.
  - [ ] Keep original filename only as metadata.
  - [ ] Support adapter methods for save, read stream, metadata, delete/soft-delete, quarantine move if needed, and health/capability checks.
  - [ ] Leave room for future adapters:
    - [ ] Local protected filesystem.
    - [ ] OneDrive.
    - [ ] Google Drive.
    - [ ] Dropbox.
    - [ ] AWS S3.
    - [ ] DigitalOcean Spaces/CDN.
    - [ ] Other S3-compatible storage.
  - [ ] Storage providers use the same file metadata, permission, event, and audit layer.

- [ ] Add core file permissions.
  - [ ] `files.view`
  - [ ] `files.upload`
  - [ ] `files.download`
  - [ ] `files.delete`
  - [ ] `files.manage_quarantine`
  - [ ] `files.manage_workspace_settings`

- [ ] Add framework file lifecycle events.
  - [ ] Define canonical event names for `file.upload.requested`, `file.upload.accepted`, `file.upload.rejected`, `file.scan.pending`, `file.scan.passed`, `file.scan.failed`, `file.quarantined`, `file.available`, `file.downloaded`, `file.reported`, `file.deleted`, `file.attachment.created`, and `file.attachment.removed`.
  - [ ] Event payloads include workspace ID, file ID, attachment ID when applicable, module ID, target type, target ID, actor user ID, status, scan status, and safe reason metadata.
  - [ ] Event payloads do not include raw file contents, unsafe path details, secrets, or sensitive scanner details.
  - [ ] Modules may subscribe to file lifecycle events through the same first-party module hook/event pattern used elsewhere.

- [ ] Add focused contract regressions.
  - [ ] Manifest-declared attachable targets are accepted for valid first-party modules.
  - [ ] Invalid attachable declarations fail predictably.
  - [ ] Storage keys cannot escape approved storage directories.
  - [ ] Framework routes/services resolve attachable targets through the registry, not hard-coded module lists.
  - [ ] File lifecycle events are emitted with safe payloads.

## Version 0.32.11 - File Upload, Download, Safety, Browser API, and Event Emission

Implementation shape:
- Build the secure service and API workflow on top of the 0.32.10 contract.
- Make upload, attach, scan/quarantine, download, delete/remove, report, audit, and event emission work as one framework-owned lifecycle.
- Keep first module screen integration mostly deferred to 0.32.12, except for service-level test targets needed to prove the contract works.

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
  - [ ] Block uploads to disabled modules unless explicitly allowed by a later historical-read rule.
  - [ ] Emit upload accepted/rejected lifecycle events.
  - [ ] Log upload attempts, successful uploads, rejected uploads, deletion, quarantine, and scan events.

- [ ] Add upload quarantine workflow.
  - [ ] New files enter `pending` or `pending/scanning` state where applicable.
  - [ ] Files are not publicly accessible until cleared.
  - [ ] Failed or suspicious files are quarantined.
  - [ ] Quarantined files are not shown in normal app UI.
  - [ ] Admin access to quarantined files is tightly restricted and audited.
  - [ ] Quarantine status changes emit file lifecycle events for audit, notifications, and future admin tooling.
  - [ ] Do not build a DIY CSAM review gallery.
  - [ ] Do not require normal admins to manually inspect suspected CSAM.

- [ ] Add antivirus/safety scanning hooks.
  - [ ] Add scanner adapter contract.
  - [ ] Allow local installs to start with a no-op scanner only when uploads are limited to trusted/admin users.
  - [ ] Leave room for ClamAV or similar antivirus scanning.
  - [ ] Leave room for external scanning/sandboxing providers.
  - [ ] Store scan result metadata without exposing sensitive details to normal users.
  - [ ] Emit scan pending, passed, failed, and error events with safe metadata.

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
  - [ ] Emit and audit download events where appropriate.

- [ ] Add abuse reporting for uploaded files.
  - [ ] Users can report illegal, abusive, or inappropriate uploaded content.
  - [ ] Reports create security/audit events and file lifecycle events.
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

- [ ] Add API and lifecycle regressions.
  - [ ] Files cannot cross workspace boundaries.
  - [ ] Users cannot upload to records they cannot access.
  - [ ] Users cannot download files attached to records they cannot access.
  - [ ] Disabled modules cannot receive new file attachments.
  - [ ] Quarantined files do not appear in normal attachment lists.
  - [ ] Quarantined files cannot be downloaded by normal users.
  - [ ] Original filenames cannot overwrite server files.
  - [ ] File metadata remains after attachment removal unless the file itself is deleted.
  - [ ] Upload, attach, scan, quarantine, download, report, remove, and delete paths emit safe lifecycle events.

## Version 0.32.12 - File Attachment UI, Files Surface, and First Module Integrations

Implementation shape:
- Add the reusable browser helper and minimal Files/Attachments workspace surface.
- Integrate files into the first real module screens through manifest-declared attachable targets and framework hooks.
- Keep record-specific meaning, placement, and labels owned by the module screen, while upload/list/download/remove mechanics stay framework-owned.

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
  - [ ] Event hooks for upload started/completed/failed, attachment added/removed, status changed, and list refreshed.
  - [ ] Browser helper accepts module ID, target type, target ID, optional client/project context, accepted categories, and display options rather than hard-coding module behavior.

- [ ] Add initial Files/Attachments module surface.
  - [ ] Add optional first-party Files area for browsing workspace files if useful.
  - [ ] Keep the first version simple.
  - [ ] Do not turn the Files area into a full document-management system yet.
  - [ ] Allow users to find files by module, target record, client, project, filename, and status where permissions allow.
  - [ ] Keep actual record-specific attachment management inside the owning module screens.
  - [ ] Show safe file event/activity summaries when useful without replacing audit logs.

- [ ] Add first module attachment integrations.
  - [ ] Tasks attach files through the shared framework helper and task manifest declaration.
  - [ ] Projects and clients may support attachments if useful for immediate project-management workflows.
  - [ ] Time entries remain out of the first attachment UI unless a concrete use case is identified.
  - [ ] Support Tickets should be ready to consume the same attachment contract in 0.33.x.
  - [ ] Notes should be able to attach files when built.
  - [ ] Knowledge Base entries should be able to attach public-safe files when built.
  - [ ] Creator Studio should be able to use files as assets/media when built.

- [ ] Add module-facing hooks.
  - [ ] Modules can refresh local record views after attachment add/remove events.
  - [ ] Modules can request attachment counts for list rows without duplicating file queries.
  - [ ] Modules can add attachment summary metadata to search/help/activity surfaces through existing framework contracts where appropriate.
  - [ ] Modules can opt into notification/event reactions without owning file security checks.

- [ ] Add public-safe file groundwork.
  - [ ] Protected internal files are the default.
  - [ ] Public/client-visible files require explicit visibility fields and permission checks.
  - [ ] Public-safe attachments are required before public KB/client portal features.
  - [ ] Do not use tags as the source of truth for public/private file access.

- [ ] Add UI and integration regressions.
  - [ ] Shared helper renders upload, list, pending, quarantine, empty, error, download, and remove states.
  - [ ] Permission-restricted users see read-only or hidden controls as appropriate.
  - [ ] Task attachment integration uses the manifest-declared target instead of custom task-only file code.
  - [ ] Files surface filters by module, target, client, project, filename, and status without leaking hidden records.
  - [ ] Browser helper event callbacks fire for upload, attach, remove, status change, and refresh flows.

## Version 0.32.13 - 0.32.x Module Contract Review, File Closeout, and Help Updates

Implementation shape:
- Treat this as the final 0.32.x stabilization and documentation closeout before Support Tickets.
- Review first-party module isolation, framework/module boundaries, file hooks, event hooks, Help pages, and docs so 0.33.x can use the framework contracts cleanly.
- Do not add new feature scope here unless review exposes a blocker for Support Tickets or the file framework.

- [ ] Perform a thorough first-party module isolation review.
  - [ ] Ensure current and existing modules are properly isolated and related data is owned by the appropriate module.
  - [ ] Confirm there are no misplaced domain tables or services, such as timer tables in the Tasks module.
  - [ ] Ensure proper isolation of core/framework from first-party modules.
  - [ ] Confirm framework-owned services remain generic for permissions, tags, search, notifications, audit logging, Help, files, and events.
  - [ ] Confirm module manifests, settings, navigation, permissions, searchable types, taggable types, help contributions, file attachable types, and event hooks are the primary integration points.

- [ ] Review file framework readiness for other modules.
  - [ ] Confirm Support Tickets can attach files in 0.33.x without new framework file primitives.
  - [ ] Confirm future Notes, Knowledge Base, Creator Studio, Lists, Projects, Clients, and Calendar integrations can use the same file attachment contract.
  - [ ] Confirm public-safe attachment fields and permissions are ready for client portal and Knowledge Base use, even if public workflows remain disabled.
  - [ ] Confirm file lifecycle events can feed notifications, audit logs, search refreshes, activity summaries, and module UI refreshes without direct module-to-module coupling.

- [ ] Add initial Help pages for existing modules and framework services.
  - [ ] Add or update Help pages for Tasks.
  - [ ] Add or update Help pages for Time Tracking.
  - [ ] Add or update Help pages for Clients and Projects.
  - [ ] Add or update Help pages for Notifications.
  - [ ] Add or update Help pages for Tags.
  - [ ] Add or update Help pages for Search.
  - [ ] Add or update Help pages for Files and Attachments if the file framework is complete.
  - [ ] Keep Help pages current-state and task-oriented, not future roadmap promises.

- [ ] Update developer documentation.
  - [ ] Document file attachable manifest declarations.
  - [ ] Document file lifecycle event names and payload rules.
  - [ ] Document storage adapter and scanner adapter contracts.
  - [ ] Document the browser attachment helper contract.
  - [ ] Document how modules should consume framework services without hard-coding framework internals.

- [ ] Add final 0.32.x closeout regressions.
  - [ ] Module manifest validation covers help, search, tags, files, permissions, navigation, and event hooks together.
  - [ ] First-party modules do not bypass file framework APIs for storage, downloads, or attachment metadata.
  - [ ] Event hooks do not expose sensitive file contents, storage paths, or scanner details.
  - [ ] Existing Help, Search, Tags, Notifications, and Files behavior still respects disabled-module visibility.
  - [ ] Run `npm run check`.
  - [ ] Run `npm run test:permissions` because file access and module hooks are permission-sensitive.
  - [ ] Run SQLite integrity check after file migration and attachment workflow tests.

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
  - [ ] Allow addition of calendar events
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

* [ ] Add notification-aware dashboard helpers

  * [ ] App shell can show unread notification count
  * [ ] Dashboard can eventually show user-specific notification summaries
  * [ ] Notification summaries should respect permissions
  * [ ] Notification summaries should not expose raw audit JSON
  * [ ] Do not build full activity feed here unless already stable

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
