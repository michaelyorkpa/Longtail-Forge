# Notes Module Developer Guide

This document describes the current Notes implementation as of 0.33.5.18.6.5.3. It is a developer handoff for the first-party `notes` module, not a product Help page and not a Knowledge Base design.

## Module Boundaries

Notes is a first-party workflow module registered by `src/modules/notes/module.js`. The module owns note-specific schema, migrations, routes, service methods, repository reads/writes, access-policy helpers, Markdown helpers, search indexer shape, and the protected Notes browser workspace.

The framework owns module registration, route mounting, protected view serving, app-shell navigation, permissions, tags, search persistence, file storage, audit logging, internal events, notifications, Help discovery, and module enablement. Notes consumes those framework services through declarations and service calls instead of adding parallel storage or UI systems.

Important files:

- `src/modules/notes/module.js`: manifest, permissions, Help declarations, searchable/taggable/attachable declarations, and event metadata.
- `src/modules/notes/notes.routes.js`: authenticated browser API routes mounted under `/api`.
- `src/modules/notes/notes.service.js`: workflow boundary for CRUD, Library changes, collections, Primary Context, Linked Context, revisions, search sync, audit, and events.
- `src/modules/notes/notes.repo.js`: module-owned SQL for Notes tables only.
- `src/modules/notes/access-policy.js`: Notes permissions, aggregate visibility rules, lifecycle sanitization, and secure-note access checks.
- `src/modules/notes/library.js`: stable Library bucket, visibility, status, Note Kind, legacy note type, and security mode constants.
- `src/modules/notes/markdown.js`: Markdown validation, rendering, excerpting, wiki-link extraction, and revision change summaries.
- `src/modules/notes/secure-crypto.js`: application-managed secure-note encryption helpers.
- `src/modules/notes/search-indexers.js`: `notes.records` search indexer.
- `public/js/notes.js` and `views/protected/notes.html`: browser workspace and UI behavior.
- `docs/workflow-context-contract.md`: shared Primary Context / Linked Context terminology and safe label rules.
- `docs/linked-context-picker-contract.md`: shared Linked Context picker provider/shell contract and normalized target response shape.

## Library Model

Notes use three active Library buckets plus Archive represented by note status:

- `active_work`: current work in progress.
- `ongoing_area`: durable areas that stay active over time.
- `reference`: retained reference material.
- Archive: `notes.status = archived` with the original `library_bucket` preserved.

Library bucket values are categorization metadata. They do not grant access, replace Linked Context permissions, or make private/secure notes visible. `notesService.listLibrary()` counts only notes the current session can read, and archived counts stay separate from active counts.

## Collection Model

Collections live in `note_library_collections`. Notes use single-primary membership through nullable `notes.note_collection_id`; there is no many-to-many collection table in the current implementation.

Collections are scoped to one Library bucket. Parent/child collection trees use `parent_collection_id`, `path_cache`, and `depth`. Moving or renaming a collection recalculates descendant paths and reindexes affected notes through the framework search sync service.

Collections are classification metadata only. They do not grant access, override visibility, bypass secure-note rules, or replace clients/projects/tasks/tickets/users/tags. Collection counts are calculated from permission-filtered note lists, so inaccessible private, secure, or Linked Context-hidden notes do not leak through counts. Moving a note to a different Library bucket clears `note_collection_id` when the prior collection belongs to the old bucket.

Archived collections remain attached to notes but are hidden from normal collection tree data unless archived collections are explicitly requested. Deleting a collection is soft-delete only and is allowed only when it has no non-deleted notes and no active child collections.

## Notes List Sorting

The protected Notes workspace sorts the currently visible Notes List after applying workspace scope, Library, Collection, filters, search fields, and archive status. Sorting is a browser read-surface concern only; it does not mutate note rows, collection membership, timestamps, or saved metadata.

The active sort control lives in the Notes List panel footer, below the scrollable list body. It is bottom-left in the footer while pagination remains bottom-right, and it is hidden automatically when the Notes List disclosure is collapsed. The default sort is `Date Updated (Newest First)`.

Supported Notes List sort modes are `Alphabetical (A-Z)`, `Alphabetical (Z-A)`, `Date Created (Newest First)`, `Date Created (Oldest First)`, `Date Updated (Newest First)`, `Date Updated (Oldest First)`, `Library / Collection, then Date Updated`, `Note Kind, then Date Updated`, and `Primary Context, then Date Updated`. Sort ties fall back deterministically to title and then note id.

## Bucket Behavior

Active Work, Ongoing Areas, and Reference Library use the same record access rules. Their difference is product meaning and filtering, not permission behavior.

Archive is a read-mostly state for notes. Archived notes preserve their original Library bucket and collection, can remain searchable as archived search results, and must be restored before normal edit operations. Archive does not create a fourth `library_bucket` value.

## Bucket Derivation

`deriveSuggestedLibraryBucket()` suggests a bucket from linked context:

- Task or ticket context suggests Active Work.
- Client, project, or user context suggests Ongoing Areas.
- Standalone notes default to Reference Library.

The suggestion is advisory. `normalizeNotePayload()` records whether the bucket was manually supplied or derived through `library_bucket_source`. Derivation must not bypass permissions, visibility, security mode, owner checks, linked-record access, or collection-bucket validation.

## Visibility And Permissions

Notes support `internal`, `workspace`, `private`, `client_visible`, and `public` visibility values at the schema level, but public/client-safe Notes surfaces are not implemented yet. Creating or updating `client_visible` notes requires `notes.publish_client_visible`, and secure notes cannot use `client_visible`.

Read/write behavior is enforced by `canAccessNote()` and the service-layer `assertCanAccess()` calls. Normal Notes permissions do not grant secure-note access. Library buckets, collections, Linked Context, tags, and file attachments are never permission sources by themselves.

Disabled Notes workspaces block writes through module-state checks. Historical reads remain available because the Notes manifest sets `historicalReadAccess: true` and the protected view allows disabled reads.

## Note Data Model

Primary note storage lives in `notes`:

- Identity and scope: `note_id`, `workspace_id`, owner/creator/updater fields.
- Content and classification: `title`, `slug`, Markdown body fields, `note_type`, `library_bucket`, `library_bucket_source`, `note_collection_id`, status, visibility, security mode.
- Primary Context columns: `client_id`, `project_id`.
- Legacy direct context columns retained for compatibility: `task_id`, `ticket_id`, `linked_user_id`.
- Secure envelope fields: encrypted payload, wrapped data key, algorithms, nonces, auth tags, key version, payload version, and `encrypted_at`.
- Import metadata: source IDs, source path, batch ID, original notebook/section/page metadata.

Normal notes store Markdown in `body_markdown`, a safe excerpt in `body_excerpt`, and plain text for indexing in `body_plaintext_index`. Secure notes store safe placeholders in those fields and keep encrypted body content only in the secure envelope columns.

`note_type` remains the database/API field name for compatibility, but the user-facing label is Note Kind. Current Note Kind values are `general`, `meeting`, `research`, `decision`, `procedure`, `reference`, `idea`, and `log`. Legacy linked-context values `client`, `project`, `task`, `ticket`, and `user` remain valid for existing rows and revisions so older data can be displayed and round-tripped safely, but they are no longer offered as new Note Kind choices.

Note Kind is content-kind metadata only. It must not drive permissions, visibility, Library bucket placement, collection membership, Linked Context access, tag assignment, or future Knowledge Base publication. Client/project Primary Context belongs in direct context columns. Flexible related-record context belongs in `note_links`.

## Primary Context And Linked Context

Notes can use direct context columns and flexible `note_links` rows. Direct nullable `notes.client_id` and `notes.project_id` fields are Primary Context. `note_links` rows are Linked Context. Primary Context is used by framework-facing behavior such as permissions, tags, search, files, filters, public API shaping, and future resume context. Linked Context is flexible related-record context and should not replace Primary Context.

The current backend-supported link targets are workspace, client, project, task, note, list, and user; ticket context is reserved until a ticket module exists. Linked Context access is checked before reads, list inclusion, target lookup, link creation, and link removal. If the session cannot read the linked target, the note is hidden or the target operation is rejected. Links connect a note to context; they do not grant access to the note or to the target.

The browser Notes workspace uses the Notes-owned `/api/notes/link-targets` picker route instead of raw ID entry for Linked Context. Picker results are permission-shaped by the target owner before labels are returned. Client, project, task, note, list, and user results include safe human labels, source URLs where the app has a record view, and context hints such as `clientId`, `projectId`, and `suggestedLibraryBucket`. Workspace target support remains for legacy/backend compatibility, but Workspace is not a normal selectable target in the Add/Edit Note picker.

As of 0.33.5.18.6.5.3, the shared Linked Context provider contract is formalized through module manifest `linkedContextProviders` descriptors and the `linked-context-target.v1` normalized response shape, and the framework exposes `LongtailForge.view.createLinkedContextPicker()` as the reusable picker shell. Notes declares itself as a Note target provider, while Clients/Projects, Tasks, Lists, and Users declare their own target providers. The Add/Edit Note dialog now uses the shared picker shell while Notes still owns target availability, target lookup, save payloads, Primary Context inference, and permission-safe labels.

The Add/Edit Note modal exposes Primary Context inside the Note Details disclosure. Business workspaces show nullable Client and Project selects; the Client select lists active clients only. Personal and Family workspaces hide Client and keep Project available. Missing or unknown browser workspace context is treated as non-Business and must not show Client controls. Browser Client controls require both Business workspace type and the `clients_projects` workspace capability. The Visibility dropdown hides `Client Visible` outside client-capable Business workspaces and normalizes stale non-Business `client_visible` editor values back to `internal`. Client labels are the client name only. Project labels are `Project Name - Client Name` for business client projects, `Project Name - Workspace Name` for business workspace projects, and `Project Name` in Personal/Family workspaces.

Task-created notes store the task's readable client/project as Primary Context and the task itself as a normal Linked Context row. The browser no longer writes `notes.task_id` as direct Primary Context; legacy `task_id` payloads are converted into task links, and migration `063_task_note_link_context.sql` repairs existing rows by creating a task link before clearing the direct task column. Removing the task link must not remove Primary Context, and editing Primary Context must not remove unrelated Linked Context.

The Add/Edit Linked Context panel mirrors the View Note row model through the shared picker shell. It starts with a non-removable Primary Context display row, including the `Edit in Note Details` hint, then shows saved Linked Context rows and staged unsaved-note Linked Context rows using readable labels and secondary context. Remove controls belong only to Linked Context rows; Primary Context changes continue to happen through the Note Details controls. Personal and Family workspaces do not show Client as a target and do not include client labels in project/task picker display strings. Business workspaces can show Client when the user can read client/project data, and workspace-level project/task labels use the workspace name when no client name is present.

Saved-note Add/Edit Linked Context mutations are immediate. `Use Target` posts a new `note_links` row through the Notes link API and refreshes the editor rows, underlying detail panel, and note list without requiring Save Note. Removing a saved Linked Context row uses the same API-first refresh path. These browser controls are convenience hints only; service-layer access checks remain authoritative.

For new unsaved notes, `Use Target` stages each selected target in local draft state and renders it as a removable Linked Context row before the note exists. Saving the note sends the staged targets as the create payload's `links` array so they become `note_links` rows. Removing a staged row removes only that draft link and does not clear Primary Context. Selecting a task still infers project/client Primary Context where those readable values are present. Task targets suggest Active Work. Client, project, and user targets suggest Ongoing Areas. Manual Library bucket choices are treated as user intent and are not overwritten by later picker changes.

Note detail reads decorate Primary Context and `note_links` with safe labels and navigation URLs where available. Missing or inaccessible targets return an unavailable state or a safe fallback label such as `Unavailable client`, `Unavailable project`, `Unavailable task`, `Unavailable note`, `Unavailable list`, or `Unavailable linked context`. Normal Notes UI must not display raw target IDs or UUIDs for unresolved context; Audit Logs may still display raw IDs because they are administrative records.

## Linked Context Panel Helper

Notes owns the reusable browser helper at `public/js/shared/notes-linked-panel.js`. Other modules should mount `LongtailForge.notesLinkedPanel.mount(container, options)` instead of querying Notes tables or rebuilding note visibility rules.

The helper accepts `targetType`, `targetId`, optional `moduleId`, optional `clientId`, optional `projectId`, optional `readonly`, optional `sort`, and display options such as `title`, `emptyMessage`, and `saveFirstMessage`. It calls `/api/notes/for-target` for the service-owned read model, then renders linked notes, visibility/security/status badges, safe note URLs, a create link into `notes.html?targetType=...&targetId=...`, a link-existing-note form, and permitted unlink actions.

`/api/notes/for-target` returns `linkedNotes`, compatibility `notes`, the shaped `target`, `moduleState`, and `actions`. Browser helpers must treat `actions.canCreate`, `actions.canLink`, `actions.canUnlink`, and `actions.readonly` as display hints only; the Notes service still enforces permissions on create/link/unlink writes. When Notes is disabled and historical reads are allowed, the helper shows permitted linked notes read-only and hides create/link/unlink controls.

The Tasks module mounts this helper in the Task detail dialog. Task-created note links include task context plus available project/client context, default Note Kind to `log`, suggest the Active Work Library bucket, and keep the normal `internal` visibility default unless the user changes it. Task list note counts also use the Notes-owned target read model so private, secure, disabled, or inaccessible notes do not leak through badge counts.

## Resume Context Hooks

Notes exposes a producer-owned `notesService.listResumeContext(session, options)` read model for future resume-state consumers. It returns permission-shaped Active Work note candidates with safe title, note kind, Library bucket, status, visibility/security badges, context identifiers for internal consumers, safe note links, source URL, and last-updated timestamps.

Recently edited Active Work notes may be eligible for future "Pick up where I left off" experiences, and Active Work notes linked to current work can appear as supporting context. Reference Library, Ongoing Areas, archived, deleted, private, and secure notes are excluded from this resume-context candidate payload. Secure/private note bodies, excerpts, hidden counts, and titles from notes the user cannot read must not appear in future Workbench or resume-context consumers.

Global resume-state storage, ranking, dismissal, Workbench feed behavior, and framework-owned resume APIs remain deferred to the framework resume-state roadmap line. Notes only provides safe source context; it does not own the global resume framework.

## Markdown And Wiki Links

Markdown is the canonical editable body format. `markdown.js` validates unsafe input, renders safe HTML, extracts plain text, creates excerpts, detects wiki-style links, and summarizes revision changes. It is a Notes-owned adapter over the framework Markdown service, so Notes keeps wiki-link and secure-note behavior while sharing the platform renderer, plain-text extraction, excerpts, source normalization, and safe URL rules.

The supported syntax follows the framework Markdown contract: CommonMark paragraphs, headings, emphasis, strong text, links, blockquotes, inline code, fenced code blocks, ordered lists, unordered lists, nested lists, plus approved tables and task lists. Raw HTML, scriptable links, unsafe image sources, broad Markdown extension bundles, and saved-source rewrites remain out of scope.

Saved note reads include `body_html` rendered through the Notes adapter. Draft preview uses the protected `POST /api/notes/preview` route, which validates the draft body and returns safe rendered HTML without persisting the note. The browser editor remains a Markdown textarea with preview; `public/js/shared/notes-editor.js` owns scoped authoring helpers for Tab indentation, Shift+Tab outdent, predictable Enter list continuation, and empty-marker cleanup.

Wiki-style links are stored in `note_wiki_links` as detected metadata. Broken or unresolved wiki links are allowed. Detection must not auto-create notes and must not expose private or secure notes to unauthorized users.

## Revisions And Changelog

Note revisions live in `note_revisions`. Notes do not create an initial revision at creation time. Meaningful edits create a before-edit snapshot; revision lists are newest-first and use user-facing change summaries from `describeRevisionChanges()`.

Restoring a revision creates a new note update and a new revision snapshot rather than mutating history. Archived notes are read-only until restored. Secure revision lists are metadata-only; dedicated revision reads decrypt secure revision bodies only after secure-history checks.

Audit logs and revisions are separate. Revisions preserve note state for user workflows, while audit records preserve safe operational history.

## Secure Notes

Secure notes are a specialized `security_mode = secure` note type with stricter access and encryption-at-rest behavior.

The first implementation uses application-managed envelope encryption:

- `LONGTAIL_SECURE_NOTES_MASTER_KEY` or `SECURE_NOTES_MASTER_KEY` supplies the server-side key-encryption key.
- `LONGTAIL_SECURE_NOTES_KEY_VERSION` supplies the current write key version.
- A random per-note data key encrypts the body with AES-256-GCM.
- The data key is wrapped with the server-side key.
- Notes and revisions store encrypted payloads, wrapped data keys, algorithms, key version, payload version, nonces, auth tags, and encrypted timestamp.

Secure note titles remain plaintext metadata. The UI warns users not to put secrets in titles. This is database-at-rest protection, not zero-knowledge: a configured app server can decrypt after session and permission checks.

Secure-note access is owner-only plus explicit secure-note permissions such as `notes.secure.view` and `notes.secure.manage`. Normal `notes.view`, workspace membership, Library bucket, collection, Linked Context, tag, and file permissions do not grant secure body access. External/client users receive no default secure-note access.

Secure note bodies are excluded from normal search, audit metadata, lifecycle metadata, notifications, Help content, file attachments, public/client controls, and list/collection previews. Existing plaintext secure placeholders block activation until recreated or explicitly migrated through reviewed tooling.

Operators must back up secure-note keys outside the database. Losing or misconfiguring the key makes secure-note bodies fail closed and can make encrypted content unrecoverable.

## Manifest Declarations

Notes declares these framework integration points in `module.js`:

- `permissions`, `requiredPermissions`, `defaultRolePermissions`, and `resourceDefinitions`.
- `browserApiRoutes`, `protectedViews`, `browserAssets`, navigation, and a module-status setting.
- `auditRecordTypes`, `eventTypes`, `eventSummaries`, and `notificationEvents`.
- `taggableTypes` for note tags through the framework tag service.
- `tagPropagation` rules for client/project tags inherited into linked notes through framework propagated-tag assignments.
- `searchableTypes` using the `notes.records` indexer.
- `attachableTypes` using the framework file service and shared browser attachment helper.
- `publicApiRoutes`, `publicApiEndpoints`, and the `notes:read` scope for read-only public Notes access.
- `help.sections` and `help.articles` for current-state product Help.

Notes declares read-only public API routes for non-secure notes. Notes write routes, secure-note public access, revision routes, collection management, and linked-record mutations remain internal/browser workflows.

## Search, Tags, And Files

Tags are framework-owned. Notes saves direct/manual note tags through `tagsService.replaceAssignments()` and decorates reads/lists through the tag service. Notes linked to client or project context receive propagated client/project tags through framework tag-propagation rules. Tags do not drive permissions, visibility, Library buckets, collection membership, billing, or workflow status.

Search is framework-owned. Notes registers `notes.records`, returns normalized search documents, and requests persistence through `searchIndexSyncService`. Notes must not write directly to `search_index` or SQLite FTS tables. Normal search indexes non-secure, non-private notes by title, safe body text, Library bucket, status, safe linked context, collection metadata, and tags.

Files are framework-owned. Notes declares an attachable `note` target and uses the shared browser file attachment helper. Notes must not create file storage tables, direct static download routes, upload routes, scanner behavior, quarantine state, or attachment UI outside the framework file service. Secure notes block framework-managed attachments until a deliberate secure-attachment model exists.

## Lifecycle Events

Notes declares and emits safe internal events for note create, update, revision create, Library change, archive, restore, delete, link, unlink, visibility change, security-mode change, and attachment-related lifecycle declarations.

Event and audit payloads use `sanitizeNoteLifecyclePayload()` and `safeAuditValue()` so raw Markdown bodies, rendered HTML, secure payloads, wrapped keys, auth material, and hidden linked-record details are not exposed through framework event/audit/notification paths.

Notification behavior is deliberately conservative. Notes only declares an owner-update notification path for another user updating a non-secure note.

## Import Metadata

Notes stores OneNote/import-friendly metadata on notes and revisions:

- `import_source`
- `import_source_id`
- `import_source_path`
- `imported_at`
- `import_batch_id`
- `original_notebook`
- `original_section_group`
- `original_section`
- `original_page_id`

`ensureCollectionsForImportPath()` maps imported notebook/section paths into `note_library_collections` using `collection_source = imported` and source metadata. Import metadata does not grant access, does not make notes client-visible, and does not imply private or secure source material is safe to import into normal notes.

The 0.33.3.4 import planning closeout lives in `docs/notes-import-planning.md`. It preserves room for a future OneNote import workflow without implementing importer routes, source connectors, Knowledge Base publication, or new access inheritance.

## What Notes Should Not Own

Notes should not own:

- Framework permission storage, role sync, or module enablement.
- Global navigation chrome, app shell rendering, or protected view serving.
- Global search routes, search persistence, FTS storage, or search results UI.
- Tag definitions, tag propagation, effective-tag computation, or tag permissions.
- File storage, upload/download routes, scanner/quarantine state, or shared file UI.
- Audit infrastructure, notification delivery, or internal event dispatch.
- Help Center chrome, Help search indexing, or user-authored Knowledge Base content.
- Public/client Notes exposure before an explicit public-safe contract exists.
- Secure attachment behavior before an explicit secure-file model exists.
- Per-note secure sharing or zero-knowledge vault behavior before those models are deliberately designed.
