# Longtail Forge Roadmap

This file is the detailed per-version forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

Completed 0.33.5.18.6.1 through 0.33.5.18.6.11 are archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.11.1 through 0.33.5.18.11.13 are archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.12.1 through 0.33.5.18.12.7 are archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.13.1 through 0.33.5.18.13.3 are archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.14.1 is archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.14.2 is archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.14.3 is archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.14.4 is archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.14.5 is archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.18.15 is archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.19 runtime configuration and SQLite small-office foundation work is archived in `ROADMAP-ARCHIVE.md`. Completed 0.33.5.20 bounded queries and small-office scale data work is archived in `ROADMAP-ARCHIVE.md`.

## Version 0.33.5.21 - Durable Jobs and Outbox Foundation

Purpose:

Add a SQLite-compatible background job/outbox system that works simply in self-hosted mode and can evolve into a separate worker model for hosted SaaS.

Decision:

Jobs are Node-side work stored in database tables. SQL stores job state; Node workers perform the work.

SQLite mode may run jobs inline or through at most one local worker process attached to the same local install.
PostgreSQL/SaaS mode should run one or more separate worker processes and may scale into a worker fleet.

Entry contract from 0.33.5.19: use the provider-neutral transaction helper for atomic job/outbox writes and consume the reserved worker runtime config names without requiring a separate worker in SQLite mode.

Foundation and hardening slices 0.33.5.21.0 through 0.33.5.21.8 are complete. Remaining slices in this branch:
The active roadmap continues with durable jobs and outbox foundation work.

### Version 0.33.5.21.9 - User-facing UI fixes (markdown links, task complete, notes files, theme switch)

Purpose:

A batch of user-facing fixes promoted from `TODO.md`'s Short Term section. These are independent of the durable-jobs work in this branch and share no runtime surface with jobs; they are grouped here only as a convenience grab-bag. Each sub-slice can land and be closed independently. Where a change adds a user preference, follow the existing per-user settings pattern (schema column + migration, repo `USER_SELECT_COLUMNS` + writer, normalizer + `userRowToAppValue` mapping, `users.service.js` `readSettings`/`saveSettings`, `views/protected/user-settings.html` fieldset, `public/js/user-settings.js` load/save handlers).

#### Version 0.33.5.21.9.1 - External markdown links open in a new tab (configurable)

Context: markdown is rendered server-side with markdown-it and the resulting HTML is cached on the record (`note.body_html`) and shared across all users, so a per-user preference must NOT be baked into the server-rendered HTML — that would fragment the cache and leak one user's preference into another user's view. Wiki links already render as `span.note-wiki-link[data-note-title]` (not anchors) in `src/modules/notes/markdown.js:79`; only real external anchors (`a[href^="http"]`) are in scope. External anchors are emitted by the `link_open` rule in `src/core/markdown/markdown.service.js:85-99` and currently carry no `target`, so they open in the same tab.

- [x] Add a user-level boolean preference "Open external links in a new tab" (default off) using the standard settings pattern above:
  - [x] Schema column on `users` + migration (model on `theme_mode` at `src/db/schema/current.sql:28`).
  - [x] `USER_SELECT_COLUMNS` + a `updateOpenExternalLinksNewTab()` writer in `src/repositories/users.repo.js` (model on `updateThemeMode` at 189-195).
  - [x] Boolean normalizer in `src/utils/normalizers.js` (model on `normalizeThemeMode` 96-98) and mapping in `userRowToAppValue` (100-111).
  - [x] Return it from `readSettings` and handle it in `saveSettings` in `src/services/users.service.js` (model on the `themeMode` block ~588-596).
- [x] Add a new "Markdown Rendering" fieldset to `views/protected/user-settings.html` (model on the Appearance fieldset 15-26) with a toggle, wired in `public/js/user-settings.js` (load + `save…()` PUT handler).
- [x] Apply the preference client-side so the shared cached HTML is not user-specific: after the browser injects rendered markdown (`public/js/notes.js:1464` `body.innerHTML = note.body_html`, and the live preview at `:2531`), post-process `a[href]` anchors whose href is an absolute `http(s)` URL, adding `target="_blank"` and `rel="noopener noreferrer"` only when the preference is on. Do not touch `.note-wiki-link` spans or relative/`mailto:` links.
- [x] Verification:
  - [x] With the preference on, external links in a rendered note open in a new tab and carry `rel="noopener noreferrer"`; with it off they open in the same tab.
  - [x] Wiki links and internal navigation are unaffected in both states.
  - [x] The cached `body_html` is byte-identical regardless of which user viewed it (no per-user server-render fragmentation).

Acceptance criteria:

- Users can opt into external markdown links opening in a new tab from User Settings → Markdown Rendering, applied without changing the shared server-rendered/cached HTML.

#### Version 0.33.5.21.9.2 - "Complete" button in the task edit modal

Context: the task edit modal (`public/js/task-dialog.js`) has only Cancel + Save in its footer (`footerActions` at 1959-1962). Completing a task from the modal today requires changing the Status select to "Complete" and saving, which goes through `PUT /api/tasks/:id` (`tasksService.update`) and — unlike the dedicated `POST /api/tasks/:id/complete` route (`tasks.service.js:521-560`) — skips the active-timer guard and does not queue recurrence generation. The list view already exposes a proper checkmark Complete action (`public/js/tasks.js:1243-1251` → `postTaskAction(record, "complete")`).

- [x] Add a "Complete" (checkmark) button to the task editor modal footer:
  - [x] Add a `{ id: "complete", label: "Complete", icon: "complete", role: "primary" }` entry to `taskEditorModalDescriptor().footerActions` (`task-dialog.js:1959-1962`) and render/wire it in `taskEditorCommitActions()` (1992-2010), using the shared `complete` icon.
  - [x] Bind a click handler (near the submit binding at `task-dialog.js:357`) that first persists edits via the existing `saveTask` flow, then calls the dedicated `POST /api/tasks/:id/complete` route — the same endpoint the list view uses — so the active-timer guard, `task_completed` audit/event, and recurrence generation all run.
- [x] Gate the button: require the `tasks.complete` permission and a current status of `open`/`in_progress`/`blocked` (mirror the list action's `requiredPermissions`/`visibleStatuses`), and only show it for an already-saved task (needs a `task_id`); hide it when creating a new task.
- [x] Handle the recurrence result: `complete` may return a `createdTask` (next recurring instance); surface/refresh it the same way the list-view complete flow does.
- [x] Verification:
  - [x] Clicking Complete in the modal saves pending edits and completes the task via the dedicated route (recurrence fires; active-timer block is respected).
  - [x] The button is hidden without `tasks.complete`, for terminal statuses, and for the new-task form.

Acceptance criteria:

- A task can be saved-and-completed in one action from the edit modal, with the same side effects as the list-view Complete action.

#### Version 0.33.5.21.9.3 - Notes file panel: preview button and icon buttons

Context: the Notes "Files" surfaces mount the shared attachment component (`public/js/shared/file-attachments.js`), whose row actions (Download/Remove/Report/Review/Delete/Restore, `:394-499`) are rendered as plain text labels with no `icon`, and which has no preview action at all. The standalone Files module already solves both: it renders these same actions as icon buttons (`public/js/files.js:799-981`, e.g. `icon:"eye"` preview, `icon:"download"`) and owns a reusable preview modal (`openFilePreview`/`buildFilePreviewDialog`/`loadFilePreview` at `files.js:988-1211`, eligibility at `1886-1961`). The icon infrastructure (`public/js/shared/icons.js`, and `view.createActionButton`'s `icon`/`iconOnly` bridge at `view-builder.js:1397-1415`) is already app-wide; the needed glyphs (`eye`, `download`, `delete`, `restore`, `alert`, `shield-alert`) already exist in the registry.

- [x] Extract the file preview flow out of `public/js/files.js` into a shared module (or expose it on `window.LongtailForge`) so both the Files module and the Notes attachment panel call one implementation. Move `openFilePreview`, `buildFilePreviewDialog`, `loadFilePreview`, the image/text/markdown/unavailable renderers, and `previewAvailabilityForRow`/`previewKindForExtension`/`previewUnavailableLabel`. Keep `files.js` behavior identical after extraction.
- [x] Add a preview action to the shared attachment rows in `public/js/shared/file-attachments.js` (`createAttachmentActions` 394-453), gated on the shared preview-eligibility check, calling the extracted preview modal — so the note detail files panel (`notes.js` `renderFilesPanel`/`mountFilesPanel` 2814-2849) and the note editor Files dialog both get preview.
- [x] Convert the shared attachment component's text-label buttons to icon buttons matching the Files module: pass `icon` (and `iconOnly` where the Files module does) to the existing `createActionButton`/`createAttachmentActionButton` calls — Download→`download`, Remove/Delete→`delete`, Report→`alert`, Review→`shield-alert`, Restore→`restore`, Preview→`eye`. Keep accessible labels (title/aria-label) even when icon-only.
- [x] Verification:
  - [x] A file attached to a note shows a working Preview button in the note detail files panel and the editor Files dialog, using the same preview modal as the Files module.
  - [x] Attachment row actions render as icons consistent with the Files module, with accessible labels preserved.
  - [x] The Files module page still previews and acts on files unchanged after the preview extraction.

Acceptance criteria:

- The Notes files view has a preview button and icon-based action buttons, sharing one preview implementation and the app-wide icon system with the Files module.

#### Version 0.33.5.21.9.4 - Three-position theme switch (light / auto / dark)

Context: theme is a binary light/dark preference everywhere — stored as `users.theme_mode` (`src/db/schema/current.sql:28`, values only `"light"`/`"dark"`), normalized by `normalizeThemeMode` (`src/utils/normalizers.js:96-98`, the single source of truth the backend imports), applied to `html[data-theme]` in three browser spots (`public/js/theme-init.js:12-25`, `public/js/navigation.js:846-853`, `public/js/user-settings.js:154-163`), and toggled by a two-position slider checkbox (`views/protected/user-settings.html:19-24`, CSS `public/css/longtail-forge.css:3077-3123`). There is no "auto" mode and no `prefers-color-scheme` detection anywhere. User timezone is already stored (`users.timezone`, `src/db/schema/current.sql:26`; client accessor `public/js/shared/timezones.js`).

- [x] Add `"auto"` as a valid stored `theme_mode` value: extend `normalizeThemeMode` (`normalizers.js:96-98`) to allow `light`/`auto`/`dark` (keep default light). No schema type change needed (already `TEXT`); confirm the default stays `light`.
- [x] Replace the two-position checkbox with a three-position control (light / auto / dark, "Auto" in the middle) in `views/protected/user-settings.html:19-24` — e.g. a radio/segmented control — and update the CSS (`longtail-forge.css:3077-3123`) from a binary slider knob to a 3-position/segmented style.
- [x] Update the browser theme logic to resolve `auto` to an effective `light`/`dark` for the `data-theme` attribute:
  - [x] `resolveThemeMode` in `public/js/theme-init.js` (currently a pass-through, 23-25) and `applyThemeMode` in `public/js/navigation.js:846-853` and `public/js/user-settings.js:154-163`.
  - [x] `getSelectedThemeMode`/change listener in `public/js/user-settings.js` (39-43, 480-482) to read the 3-way control.
- [x] Add a secondary "auto source" control, only active/visible when the mode is `auto`, choosing how auto resolves:
  - [x] "Match operating system" — resolve via `window.matchMedia("(prefers-color-scheme: dark)")`, re-resolving on the media-query `change` event (net-new; no `prefers-color-scheme` usage exists today). This is the recommended default auto source.
  - [x] "Follow sunrise/sunset" — deferred to a follow-up because accurate sunrise/sunset needs an explicit location contract and only an IANA timezone is stored today. This decision is recorded in `DECISIONS.md`.
  - [x] Persist the auto-source choice as a second user preference using the standard settings pattern (schema column + migration, repo, normalizer/mapping, service read/save, settings UI). It only takes effect while mode is `auto`.
- [x] Keep the pre-render flash guard working: `theme-init.js` must resolve `auto` before first paint (read the auto-source preference from the existing cookie/localStorage path, not an async fetch).
- [x] Verification:
  - [x] The switch offers light / auto / dark; auto with "match OS" flips the applied theme when the OS scheme changes, with no flash on load.
  - [x] Existing stored `light`/`dark` preferences continue to resolve unchanged.
  - [x] Sunrise/sunset is deferred, and `auto` cleanly falls back to OS match.

Acceptance criteria:

- Theme can be set to light, dark, or auto (three-position switch), and in auto mode resolves via OS color scheme (and, if in scope, sunrise/sunset by the user's timezone) without a load flash and without breaking existing light/dark preferences.

## Version 0.33.5.22 - Storage Provider and Scanner Runtime

Purpose:

Keep local file storage simple for SQLite/self-hosted mode while making storage provider selection configuration-owned and preparing for S3-compatible SaaS storage.

Entry contract from 0.33.5.19: consume the documented storage and scanner runtime config keys without changing existing Files storage semantics until this branch owns the behavior.

Current wiring (grounding for this branch):

- The config keys already exist but are inert: `config.storage.provider` (default `local`) and `config.scanner.mode` (default `none`) are defined in `src/config.js:133-142` and only *echoed* by `src/services/runtime-diagnostics.service.js:43-48` — nothing consumes them to select an adapter yet.
- The upload write path hardcodes storage: `getFileStorageAdapter("local")` / `storageProvider: "local"` in `src/services/files.service.js:189-193`. Reads are already per-row (`getFileStorageAdapter(file.storage_provider)` at `:609`/`:660`), so existing local rows keep resolving.
- The scanner is hardcoded the same way: `let scannerAdapter = createNoopFileScannerAdapter()` at `src/services/files.service.js:92`, invoked at `:1663` inside `scanFile`. `config.scanner.mode = "none"` is never read, so the effective behavior today is always noop regardless of config.
- Admin diagnostics already exist end-to-end: `GET /api/runtime-diagnostics` (`runtimeDiagnosticsService.read`) → `public/js/workspace-settings.js:225-250` renders "Storage Provider" and "Scanner Mode" rows. This branch should *extend* that existing surface, not build a new one.
- Adapter contracts: `registerFileStorageAdapter` requires `save/read/metadata/delete/health` (`files.service.js:116`) and the local adapter satisfies `health()` (`local-storage-adapter.js:20-23`); `registerFileScannerAdapter` requires only `scan()` (`files.service.js:127`) and the noop scanner has **no** `health()`/availability method. The scanner health work below must therefore grow the scanner adapter contract, not just reuse the storage one.

Sizing rule for this branch:

- Each sub-slice below should have one primary blast radius and should be completable in a single focused implementation session.
- Each implementation sub-slice still follows the normal release ceremony for the version it lands: focused regressions, relevant docs, `CHANGELOG.md`, package metadata when the version changes, and verification.
- Do not combine adjacent slices just because the same helper file is already open.

### Version 0.33.5.22.1 - Storage provider resolver and local write path

- [x] Add a service-owned configured storage provider resolver that reads `config.storage.provider`.
- [x] Route the upload write path through the configured provider: replace the hardcoded `getFileStorageAdapter("local")` and `storageProvider: "local"` in `src/services/files.service.js` with the resolved provider ID, keeping the stored `files.storage_provider` per-row so existing local files still read back correctly.
- [x] Fail fast on an unknown configured provider at resolution time (reuse the existing `getFileStorageAdapter` "provider is not configured" 500 path at `files.service.js:139-141`) rather than silently falling back to `local`.
- [x] Keep `local` as default for SQLite/self-hosted mode.
- [x] Do not change download, preview, File Context, attachment-panel, scanner, diagnostics UI, S3, or streaming-upload behavior in this slice.
- [x] Add regressions proving:
  - [x] Local storage remains default.
  - [x] A configured `local` provider is stored on new upload rows.
  - [x] Unknown provider fails clearly (surfaced as an error, not a silent local fallback).
  - [x] Existing local rows still read through their stored `files.storage_provider`.

Acceptance criteria:

- Storage provider selection is centralized for new writes, existing local files still read through per-row provider metadata, and unknown configured providers fail loudly.

### Version 0.33.5.22.2 - Storage diagnostics and local storage docs

- [x] Add provider health checks: call the adapter `health()` method (already implemented for local at `local-storage-adapter.js:20-23`) from the diagnostics path and normalize the result into a safe availability status without leaking the absolute root path.
- [x] Extend the existing admin diagnostics (do not add a new surface): the `storage` block returned by `runtimeDiagnosticsService.read` (`runtime-diagnostics.service.js:43-45`) and its "Storage Provider" row in `public/js/workspace-settings.js:240` should expose:
  - [x] Provider ID.
  - [x] Availability status from the provider `health()` check.
  - [x] Local root path as a safe/redacted label, reusing the existing `safeDataDirectoryLocation`/redaction helpers in `runtime-diagnostics.service.js:121-141` so the raw filesystem path is not exposed.
- [x] Add local storage docs and update runtime-configuration docs so `LONGTAIL_STORAGE_PROVIDER=local` and `LONGTAIL_LOCAL_STORAGE_ROOT` are marked live rather than merely reserved.
- [x] Add regressions proving:
  - [x] Runtime diagnostics reports safe storage provider health.
  - [x] The Workspace Settings readout renders provider status without a new admin surface.
  - [x] File routes and diagnostics do not expose storage keys, protected paths, raw local roots, or signed URLs.

Acceptance criteria:

- Admin diagnostics can show the configured local storage provider and safe availability status without exposing filesystem internals.

### Version 0.33.5.22.3 - Streaming write contract and multipart decision

- [x] Prepare file uploads to move away from JSON-body file payloads by settling the transport and storage-write contracts first.
- [x] Decide the multipart mechanism explicitly: no multipart parser exists today (uploads are base64-in-JSON via the hand-rolled `readJsonBody` in `src/utils/http.js`, capped at 8 MB JSON / 5 MB decoded file), so this slice adds either a streaming multipart dependency or a hand-rolled parser. Record the dependency decision in `DECISIONS.md`.
- [x] Extend the storage adapter write contract for streaming: `save()` takes a fully-buffered `Buffer` today (`local-storage-adapter.js:41-48`), so a streamed HTTP body still buffers end-to-end unless `save()` gains a stream/`pipeline`-based path. Add a streaming save variant (or accept a `Readable`) so local writes go body → disk without a full in-memory buffer, and keep the buffered signature working for existing callers.
- [x] Keep the existing base64 JSON routes and browser helper unchanged in this slice.
- [x] Add focused adapter-level regressions proving:
  - [x] Buffered `save()` callers still work.
  - [x] A streamed local save writes through the same storage-key safety rules.
  - [x] Stream errors clean up partial local writes where practical.

Acceptance criteria:

- The storage adapter contract can accept streamed bytes without breaking existing upload callers.

### Version 0.33.5.22.4 - Multipart upload route and Files lifecycle

- [ ] Add the first streamed/multipart upload route for local/self-hosted mode without removing `POST /api/files`.
- [ ] Parse one uploaded file plus attachment metadata through the selected multipart mechanism from 0.33.5.22.3.
- [ ] Add upload size enforcement at the streamed route boundary.
- [ ] Keep the post-write pipeline identical for the streamed route: it must still create the file record, `queueFileScanJob` (`files.service.js:197`), and `attachFile` so uploaded files land `pending`/scan-`pending` exactly as the base64 path does (per 0.33.5.21.7.1). Streaming changes only how bytes reach the storage adapter, not the lifecycle.
- [ ] Preserve permission checks, target validation, audit/lifecycle behavior, scan/download/preview availability gates, and per-row `files.storage_provider`.
- [ ] Add regressions proving:
  - [ ] Successful streamed upload creates and attaches a pending file.
  - [ ] Oversized streamed upload is rejected before storing a usable file.
  - [ ] Failed parsing/storage does not leave an attached orphan.

Acceptance criteria:

- A single streamed upload can land through the normal Files lifecycle without changing the existing JSON upload contract.

### Version 0.33.5.22.5 - Streamed batch upload and attachment helper migration

- [ ] Add streamed/multipart batch upload support with per-file result reporting.
- [ ] Update the shared attachment helper to prefer the streamed batch route while preserving the current upload UI, dropzone, save-first behavior, host refresh callbacks, and upload-result messages.
- [ ] Preserve existing route compatibility for the base64 JSON route during the transition window.
- [ ] Add regressions for:
  - [ ] Successful multi-file upload.
  - [ ] Partial batch failure.
  - [ ] Browser helper result rendering for pending-review uploads.
  - [ ] Host refresh/event callbacks after streamed batch completion.

Acceptance criteria:

- Attachment-panel uploads no longer require base64 JSON for the normal browser path, and partial failures remain visible and recoverable.

### Version 0.33.5.22.6 - Upload compatibility and error hardening

- [ ] Define the transition window: how long the base64 JSON route (`POST /api/files` / `POST /api/files/batch`) and the new streamed routes coexist, and when the shared attachment helper's base64 path is retired.
- [ ] Harden cancellation/error behavior for streamed uploads: aborted client requests, parser errors, storage stream errors, and oversized payloads should not leave active file records, attachments, or usable partial files.
- [ ] Keep unsupported files download-only and preserve all scan/download/preview availability rules.
- [ ] Add regressions for:
  - [ ] Upload cancellation/error cleanup.
  - [ ] Legacy base64 route compatibility while the route remains supported.
  - [ ] Size-limit copy and failure response shape stay useful.

Acceptance criteria:

- Streamed upload failure modes are bounded, legacy compatibility is explicit, and the base64 route has a documented retirement path.

### Version 0.33.5.22.7 - Scanner mode resolver and none/noop policy

- [ ] Formalize scanner modes:
  - [ ] `none`
  - [ ] `noop`
  - [ ] `clamd`
  - [ ] `clamscan`
- [ ] Define the `none` vs `noop` distinction precisely (e.g. `none` = do not scan / mark available; `noop` = pass-through adapter for tests), since only `noop` exists today (`src/core/files/scanner-adapter.js`) while config defaults to `none`.
- [ ] Resolve the scanner adapter from `config.scanner.mode` instead of hardcoding: replace the module-level `let scannerAdapter = createNoopFileScannerAdapter()` (`src/services/files.service.js:92`) with a config-driven selection so `none`/`noop`/`clamd`/`clamscan` map to the right adapter.
- [ ] Keep `scanFile` as the service-owned scanner call site; if adapters need file bytes, pass a service-owned safe scan context instead of exposing storage paths, keys, or scanner internals outside the service boundary.
- [ ] Cross-reference 0.33.5.21.7.1: `file.scan` now owns upload scan execution, uploaded files stay pending/unavailable until the worker completes the job, and this slice should make scanner adapter configuration the single owner of any future pending scan -> available/quarantine transition changes.
- [ ] Reuse the existing quarantine/review lifecycle (`files.manage_quarantine`, the `Mark Reviewed` restore path) rather than introducing new scan states.
- [ ] Decide the `none`-mode disposition for pending files explicitly: since `file.scan` leaves files `pending`/unavailable until a result lands, `none` must still drive files to a terminal available state (e.g. resolve to `scan_status = not_required`/`available`) so uploads are not stuck unavailable forever when scanning is off. Keep this transition owned here, per the cross-reference above.
- [ ] Keep no-op scanner only for development or explicitly accepted self-hosted mode.
- [ ] Add regressions proving:
  - [ ] `none` mode does not leave uploaded files stuck pending forever.
  - [ ] `noop` mode remains an explicit pass-through mode.
  - [ ] Unknown scanner modes fail clearly instead of silently falling back.
  - [ ] Scanner execution does not bypass Files permissions, download gates, or preview gates.

Acceptance criteria:

- Scanner mode selection is configuration-owned, disabled scanning has a deliberate terminal disposition, and `noop` is no longer the hidden default.

### Version 0.33.5.22.8 - Scanner health diagnostics and disabled warning

- [ ] Grow the scanner adapter contract to support health/availability: `registerFileScannerAdapter` requires only `scan()` today (`files.service.js:127`) and the noop adapter exposes no `health()`. Add an optional `health()`/availability method to the contract and give each built-in adapter one, so diagnostics has something safe to call.
- [ ] Add scanner health checks by calling the adapter `health()` from the diagnostics path.
- [ ] Add admin warning when scanner is disabled by extending the existing diagnostics surface: the `scanner` block in `runtimeDiagnosticsService.read` (`runtime-diagnostics.service.js:46-48`) and its "Scanner Mode" row (`public/js/workspace-settings.js:241`) should surface mode + availability and a visible warning when mode is `none`/`noop`, alongside the existing `configurationWarnings` channel.
- [ ] Do not expose scanner internals, executable paths, hostnames, ports, sockets, raw environment values, storage keys, protected paths, or signed URLs.
- [ ] Add regressions proving:
  - [ ] Scanner disabled state is visible in runtime diagnostics and Workspace Settings.
  - [ ] Scanner availability status is safe and redacted.
  - [ ] Existing runtime diagnostics redaction checks still cover scanner-sensitive values.

Acceptance criteria:

- Admin diagnostics clearly show scanner mode and safe availability without leaking scanner configuration internals.

### Version 0.33.5.22.9 - `clamscan` executable scanner adapter

- [ ] Add `clamscan` executable adapter.
- [ ] Support the configured executable path from `config.scanner.clamscanPath` (`src/config.js:141`) while keeping the path out of diagnostics/UI payloads.
- [ ] Implement the adapter `health()` method added to the scanner contract in 0.33.5.22.8 by probing `clamscan --version`.
- [ ] Add timeout and failure behavior for the executable path.
- [ ] Add safe scanner metadata.
- [ ] Do not auto-delete suspicious files.
- [ ] Quarantine suspicious files and require review.
- [ ] Add regressions using mocked executable responses:
  - [ ] Clean.
  - [ ] Infected.
  - [ ] Scanner unavailable.
  - [ ] Timeout.

Acceptance criteria:

- `clamscan` is available as an optional executable scanner adapter without making ClamAV a hard dependency.

### Version 0.33.5.22.10 - `clamd` scanner adapter

- [ ] Add `clamd` adapter.
- [ ] Support configured host/port from `config.scanner.clamdHost` and `config.scanner.clamdPort` (`src/config.js:139-140`).
- [ ] Decide socket support for this branch: config currently exposes **no** unix-socket key; add a `LONGTAIL_CLAMD_SOCKET` config key with documented host/port precedence if socket support is in scope, otherwise explicitly defer socket support.
- [ ] Implement the adapter `health()` method added to the scanner contract in 0.33.5.22.8 by probing clamd `PING`/socket reachability.
- [ ] Add stream scanning, timeout behavior, and scanner-unavailable failure behavior through the service-owned scanner context.
- [ ] Add safe scanner metadata.
- [ ] Do not auto-delete suspicious files.
- [ ] Quarantine suspicious files and require review.
- [ ] Add regressions using mocked clamd responses:
  - [ ] Clean.
  - [ ] Infected.
  - [ ] Scanner unavailable.
  - [ ] Timeout.

Acceptance criteria:

- `clamd` is available as an optional runtime scanner adapter for service deployments without requiring Linux-only assumptions.

### Version 0.33.5.22.11 - Scanner setup docs and ClamAV closeout

- [ ] Add docs:
  - [ ] Linux service setup.
  - [ ] Windows executable path setup.
  - [ ] macOS/Homebrew setup if practical.
  - [ ] What happens when scanner is unavailable.
- [ ] Update runtime-configuration docs so `LONGTAIL_FILE_SCANNER`, `LONGTAIL_CLAMD_HOST`, `LONGTAIL_CLAMD_PORT`, `LONGTAIL_CLAMSCAN_PATH`, and any new socket key are marked live vs. deferred accurately.
- [ ] Record scanner decisions in `DECISIONS.md`: `none` vs `noop`, `none`-mode pending-file disposition, scanner-unavailable behavior, and no automatic deletion of suspicious files.
- [ ] Run the scanner-focused regressions from 0.33.5.22.7 through 0.33.5.22.10 and add them to the suite.

Acceptance criteria:

- Scanner behavior is OS-agnostic at the app level, ClamAV setup is documented, and scanner decisions are recorded.

### Version 0.33.5.22.12 - S3 configuration and provider registration

- [ ] Add S3-compatible provider config keys (bucket/region/endpoint/credentials) to `config.storage` in `src/config.js` and `.env.example`.
- [ ] Keep secrets out of diagnostics, browser payloads, docs examples, and committed files.
- [ ] Register the S3 provider under a new key via `registerFileStorageAdapter` (do not overload `local`).
- [ ] Support provider configuration through `.env`/runtime config.
- [ ] Do not require S3 for SQLite/self-hosted installs.
- [ ] Decide and record the S3 dependency/client strategy before implementing object operations.
- [ ] If object operations are not implemented in this slice, the registered provider must fail with safe "not implemented/configured" errors rather than partial writes.
- [ ] Add regressions proving:
  - [ ] Local storage remains the default when S3 config is absent.
  - [ ] S3 can be selected only through the explicit provider key.
  - [ ] Missing required S3 config fails clearly when the provider is selected.

Acceptance criteria:

- The S3 provider can be selected explicitly through runtime configuration, while self-hosted local storage remains unchanged.

### Version 0.33.5.22.13 - S3 object operation proof

- [ ] Add S3-compatible storage adapter behind the provider contract: implement the same `save/saveStream/read/metadata/delete/health` methods `registerFileStorageAdapter` enforces (`files.service.js:116`), returning a `Readable` from `read()` so the existing download/preview stream paths (`files.service.js:609`/`:660`) work unchanged, and adopting the streaming `saveStream()` path from 0.33.5.22.3 if it has landed.
- [ ] Add safe provider health checks.
- [ ] Keep uploads, downloads, previews, deletes, and metadata reads behind the existing Files service permission/lifecycle boundaries.
- [ ] Add regressions with mocked S3 provider/client calls proving:
  - [ ] Save records a storage key without exposing provider internals.
  - [ ] Read returns a `Readable` for existing download/preview paths.
  - [ ] Metadata and delete work through the provider contract.
  - [ ] Health failures surface safely.

Acceptance criteria:

- Hosted SaaS has a mocked, contract-tested path to object storage without changing self-hosted local storage behavior.

### Version 0.33.5.22.14 - S3 diagnostics and signed-URL boundary

- [ ] Extend runtime diagnostics for the S3 provider with safe availability only; do not expose bucket names, credentials, raw endpoints when sensitive, storage keys, signed URLs, or provider internals.
- [ ] Write the direct/presigned upload/download plan; keep implementation out of scope unless a single permission-checked proof route is explicitly chosen and covered by regressions in this slice.
- [ ] Treat any presigned upload/download URL as a deliberate, documented exception to the standing "no signed URLs unless designed for that route" guardrail, with per-object permission checks and expiry recorded in `DECISIONS.md`.
- [ ] Keep all downloads permission-checked through LTF routes or signed URL rules.
- [ ] Update storage docs with optional S3 config, local-vs-S3 deployment guidance, and the signed-URL boundary.
- [ ] Add regressions proving:
  - [ ] S3 diagnostics stay redacted.
  - [ ] Normal Files payloads do not expose signed URLs.
  - [ ] Any signed URL proof is route-designed, permission-checked, and expiring.

Acceptance criteria:

- S3 diagnostics and any signed-URL exception are explicit, safe, and documented.

### Version 0.33.5.22.15 - Branch docs, regression wiring, and closeout

- [ ] Confirm the branch decisions in `DECISIONS.md`: storage-provider selection ownership, the multipart/streaming dependency choice from 0.33.5.22.3, the `none` vs `noop` scanner distinction and `none`-mode pending-file disposition from 0.33.5.22.7, scanner-unavailable behavior from 0.33.5.22.11, and the presigned-URL exception from 0.33.5.22.14.
- [ ] Add/collect the storage and scanner docs the sub-slices produce (local storage mode, streamed upload transition, per-OS scanner setup, "scanner unavailable" behavior, optional S3 config) into the docs set, and note in the runtime-configuration docs which `LONGTAIL_STORAGE_*`/`LONGTAIL_*SCAN*`/`LONGTAIL_CLAMD_*` keys are now live vs. still inert.
- [ ] Confirm the standing per-slice version ceremony was followed for each landed slice: `package.json` + `package-lock.json` (root + `packages[""]`), version-pinned regression scripts where applicable, and dated `CHANGELOG.md` entries.
- [ ] Run `npm run check` and `npm run test:permissions` (re-running any transiently-flaky isolated-DB regressions standalone to confirm), and add the storage/scanner regressions from 0.33.5.22.1-0.33.5.22.14 to the suite.
- [ ] Verify `/api/runtime-diagnostics` reports the configured storage provider + scanner mode/availability and `/api/app-info` reports the expected version after restart.
- [ ] Archive or hand off the completed 0.33.5.22 branch according to the current roadmap bookkeeping rule.

Acceptance criteria:

- Storage/scanner behavior, decisions, and docs are recorded, the regression suite covers the new provider/scanner paths, diagnostics reflect the live configuration, and the roadmap is ready to move to 0.33.5.23.

## Version 0.33.5.23 - PostgreSQL Adapter and SaaS Runtime Proof

Purpose:

Add the hosted-SaaS database backend behind the provider-neutral database contract while preserving SQLite small-office support.

Entry contract from 0.33.5.19: consume the database provider config, the `src/db/provider.js` adapter boundary, health/capability shape, parameterized query and transaction conventions, and documented migration-lock strategy while keeping SQLite defaults intact.

Current wiring (grounding for this branch):

- The real adapter seam is `createDatabaseAdapter(provider)` in `src/db/provider.js:12-18`, which currently `throw`s for anything but `"sqlite"` and returns `createSqliteAdapter()` from `src/db/adapters/sqlite-adapter.js`. `src/core/database.js` is only a re-export of `provider.js`, so PostgreSQL plugs in as a new `src/db/adapters/postgres-adapter.js` plus a branch in the factory, not by editing `core/database.js`.
- Adapter contract shape (from `sqlite-adapter.js`): `provider`, a `capabilities` object (`SQLITE_CAPABILITIES` with `transactions: true`, `transactionApi: "callback"`), `query/get/run(sql, params = [])`, `transaction(callback)`, `health`, and `initializeRuntime`. The app-facing helpers `querySql/getSql/runSql` (`provider.js:20-30`) already forward a `params` argument to `db.query`, but ~94% of app SQL interpolates values via `sqlText()/sqlInteger()/sqlNullableText()` from `src/db/sql-literals.js` instead of using that channel. "Parameter binding" work is therefore migrating interpolation onto the existing-but-unused `params` channel, not inventing a new API.
- `assertNotInsideTransactionContext` (AsyncLocalStorage, `sqlite-adapter.js:29-33`) already guards `query/get/run` from being called on the top-level `db.*` inside a transaction, and nested `transaction()` throws. There are **5** `db.transaction(...)` call sites today — `src/services/jobs.service.js:90`, `src/core/jobs/job-queue.js:18`, `src/core/jobs/job-runner.js:235`, `src/modules/notes/notes.repo.js:240`, `src/modules/tasks/tasks.repo.js:222` — not two; the 0.33.5.21 jobs work added several. Treat the count as "few and enumerated," and re-verify it at implementation time.
- SQLite-only introspection/repair lives in **two** places, not just migrations: `src/db/migrations.js` (~17 `sqlite_master`/`PRAGMA`/`INSERT OR IGNORE` constructs) **and** `src/db/index.js` startup maintenance (~16 constructs — `tableExists` via `sqlite_master`, `columnsExist` via `PRAGMA table_info`, `INSERT OR IGNORE`, `ON CONFLICT`, and `rowid`-based dedup/repair). Both must be provider-gated. Overall there are ~86 SQLite-specific constructs across ~19 files.
- The migration lock is file-based (`src/db/migration-lock.js`, `fs.open(path, "wx")`) and single-host; PostgreSQL needs an advisory-lock equivalent.
- Search is already behind a search adapter (`src/core/search/adapters/sqlite-search-adapter.js`, FTS5 `MATCH`/`bm25()`); a PostgreSQL backend needs a parallel search adapter, not an inline port of FTS SQL.

Sizing rule for this branch:

- Each sub-slice below should have one primary blast radius and should be completable in a single focused implementation session.
- Each implementation sub-slice still follows the normal release ceremony for the version it lands: focused regressions, relevant docs, `CHANGELOG.md`, package metadata when the version changes, and verification.
- Do not combine adjacent slices just because the same helper file is already open. In particular, the parameter-binding conversion is intentionally split from the translation-layer foundation it depends on, and the SQLite-only routine gating is split from the PostgreSQL migration runner.

### Version 0.33.5.23.1 - PostgreSQL adapter skeleton and factory wiring

- [ ] Add a `src/db/adapters/postgres-adapter.js` implementation and register it through the `createDatabaseAdapter(provider)` factory in `src/db/provider.js:12-18` (replace the current unconditional throw for `"postgres"`).
- [ ] Match the existing adapter contract exactly: `provider`, a `capabilities` object (mirror `SQLITE_CAPABILITIES` shape, `transactionApi: "callback"`), `query/get/run(sql, params)`, `transaction(callback)`, `health`, and `initializeRuntime`.
- [ ] Support `DATABASE_URL`, pool configuration, and TLS/SSL configuration through runtime config.
- [ ] Add health checks that return the same health/capability shape the diagnostics path already consumes.
- [ ] Add docs for local Postgres development.
- [ ] Do not change SQLite defaults, and do not convert app SQL in this slice (connection + contract only).

Acceptance criteria:

- App can connect to PostgreSQL behind the same database adapter contract, with SQLite remaining the default.

### Version 0.33.5.23.2 - SQL portability audit (inventory and plan only)

- [ ] Produce a documented, plan-only audit; do not change runtime behavior in this slice.
- [ ] Quantify parameter binding per repository: how many values are interpolated via `sqlText()/sqlInteger()/sqlNullableText()` (~1,763 calls / ~314 call sites today) vs. bound `params`, since PostgreSQL (`pg`) requires positional `$1` binding and rejects inlined literals.
- [ ] Inventory SQLite-specific SQL with call sites:
  - [ ] `INSERT OR IGNORE` and SQLite-specific `ON CONFLICT` usage.
  - [ ] `COLLATE NOCASE` (~21 sites) vs `citext`/`ILIKE`/nondeterministic collation.
  - [ ] PRAGMA usage.
  - [ ] FTS5 (`MATCH`/`bm25()`) behavior — flag it as a PostgreSQL `tsvector`/`tsquery` reimplementation behind the search adapter, not a compatibility helper.
  - [ ] JSON handling assumptions.
  - [ ] Boolean storage (`0/1` + `CHECK (col IN (0,1))`) vs PostgreSQL `boolean`.
  - [ ] `julianday(...)` / date arithmetic (timer elapsed seconds) vs PostgreSQL interval math.
  - [ ] `rowid` reliance in dedup/repair code vs PostgreSQL (no implicit rowid).
- [ ] Inventory read-modify-write sequences that currently rely on the SQLite adapter's global operation serialization for correctness (counters, read-then-write upserts, claim/allocate patterns), and re-verify the current `db.transaction(...)` call-site count (5 today) so the hardening slice has a concrete list.
- [ ] Record the confirmed non-issues for scope clarity: no `RETURNING`, no SQLite JSON functions, and no `LIMIT`/`OFFSET` inside `UPDATE`/`DELETE` exist today (re-verify at audit time).
- [ ] Output: a portability plan doc plus the intentional SQLite-only paths list that later slices (0.33.5.23.3-0.33.5.23.9) consume.

Acceptance criteria:

- The parameter-binding, dialect, and transaction-safety work is quantified and grouped into a documented plan without any runtime change.

### Version 0.33.5.23.3 - Named/positional parameter binding layer

- [ ] Add a named-to-positional (`:name` -> `$n`) parameter translation layer at the adapter boundary so the app-facing `db.query(sql, params)` contract stays stable across providers.
- [ ] Keep SQLite working through the same layer (SQLite already accepts `params` on `query/get/run`), so both providers consume one binding path.
- [ ] Decide and document the migration path for the `sqlText()/sqlInteger()/sqlNullableText()` interpolation helpers (`src/db/sql-literals.js`): whether they become param-emitting shims, are deprecated in favor of `params`, or are gated per provider. Record the decision in `DECISIONS.md`.
- [ ] Do not mass-convert call sites in this slice; land only the layer plus a small proof conversion.
- [ ] Add focused regressions proving named params translate correctly, escaping/edge cases are safe, and SQLite behavior is unchanged.

Acceptance criteria:

- One binding layer supports both providers and keeps `db.query(sql, params)` stable, ready for staged call-site conversion.

### Version 0.33.5.23.4 - Parameter-binding conversion waves

- [ ] Convert interpolated SQL to bound `params` in prioritized per-repository/per-module waves, each wave sized to a single session (do not attempt all ~314 sites at once).
- [ ] Order waves by the audit's per-repository counts and risk (start with the highest-traffic repositories: sessions, workspaces, permissions, tasks, notes, files metadata, notifications).
- [ ] For each wave, keep behavior identical on SQLite and add/extend regressions before moving on.
- [ ] Track remaining interpolation sites so the conversion has a visible burndown and no silent "mostly done" gaps.

Acceptance criteria:

- Value interpolation is replaced by bound parameters in prioritized waves, each independently verified on SQLite and PostgreSQL-ready.

### Version 0.33.5.23.5 - SQLite dialect compatibility helpers

- [ ] Add provider-aware helpers/translations for the non-FTS dialect items from the audit: `INSERT OR IGNORE`/`ON CONFLICT`, `COLLATE NOCASE` vs `ILIKE`/`citext`, boolean `0/1` + `CHECK` vs `boolean`, `julianday(...)`/date arithmetic vs interval math, and `rowid` reliance.
- [ ] Keep SQLite output identical; route PostgreSQL to the compatible form behind the same helper call.
- [ ] Document any intentional SQLite-only path that will not be translated.
- [ ] Add regressions covering each translated construct on SQLite (and PostgreSQL where the dual-backend harness from 0.33.5.23.11 can run).

Acceptance criteria:

- Dialect differences other than FTS are handled by shared provider-aware helpers with SQLite behavior preserved.

### Version 0.33.5.23.6 - Full-text search portability

- [ ] Add a PostgreSQL search adapter behind the existing search-adapter seam (parallel to `src/core/search/adapters/sqlite-search-adapter.js`), mapping FTS5 `MATCH`/`bm25()` ranking to `tsvector`/`tsquery` (and a ranking function) rather than porting FTS SQL inline.
- [ ] Keep the SQLite FTS5 adapter and its behavior unchanged as the self-hosted default.
- [ ] Preserve the existing search result/permission-scoping contract on both adapters.
- [ ] Add regressions proving indexing, query, and ranking parity within documented limits.

Acceptance criteria:

- Search works on PostgreSQL through its own adapter without changing SQLite FTS behavior.

### Version 0.33.5.23.7 - Read-modify-write transaction hardening

- [ ] Wrap the read-modify-write sequences identified in the audit (counters, read-then-write upserts, claim/allocate patterns) in `db.transaction(...)` so they stay correct on a pooled/concurrent backend that no longer has SQLite's global operation serialization.
- [ ] Reuse the existing callback-transaction contract and the `assertNotInsideTransactionContext` guard; do not introduce nested transactions.
- [ ] Keep the existing 5 transaction sites working and extend coverage to the newly identified sequences.
- [ ] Add regressions proving each hardened sequence remains atomic and that top-level `db.*` inside a transaction still throws.

Acceptance criteria:

- Concurrency-sensitive sequences are transaction-wrapped and safe for a pooled PostgreSQL backend without regressing SQLite.

### Version 0.33.5.23.8 - Provider-gate SQLite-only introspection and repair

- [ ] Gate the SQLite-only introspection/repair routines behind the SQLite provider so they never run against PostgreSQL, covering **both** `src/db/index.js` startup maintenance (`tableExists`/`sqlite_master`, `columnsExist`/`PRAGMA table_info`, `INSERT OR IGNORE`, `ON CONFLICT`, `rowid` dedup/repair) **and** `src/db/migrations.js` (`sqlite_master`, `PRAGMA table_info`, `PRAGMA legacy_alter_table`, `ALTER TABLE ... RENAME`, `INSERT OR IGNORE`, FK-repair passes).
- [ ] Provide provider-appropriate equivalents (or explicit no-ops) for the startup maintenance steps PostgreSQL still needs, so a PostgreSQL boot does not silently skip required repairs.
- [ ] Do not change SQLite startup/migration behavior.
- [ ] Add regressions proving SQLite startup maintenance is unchanged and that the SQLite-only routines are skipped under a non-SQLite provider.

Acceptance criteria:

- SQLite-only introspection/repair is fenced to the SQLite provider in both maintenance surfaces, with SQLite behavior intact.

### Version 0.33.5.23.9 - PostgreSQL migration runner and advisory locking

- [ ] Add PostgreSQL migration runner support that selects DDL/introspection per provider rather than assuming SQLite.
- [ ] Add PostgreSQL migration locking as an advisory-lock equivalent of the file-based `src/db/migration-lock.js` (which stays SQLite/single-host).
- [ ] Keep the runner's app-facing entry (`runMigrations`) stable so `src/db/index.js` startup wiring does not need provider-specific branches beyond provider selection.
- [ ] Add regressions proving the runner applies migrations under PostgreSQL locking and that SQLite migration locking/behavior is unchanged.

Acceptance criteria:

- Migrations run under PostgreSQL with safe locking while SQLite migration behavior remains intact.

### Version 0.33.5.23.10 - PostgreSQL schema baseline and checksum

- [ ] Create a PostgreSQL-compatible schema baseline or migration translation (the baseline `src/db/schema/current.sql` is SQLite DDL today).
- [ ] Verify schema creation from an empty PostgreSQL database.
- [ ] Add checksum validation for the PostgreSQL baseline/migration set.
- [ ] Add docs explaining the SQLite self-hosted path, the PostgreSQL SaaS path, migration ownership, and backup expectations.

Acceptance criteria:

- PostgreSQL can initialize cleanly from empty with checksum-validated schema, and SQLite initialization is unchanged.

### Version 0.33.5.23.11 - Dual-backend repository contract tests

- [ ] Add a test runner that can execute repository contract tests against SQLite and against PostgreSQL when configured.
- [ ] Prioritize high-value repositories: sessions, workspaces, permissions, tasks, notes, files metadata, search index, notifications.
- [ ] Specify how Postgres contract tests run locally/CI (Docker or local Postgres, opt-in via `DATABASE_URL`) so the dual-backend suite is actually exercised, not skipped by default; add docs for optional Postgres test setup.
- [ ] Add a contract test proving `db.transaction(...)` pins one connection for the whole callback on PostgreSQL and that no code path uses the top-level `db.*` inside a transaction (SQLite already enforces this via `assertNotInsideTransactionContext`).

Acceptance criteria:

- Core repository behavior can be verified against both backends, with the PostgreSQL path actually runnable rather than skipped by default.

### Version 0.33.5.23.12 - SaaS seed and load smoke test

- [ ] Add a Postgres seed profile for many workspaces.
- [ ] Add basic load-smoke scripts.
- [ ] Test: login/session, app shell, tasks list/detail, notes list/detail, files browse, search, notifications, and the job worker.
- [ ] Record baseline performance numbers.
- [ ] Document what is proven and what is not yet proven.

Acceptance criteria:

- The SaaS backend has an evidence-based baseline.

### Version 0.33.5.23.13 - Branch docs, decisions, regression wiring, and closeout

- [ ] Confirm the branch decisions in `DECISIONS.md`: the parameter-binding/interpolation-helper migration from 0.33.5.23.3, intentional SQLite-only paths, the PostgreSQL advisory-lock strategy from 0.33.5.23.9, and the FTS `tsvector` reimplementation boundary from 0.33.5.23.6.
- [ ] Collect the database docs the sub-slices produce (local Postgres development, SQLite vs PostgreSQL paths, migration ownership, backups, optional Postgres test setup) and update runtime-configuration docs so `LONGTAIL_DATABASE_PROVIDER`/`DATABASE_URL`/pool/TLS keys are marked live vs. reserved accurately.
- [ ] Confirm the standing per-slice version ceremony was followed for each landed slice: `package.json` + `package-lock.json` (root + `packages[""]`), version-pinned regression scripts where applicable, and dated `CHANGELOG.md` entries.
- [ ] Run `npm run check` and `npm run test:permissions` (re-running any transiently-flaky isolated-DB regressions standalone to confirm), and add the dual-backend/portability regressions from 0.33.5.23.1-0.33.5.23.12 to the suite.
- [ ] Verify `/api/runtime-diagnostics` reports the configured database provider/health and `/api/app-info` reports the expected version after restart, on both SQLite and (where available) PostgreSQL.
- [ ] Archive or hand off the completed 0.33.5.23 branch according to the current roadmap bookkeeping rule.

Acceptance criteria:

- PostgreSQL support, portability decisions, and docs are recorded, the regression suite covers both backends, diagnostics reflect the live provider, and the roadmap is ready to move on with SQLite defaults intact.

## Version 0.33.6 - Dashboard and Workbench Formalization as Project hub and work center

Purpose:

Turn the already-existing Dashboard and Workbench surfaces into framework-owned hosts that render module *contributions* instead of hardcoded Tasks/Time-Tracking behavior. Dashboard becomes the workspace overview/orientation surface; Workbench becomes the active work/resumption/focus surface driven by a single normalized work-candidate model, focus modes, the existing resume-state service, a floating Quick Action Capture (QAC) drawer, and a Workbench Inspector.

This is a formalization and de-hardcoding pass, not greenfield. Dashboard, Workbench, and the resume-state service already exist; several contribution contracts already exist. The work is finishing/converting them, adding the net-new contracts, and reconciling the QAC/Inspector direction from `TODO.md`.

Dependencies and framework baseline:

- 0.33.5.9 shipped the framework-owned resume-state service and `/api/work-resume`.
- 0.33.5.15/0.33.5.16/0.33.5.18 provide the `LongtailForge.view` primitives, validated `viewSurfaces`/`renderSurface(...)`, minimal protected hosts, and the finalized view baseline. Dashboard/Workbench hosts must consume this baseline rather than hand-building framework-owned anatomy (mirrors the Reporting host rule in 0.33.8).

Current wiring (grounding for this branch):

- Contribution contracts already half-exist. The module manifest already validates `dashboard` and `workbench` contributions (plus `timerSources`/`workItemSources`) in `src/core/modules/manifest-contract.js:1019-1047`, and `modulesService` already exposes `listDashboardPanels`, `listWorkbenchCards`, `listTimerSources`, `listWorkItemSources` (`src/core/modules/modules.service.js:997-1023`), all filtered through the shared `listWorkspaceContributions(workspaceId, session, fieldName)` path (enabled-module + `requiredPermissions` + `requiredWorkspaceCapabilities` + `requiresEnabledModules`). The **net-new** contracts are focus modes and a candidate source; a resume-snippet producer contract already exists (below).
- Workbench still hardcodes Tasks + Time-Tracking despite having the registry: `src/services/workbench.service.js:1-21` imports `tasksService`/`activeTimersService` and calls them directly alongside `listWorkbenchCards`/`listTimerSources`/`listWorkItemSources`. This is the primary de-hardcoding target.
- Dashboard is hand-built static HTML, not a framework host: `views/protected/dashboard.html` hardcodes the client/billing panels inline and exposes only a hidden `data-dashboard-extension-panels` stub for contributions. Converting it to a minimal host is in scope for this version.
- Resume state is fully built and safe by construction. `GET /api/work-resume` + `POST /api/work-resume/:id/dismiss` (`src/routes/work-resume.routes.js`) return a rich normalized item (`title`, `contextLabel`, `nextAction`, `sourceUrl`, `priority`, `dueAt`, `blockedReason`, `resumeRankHint`, `lastActionLabel`, `metadata`, `mode`). It is fed by an event-driven producer registry (`src/services/work-resume-state-producers.js`) with a strict field allowlist and forbidden-field patterns (`body`, `html`, `attachment`, `secure`, `encrypt`, `storage.key`, `scanner`, ...). This producer payload is the basis for the shared work-candidate shape below.
- Global chrome is injected per protected page via the shared `navigation.js` + `footer.js` includes (see `views/protected/dashboard.html`); the QAC floating drawer hooks into that app-shell include so it appears on all protected screens.

Sizing rule for this branch:

- Each sub-slice below should have one primary blast radius and should be completable in a single focused implementation session.
- Each implementation sub-slice follows the normal release ceremony: focused regressions, relevant docs, `CHANGELOG.md`, package metadata when the version changes, and verification.
- Do not combine adjacent slices just because the same helper file is already open. In particular, the candidate model (0.33.6.2) is split from its ranking/sources (0.33.6.3), and the Dashboard host conversion (0.33.6.8) is split from moving Time-Tracking's panels into contributions (0.33.6.9).

Key decisions for this branch:

- QAC is a floating bottom-right drawer available on all protected pages, NOT a permanent right-side rail (reconciling `TODO.md` against the earlier rail wording). Record this in `DECISIONS.md`.
- The Workbench Inspector is a persistent right panel on wide Workbench layouts showing related record titles and read-only previews. It is a distinct surface from QAC and must not steal the same screen space.
- Next-action candidates and resume state share ONE normalized work-candidate shape derived from the existing resume-producer payload; there is no second parallel candidate contract. The candidate model inherits the producer allowlist/forbidden-field safety so candidates can never leak body/secure/storage-key content.

### Version 0.33.6.1 - Surface contracts and scope (plan only)

- [ ] Define Dashboard as the workspace overview/orientation surface and Workbench as the active work/resumption/focus surface, and keep them separate.
- [ ] Confirm and document the already-existing contribution contracts (`dashboard`, `workbench`, `timerSources`, `workItemSources`) and the resume-state producer registry, so later slices extend rather than reinvent them.
- [ ] Name the net-new contracts this branch adds: a focus-mode contract/registry (0.33.6.4) and a normalized work-candidate source (0.33.6.2-0.33.6.3).
- [ ] Enumerate the hardcoded Task/Time assumptions to remove (`src/services/workbench.service.js` direct `tasksService`/`activeTimersService` calls; the inline panels in `views/protected/dashboard.html`) and assign each to its owning slice.
- [ ] Preserve, as a standing requirement for every slice, permission checks, module enabled/disabled checks, workspace boundaries, and private/secure/deleted-record handling.
- [ ] Update the implementation plan only; do not change runtime behavior in this slice.

Acceptance criteria:

- The Dashboard/Workbench boundary, the existing vs. net-new contracts, and the de-hardcoding targets are documented, with each target assigned to a later slice.

### Version 0.33.6.2 - Normalized work-candidate contract and service

- [ ] Promote the resume-producer payload shape (`src/services/work-resume-state-producers.js`) into a single normalized work-candidate shape reused by both next-action ranking and resume state: `moduleId`, `recordType`, `recordId`, `title`, `contextLabel`, `reason`, primary-action descriptor, `sourceUrl`, `priority`, `dueAt`, `blockedReason`, and a rank hint.
- [ ] Add a framework-owned candidate service that assembles candidates from resume-state rows plus live signals (e.g. running/paused timers) behind one shape.
- [ ] Inherit the producer safety rules verbatim: the same field allowlist and forbidden-field patterns (`body`, `html`, `attachment`, `secure`, `storage.key`, `scanner`, ...) so a candidate can never carry body text, secure content, storage keys, or raw IDs in labels.
- [ ] Every candidate must expose a reason string, a primary action, a safe context label, and a source URL; labels follow the `docs/workflow-context-contract.md` no-raw-ID rule.
- [ ] Add regressions proving the shape is stable and that forbidden fields are stripped even if a source tries to supply them.

Acceptance criteria:

- One normalized, safe-by-construction work-candidate shape backs both next-action and resume behavior, with no second parallel contract.

### Version 0.33.6.3 - Deterministic ranking and module candidate sources

- [ ] Add deterministic candidate ranking: running timers, paused timers, overdue assigned work, due today, blocked/stale work, recently touched work, due this week.
- [ ] Tasks contributes task candidates and Time Tracking contributes running/paused timer candidates through the shared contract; Lists, Notes (Active Work), and future Tickets contribute when their integrations are ready.
- [ ] Reuse the existing resume-state producer registry where a candidate is event-driven; add a pull-style candidate source only where live state (e.g. active timers) is not captured by producers.
- [ ] Keep ranking a pure function of candidate fields (no hidden per-module ordering) so the "one recommended next action" is deterministic and testable.
- [ ] Add regressions for ranking order across mixed candidate types and for disabled-module/permission filtering of sources.

Acceptance criteria:

- Candidates from multiple modules rank deterministically into a single ordered list, permission- and module-aware.

### Version 0.33.6.4 - Focus-mode contract and resolver

- [ ] Add a focus-mode contract/registry (following the `listWorkspaceContributions` pattern) with the canonical modes: Start my day, Pick up where I left off, What's due next, Work this week, Review blocked work, In progress, Project focus, and Client focus (Business workspaces only).
- [ ] Each focus mode resolves to a normalized focus context (scope, client/project, status/date filters) passed to the candidate sources from 0.33.6.3.
- [ ] Focus modes are user-friendly labels over deterministic filters, not separate hardcoded pages.
- [ ] Client focus must be hidden outside Business workspaces; Personal/Family must not surface client scope or labels.
- [ ] Add regressions for mode-to-context resolution and workspace-type gating.

Acceptance criteria:

- A canonical focus-mode set resolves to normalized focus contexts that drive the candidate sources, with correct workspace-type gating.

### Version 0.33.6.5 - De-hardcode the Workbench service

- [ ] Remove the direct `tasksService`/`activeTimersService` imports and hardcoded `tasks`/`time-tracking` branches from `src/services/workbench.service.js`; drive timers and work items purely through the contribution registry and the candidate service.
- [ ] Keep the existing Workbench bootstrap response shape working for the browser during the transition (adapt internals without breaking the page contract).
- [ ] Preserve enabled/disabled-module handling, permission checks, and workspace boundaries already enforced in `bootstrap`.
- [ ] Add regressions proving Workbench renders the same live data with Tasks/Time enabled and degrades cleanly when either is disabled, without importing them directly.

Acceptance criteria:

- Workbench data comes entirely from contributions and the candidate service, with no hardcoded module imports and no behavior regression.

### Version 0.33.6.6 - Guided Workbench UI

- [ ] Add a question-led Workbench entry that presents the focus modes as friendly questions ("Pick up where I left off", "Start with what's due", "Work this week", "Review blocked work", "Focus on a project") over the 0.33.6.4 deterministic filters.
- [ ] Show one recommended next action (top-ranked candidate) before showing longer lists.
- [ ] Keep secondary lists available but visually subordinate; do not turn Workbench into another full module index.
- [ ] Add empty states that suggest a useful next step instead of dead ends.
- [ ] Build on `LongtailForge.view` primitives and framework view states; do not hand-build framework-owned anatomy.
- [ ] Add focused browser/static regressions for focus selection, recommended-action rendering, and empty states.

Acceptance criteria:

- Workbench opens as a guided, focus-led surface that highlights one recommended action first and keeps secondary work subordinate.

### Version 0.33.6.7 - Resume "Pick up where I left off" UI

- [ ] Wire the "Pick up where I left off" focus to `GET /api/work-resume` first, falling back to recent activity only when no active resume rows exist.
- [ ] Show one recommended resume candidate first; keep secondary candidates subordinate.
- [ ] Allow users to dismiss stale resume candidates via `POST /api/work-resume/:id/dismiss`.
- [ ] Preserve permission checks, disabled-module behavior, deleted-record handling, and private/secure content boundaries (already enforced by the producer allowlist).
- [ ] Add regressions for resume-first ordering, activity fallback, dismiss behavior, and safe handling of stale/unavailable targets.

Acceptance criteria:

- The resume focus consumes the existing resume-state service, recommends one candidate first, supports dismissal, and never exposes unsafe content.

### Version 0.33.6.8 - Dashboard host conversion

- [ ] Convert `views/protected/dashboard.html` into a minimal framework host that renders contributed dashboard panels via `modulesService.listDashboardPanels` and registered panel renderers, using `LongtailForge.view` primitives for shell/header/status/empty/error states.
- [ ] Keep the existing panels working through the host during the conversion (no visual/data regression), retiring the hidden `data-dashboard-extension-panels` stub.
- [ ] Do not hand-build framework-owned Dashboard anatomy in static HTML or ad-hoc DOM when a view primitive or descriptor field covers it.
- [ ] Add a focused static regression proving the Dashboard page is a minimal framework host.

Acceptance criteria:

- Dashboard renders module-contributed panels through a framework host rather than hardcoded static markup, with existing panels preserved.

### Version 0.33.6.9 - Move Time-Tracking dashboard panels into contributions

- [ ] Move the currently-inline billing/client Dashboard panels (client summary, current-month billables, hours-and-billables chart) out of `dashboard.html` and into Time-Tracking-owned `dashboard` contributions with their own renderers and data routes.
- [ ] Keep Time Tracking responsible for the billing/time data and calculations; keep the framework responsible only for panel hosting, placement, and status/empty/error states.
- [ ] Ensure the panels disappear cleanly when Time Tracking is disabled or the user lacks the required permissions, via the existing contribution filtering.
- [ ] Add regressions proving the panels appear only when Time Tracking is enabled and permitted, and that no hardcoded Task/Time assumptions remain in the Dashboard host.

Acceptance criteria:

- The Dashboard billing/client panels are module contributions gated by enabled-module and permission checks, with no remaining hardcoded Time-Tracking markup in the host.

### Version 0.33.6.10 - Quick Action Capture floating drawer

Decision:

QAC is app-shell utility behavior, not a Workbench focus mode. It provides low-distraction access to common capture and recovery tools without navigating away from the current work surface: reduce focus/workflow interruption, keep productivity focused, and allow quick idea/thought capture without derailing the work train. QAC is a floating bottom-right drawer (not a permanent rail).

- [ ] Add a floating, drawer-style QAC control anchored bottom-right, available on ALL protected screens via the shared app-shell include (`navigation.js`/`footer.js`), quiet until the user opens it.
  - [ ] Use an icon that communicates action/capture rather than words that consume screen real estate (evaluate a "runner"/lightning-style glyph against the existing icon registry at build time).
  - [ ] On wide screens the drawer may show icon + small text; on narrow screens it collapses to icon-only.
- [ ] Drawer actions are contributed by enabled modules or mapped from registered module actions; since the user may not yet have a target record, capture actions should offer an initial find-or-create modal.
- [ ] First actions and their target behavior:
  - [ ] Timer - opens the future 2-timer modal when it exists; temporary fallback to `time-tracker.html` (see deferred follow-ups in 0.33.6.12).
  - [ ] Task - opens a task picker with an Add Task button, then the appropriate task modal.
  - [ ] Note - opens a note picker with an Add Note button, then the appropriate note modal.
  - [ ] List - opens a picker to add an item to a list or add a list, then the appropriate modal.
  - [ ] File - opens the Add File modal.
  - [ ] Reporting - opens the future report-creation modal when it exists; temporary fallback to `reporting.html`.
  - [ ] Search - opens the future advanced-search modal when it exists; temporary fallback to `search.html`.
- [ ] Actions open modals without changing the current page, receive safe current-page context when available, and return focus to the triggering control when closed.
- [ ] If a modal action does not exist yet, the QAC action may be hidden, disabled with a clear tooltip, or temporarily link to the existing module page as an explicitly temporary fallback; temporary navigation fallbacks must be removed once the modal action exists.
- [ ] Do not use badges, alerts, or recommendation behavior in the drawer; notifications and Workbench own those concerns.
- [ ] Add regressions for drawer presence on protected pages, contributed-action gating, focus return, quiet-until-opened behavior, and temporary-fallback labeling.

Acceptance criteria:

- A quiet floating QAC drawer is available on all protected pages, opens contributed capture actions as modals (with explicit temporary page fallbacks), preserves focus, and adds no badge/alert noise.

### Version 0.33.6.11 - Workbench Inspector panel

- [ ] Add a persistent Inspector panel on wide Workbench layouts (subordinate to the main surface) that stays out of the QAC drawer's space.
- [ ] Show related record titles when idle; clicking a related title opens a read-only preview inside the Inspector (reuse existing preview/linked-context infrastructure rather than a new viewer).
- [ ] Keep the Inspector permission-safe and workspace-aware, and apply the no-raw-ID/`docs/workflow-context-contract.md` label rules; non-Workbench screens remain centered unless they explicitly opt into Inspector behavior.
- [ ] Degrade gracefully on narrow screens (collapse/hide) and when there is no related context.
- [ ] Add regressions for related-title rendering, read-only preview, permission scoping, and narrow-screen behavior.

Acceptance criteria:

- The Workbench Inspector shows permission-safe related titles and read-only previews on wide layouts without competing with the QAC drawer or leaking unsafe content.

### Version 0.33.6.12 - Guardrails, docs, decisions, and closeout

- [ ] Record the branch decisions in `DECISIONS.md`: QAC as a floating drawer (not a permanent rail), the single shared work-candidate shape, and the Workbench Inspector as a distinct surface.
- [ ] Add guardrails so Dashboard/Workbench hosts do not hand-build framework-owned page/header/filter/status anatomy when a view primitive covers it, and do not reintroduce hardcoded module assumptions.
- [ ] Update `docs/declarative-view-surfaces.md`, `docs/module-contract.md`, and `docs/view-building-contract.md` with the Dashboard/Workbench host status and the focus-mode/candidate/QAC contribution boundaries.
- [ ] Define the deferred future-modal follow-ups the QAC actions temporarily fall back to, as explicit cross-referenced items (not hidden inside QAC bullets):
  - [ ] 2-timer Timer modal (redirect the QAC Timer action to it once built).
  - [ ] Advanced-search modal + search-result display modal, including routing all search results (even main-ribbon searches) through it; evaluate at build time whether this needs its own roadmap version (e.g. 0.33.9) given the potential search overhaul.
  - [ ] Report-creation modal, cross-referenced to 0.37.5.
- [ ] Run the Dashboard/Workbench regressions, `npm run check`, and `npm run test:permissions` (re-running any transiently-flaky isolated-DB regressions standalone to confirm).
- [ ] Verify `/api/app-info` reports the expected version after restart and that Dashboard/Workbench render correctly with modules enabled and disabled.

Acceptance criteria:

- Dashboard/Workbench are framework-owned hosts driven by contributions and the shared candidate model, decisions and docs are recorded, deferred modal follow-ups are cross-referenced, and the regression suite covers the new surfaces.

## Version 0.33.7 - Task Calendar Views (lean, read-only)

Purpose:

Give the Dashboard/Workbench work a calendar companion as soon as it lands: a read-only calendar that visualizes existing task due dates and the reminder schedule shipped in 0.33.5.21.8. This is intentionally lean. User-created calendar events, iCal/shared-calendar display, and external Google/Outlook sync stay at 0.36.0 (Calendars and Calendar Views) and the 0.70.x integrations work; this slice must not build them.

Scope decision:

- Read-only. No calendar event record type, no event creation, no iCal, and no external calendar sync in this slice.
- Framework-owned Calendar host built on the finalized 0.33.5.18 view baseline and the bounded-query pattern from 0.33.5.20, not a bespoke Calendar-only layout.
- Data comes from the existing task calendar-window path (`GET /api/tasks/calendar` -> `tasksService.calendarWindow` -> `tasksRepository.readDueBetween`), which is already workspace- and permission-aware and date-range bounded (`canReadTask` filtering, `taskCalendarRow` shape). Extend it only where needed; do not replace it with a load-everything query.

### Version 0.33.7.1 - Task calendar data contract

- [ ] Confirm/extend `tasksService.calendarWindow` (`src/modules/tasks/tasks.service.js`) to return everything a month/week/day render needs: task id, title, due date, due time/`due_at_utc`, status, priority, client/project context, assignee summary, and a task URL/link.
- [ ] Include reminder markers from the 0.33.5.21 reminder schedule (the `reminder_at_utc` occurrences from `taskRemindersService`) so the calendar can show when reminders fire, not only the due date.
- [ ] Keep the range bounded (reuse the existing start/end window and the 0.33.5.20 bounded-query pattern via `readDueBetween`); clamp or reject overly wide ranges instead of loading all tasks.
- [ ] Keep results permission- and workspace-aware (already enforced by `canReadTask` in `calendarWindow`); archived/complete and disabled-module handling must match the rest of Tasks.

### Version 0.33.7.2 - Framework Calendar host and month/week/day views

- [ ] Add a framework-owned Calendar surface (protected page + browser behavior) built on `LongtailForge.view` primitives and the 0.33.5.18 anatomy, not hand-built layout/CSS.
- [ ] Render read-only month, week, and day views of task due dates (year view can defer to 0.36.0).
- [ ] Show each task as a calendar entry with its title and a priority/status affordance, plus a reminder indicator on days a reminder fires; clicking an entry opens the existing task editor/detail (reuse the task modal) rather than an inline editor.
- [ ] Handle empty/loading/error states through the framework view states, not ad-hoc DOM.

### Version 0.33.7.3 - Filters, navigation, and Workbench hook

- [ ] Add client (business workspace only) and project filters, mirroring the filter behavior used by Tasks and the Reporting host.
- [ ] Add period navigation (previous/next/today) and view switching (month/week/day) that re-query the bounded window.
- [ ] Add framework navigation for the Calendar surface, permission- and module-aware.
- [ ] Provide a lightweight entry point from Workbench/Dashboard (e.g. a "this week" affordance or link) so the calendar reinforces the "what's due next / work this week" focus modes; keep Workbench framework-owned and do not duplicate calendar logic there.

### Version 0.33.7.4 - Guardrails, docs, and closeout

- [ ] Do not introduce a calendar event record type, iCal parsing, or external calendar sync in this slice; cross-reference 0.36.0 as the owner of events/iCal and the 0.70.x work as the owner of Google/Outlook sync.
- [ ] Add guardrails so the Calendar host does not hand-build framework-owned page/header/filter/status anatomy when a view primitive already covers it.
- [ ] Add focused regressions: bounded-range enforcement, permission/workspace scoping (no cross-workspace or unreadable tasks leak), reminder-marker correctness, and disabled-module behavior.
- [ ] Update `docs/declarative-view-surfaces.md` and the view/module contract docs with the Calendar host status.
- [ ] Update the changelog and verify `/api/app-info` after restart.

Acceptance criteria:

- A read-only task calendar (month/week/day) shows task due dates and reminder markers, filtered by client/project, consuming the existing bounded, permission-aware task calendar-window path.
- Calendar entries link back to their task; the surface reuses framework view anatomy and adds no event/iCal/external-sync behavior (those remain at 0.36.0 / 0.70.x).
- The calendar is reachable from Workbench/Dashboard and reinforces the "what's due / this week" focus without duplicating calendar logic.

## Version 0.33.8 - Reporting Framework and Time Report Contribution

Decision:

Reporting is framework-owned report infrastructure, not a normal disable-able first-party workflow module. The framework owns the Reporting page, report catalog, contribution filtering, report execution dispatch, shared filter host, loading/error/empty states, and future saved/export/export scheduling behavior. Individual modules own the actual report definitions, report runners, data queries, domain calculations, result shapes, and record-level permission checks.

The first 0.33.8 report should remain intentionally small: Time Tracking contributes one Project Time & Billing report. Do not build a custom report builder, report designer, analytics dashboard, or saved report system in this pass.

### Dependencies and Framework Baseline

This version builds on the framework surface work completed immediately before it and must not
reintroduce a hard-coded Reporting page:

- 0.33.5.13 defines shared surface/modal/overlay tokens and common page anatomy expectations.
- 0.33.5.15 exposes the framework-owned `LongtailForge.view` primitives for page headers,
  filters, status/empty/error states, tables, action strips, field grids, and modal shells.
- 0.33.5.16 introduces validated `viewSurfaces`, `LongtailForge.view.renderSurface(...)`,
  descriptor data binding, `surface.refresh()`, route actions, behavior handlers, minimal protected
  hosts, and strict guardrails for converted declarative surfaces.
- 0.33.5.18 extends the descriptor/renderer capability set while converting Notes, Tasks, Files,
  and Clients/Projects pages. Reporting should consume the finalized 0.33.5.18 view baseline
  instead of creating Reporting-only anatomy for filters, tables, status messages, or host layout.

Reporting is a framework-owned surface, so it should not create a fake disable-able
`src/modules/reporting` workflow module just to fit module-owned `viewSurfaces`. 0.33.8 must decide
and document the framework-owned equivalent: either a framework-owned descriptor/config source that
the same renderer can consume, or a narrow framework host adapter built directly on
`LongtailForge.view` primitives where the descriptor contract cannot yet model report execution.

### Version 0.33.8.1 - Reporting Architecture and Framework View Baseline

- [ ] Review the completed 0.33.5.18 renderer/primitive capabilities before implementing Reporting.
- [ ] Decide whether the Reporting host should use:
  - [ ] A framework-owned descriptor/config source consumed by `LongtailForge.view.renderSurface(...)`.
  - [ ] A narrow framework Reporting host adapter built on `LongtailForge.view` primitives.
- [ ] Do not create a normal disable-able `src/modules/reporting` workflow module only to satisfy
      module-owned `viewSurfaces` shape.
- [ ] Define which Reporting host anatomy is framework-owned:
  - [ ] Page shell and header.
  - [ ] Report selector.
  - [ ] Shared filter host.
  - [ ] Loading, error, empty, and status states.
  - [ ] Results host and overflow behavior.
  - [ ] Report action placement for future export/saved-report actions.
- [ ] Define module-owned report responsibilities:
  - [ ] Report definitions.
  - [ ] Runner IDs.
  - [ ] Data queries and aggregation.
  - [ ] Domain calculations.
  - [ ] Result shape.
  - [ ] Record-level permission checks.
- [ ] Update the implementation plan only; do not change runtime behavior in this slice.

### Version 0.33.8.2 - Reporting Contribution Contract

- [ ] Keep this roadmap section named "Reporting Framework and Time Report Contribution."
- [ ] Keep `reporting.html` framework-owned.
- [ ] Expand the existing module manifest `reporting` field into a validated report contribution contract.
- [ ] Report contribution fields should include:
  - [ ] `id`
  - [ ] `label`
  - [ ] `description`
  - [ ] `category`
  - [ ] `renderer`
  - [ ] `runner`
  - [ ] `requiredPermissions`
  - [ ] `requiredWorkspaceCapabilities`
  - [ ] `requiresEnabledModules`
  - [ ] `sortOrder`
  - [ ] supported filter metadata, such as billing period, custom date range, scope, project, tag, and descendants.
- [ ] Add `modulesService.listReportingReports(workspaceId, session)` using the same enabled-module, permission, workspace-capability, and required-module filtering pattern used by other module contributions.
- [ ] Keep contribution validation data-only. Do not place executable functions directly in module manifests.
- [ ] Keep report contribution filtering separate from report execution so the catalog can be permission-safe without running report code.
- [ ] Update `docs/module-contract.md` with the finalized reporting contribution shape.

### Version 0.33.8.3 - Reporting Framework Catalog Route

- [ ] Add framework-owned report catalog route:
  - [ ] `GET /api/reporting/catalog`
- [ ] Return only reports allowed by enabled modules, workspace capabilities, required modules, and user permissions.
- [ ] Include report metadata, supported filters, renderer ID, default filter values, and report-specific permission requirements.
- [ ] Ensure disabled modules do not contribute active catalog reports.
- [ ] Ensure reports from historically readable disabled modules are only visible when explicitly allowed by contribution and module policy.
- [ ] Add focused catalog regressions for disabled modules, missing permissions, workspace capability filtering, and required-module filtering.

### Version 0.33.8.4 - Reporting Runner Registry and Execution Route

- [ ] Add framework-owned report execution route:
  - [ ] `GET /api/reporting/reports/:moduleId/:reportId/run`
  - [ ] or a stable equivalent using a report key.
- [ ] Add a server-side report runner registry keyed by stable runner IDs.
- [ ] The framework Reporting service should validate report availability, permissions, enabled modules, workspace capability requirements, and basic filter shape before dispatching.
- [ ] The module-owned runner should remain responsible for domain-specific data access, calculations, and record-level permission safety.
- [ ] Normalize execution errors into framework-owned report status/error payloads without exposing implementation details.
- [ ] Add focused execution regressions for unknown report IDs, missing runners, denied permissions, disabled modules, and invalid filter shape.

### Version 0.33.8.5 - Time Tracking Project Time & Billing Contribution

- [ ] Move Project Time & Billing report logic out of the framework Reporting service and into Time Tracking-owned report/service code.
- [ ] Time Tracking should contribute the initial report:
  - [ ] ID: `project-time-billing`
  - [ ] Label: `Project Time & Billing`
  - [ ] Runner: `time-tracking.project-time-billing`
  - [ ] Renderer: `time-project-billing-table`
- [ ] Preserve existing useful filters:
  - [ ] Current billing period
  - [ ] Last billing period
  - [ ] Custom date range
  - [ ] Reporting scope
  - [ ] Projects
  - [ ] Tags
  - [ ] Include descendants
- [ ] Hide Start Date and End Date unless Billing Period is set to Custom.
- [ ] Keep Time Tracking responsible for time entry aggregation.
- [ ] Keep Client/Projects responsible for client/project hierarchy and billing metadata.
- [ ] Keep framework Reporting responsible only for report hosting and dispatch.
- [ ] Preserve existing `tagIds` filtering behavior through the Time Tracking-owned runner.
- [ ] Preserve existing task-linked time entry reporting behavior where already supported.
- [ ] Add focused Time Tracking report runner regressions before the page-host rewrite depends on it.

### Version 0.33.8.6 - Correct Project and Client Rollup Billing Math

- [ ] Fix descendant rollup calculation so each project/subproject computes its own direct time first.
- [ ] Apply that project's effective billing rate, billing period, and rounding rules to that project's direct time.
- [ ] Parent project totals should equal:
  - [ ] Parent direct rounded total
  - [ ] plus child project rounded totals
  - [ ] plus deeper descendant rounded totals
- [ ] Do not round all descendant time together at the parent level.
- [ ] Do not apply the parent billing rate to child project time when the child has its own effective rate.
- [ ] Client totals should aggregate project totals using the same already-rounded project/subproject totals.
- [ ] Parent clients should add direct client project totals plus child-client totals without losing child billing rules.
- [ ] Preserve display-only expandable child project rows without double-counting totals.
- [ ] Add fixture coverage for parent projects, child projects, deeper descendants, parent clients, child clients, mixed rates, and mixed billing periods.

### Version 0.33.8.7 - Framework Reporting Host Shell

- [ ] Keep one framework-owned `reporting.html` page.
- [ ] Reduce `views/protected/reporting.html` to a minimal framework host that loads shared view assets,
      the chosen Reporting host renderer/adapter, and the Reporting browser behavior file.
- [ ] Convert the hard-coded Time Report UI into a framework Reporting host that loads available report definitions from the catalog.
- [ ] Render the page shell, header, report selector, status/error/empty states, filter host, and results host through the chosen framework view path.
- [ ] Do not hand-build framework-owned Reporting anatomy in static HTML or ad-hoc browser DOM when a descriptor field or `LongtailForge.view` primitive exists.
- [ ] Keep the first host simple: one selected report, one filter area, one status area, and one results area.
- [ ] Add a focused static regression proving the Reporting page is a minimal framework host.

### Version 0.33.8.8 - Reporting Filter Host and Report Selection

- [ ] Load report definitions from `GET /api/reporting/catalog`.
- [ ] Select the first available report by default when no valid report is requested.
- [ ] Render report filters from contribution metadata through the shared filter host:
  - [ ] Billing period.
  - [ ] Custom date range.
  - [ ] Reporting scope.
  - [ ] Projects.
  - [ ] Tags.
  - [ ] Include descendants.
- [ ] Hide Start Date and End Date unless Billing Period is set to Custom.
- [ ] Preserve query-parameter deep links where already useful, including selected scope/report where practical.
- [ ] Ensure filter changes call the framework execution route and refresh the current result without rebuilding the host layout by hand.
- [ ] Add focused browser/static regressions for report selection, custom date visibility, empty catalog state, and filter refresh behavior.

### Version 0.33.8.9 - Project Time & Billing Result Renderer

- [ ] Add a registered report result renderer for `time-project-billing-table`.
- [ ] The first renderer may remain specific to Project Time & Billing, but it should use framework table/action primitives where they fit.
- [ ] Preserve hierarchical project display:
  - [ ] Parent rows can expand/collapse child rows.
  - [ ] Child rows are display-only rows under their parent.
  - [ ] Footer totals come from the runner result and are not recomputed from expanded display rows.
- [ ] Keep Time Tracking responsible for the result shape and billing semantics.
- [ ] Keep the framework responsible for result-host placement, overflow wrappers, loading/error/empty states, and renderer dispatch.
- [ ] Add focused regressions for expandable child rows, totals, no-results state, and renderer-not-found recovery.

### Version 0.33.8.10 - Permissions, Navigation, Guardrails, and Closeout

- [ ] Decide whether `reporting.view` should become a framework-owned permission instead of being contributed by Time Tracking.
- [ ] Keep report-specific visibility dependent on both `reporting.view` and the owning module's required permissions.
- [ ] Keep Reporting navigation framework-owned, with child report entries contributed by modules.
- [ ] Add strict guardrails for the converted Reporting host:
  - [ ] Reporting must not ship a non-minimal protected HTML view.
  - [ ] Reporting must not call `document.createElement` for framework-owned page header, filter host, status, table shell, or action anatomy when the chosen framework view path covers it.
  - [ ] Reporting must not introduce new one-off layout/footer classes for framework-owned anatomy.
- [ ] Update `docs/declarative-view-surfaces.md` inventory to move Reporting out of "reported" and into the chosen framework-owned Reporting host status.
- [ ] Update `docs/view-building-contract.md` and `docs/module-contract.md` with the Reporting host/contribution boundary.
- [ ] Update Help, `DECISIONS.md`, `CHANGELOG.md`, package metadata, and roadmap archive.
- [ ] Add regression coverage for:
  - [ ] Report catalog filters disabled modules.
  - [ ] Report catalog filters missing permissions.
  - [ ] Time Tracking report appears when Time Tracking is enabled and permissions allow it.
  - [ ] Time Tracking report disappears or is blocked when Time Tracking is disabled.
  - [ ] Custom date fields are hidden unless Custom is selected.
  - [ ] Project/subproject/client rollups apply rounding at the correct level.
  - [ ] Reporting no longer uses hard-coded framework-owned page anatomy.
- [ ] Run focused reporting regressions.
- [ ] Run `npm run check`.
- [ ] Run `npm run test:permissions`.
- [ ] Verify `/api/app-info` reports the expected version after implementation.

## Version 0.34 - Knowledge Base Module

## Knowledge Base Direction Adjustment

Decision:
Knowledge Base is the reviewed, read-only knowledge layer generated from Notes first. Notes remain the working authoring records. Knowledge Base entries may still be written directly, but the default workflow is note-sourced: normal internal/workspace/client-visible notes become KB review candidates automatically, then reviewers approve and publish safe read-only KB snapshots.

### Add to 0.34.1 - Knowledge Base Module Contract, Publishing Model, and Notes Relationship

* [ ] Define Knowledge Base as the reviewed consumption layer for Notes-backed knowledge.

  * [ ] Notes are the working/source records.
  * [ ] KB articles are reviewed read-only article records or publication snapshots.
  * [ ] Normal note creation/update can automatically create or update a KB review candidate.
  * [ ] Automatic KB candidate creation does not mean automatic publishing.
  * [ ] Publishing remains explicit, permission-protected, audited, and snapshot-based.
  * [ ] KB may support directly authored articles, but direct authoring is secondary to note-sourced workflow.

* [ ] Add KB candidate/source behavior.

  * [ ] Add `source_mode` values:

    * [ ] `note_sourced`
    * [ ] `manual`
    * [ ] `imported`
  * [ ] Add `source_sync_state` or equivalent metadata:

    * [ ] `current`
    * [ ] `source_updated`
    * [ ] `manual_override`
    * [ ] `detached`
  * [ ] Add `source_note_id` convenience field only if it simplifies the common one-note article case; keep `kb_article_sources` as the canonical many-source table.
  * [ ] Add `source_note_revision_id` or use `kb_article_sources.source_revision_id` to preserve the note revision that seeded the reviewed article.
  * [ ] Add `last_source_synced_at`.
  * [ ] Add `last_reviewed_at`.
  * [ ] Add `review_due_at` optional for future maintenance workflows.

* [ ] Define automatic candidate rules.

  * [ ] Normal `internal` notes create internal KB candidates.
  * [ ] Normal `workspace` notes create workspace KB candidates.
  * [ ] Normal `client_visible` notes may create client-visible KB candidates only after client-visible KB permissions and file safety are enabled.
  * [ ] `private` notes do not create KB candidates by default.
  * [ ] `secure` notes must never create KB candidates.
  * [ ] Deleted notes should not create KB candidates.
  * [ ] Archived notes may remain as KB sources, but should not automatically update pending candidates unless explicitly configured.

* [ ] Define KB statuses for note-sourced workflow.

  * [ ] `draft`
  * [ ] `in_review`
  * [ ] `approved`
  * [ ] `published`
  * [ ] `rejected`
  * [ ] `archived`
  * [ ] `deleted`
  * [ ] Manually created articles start as `draft`.
  * [ ] Automatically note-sourced articles start as `in_review`.
  * [ ] Updating a source note marks the KB candidate/publication as `source_updated` or creates a new review revision, but does not silently mutate the published snapshot.
  * [ ] Rejected candidates remain linked to the source note for history unless deleted by a permitted user.

### Add to 0.34.2 - Knowledge Base Browser API, Editorial Workflow, and Internal UI MVP

* [ ] Add automatic note-to-KB candidate service methods.

  * [ ] Create or update candidate from note.
  * [ ] Queue note for KB review.
  * [ ] Read KB candidate by source note.
  * [ ] List KB candidates needing review.
  * [ ] Mark source update pending review.
  * [ ] Detach KB article from source note where permitted.
  * [ ] Reject KB candidate with reason.
  * [ ] Approve KB candidate.
  * [ ] Publish approved KB article snapshot.

* [ ] Add Notes lifecycle hook integration.

  * [ ] On normal note created, create KB candidate if workspace KB candidate policy allows it.
  * [ ] On normal note updated, mark linked KB candidate/publication as source-updated.
  * [ ] On note archived, preserve existing KB linkage but stop automatic updates unless configured.
  * [ ] On note deleted, hide or mark linked KB candidate as source unavailable.
  * [ ] Do not process secure notes.
  * [ ] Do not process private notes unless a future explicit rule allows it.

* [ ] Add KB review queue UI.

  * [ ] Show candidates grouped by source visibility:

    * [ ] Internal
    * [ ] Workspace
    * [ ] Client-visible when enabled
  * [ ] Show source note title, source collection path, source updated date, proposed article title, visibility, review status, and whether the source changed since last review.
  * [ ] Allow reviewers to approve, reject, edit article draft, publish, or detach.
  * [ ] Make it obvious when a published KB article is behind its source note.

### Add to 0.34.3 - Knowledge Base Search, Tags, Attachments, Static Pages, and Permission Boundaries

* [ ] Add KB article chrome/window-dressing generation.

  * [ ] Generate safe table of contents.
  * [ ] Generate "What links here."
  * [ ] Generate related articles from article links, source notes, shared tags, shared collections, and wiki-style links.
  * [ ] Show source-note linkage only to users who can access the source note.
  * [ ] Show source update/review status only to internal users with review/history permission.
  * [ ] Hide internal source data from client-visible/public outputs.
  * [ ] Backlink lists must be permission-filtered and must not leak inaccessible article titles, note titles, files, or counts.

* [ ] Add KB link index support.

  * [ ] Track article-to-article links detected from Markdown/wiki-style links.
  * [ ] Track note-to-article references where useful.
  * [ ] Track source note-to-article relationships through `kb_article_sources`.
  * [ ] Rebuild link indexes when article Markdown, note wiki links, slugs, or source links change.
  * [ ] Broken links should be allowed but clearly labeled for reviewers.

### Add to 0.34.4 - Knowledge Base Settings, Documentation, and Closeout

* [ ] Add KB automation settings.

  * [ ] Configure note-to-KB candidate behavior:

    * [ ] Disabled
    * [ ] Manual only
    * [ ] Auto-create internal/workspace candidates
    * [ ] Auto-create client-visible candidates when supported
  * [ ] Configure default candidate status for note-sourced entries.
  * [ ] Configure whether review is always required before publishing.
  * [ ] Configure whether source note updates reopen review.
  * [ ] Configure whether archived notes can continue feeding KB candidates.
  * [ ] Settings must not bypass permissions, secure-note restrictions, private-note restrictions, file safety, or publication review.

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

A lean, read-only task calendar shipped earlier in 0.33.7 (task due dates + reminder markers). This
section owns the fuller Calendar module: user-created calendar events, iCal/shared-calendar display,
and richer views beyond the 0.33.7 task read-out. External Google/Outlook sync remains later integrations work.

- [ ] Calendars
  - [ ] Year view
  - [ ] Month view
  - [ ] Week view
  - [ ] Day view
  - [ ] Filters for client (business workspace only)/project

- [ ] Calendar Events
  - [ ] Allow addition of calendar events
  - [ ] Display iCal events from shared calendars

## Version 0.36.5 - Account Home / Cross-Workspace Attention View

Add a framework-owned Account Home view for users who belong to multiple workspaces.

This view must not weaken workspace isolation. It should aggregate only permission-safe summaries from workspaces the current user can access.

Account Home should not query module tables directly. It should use framework-owned summary services, notification records, announcement records, activity-feed records, and module-declared attention providers where available.

The first version should include:

- Workspace cards showing unread/attention counts.
- Active workspace announcements.
- Current-user notifications across accessible workspaces.
- Permission-safe attention items such as overdue tasks, assigned tickets, pending reviews, and stale timers where those modules are enabled.
- Links that switch/open the correct workspace before navigating to the target record.

Do not expose raw audit records, raw event payloads, private module records, or cross-workspace administrative data. Every item must be visible only if the user could read the source record inside that workspace.

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

## Version 0.38.x - Security, Sessions, Login Monitoring, and Production Hardening

Add dependency note:

This branch depends on the runtime configuration contract from 0.33.5.19. Security-sensitive settings must be validated through `.env`/runtime config before public hosted SaaS launch.

Additional required hardening before hosted SaaS:

- [ ] Production secure cookies.
- [ ] Trusted proxy configuration.
  - [ ] Wire the already-reserved `TRUST_PROXY` env var into `src/config.js` and `app.set('trust proxy', ...)`; it is documented in `.env.example`/`docs/runtime-configuration.md` but currently unread.
- [ ] Login throttling/rate limiting.
- [ ] Async password hashing/verification.
- [ ] Session revocation.
- [ ] Admin-forced logout.
- [ ] Password reset.
- [ ] Security event logging.
- [ ] Backup/restore testing.
- [ ] Runtime secret documentation.

### Version 0.38.4

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

### Version 0.39.0 - Creator Studio / Content Studio Module

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

- [x] Wipe existing DB migrations and create a new DB baseline  -  Completed in 0.33.5.18.6.5.4.

- [x] Evaluate all existing regressions and see what can be eliminated/lightened  -  Completed in 0.33.5.18.6.5.4 without removing coverage from the standard release gate.

- [x] Determine where efficiencies can be made in the code/Perform an efficiency refactor  -  Initial regression/database efficiency pass completed in 0.33.5.18.6.5.4.

- [ ] Evaluate whether TypeScript would be a useful addition for ensure module/framework contracts are adhered to

- [ ] Audit all Public API calls and make a list for review and modification. Sort by module.

- [ ] Audit all event hooks by module and make a list for review and modification.

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

## Version 0.43.0

- [ ] Email delivery
- [ ] Invite links
- [ ] Single Sign-On (SSO)

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

## Version 0.60.0 - SaaS Wrapper

This will be a private plugin, only available to me.

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

#### Support tickets

- [ ] ZenDesk
- [ ] FreshDesk
- [ ] GitHub Issues

#### Calendars

- [ ] Google Calendar
- [ ] Outlook Calendar

#### Task/To Do App Integrations

- [ ] Microsoft To Do
- [ ] Google Tasks
- [ ] Identify others in the marketplace

#### File Sharing and Storage

Is it possible to get notifications from any of these sources?

- [ ] DigitalOcean Spaces
- [ ] AWS
- [ ] Microsoft Azure
- [ ] Microsoft OneDrive
- [ ] Google Drive
- [ ] DropBox
- [ ] Microsoft SharePoint
  - File sharing
  - Knowledgebase pages
  - Input for tickets/notes/tasks/etc.
- [ ] GitHub (Repository Linking)

#### Email integrations

Auto-routing communications/messaging

- [ ] Google Workspace email
- [ ] Outlook

#### eCommerce Plugins

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

#### Personal/Family Workspace Integrations

- [ ] Create grocery/shopping list items from Home Assistant (voice commands inputs)
- [ ] Update/create project tasks from Home Assistant (voice commands inputs)

- [ ] Home Assistant
- [ ] Apple Home
- [ ] Google Assistant (Google Home?)

#### Analytics (Creator Studio)

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

#### Publishing (Creator Studio)

The Creator studio tool can be much richer if it pushes content out to these platforms, or stores them there until ready for publishing.

- [ ] WordPress (Posts first, the Custom Post Types)
- [ ] Shopify (Blogs)
- [ ] Social Media
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
