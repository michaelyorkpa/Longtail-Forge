# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.32.13 - 0.32.x Module Contract Review, File Closeout, and Help Updates

Implementation shape:
- Treat this as the final 0.32.x stabilization and documentation closeout before Notes.
- Review first-party module isolation, framework/module boundaries, file hooks, event hooks, Help pages, and docs so 0.33.x can use the framework contracts cleanly.
- Do not add new feature scope here unless review exposes a blocker for Notes or the file framework.

- [x] Perform a thorough first-party module isolation review.
  - [x] Ensure current and existing modules are properly isolated and related data is owned by the appropriate module.
  - [x] Confirm there are no misplaced domain tables or services, such as timer tables in the Tasks module.
  - [x] Ensure proper isolation of core/framework from first-party modules.
  - [x] Confirm framework-owned services remain generic for permissions, tags, search, notifications, audit logging, Help, files, and events.
  - [x] Confirm module manifests, settings, navigation, permissions, searchable types, taggable types, help contributions, file attachable types, and event hooks are the primary integration points.

- [x] Review file framework readiness for other modules.
  - [x] Confirm Support Tickets can attach files in 0.33.x without new framework file primitives.
  - [x] Confirm future Notes, Knowledge Base, Creator Studio, Lists, Projects, Clients, and Calendar integrations can use the same file attachment contract.
  - [x] Confirm public-safe attachment fields and permissions are ready for client portal and Knowledge Base use, even if public workflows remain disabled.
  - [x] Confirm file lifecycle events can feed notifications, audit logs, search refreshes, activity summaries, and module UI refreshes without direct module-to-module coupling.

- [x] Add initial Help pages for existing modules and framework services.
  - [x] Add or update Help pages for Tasks.
  - [x] Add or update Help pages for Time Tracking.
  - [x] Add or update Help pages for Clients and Projects.
  - [x] Add or update Help pages for Notifications.
  - [x] Add or update Help pages for Tags.
  - [x] Add or update Help pages for Search.
  - [x] Add or update Help pages for Files and Attachments if the file framework is complete.
  - [x] Keep Help pages current-state and task-oriented, not future roadmap promises.

- [x] Update developer documentation.
  - [x] Document file attachable manifest declarations.
  - [x] Document file lifecycle event names and payload rules.
  - [x] Document storage adapter and scanner adapter contracts.
  - [x] Document the browser attachment helper contract.
  - [x] Document how modules should consume framework services without hard-coding framework internals.

- [x] Add final 0.32.x closeout regressions.
  - [x] Module manifest validation covers help, search, tags, files, permissions, navigation, and event hooks together.
  - [x] First-party modules do not bypass file framework APIs for storage, downloads, or attachment metadata.
  - [x] Event hooks do not expose sensitive file contents, storage paths, or scanner details.
  - [x] Existing Help, Search, Tags, Notifications, and Files behavior still respects disabled-module visibility.
  - [x] Run `npm run check`.
  - [x] Run `npm run test:permissions` because file access and module hooks are permission-sensitive.
  - [x] Run SQLite integrity check after file migration and attachment workflow tests.

## Version 0.33.0 - Notes Module Contract, Data Model, Permissions, and Revisions

Decision:
Notes are a first-party workflow module for dynamic working records. Notes are not Knowledge Base articles, Help articles, ticket ledger entries, audit records, or task comments. Notes may later feed Knowledge Base content, but note authoring and KB publishing remain separate workflows.

Implementation shape:

* Add Notes as a durable first-party module with its own data model, permissions, routes, services, manifest declarations, search integration, tag integration, file attachment integration, revision history, and Help contribution.

* Keep Notes internal-first in the initial implementation.

* Store note content as Markdown, even if the first editor is a plain textarea.

* Leave clean hooks for a future WYSIWYG-style Markdown editor that emits valid Markdown instead of storing proprietary rich-text blobs.

* Treat secure notes as a separate privacy/encryption concern, not just a tag or visibility flag.

* [ ] Add Notes as a first-party module.

  * [ ] Module ID should be `notes`.
  * [ ] Notes are dynamic working records.
  * [ ] Notes are module records, not framework/core records.
  * [ ] Notes should use framework-owned services for users, workspaces, permissions, tags, search, notifications, audit logging, file attachments, events/hooks, API scopes, Help contributions, and module lifecycle.
  * [ ] Do not hard-code note behavior into framework-owned app shell, search, notification, file, tag, or permission services.
  * [ ] Notes should be disableable per workspace where appropriate.
  * [ ] Disabled Notes module should block new note writes while preserving historical reads if `historicalReadAccess` is enabled.
  * [ ] Notes should not become an all-purpose dumping ground for comments, ticket replies, audit events, or KB publishing state.

* [ ] Define note terminology and purpose.

  * [ ] Notes are working records.
  * [ ] Notes may contain drafts, meeting notes, research, implementation notes, client notes, project notes, task notes, ticket-adjacent notes, user notes, and general workspace notes.
  * [ ] Notes should be allowed to evolve over time.
  * [ ] Notes should support links to other records without becoming those records.
  * [ ] Notes should be internal-first until client/public visibility rules are deliberately added.
  * [ ] Knowledge Base should remain the curated publishing layer.
  * [ ] Help Center should remain product/module documentation, not workspace-authored notes.

* [ ] Define core note record model.

  * [ ] Add `notes` table.
  * [ ] Suggested fields:

    * [ ] `note_id`
    * [ ] `workspace_id`
    * [ ] `title`
    * [ ] `slug` optional, workspace-scoped
    * [ ] `body_markdown`
    * [ ] `body_excerpt`
    * [ ] `body_plaintext_index`
    * [ ] `note_type`
    * [ ] `status`
    * [ ] `visibility`
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `task_id` optional
    * [ ] `ticket_id` optional
    * [ ] `linked_user_id` optional
    * [ ] `owner_user_id` optional
    * [ ] `created_by_user_id`
    * [ ] `updated_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `archived_at`
    * [ ] `deleted_at`
    * [ ] `metadata_json`
  * [ ] Every note must belong to exactly one workspace.
  * [ ] Optional client/project/task/ticket/user links must belong to the same workspace.
  * [ ] `body_markdown` is the canonical editable body for normal notes.
  * [ ] `body_plaintext_index` should be generated server-side from safe Markdown parsing and should not be trusted from the browser.
  * [ ] Do not store rendered HTML as the source of truth.
  * [ ] Do not use tags as the source of truth for note visibility, ownership, publication, or security.

* [ ] Define note types.

  * [ ] Start with a small set:

    * [ ] `general`
    * [ ] `meeting`
    * [ ] `research`
    * [ ] `client`
    * [ ] `project`
    * [ ] `task`
    * [ ] `ticket`
    * [ ] `user`
  * [ ] Note type should guide labels, filters, and defaults.
  * [ ] Note type should not replace explicit record links.
  * [ ] Note type should not define access control by itself.
  * [ ] Keep custom note types for a later settings pass if needed.

* [ ] Define note statuses.

  * [ ] Start with:

    * [ ] `active`
    * [ ] `pinned`
    * [ ] `archived`
    * [ ] `deleted`
  * [ ] Keep `deleted` as soft-delete unless a later retention policy explicitly allows hard delete.
  * [ ] Do not make tags the source of truth for status.
  * [ ] Avoid overbuilding workflow states here; Knowledge Base will own editorial states.

* [ ] Define note visibility values.

  * [ ] Start with internal-safe visibility:

    * [ ] `internal`
    * [ ] `private`
    * [ ] `workspace`
  * [ ] `internal` means available to internal workspace users with the appropriate note permissions and record-context access.
  * [ ] `private` means available only to the creator/owner and users with an explicit elevated permission.
  * [ ] `workspace` means visible to permitted workspace users, subject to workspace and role checks.
  * [ ] Reserve future visibility values:

    * [ ] `client_visible`
    * [ ] `public`
  * [ ] Do not enable `client_visible` or `public` notes in 0.34.0 unless the permission model and public-safe file handling are already stable.
  * [ ] Do not use tags as the source of truth for public/private access.

* [ ] Add flexible note-linking foundation.

  * [ ] Add `note_links` table if the direct foreign keys on `notes` are not enough.
  * [ ] Suggested fields:

    * [ ] `note_link_id`
    * [ ] `workspace_id`
    * [ ] `note_id`
    * [ ] `module_id`
    * [ ] `target_type`
    * [ ] `target_id`
    * [ ] `link_role`
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `removed_at`
    * [ ] `metadata_json`
  * [ ] Support linking notes to:

    * [ ] Workspace
    * [ ] Client
    * [ ] Project
    * [ ] Task
    * [ ] Ticket
    * [ ] User
    * [ ] Future Knowledge Base article
    * [ ] Future Creator Studio item
  * [ ] Validate linked target records through module-declared linkable/searchable contracts where possible.
  * [ ] Prevent cross-workspace note links.
  * [ ] Preserve historical links when target modules are disabled if historical read access allows it.
  * [ ] Do not hard-code all possible note target types into the Notes service.

* [ ] Add Markdown content foundation.

  * [ ] Store note body as Markdown.
  * [ ] Add safe Markdown parsing/rendering helper.
  * [ ] Strip or reject unsafe HTML.
  * [ ] Normalize Markdown before saving where practical.
  * [ ] Generate safe excerpts/snippets server-side.
  * [ ] Support headings, bold, italic, links, blockquotes, code blocks, unordered lists, ordered lists, and checklists.
  * [ ] Do not support arbitrary scriptable embeds.
  * [ ] Do not trust browser-rendered Markdown output.
  * [ ] Add rendering tests for unsafe input.

* [ ] Add future editor hooks.

  * [ ] First implementation may use a plain Markdown textarea.
  * [ ] Leave a clean browser helper boundary for a future toolbar/editor.
  * [ ] Future editor should emit valid Markdown.
  * [ ] Future editor should support common controls:

    * [ ] Bold
    * [ ] Italic
    * [ ] Headings
    * [ ] Links
    * [ ] Checklists
    * [ ] Unordered lists
    * [ ] Ordered lists
    * [ ] Code blocks
    * [ ] Blockquotes
  * [ ] Do not store proprietary editor JSON as the canonical note body unless a later migration strategy is explicitly designed.
  * [ ] Keep editor behavior replaceable without changing the note storage model.

* [ ] Add wiki-style linking groundwork.

  * [ ] Reserve syntax support for wiki-style links such as `[[Note Title]]` or `[[note-slug|Display Text]]`.
  * [ ] Do not require full wiki-link autocomplete in the first pass.
  * [ ] Store detected wiki links as metadata or `note_links` records where practical.
  * [ ] Broken wiki links should render safely.
  * [ ] Renaming a note should not break stable note IDs.
  * [ ] Slugs should be display/routing helpers, not primary keys.
  * [ ] Do not auto-create notes from wiki links until the UX is deliberate.

* [ ] Add persistent note revision support.

  * [ ] Add `note_revisions` table.
  * [ ] Suggested fields:

    * [ ] `note_revision_id`
    * [ ] `workspace_id`
    * [ ] `note_id`
    * [ ] `revision_number`
    * [ ] `title`
    * [ ] `body_markdown`
    * [ ] `body_excerpt`
    * [ ] `changed_by_user_id`
    * [ ] `change_summary`
    * [ ] `change_reason`
    * [ ] `created_at`
    * [ ] `metadata_json`
  * [ ] Create a revision when meaningful note content changes.
  * [ ] Create a revision when title changes.
  * [ ] Avoid creating noisy revisions for only `updated_at` changes.
  * [ ] Preserve previous body content for restore/diff workflows.
  * [ ] Note revision history should be permission-protected.
  * [ ] Revisions should not replace audit logging.
  * [ ] Revision bodies for normal notes may be searchable only through the current note unless version search is deliberately added later.
  * [ ] Secure note revisions must follow the secure note encryption rules and must not leak plaintext into normal revision tables or search indexes.

* [ ] Add note changelog display model.

  * [ ] Changelogs should show user-friendly change history.
  * [ ] Changelogs should include:

    * [ ] Revision number
    * [ ] Changed by
    * [ ] Changed at
    * [ ] Change summary where provided
    * [ ] Title changed indicator
    * [ ] Body changed indicator
    * [ ] Visibility changed indicator where safe
    * [ ] Link changes where useful
    * [ ] Attachment changes where useful
  * [ ] Changelogs should not expose raw audit JSON.
  * [ ] Changelogs should not expose encrypted secure-note body content unless the viewer can decrypt the secure note.
  * [ ] Changelogs should be readable by users with note history permissions.

* [ ] Add note permissions.

  * [ ] `notes.view`
  * [ ] `notes.view_all`
  * [ ] `notes.view_private`
  * [ ] `notes.create`
  * [ ] `notes.update`
  * [ ] `notes.archive`
  * [ ] `notes.restore`
  * [ ] `notes.delete`
  * [ ] `notes.view_history`
  * [ ] `notes.restore_revision`
  * [ ] `notes.manage_links`
  * [ ] `notes.manage_settings`
  * [ ] Add context-sensitive access checks for linked client/project/task/ticket/user records.
  * [ ] Private notes require owner access or elevated permission.
  * [ ] Note visibility and edit access must respect roles and permissions.
  * [ ] Leave hooks for future change requests.
  * [ ] Do not allow users to infer the existence of hidden/private notes through search, tag counts, attachment counts, or linked-record summaries.

* [ ] Add note resource definition.

  * [ ] Resource key: `notes`.
  * [ ] Supported operations:

    * [ ] `read`
    * [ ] `create`
    * [ ] `update`
    * [ ] `archive`
    * [ ] `restore`
    * [ ] `delete`
    * [ ] `manage`
    * [ ] `view_history`
    * [ ] `restore_revision`

* [ ] Add note audit record types.

  * [ ] `note`
  * [ ] `note_revision`
  * [ ] `note_link`
  * [ ] Audit note creation, updates, archive/restore, soft delete, visibility changes, link changes, revision restores, attachment links, and secure-note access events where appropriate.
  * [ ] Audit records should remain admin/security records and should not be shown as the normal note changelog.

* [ ] Add note lifecycle events.

  * [ ] `note.created`
  * [ ] `note.updated`
  * [ ] `note.revision_created`
  * [ ] `note.archived`
  * [ ] `note.restored`
  * [ ] `note.deleted`
  * [ ] `note.linked`
  * [ ] `note.unlinked`
  * [ ] `note.visibility_changed`
  * [ ] `note.attachment_added`
  * [ ] `note.attachment_removed`
  * [ ] Event payloads should include workspace ID, actor user ID, note ID, safe title/excerpt metadata, visibility, linked record context where safe, previous/new values where safe, and timestamps.
  * [ ] Event payloads should not include raw secure note content, encrypted payloads, decrypted plaintext, unsafe Markdown, secrets, or private attachment details.
  * [ ] Event payloads should leave room for future notifications, Workbench activity, dashboard activity, and automations.

* [ ] Add note indexes.

  * [ ] Workspace + note ID.
  * [ ] Workspace + status.
  * [ ] Workspace + visibility.
  * [ ] Workspace + owner user ID.
  * [ ] Workspace + created by user ID.
  * [ ] Workspace + updated at.
  * [ ] Workspace + client ID.
  * [ ] Workspace + project ID.
  * [ ] Workspace + task ID.
  * [ ] Workspace + ticket ID.
  * [ ] Workspace + linked user ID.
  * [ ] Workspace + slug where slugs are enabled.
  * [ ] Note links by workspace + module ID + target type + target ID.
  * [ ] Note revisions by workspace + note ID + revision number.

* [ ] Add focused contract regressions.

  * [ ] Notes cannot cross workspace boundaries.
  * [ ] Notes cannot link to records from another workspace.
  * [ ] Private notes are hidden from users without owner/elevated access.
  * [ ] Disabled Notes module blocks new writes.
  * [ ] Historical reads follow module lifecycle policy.
  * [ ] Note revisions are created for meaningful content changes.
  * [ ] Note changelog does not expose raw audit JSON.
  * [ ] Unsafe Markdown is rejected or rendered safely.
  * [ ] Tags do not control note visibility.
  * [ ] Note lifecycle events emit safe payloads.

## Version 0.33.1 - Notes Browser API, UI MVP, Search, Tags, Files, and Help

Implementation shape:

* Build the practical Notes workflow on top of the 0.34.0 contract.

* Add service methods, browser API routes, permission-safe UI, search registration, tag registration, file attachment integration, revision UI, and Help documentation.

* Keep the first UI boring and useful: list, filters, create/edit, detail, archive, revisions, linked records, tags, and attachments.

* [ ] Add note service methods.

  * [ ] Create note.
  * [ ] Read one note.
  * [ ] List notes.
  * [ ] Update note.
  * [ ] Archive note.
  * [ ] Restore note.
  * [ ] Soft-delete note where allowed.
  * [ ] List note revisions.
  * [ ] Read note revision.
  * [ ] Restore note revision.
  * [ ] Link note to a target record.
  * [ ] Remove note link.
  * [ ] List notes for target record.
  * [ ] Validate note access.
  * [ ] Validate note edit access.
  * [ ] Generate safe Markdown excerpt.
  * [ ] Generate search indexing payload.
  * [ ] Emit safe lifecycle events.

* [ ] Add browser API routes.

  * [ ] `GET /api/notes`
  * [ ] `POST /api/notes`
  * [ ] `GET /api/notes/:noteId`
  * [ ] `PUT /api/notes/:noteId`
  * [ ] `POST /api/notes/:noteId/archive`
  * [ ] `POST /api/notes/:noteId/restore`
  * [ ] `POST /api/notes/:noteId/delete`
  * [ ] `GET /api/notes/:noteId/revisions`
  * [ ] `GET /api/notes/:noteId/revisions/:revisionId`
  * [ ] `POST /api/notes/:noteId/revisions/:revisionId/restore`
  * [ ] `GET /api/notes/:noteId/links`
  * [ ] `POST /api/notes/:noteId/links`
  * [ ] `POST /api/notes/:noteId/links/:noteLinkId/remove`
  * [ ] `GET /api/notes/for-target`
  * [ ] Keep public/client note APIs deferred until explicit visibility and public-safe file behavior are stable.

* [ ] Enforce note API permissions.

  * [ ] Every route must validate active workspace.
  * [ ] Every read must validate note visibility, note permissions, and linked-record access where applicable.
  * [ ] Every write must validate Notes module state.
  * [ ] Users cannot create notes for records they cannot access.
  * [ ] Users cannot link notes to records they cannot access.
  * [ ] Users cannot read private notes unless they own them or have elevated permission.
  * [ ] Users cannot restore revisions unless they can edit the note and view history.
  * [ ] Disabled module state blocks new writes.
  * [ ] Search, tag, file, and revision APIs must use the same access rules as note reads.

* [ ] Add Notes navigation and protected views.

  * [ ] Add Notes navigation when the module is enabled.
  * [ ] Add Notes list page.
  * [ ] Add Note detail page.
  * [ ] Add create note form.
  * [ ] Add edit note form.
  * [ ] Add archive/restore actions.
  * [ ] Add revision history panel.
  * [ ] Add linked-record context display.
  * [ ] Add tags panel.
  * [ ] Add attachments panel through the shared file helper.
  * [ ] Add disabled-module state.
  * [ ] Add loading, empty, error, permission-denied, and archived states.
  * [ ] Keep layout consistent with existing authenticated module pages.

* [ ] Add note list workflow.

  * [ ] Show title.
  * [ ] Show safe excerpt.
  * [ ] Show note type.
  * [ ] Show visibility.
  * [ ] Show linked client/project/task/ticket/user context where allowed.
  * [ ] Show tags where allowed.
  * [ ] Show attachment count where allowed.
  * [ ] Show updated date.
  * [ ] Show updated by where allowed.
  * [ ] Add filters for:

    * [ ] Status
    * [ ] Visibility
    * [ ] Note type
    * [ ] Client
    * [ ] Project
    * [ ] Task
    * [ ] Ticket
    * [ ] User
    * [ ] Tag
    * [ ] Owner
    * [ ] Updated date
    * [ ] Archived state
  * [ ] Add pagination.
  * [ ] Add sort by updated date, created date, title, and type.
  * [ ] Do not show hidden/private note counts to unauthorized users.

* [ ] Add note detail workflow.

  * [ ] Render Markdown safely.
  * [ ] Show title, status, visibility, note type, linked records, tags, attachments, created date, updated date, and author/updater where allowed.
  * [ ] Allow permitted users to edit note body and title.
  * [ ] Allow permitted users to archive/restore.
  * [ ] Allow permitted users to manage links.
  * [ ] Allow permitted users to manage tags.
  * [ ] Allow permitted users to manage attachments.
  * [ ] Show revision history to users with history permission.
  * [ ] Keep raw Markdown available to the editor.
  * [ ] Do not expose hidden linked records through note detail metadata.

* [ ] Add Markdown editor MVP.

  * [ ] Start with a textarea if that is the fastest safe implementation.
  * [ ] Add preview mode if practical.
  * [ ] Add helper buttons only if they can emit valid Markdown without creating fragile browser code.
  * [ ] Preserve keyboard accessibility.
  * [ ] Preserve focus management.
  * [ ] Show validation errors clearly.
  * [ ] Prevent accidental loss of unsaved note edits where practical.
  * [ ] Keep future WYSIWYG editor replacement isolated behind a browser helper.

* [ ] Register notes as searchable records.

  * [ ] Add `searchableTypes` manifest declaration for notes.
  * [ ] Index title.
  * [ ] Index safe body plaintext.
  * [ ] Index safe excerpt.
  * [ ] Index linked client/project/task/ticket/user context where allowed.
  * [ ] Index tags as classification metadata.
  * [ ] Index attachment names only if the file framework exposes permission-safe metadata.
  * [ ] Search result type should be `note`.
  * [ ] Search source should be `Notes`.
  * [ ] Search results should link to Note detail.
  * [ ] Search must respect workspace, module state, note visibility, private-note rules, linked-record access, and permissions.
  * [ ] Archived notes should follow the existing search archived-state pattern.
  * [ ] Secure notes must be excluded from normal search indexing.

* [ ] Register notes as taggable records.

  * [ ] Add `taggableTypes` declaration for notes.
  * [ ] Allow permitted users to assign workspace tags to notes.
  * [ ] Tags are classification metadata only.
  * [ ] Tags must not define public/private access.
  * [ ] Tags must not define secure-note status.
  * [ ] Tags must not define Knowledge Base publication state.

* [ ] Register notes as attachable records.

  * [ ] Use the framework file attachment contract.
  * [ ] Notes should not implement separate file storage.
  * [ ] Attachments should inherit note access rules unless an explicit attachment visibility rule is added.
  * [ ] Private note attachments must not be downloadable by users who cannot access the private note.
  * [ ] Quarantined/pending files must not appear in normal note UI.
  * [ ] Secure note attachments need a deliberate rule before they are allowed; do not assume normal file encryption covers secure note attachment content.

* [ ] Add note revision UI.

  * [ ] Show revision list.
  * [ ] Show revision metadata.
  * [ ] Show safe diff or previous/current view if practical.
  * [ ] Allow permitted users to restore a revision.
  * [ ] Create a new revision when restoring an old revision.
  * [ ] Do not expose revisions to users who cannot view note history.
  * [ ] Do not expose encrypted secure-note revision plaintext without secure-note access.

* [ ] Add note notifications where useful.

  * [ ] Notify note owner when another user updates their note where appropriate.
  * [ ] Notify linked-record followers only if a clear subscription rule exists.
  * [ ] Do not spam users for every small note edit.
  * [ ] Keep note notifications conservative until notification preferences are richer.
  * [ ] Notification payloads should use safe title/excerpt metadata only.

* [ ] Add Notes Help contribution.

  * [ ] Add Help page for Notes basics.
  * [ ] Add Help page for Markdown notes.
  * [ ] Add Help page for note links.
  * [ ] Add Help page for note revisions.
  * [ ] Add Help page for notes and attachments.
  * [ ] Keep Help pages current-state and task-oriented.
  * [ ] Do not describe future Knowledge Base publishing as current behavior.

* [ ] Add UI and integration regressions.

  * [ ] Notes navigation appears only when Notes module is enabled.
  * [ ] Users can create, edit, archive, restore, and read notes according to permissions.
  * [ ] Private notes are hidden from unauthorized users.
  * [ ] Linked record access is enforced.
  * [ ] Notes search does not leak private notes.
  * [ ] Notes tags do not alter visibility.
  * [ ] Note attachments use the shared file framework.
  * [ ] Markdown renders safely.
  * [ ] Revision restore creates a new revision.
  * [ ] Disabled Notes module blocks new writes.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run SQLite integrity check after note migration and revision tests.

## Version 0.33.2 - Secure Notes Foundation, Encryption Contract, and Private Revision Handling

Decision:
Secure notes are not ordinary notes with a scary label. Secure notes need a clear encryption boundary, reduced metadata exposure, no normal search indexing, no Knowledge Base publishing path, and stricter permissions. The first implementation should be honest about its security model.

Implementation shape:

* Build secure notes as a specialized note mode on top of the Notes module only if the encryption and access model is explicit.

* Start with application-managed encryption-at-rest for self-hosted installs unless a true user-keyed vault is deliberately designed later.

* Do not claim secure notes are zero-knowledge unless the server cannot decrypt them.

* Exclude secure note body content from normal search, snippets, Knowledge Base conversion, Help, notifications, dashboard activity, and public/client surfaces.

* [ ] Define secure note scope.

  * [ ] Secure notes are for sensitive internal notes.
  * [ ] Secure notes should be excluded from normal search indexing.
  * [ ] Secure notes should not have Knowledge Base publishing options.
  * [ ] Secure notes should not create public/client-visible outputs.
  * [ ] Secure notes should not appear in normal dashboard activity feeds with body excerpts.
  * [ ] Secure notes should not appear in notification payloads with body excerpts.
  * [ ] Secure notes should not expose body text through audit logs, lifecycle events, search rows, browser-safe snippets, or metadata JSON.
  * [ ] Secure notes should use stricter access checks than normal private notes.

* [ ] Decide and document the encryption model.

  * [ ] Recommended first model: application-managed envelope encryption.
  * [ ] Store the master encryption key outside the database, preferably in environment/config/secrets storage.
  * [ ] Generate per-note or per-workspace data encryption keys.
  * [ ] Encrypt secure note body content before storing it.
  * [ ] Store encrypted payload, algorithm metadata, key version, nonce/IV, and auth tag.
  * [ ] Do not derive the only decryption key from the user password in the first implementation unless account recovery, password changes, sharing, rotation, and multi-device unlock are fully designed.
  * [ ] Do not treat "validated session" alone as the encryption secret.
  * [ ] A valid session may authorize a decrypt request, but the actual decrypt key must come from the server-side key hierarchy or a user-provided vault key.
  * [ ] Do not store encryption keys in `metadata_json`.
  * [ ] Do not store encryption keys in browser local storage.
  * [ ] Document that application-managed encryption protects database-at-rest exposure but does not protect against a compromised app server or operator with access to server secrets.
  * [ ] Reserve a future user-keyed or workspace-keyed vault model if stronger zero-knowledge behavior is required.

* [ ] Add secure note fields.

  * [ ] Add secure note support to `notes` or a dedicated `secure_notes` table.
  * [ ] Suggested fields if stored in `notes`:

    * [ ] `is_secure`
    * [ ] `secure_payload`
    * [ ] `secure_payload_version`
    * [ ] `encryption_key_version`
    * [ ] `encryption_algorithm`
    * [ ] `encrypted_at`
    * [ ] `last_decrypted_at` optional and carefully audited
  * [ ] For secure notes, `body_markdown`, `body_excerpt`, and `body_plaintext_index` must be null or contain only safe placeholders.
  * [ ] Secure note titles should either be non-sensitive or optionally encrypted in a later pass.
  * [ ] If titles remain plaintext, label the UI clearly so users know titles are visible to permitted metadata readers.
  * [ ] Do not put secure note body text in normal note fields.

* [ ] Add secure note revision handling.

  * [ ] Secure note revisions must store encrypted revision payloads.
  * [ ] Secure note revisions must not store plaintext body markdown.
  * [ ] Secure note revision metadata should be minimal.
  * [ ] Secure note revision diffs should require decryption and proper permission checks.
  * [ ] Secure note revision restores should create a new encrypted revision.
  * [ ] Secure note revision history should not leak body excerpts.

* [ ] Add secure note permissions.

  * [ ] `notes.secure.create`
  * [ ] `notes.secure.view`
  * [ ] `notes.secure.update`
  * [ ] `notes.secure.archive`
  * [ ] `notes.secure.restore`
  * [ ] `notes.secure.delete`
  * [ ] `notes.secure.view_history`
  * [ ] `notes.secure.manage`
  * [ ] Normal `notes.view` should not automatically grant secure note body access.
  * [ ] Normal `notes.view_history` should not automatically grant secure note revision body access.
  * [ ] Secure note access should require both Notes module access and secure-note-specific permission.
  * [ ] Private secure notes should also require owner/elevated checks.

* [ ] Add secure note API behavior.

  * [ ] Secure note create endpoint encrypts body before storage.
  * [ ] Secure note read endpoint decrypts body only after permission checks.
  * [ ] Secure note update endpoint decrypts only when needed and writes a new encrypted payload.
  * [ ] Secure note list endpoints return minimal metadata and no body excerpt.
  * [ ] Secure note search returns no body matches and preferably no secure note rows unless a title-only secure note search is explicitly allowed.
  * [ ] Secure note revisions decrypt only through secure revision endpoints.
  * [ ] Secure note events and audit records use safe metadata only.

* [ ] Add secure note UI behavior.

  * [ ] Clearly label secure notes.
  * [ ] Do not show secure note body in list excerpts.
  * [ ] Do not show secure note body in dashboard summaries.
  * [ ] Do not show secure note body in notifications.
  * [ ] Do not expose Knowledge Base conversion controls on secure notes.
  * [ ] Do not expose public/client visibility controls on secure notes.
  * [ ] Warn users if secure note titles are not encrypted.
  * [ ] Add locked/permission-denied state.
  * [ ] Add safe error state for decrypt failures.
  * [ ] Do not display raw encryption errors to normal users.

* [ ] Add secure note file attachment rule.

  * [ ] Do not allow secure note attachments in the first pass unless attachment encryption is explicitly designed.
  * [ ] If secure note attachments are allowed later, they must use a compatible encryption and permission model.
  * [ ] Normal file framework encryption-at-rest is not automatically enough for secure note attachments.
  * [ ] Secure note attachment metadata must not leak sensitive body context.

* [ ] Add key rotation groundwork.

  * [ ] Store encryption key version.
  * [ ] Allow future migration/rotation without rewriting the whole Notes model.
  * [ ] Add health check for missing encryption configuration.
  * [ ] Block secure note creation if encryption is not configured.
  * [ ] Allow existing secure notes to fail closed if required keys are unavailable.
  * [ ] Document backup requirements for encryption keys.
  * [ ] Warn that losing the server-side encryption key may make secure note content unrecoverable.

* [ ] Add secure note regressions.

  * [ ] Secure note body is encrypted at rest.
  * [ ] Secure note body does not appear in `search_index`.
  * [ ] Secure note body does not appear in audit logs.
  * [ ] Secure note body does not appear in lifecycle events.
  * [ ] Secure note body does not appear in notifications.
  * [ ] Secure notes do not show Knowledge Base publishing controls.
  * [ ] Users with normal note permissions but without secure note permissions cannot read secure note bodies.
  * [ ] Secure note revisions are encrypted.
  * [ ] Missing encryption configuration blocks secure note creation.
  * [ ] Decrypt failures fail closed.

## Version 0.33.3 - Notes Integration Polish, Documentation, and Release Closeout

Implementation shape:

* Stabilize Notes before building Knowledge Base on top of it.

* Verify permissions, search, tags, files, revisions, secure notes, module lifecycle, Help pages, and UI states together.

* Keep this as closeout; do not add Knowledge Base behavior here.

* [ ] Perform Notes module integration review.

  * [ ] Confirm Notes uses framework services for permissions, tags, search, files, audit, notifications, events, Help, and module lifecycle.
  * [ ] Confirm Notes does not bypass file framework APIs.
  * [ ] Confirm Notes does not write direct search rows outside the framework search service.
  * [ ] Confirm Notes does not hard-code unrelated module behavior.
  * [ ] Confirm linked-record behavior uses stable module contracts where available.
  * [ ] Confirm secure notes do not leak body content through normal integration surfaces.

* [ ] Update developer documentation.

  * [ ] Document Notes module boundaries.
  * [ ] Document note data model.
  * [ ] Document note linking model.
  * [ ] Document Markdown storage/rendering rules.
  * [ ] Document revision/changelog behavior.
  * [ ] Document secure note encryption model and limitations.
  * [ ] Document Notes searchable/taggable/attachable declarations.
  * [ ] Document Notes lifecycle events.
  * [ ] Document what Notes should not own.

* [ ] Update product Help.

  * [ ] Add current-state Notes usage page.
  * [ ] Add current-state Markdown page.
  * [ ] Add current-state note linking page.
  * [ ] Add current-state note revisions page.
  * [ ] Add current-state secure notes page only if secure notes are implemented.
  * [ ] Keep Help separate from Knowledge Base.

* [ ] Release bookkeeping.

  * [ ] Record Notes decisions in `DECISIONS.md`.
  * [ ] Update `CHANGELOG.md`.
  * [ ] Bump `package.json` and `package-lock.json`.
  * [ ] Verify `/api/app-info` reports the completed Notes version.
  * [ ] Move completed roadmap sections to `ROADMAP-ARCHIVE.md` according to the existing release process.

* [ ] Run verification.

  * [ ] Run focused Notes API tests.
  * [ ] Run focused Notes UI tests.
  * [ ] Run focused Notes search tests.
  * [ ] Run focused Notes tag tests.
  * [ ] Run focused Notes file attachment tests.
  * [ ] Run focused Notes revision tests.
  * [ ] Run focused secure note tests if secure notes are included.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run SQLite integrity check after Notes migrations and revision tests.

### Version 0.33.4 - Shopping / Procurement Lists Module

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

## Version 0.34.1 - Knowledge Base Module Contract, Publishing Model, and Notes Relationship

Decision:
Knowledge Base is a separate first-party publishing and curation module. It is not "notes with public enabled." Knowledge Base articles may be created from notes, linked to notes, or written directly, but publication is explicit and permission-protected.

Implementation shape:

* Add Knowledge Base as the curated article layer for workspace-authored operational knowledge.

* Keep Help Center separate as product/module documentation.

* Keep Notes separate as dynamic working records.

* Build internal Knowledge Base authoring first.

* Defer client/public Knowledge Base exposure until permissions, public-safe files, sanitized rendering, and routing are stable.

* [ ] Add Knowledge Base as a first-party module.

  * [ ] Module ID should be `knowledge-base`.
  * [ ] Knowledge Base is a publishing and curation layer.
  * [ ] Knowledge Base entries are module records, not framework/core records.
  * [ ] Knowledge Base should use framework-owned services for users, workspaces, permissions, tags, search, notifications, audit logging, file attachments, events/hooks, API scopes, Help contributions, and module lifecycle.
  * [ ] Do not hard-code KB behavior into framework-owned app shell, search, notification, file, tag, or permission services.
  * [ ] Knowledge Base should be disableable per workspace where appropriate.
  * [ ] Disabled Knowledge Base module should block new writes while preserving historical reads if `historicalReadAccess` is enabled.
  * [ ] Knowledge Base should not replace Help Center.
  * [ ] Knowledge Base should not replace Notes.

* [ ] Define Knowledge Base terminology.

  * [ ] User-facing label: `Knowledge Base`.
  * [ ] Primary record label: `Article`.
  * [ ] Optional grouping label: `Collection` or `Category`.
  * [ ] Avoid using "Help" for KB records in code or UI where it can be confused with the framework-owned Help Center.
  * [ ] Avoid using "public" for client-visible records unless the record is truly public internet visible.

* [ ] Define core KB article record model.

  * [ ] Add `kb_articles` table.
  * [ ] Suggested fields:

    * [ ] `kb_article_id`
    * [ ] `workspace_id`
    * [ ] `title`
    * [ ] `slug`
    * [ ] `summary`
    * [ ] `body_markdown`
    * [ ] `body_excerpt`
    * [ ] `body_plaintext_index`
    * [ ] `status`
    * [ ] `visibility`
    * [ ] `collection_id` optional
    * [ ] `category_id` optional
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `source_mode`
    * [ ] `created_by_user_id`
    * [ ] `updated_by_user_id`
    * [ ] `submitted_for_review_by_user_id` optional
    * [ ] `reviewed_by_user_id` optional
    * [ ] `published_by_user_id` optional
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `submitted_for_review_at` optional
    * [ ] `reviewed_at` optional
    * [ ] `published_at` optional
    * [ ] `archived_at` optional
    * [ ] `deleted_at` optional
    * [ ] `metadata_json`
  * [ ] Every KB article must belong to one workspace.
  * [ ] Slugs should be workspace-scoped and stable enough for internal links.
  * [ ] Public slugs must be sanitized and collision-safe before public routing is enabled.
  * [ ] `body_markdown` is the canonical editable body.
  * [ ] Rendered/static output should be derived from the canonical body and publication snapshot.
  * [ ] Do not store arbitrary browser HTML as the source of truth.

* [ ] Define KB statuses.

  * [ ] Start with:

    * [ ] `draft`
    * [ ] `in_review`
    * [ ] `approved`
    * [ ] `published`
    * [ ] `archived`
    * [ ] `deleted`
  * [ ] Draft articles are editable working article records.
  * [ ] In-review articles are awaiting editorial approval.
  * [ ] Approved articles are ready to publish but not necessarily published.
  * [ ] Published articles have an explicit published snapshot/version.
  * [ ] Archived articles are hidden from normal browsing but remain historically available to permitted users.
  * [ ] Deleted articles are soft-deleted unless retention policy later allows hard delete.
  * [ ] Do not use tags as the source of truth for status.

* [ ] Define KB visibility values.

  * [ ] Start with internal-safe values:

    * [ ] `internal`
    * [ ] `workspace`
  * [ ] Reserve future visibility values:

    * [ ] `client_visible`
    * [ ] `public`
  * [ ] `internal` means visible to internal users with appropriate KB permissions.
  * [ ] `workspace` means visible to permitted workspace users.
  * [ ] `client_visible` must wait for client/external permissions and public-safe file handling.
  * [ ] `public` must wait for public routing, public-safe files, safe rendering, metadata stripping, and abuse/reporting decisions.
  * [ ] Do not use tags as the source of truth for KB visibility.
  * [ ] Visibility should be an explicit field.

* [ ] Add KB collections/categories foundation.

  * [ ] Add `kb_collections` table if useful for organization.
  * [ ] Suggested fields:

    * [ ] `kb_collection_id`
    * [ ] `workspace_id`
    * [ ] `title`
    * [ ] `slug`
    * [ ] `description`
    * [ ] `visibility`
    * [ ] `sort_order`
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `archived_at`
    * [ ] `metadata_json`
  * [ ] Keep first implementation simple.
  * [ ] Do not build a full CMS taxonomy system in 0.34.x.
  * [ ] Collections/categories must respect article visibility and permissions.

* [ ] Add KB article revision support.

  * [ ] Add `kb_article_revisions` table.
  * [ ] Suggested fields:

    * [ ] `kb_article_revision_id`
    * [ ] `workspace_id`
    * [ ] `kb_article_id`
    * [ ] `revision_number`
    * [ ] `title`
    * [ ] `summary`
    * [ ] `body_markdown`
    * [ ] `body_excerpt`
    * [ ] `status`
    * [ ] `visibility`
    * [ ] `changed_by_user_id`
    * [ ] `change_summary`
    * [ ] `created_at`
    * [ ] `metadata_json`
  * [ ] Create revisions for meaningful article content, title, summary, status, or visibility changes.
  * [ ] Revisions should support editorial review and restore.
  * [ ] Revisions should not replace audit logging.

* [ ] Add KB publication snapshot support.

  * [ ] Add `kb_article_publications` or `kb_published_versions` table.
  * [ ] Suggested fields:

    * [ ] `kb_publication_id`
    * [ ] `workspace_id`
    * [ ] `kb_article_id`
    * [ ] `kb_article_revision_id`
    * [ ] `publication_number`
    * [ ] `title`
    * [ ] `slug`
    * [ ] `summary`
    * [ ] `body_markdown`
    * [ ] `body_rendered_html` if safe static rendering is stored
    * [ ] `visibility`
    * [ ] `published_by_user_id`
    * [ ] `published_at`
    * [ ] `unpublished_at` optional
    * [ ] `archived_at` optional
    * [ ] `metadata_json`
  * [ ] Published pages should be snapshots.
  * [ ] Editing a draft should not silently mutate the published version.
  * [ ] Publishing should create a deliberate publication record.
  * [ ] Unpublishing should be explicit and audited.
  * [ ] Public/client-visible published snapshots must strip internal metadata before exposure.

* [ ] Define relationship between Notes and Knowledge Base.

  * [ ] Notes can be source material for KB entries.
  * [ ] KB entries can link back to source notes.
  * [ ] KB entries can be written directly without source notes.
  * [ ] Updating a note should not automatically publish a KB change.
  * [ ] Publishing should be explicit.
  * [ ] KB should not automatically publish tasks, tickets, or notes without review.
  * [ ] Public/client-visible KB pages should not expose internal comments, audit data, private attachments, secure notes, hidden source notes, raw source metadata, or private linked records.
  * [ ] Metadata exposed on published KB pages should be intentionally limited.

* [ ] Add KB source-link table.

  * [ ] Add `kb_article_sources` table.
  * [ ] Suggested fields:

    * [ ] `kb_article_source_id`
    * [ ] `workspace_id`
    * [ ] `kb_article_id`
    * [ ] `source_module_id`
    * [ ] `source_type`
    * [ ] `source_id`
    * [ ] `source_revision_id` optional
    * [ ] `source_role`
    * [ ] `sync_mode`
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `last_synced_at` optional
    * [ ] `removed_at` optional
    * [ ] `metadata_json`
  * [ ] Supported first source type should be `note`.
  * [ ] Reserve future source types:

    * [ ] `task`
    * [ ] `ticket`
    * [ ] `project`
    * [ ] `client`
    * [ ] `file`
  * [ ] Default `sync_mode` should be `manual`.
  * [ ] A future `live_source` mode may update draft/source material, but it should not publish public/client-visible changes unless an explicit publish action or later explicit auto-publish rule exists.
  * [ ] Secure notes cannot be KB sources.
  * [ ] Private notes cannot become client/public KB content without explicit copy/review/publish behavior.

* [ ] Add KB permissions.

  * [ ] `kb.view`
  * [ ] `kb.view_all`
  * [ ] `kb.create`
  * [ ] `kb.update`
  * [ ] `kb.submit_review`
  * [ ] `kb.review`
  * [ ] `kb.approve`
  * [ ] `kb.publish`
  * [ ] `kb.unpublish`
  * [ ] `kb.archive`
  * [ ] `kb.restore`
  * [ ] `kb.delete`
  * [ ] `kb.view_history`
  * [ ] `kb.restore_revision`
  * [ ] `kb.manage_sources`
  * [ ] `kb.manage_collections`
  * [ ] `kb.manage_settings`
  * [ ] Publishing requires explicit publish permission.
  * [ ] Review/approval requires explicit review/approve permissions.
  * [ ] Future client/public visibility requires additional client/public-safe access checks.
  * [ ] Normal note permissions should not grant KB publishing permission.

* [ ] Add KB resource definition.

  * [ ] Resource key: `knowledge_base`.
  * [ ] Supported operations:

    * [ ] `read`
    * [ ] `create`
    * [ ] `update`
    * [ ] `submit_review`
    * [ ] `review`
    * [ ] `approve`
    * [ ] `publish`
    * [ ] `unpublish`
    * [ ] `archive`
    * [ ] `restore`
    * [ ] `delete`
    * [ ] `manage`

* [ ] Add KB audit record types.

  * [ ] `kb_article`
  * [ ] `kb_article_revision`
  * [ ] `kb_article_publication`
  * [ ] `kb_article_source`
  * [ ] `kb_collection`
  * [ ] Audit article creation, updates, review submission, approval, publication, unpublication, archive/restore, deletion, source links, attachment links, visibility changes, and collection changes.
  * [ ] Audit records should remain admin/security records and should not be exposed on public/client-visible KB pages.

* [ ] Add KB lifecycle events.

  * [ ] `kb.article.created`
  * [ ] `kb.article.updated`
  * [ ] `kb.article.submitted_for_review`
  * [ ] `kb.article.approved`
  * [ ] `kb.article.published`
  * [ ] `kb.article.unpublished`
  * [ ] `kb.article.archived`
  * [ ] `kb.article.restored`
  * [ ] `kb.article.deleted`
  * [ ] `kb.article.source_linked`
  * [ ] `kb.article.source_unlinked`
  * [ ] `kb.article.attachment_added`
  * [ ] `kb.article.attachment_removed`
  * [ ] Event payloads should include workspace ID, actor user ID, article ID, revision/publication IDs where applicable, safe title/summary metadata, visibility, status, source metadata where safe, and timestamps.
  * [ ] Event payloads should not include internal-only source note bodies, secure note content, private attachment details, raw audit data, or unsafe rendered HTML.

* [ ] Add KB indexes.

  * [ ] Workspace + article ID.
  * [ ] Workspace + slug.
  * [ ] Workspace + status.
  * [ ] Workspace + visibility.
  * [ ] Workspace + collection/category.
  * [ ] Workspace + created by user ID.
  * [ ] Workspace + updated at.
  * [ ] Workspace + published at.
  * [ ] Workspace + source module/type/source ID.
  * [ ] Article revisions by workspace + article ID + revision number.
  * [ ] Published versions by workspace + article ID + publication number.

* [ ] Add focused contract regressions.

  * [ ] KB articles cannot cross workspace boundaries.
  * [ ] KB source links cannot cross workspace boundaries.
  * [ ] Secure notes cannot be KB sources.
  * [ ] Publishing requires explicit permission.
  * [ ] Editing a draft does not mutate the published snapshot.
  * [ ] KB article visibility is explicit and not tag-driven.
  * [ ] Public/client visibility remains disabled or guarded until public-safe behavior exists.
  * [ ] KB events emit safe payloads.
  * [ ] KB does not replace Help Center records.

## Version 0.34.2 - Knowledge Base Browser API, Editorial Workflow, and Internal UI MVP

Implementation shape:

* Build the internal Knowledge Base authoring and publishing workflow first.

* Add article services, browser APIs, internal list/detail/editor views, review/publish actions, revision history, and source-note linking.

* Keep client/public KB routing deferred unless the permission-safe publication layer is ready.

* [ ] Add KB service methods.

  * [ ] Create article.
  * [ ] Read one article.
  * [ ] List articles.
  * [ ] Update article draft.
  * [ ] Submit article for review.
  * [ ] Approve article.
  * [ ] Publish article.
  * [ ] Unpublish article.
  * [ ] Archive article.
  * [ ] Restore article.
  * [ ] Soft-delete article.
  * [ ] List article revisions.
  * [ ] Read article revision.
  * [ ] Restore article revision.
  * [ ] List article publication snapshots.
  * [ ] Read article publication snapshot.
  * [ ] Link source note.
  * [ ] Remove source link.
  * [ ] Create article from note.
  * [ ] Update draft from source note where manual sync is requested.
  * [ ] Validate article access.
  * [ ] Validate publish access.
  * [ ] Generate safe Markdown excerpt.
  * [ ] Generate safe rendered output.
  * [ ] Generate search indexing payload.
  * [ ] Emit safe lifecycle events.

* [ ] Add browser API routes.

  * [ ] `GET /api/kb/articles`
  * [ ] `POST /api/kb/articles`
  * [ ] `GET /api/kb/articles/:articleId`
  * [ ] `PUT /api/kb/articles/:articleId`
  * [ ] `POST /api/kb/articles/:articleId/submit-review`
  * [ ] `POST /api/kb/articles/:articleId/approve`
  * [ ] `POST /api/kb/articles/:articleId/publish`
  * [ ] `POST /api/kb/articles/:articleId/unpublish`
  * [ ] `POST /api/kb/articles/:articleId/archive`
  * [ ] `POST /api/kb/articles/:articleId/restore`
  * [ ] `POST /api/kb/articles/:articleId/delete`
  * [ ] `GET /api/kb/articles/:articleId/revisions`
  * [ ] `GET /api/kb/articles/:articleId/revisions/:revisionId`
  * [ ] `POST /api/kb/articles/:articleId/revisions/:revisionId/restore`
  * [ ] `GET /api/kb/articles/:articleId/publications`
  * [ ] `GET /api/kb/articles/:articleId/sources`
  * [ ] `POST /api/kb/articles/:articleId/sources`
  * [ ] `POST /api/kb/articles/:articleId/sources/:sourceId/remove`
  * [ ] `POST /api/kb/articles/from-note`
  * [ ] Keep public unauthenticated KB routes deferred until public publishing is deliberately enabled.

* [ ] Enforce KB API permissions.

  * [ ] Every route must validate active workspace.
  * [ ] Every read must validate workspace, module state, article visibility, and permissions.
  * [ ] Every write must validate Knowledge Base module state.
  * [ ] Users cannot create KB articles from notes they cannot access.
  * [ ] Users cannot link hidden/private notes unless they can access those notes.
  * [ ] Users cannot use secure notes as KB sources.
  * [ ] Users cannot publish without explicit publish permission.
  * [ ] Users cannot expose client/public visibility unless those modes are enabled.
  * [ ] Disabled module state blocks new writes.

* [ ] Add Knowledge Base navigation and protected views.

  * [ ] Add Knowledge Base navigation when module is enabled.
  * [ ] Add KB article list page.
  * [ ] Add KB article detail page.
  * [ ] Add create article form.
  * [ ] Add edit article form.
  * [ ] Add review/publish controls.
  * [ ] Add source notes panel.
  * [ ] Add revision history panel.
  * [ ] Add publication history panel.
  * [ ] Add tags panel.
  * [ ] Add attachments panel through the shared file helper.
  * [ ] Add disabled-module state.
  * [ ] Add loading, empty, error, permission-denied, draft, review, published, archived, and unpublished states.
  * [ ] Keep layout consistent with existing authenticated module pages.

* [ ] Add KB article list workflow.

  * [ ] Show title.
  * [ ] Show summary.
  * [ ] Show status.
  * [ ] Show visibility.
  * [ ] Show collection/category.
  * [ ] Show tags where allowed.
  * [ ] Show source-note indicator where allowed.
  * [ ] Show attachment count where allowed.
  * [ ] Show updated date.
  * [ ] Show published date where applicable.
  * [ ] Add filters for:

    * [ ] Status
    * [ ] Visibility
    * [ ] Collection/category
    * [ ] Tag
    * [ ] Source type
    * [ ] Author
    * [ ] Updated date
    * [ ] Published date
    * [ ] Archived state
  * [ ] Add pagination.
  * [ ] Add sort by updated date, published date, title, and status.
  * [ ] Do not expose hidden source-note metadata to unauthorized users.

* [ ] Add KB article detail workflow.

  * [ ] Render Markdown safely.
  * [ ] Show title, summary, status, visibility, collection/category, tags, attachments, sources, created date, updated date, and published date where allowed.
  * [ ] Show whether the viewed article is draft/current/published.
  * [ ] Allow permitted users to edit article body, title, summary, collection/category, and visibility.
  * [ ] Allow permitted users to submit for review.
  * [ ] Allow permitted users to approve.
  * [ ] Allow permitted users to publish.
  * [ ] Allow permitted users to unpublish.
  * [ ] Allow permitted users to archive/restore.
  * [ ] Allow permitted users to manage source links.
  * [ ] Allow permitted users to manage attachments.
  * [ ] Show revision history to users with history permission.
  * [ ] Show publication history to users with publish/history permission.
  * [ ] Keep raw Markdown available to the editor.

* [ ] Add create-from-note workflow.

  * [ ] User selects an accessible note.
  * [ ] Secure notes are not selectable.
  * [ ] Private notes require explicit access.
  * [ ] Note title may seed article title.
  * [ ] Note body may seed article body.
  * [ ] Note tags may be suggested but not blindly copied if that creates permission or classification confusion.
  * [ ] Source link should preserve source note ID and source note revision ID where available.
  * [ ] Created KB article starts as `draft`.
  * [ ] Created KB article is not automatically published.
  * [ ] Private/internal source metadata is hidden from users who cannot access it.

* [ ] Add editorial workflow.

  * [ ] Draft articles can be edited by permitted users.
  * [ ] Submit for review changes status to `in_review`.
  * [ ] Reviewers can approve or send back to draft.
  * [ ] Publish requires explicit publish action.
  * [ ] Publish creates a publication snapshot.
  * [ ] Unpublish removes normal access to the published snapshot without deleting article history.
  * [ ] Archive hides article from normal browsing.
  * [ ] Restore reactivates archived article where permitted.
  * [ ] Editing a published article creates draft changes and does not silently alter the published snapshot.

* [ ] Add KB Markdown editor MVP.

  * [ ] Reuse or adapt the Notes Markdown editor helper.
  * [ ] Support preview.
  * [ ] Support common Markdown controls where practical.
  * [ ] Preserve keyboard accessibility.
  * [ ] Show validation errors clearly.
  * [ ] Warn users about unpublished draft changes where applicable.
  * [ ] Keep future WYSIWYG editor replacement isolated behind a browser helper.

* [ ] Add KB UI regressions.

  * [ ] KB navigation appears only when Knowledge Base module is enabled.
  * [ ] Users can create, edit, review, publish, unpublish, archive, restore, and read articles according to permissions.
  * [ ] Users cannot publish without publish permission.
  * [ ] Create-from-note excludes secure notes.
  * [ ] Create-from-note requires access to the source note.
  * [ ] Published snapshots do not change when draft edits are saved.
  * [ ] Public/client visibility is hidden or blocked until enabled.
  * [ ] Disabled Knowledge Base module blocks new writes.

## Version 0.34.3 - Knowledge Base Search, Tags, Attachments, Static Pages, and Permission Boundaries

Implementation shape:

* Integrate KB articles with framework services after the internal authoring workflow exists.

* Keep Knowledge Base searchable separately from Help and Notes.

* Add tag and file integrations without using either as access-control shortcuts.

* Build the static/published page mechanics in a permission-safe way before exposing client/public routes.

* [ ] Register KB articles as searchable records.

  * [ ] Add `searchableTypes` manifest declaration for KB articles.
  * [ ] Index article title.
  * [ ] Index summary.
  * [ ] Index safe body plaintext.
  * [ ] Index collection/category labels.
  * [ ] Index tags as classification metadata.
  * [ ] Index source-note title only where the searching user can access that source metadata.
  * [ ] Index attachment names only if the file framework exposes permission-safe metadata.
  * [ ] Search result type should be `kb_article`.
  * [ ] Search source should be `Knowledge Base`.
  * [ ] Search results should link to KB article detail.
  * [ ] KB search must not be conflated with Help search.
  * [ ] KB search must not be conflated with Notes search.
  * [ ] Search must respect workspace, module state, article visibility, status, permissions, and future client/public boundaries.

* [ ] Register KB articles as taggable records.

  * [ ] Add `taggableTypes` declaration for KB articles.
  * [ ] Allow permitted users to assign workspace tags to KB articles.
  * [ ] Tags are classification metadata only.
  * [ ] Tags must not define KB visibility.
  * [ ] Tags must not define publication state.
  * [ ] Tags must not define client/public access.

* [ ] Register KB articles as attachable records.

  * [ ] Use the framework file attachment contract.
  * [ ] KB should not implement separate file storage.
  * [ ] Internal KB attachments may remain protected.
  * [ ] Client-visible KB attachments require client-safe file handling.
  * [ ] Public KB attachments require public-safe file handling.
  * [ ] Public/client KB pages must not expose private/internal attachments.
  * [ ] Quarantined/pending files must not appear in normal KB UI.
  * [ ] Published snapshots should record which attachments were public/client-safe at publish time where applicable.

* [ ] Add static/published page rendering foundation.

  * [ ] Published article snapshot should be renderable independently from draft body.
  * [ ] Render Markdown to safe HTML through server-side safe renderer.
  * [ ] Strip unsafe HTML, scripts, dangerous links, and unsafe embeds.
  * [ ] Generate safe table of contents where useful.
  * [ ] Generate safe metadata for title, summary, slug, and updated/published dates.
  * [ ] Do not expose raw source note metadata.
  * [ ] Do not expose raw audit data.
  * [ ] Do not expose private attachments.
  * [ ] Do not expose internal comments.
  * [ ] Do not expose hidden linked records.
  * [ ] Do not expose internal author/reviewer metadata on public/client pages unless explicitly allowed.

* [ ] Add internal published preview.

  * [ ] Internal users with proper permission can preview published output.
  * [ ] Preview should show the sanitized/static version.
  * [ ] Preview should identify whether it is viewing draft, latest publication, or historical publication.
  * [ ] Preview should warn when draft changes are unpublished.
  * [ ] Preview should not bypass article permissions.

* [ ] Add permission boundary tests for future client/public KB.

  * [ ] Internal-only KB articles are never returned to client/public routes.
  * [ ] Workspace-visible KB articles require authentication and permission.
  * [ ] Client-visible KB articles require authorized client/project access when enabled.
  * [ ] Public KB articles require explicit public visibility and published state when enabled.
  * [ ] Public/client pages do not expose internal source note links.
  * [ ] Public/client pages do not expose audit records.
  * [ ] Public/client pages do not expose private attachments.
  * [ ] Public/client pages do not expose secure note content.
  * [ ] Public/client search does not expose hidden articles.

* [ ] Add KB Help contribution.

  * [ ] Add Help page for Knowledge Base basics.
  * [ ] Add Help page for KB articles vs Notes.
  * [ ] Add Help page for drafts, review, and publishing.
  * [ ] Add Help page for KB visibility.
  * [ ] Add Help page for KB attachments.
  * [ ] Keep Help pages current-state and task-oriented.
  * [ ] Clearly distinguish Help Center docs from user-authored Knowledge Base content.

* [ ] Add search/tag/file/static regressions.

  * [ ] KB articles are discoverable through global search according to permissions.
  * [ ] KB filter returns KB articles only.
  * [ ] Help filter does not return KB articles.
  * [ ] Notes filter does not return KB articles.
  * [ ] Tags do not control KB visibility or publication.
  * [ ] KB attachments use the shared file framework.
  * [ ] Public/client-unsafe attachments are not exposed on published public/client outputs.
  * [ ] Rendered KB HTML is sanitized.
  * [ ] Published snapshot remains stable after draft edits.

## Version 0.34.4 - Knowledge Base Client/Public Groundwork, Documentation, and Closeout

Implementation shape:

* Close the Knowledge Base foundation by documenting boundaries, testing permission-sensitive paths, and leaving clean hooks for future client/public portals.

* Do not fully open public KB pages unless public-safe files, routing, abuse reporting, and visibility controls are ready.

* Keep the release focused so Calendar and later Dashboard work are not dragged into an unfinished CMS.

* [ ] Add future client-visible KB groundwork.

  * [ ] Reserve authenticated client KB route patterns.
  * [ ] Require client/external user access checks.
  * [ ] Require article status `published`.
  * [ ] Require visibility `client_visible`.
  * [ ] Require client/project context checks if articles are scoped.
  * [ ] Hide internal source notes.
  * [ ] Hide internal author/reviewer metadata unless explicitly allowed.
  * [ ] Hide private/internal attachments.
  * [ ] Hide audit records.
  * [ ] Hide unpublished draft changes.
  * [ ] Do not enable client-visible KB by default until client portal permissions are stable.

* [ ] Add future public KB groundwork.

  * [ ] Reserve public KB route patterns.
  * [ ] Require article status `published`.
  * [ ] Require visibility `public`.
  * [ ] Require public-safe rendered output.
  * [ ] Require public-safe attachments.
  * [ ] Require safe metadata.
  * [ ] Require abuse/reporting plan before broad public user-generated content is exposed.
  * [ ] Add noindex/private behavior for non-public articles.
  * [ ] Do not expose public KB routes by default unless explicitly enabled in workspace/module settings.
  * [ ] Do not expose public KB search until public indexing rules are deliberate.

* [ ] Add KB settings foundation.

  * [ ] Enable/disable Knowledge Base module per workspace.
  * [ ] Configure default article visibility.
  * [ ] Configure whether review is required before publishing.
  * [ ] Configure whether client-visible publishing is allowed once supported.
  * [ ] Configure whether public publishing is allowed once supported.
  * [ ] Configure default collection/category behavior.
  * [ ] Keep settings permission-protected.
  * [ ] Do not allow settings to bypass file safety or permission boundaries.

* [ ] Perform Knowledge Base module integration review.

  * [ ] Confirm KB uses framework services for permissions, tags, search, files, audit, notifications, events, Help, and module lifecycle.
  * [ ] Confirm KB does not bypass file framework APIs.
  * [ ] Confirm KB does not write direct search rows outside the framework search service.
  * [ ] Confirm KB does not hard-code Notes internals beyond stable source-link/service contracts.
  * [ ] Confirm KB does not conflate Help Center records with user-authored KB articles.
  * [ ] Confirm KB does not expose secure note content.
  * [ ] Confirm client/public visibility is blocked unless intentionally enabled.

* [ ] Update developer documentation.

  * [ ] Document Knowledge Base module boundaries.
  * [ ] Document article data model.
  * [ ] Document revision and publication snapshot behavior.
  * [ ] Document Notes-to-KB source relationship.
  * [ ] Document editorial workflow states.
  * [ ] Document visibility rules.
  * [ ] Document KB searchable/taggable/attachable declarations.
  * [ ] Document KB lifecycle events.
  * [ ] Document client/public publishing prerequisites.
  * [ ] Document what Knowledge Base should not own.

* [ ] Update product Help.

  * [ ] Add current-state Knowledge Base usage page.
  * [ ] Add current-state article publishing page.
  * [ ] Add current-state Notes-to-KB page.
  * [ ] Add current-state KB visibility page.
  * [ ] Add current-state KB attachments page.
  * [ ] Keep Help separate from Knowledge Base.

* [ ] Release bookkeeping.

  * [ ] Record Knowledge Base decisions in `DECISIONS.md`.
  * [ ] Update `CHANGELOG.md`.
  * [ ] Bump `package.json` and `package-lock.json`.
  * [ ] Verify `/api/app-info` reports the completed KB version.
  * [ ] Move completed roadmap sections to `ROADMAP-ARCHIVE.md` according to the existing release process.

* [ ] Run verification.

  * [ ] Run focused KB API tests.
  * [ ] Run focused KB UI tests.
  * [ ] Run focused KB editorial workflow tests.
  * [ ] Run focused KB publication snapshot tests.
  * [ ] Run focused KB search tests.
  * [ ] Run focused KB tag tests.
  * [ ] Run focused KB file attachment tests.
  * [ ] Run focused KB Notes-source tests.
  * [ ] Run focused client/public boundary tests.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run SQLite integrity check after KB migrations and publication snapshot tests.

## Version 0.35.0 - Support Tickets Framework Contract

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

## Version 0.35.1 - Ticket Browser API and Services

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

## Version 0.35.2 - Ticket UI MVP

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

## Version 0.35.3 - Ticket Integration Hooks

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

## Version 0.35.4 - Client Ticket Portal MVP

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

## Version 0.35.5 - Ticket Public API Groundwork

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

## Version 0.35.6 - Ticket Regression, Polish, and Closeout

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

## Version 0.36.0 - Calendars and Calendar Views

- [ ] Calendars
  - [ ] Year view
  - [ ] Month view
  - [ ] Week view
  - [ ] Day view
  - [ ] Filters for client (business workspace only)/project

- [ ] Calendar Events
  - [ ] Allow addition of calendar events
  - [ ] Display iCal events from shared calendars

## Version 0.37.0 - Dashboard and Workbench Formalization as Project hub and work center

- [ ] Dashboard should become the hub for managing projects
  - [ ] Add "Urgent" section that shows past due and upcoming tasks, and open support tickets sorted by client and project
  - [ ] Add "Latest Updates" section
    - [ ] Newest clients
    - [ ] Newest projects
    - [ ] Newest tasks
    - [ ] Newest notes
    - [ ] Newest support tickets
    - [ ] Recent time entries with billable amount, if budget tracking is turned on in client/project (eventual feature in 0.4x)
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

## Version 0.39.0 - User Account Security Upgrades and Database/Settings File Backup/Restore

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.39.1 - Passkeys

- [ ] Passkeys

### Version 0.39.2 - User Sessions

- [ ] Sessions should expire after 1 day
- [ ] Super Admins should have ability to log users out
- [ ] Workspace admins should have ability to log users out

## Version 0.39.3 - Login Security Monitoring and Risk Scoring

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

### Version 0.39.4

Super Admins should have a backup/restore function on the dashboard that dumps the current database into a clean file with an app meta data file that has app version stamped and datetime (UTC) of backup in it and zips it into a zip file along with any physical settings files on disk (this will be necessary after packaging for self-hosting and may not yet be necessary, but I want uniform functions for backup/restore that can be easily modified in the future)

- [ ] Create backup function to grab and zip:
  - [ ] Database dump/database file
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

### Version 0.39.5 - Creator Studio / Content Studio Module

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


