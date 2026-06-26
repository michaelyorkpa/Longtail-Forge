# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.33.5.18 - View Conversion Backlog (Framework-Owned Views, Module-Owned Data)

Completed 0.33.5.17 Markdown platform work and earlier 0.33.5.18 planning and implementation slices
are archived in `ROADMAP-ARCHIVE.md`.
Completed 0.33.5.18.6.1 through 0.33.5.18.6.11 are archived in `ROADMAP-ARCHIVE.md`.
The active roadmap continues with Files and Clients/Projects view conversion work.
Completed 0.33.5.18.11.1 through 0.33.5.18.11.13 are archived in `ROADMAP-ARCHIVE.md`.
0.33.5.18.12.4 is the most recently completed Files visual states and control parity slice. The next live work starts with 0.33.5.18.12.5.

## Files (0.33.5.18.11 - 0.33.5.18.12)

The framework already owns the file service (storage, scanning, lifecycle, downloads). This conversion
is strictly the browse/attachment UI and must never bypass file permission, scan, storage, or download
routes.

Decision:

Files should adopt the same standardized framework/module UI boundary established by Notes and Tasks,
but Files should not become a generic document manager or cross-module record browser. The Files page is
the workspace file recovery and audit surface. Attachment management remains closest to the record that
owns the work context, with the shared Files attachment helper providing consistent upload/list/action
anatomy.

Framework owns:

- Files page shell.
- Slide-out filter/sidebar shell when the browse surface needs many filters.
- Filter control placement, status/empty/loading/error states, table/list/card wrappers, detail/preview
  shell, metadata badge rows, dense row/action placement, attachment panel shell, upload control shell,
  progress/result placement, modal/child-dialog shell, focus return, and accessible control anatomy.

Files owns:

- File and attachment metadata.
- Storage keys, scan/quarantine state, retention/delete/restore meaning, download availability, upload
  acceptance, attachment target validation, allowed file categories, visibility values, per-record
  placement meaning, permission checks, file lifecycle/audit events, and all file/attachment routes.
- Human-readable labels for files, attachment targets, clients, projects, scan/status values, and safe
  unavailable/deleted/quarantined fallbacks.
- Which actions are visible, route calls, confirmations, save-first states, upload payloads, refresh
  behavior, and the shared attachment helper body.

Guardrails:

- Do not expose protected storage paths, direct filesystem URLs, scanner internals, signed URLs, or raw
  storage keys in browser UI, descriptors, events, audit summaries, or regressions.
- Do not bypass `/api/files`, `/api/files/attachments`, download, delete, restore, report, quarantine,
  or attachment routes from the converted UI.
- Do not add rename, move, hard purge, permanent delete, or direct metadata-edit controls unless the
  Files service first ships explicit routes, permissions, audit behavior, and regressions for them.
- Do not show Client filters or Client metadata controls outside Business workspaces.
- Normal Files UI should prefer readable module, target, client, and project labels. Raw IDs may remain
  internal payload values or advanced troubleshooting filters only when there is no safe readable label.
- Do not make secure-note files available while secure attachments remain out of scope.
- Do not let attachment panels render substantial upload/list bodies inline in converted add/edit modal
  bodies. Notes and Tasks open Files from footer utility actions as stacked child dialogs, and Files
  should preserve that model for future attachable modules.

Sizing note:

The original generated Files work grouped the browse page, filters, attachment helper, upload/dropzone,
row actions, route safety, cleanup, and strict guardrails into two broad slices. This split keeps the
read-only descriptor proof, filter/readable-label cleanup, upload behavior, attachment panels, actions,
and strict guardrails separately reviewable like the Notes and Tasks conversions.

### Version 0.33.5.18.12 - File Upload, Attachment Panels, Actions, and Strict Guardrails

Scope note:

This branch starts after the 0.33.5.18.11.13 browse/edit/preview closeout. Files is already a compact
browse/recovery listing with route-backed File Context and Preview modal workflows. These slices may
standardize upload, attachment-panel, action, visual-state, and strict-guardrail anatomy, but they must
not reintroduce inline Browse Summary, selected-file detail, Metadata, Preview, selected-row state, or
Inspector behavior on the Files browse page.

#### Version 0.33.5.18.12.1 - Upload control shell and progress/result behavior

- [x] Render the Files upload/dropzone shell, accepted-file hint, upload button, progress/status, and
      per-file result list through shared framework anatomy or descriptor mount regions.
- [x] Keep file reading, base64 payload construction, batch upload payloads, accepted categories,
      size/type checks, target IDs, visibility, and upload route calls in Files-owned browser/service
      paths.
- [x] Preserve multi-file upload and drag/drop behavior in both the Files page and reusable attachment
      surfaces where currently supported.
- [x] Keep upload UI out of File Context and Preview; those already-shipped modals remain focused on
      attachment context editing and route-backed preview only.
- [x] Add regressions proving successful, partial-failure, and rejected upload states remain visible
      without moving scanner/storage rules into framework UI code.

#### Version 0.33.5.18.12.2 - Shared attachment panel shell standardization

- [x] Convert the shared attachment panel (`public/js/shared/file-attachments.js`) view anatomy to
      framework-owned panel, list, empty, status, upload-result, and dense-action shells while keeping
      the helper's upload/list/download/remove/delete/restore logic Files-owned.
- [x] Preserve saved-record attachment behavior and unsaved-record save-first messaging for Notes,
      Tasks, and future attachable modules.
- [x] Keep the attachment helper body compatible with stacked child dialogs opened from converted modal
      footer utility buttons.
- [x] Do not turn attachment panels into inline File Context, Preview, Metadata, or Inspector surfaces;
      any future edit/preview affordance must call the canonical route-backed Files modal workflow.
- [x] Ensure deleted/unavailable/quarantined attachments show gentle recovery-safe states instead of
      breaking the host modal or hiding history.
- [x] Add regressions proving Notes and Tasks Files utilities still open stacked child dialogs and that
      attachment helper focus/status behavior is preserved.

#### Version 0.33.5.18.12.3 - Files row and attachment action wiring

- [x] Express existing shipped actions through declarative route actions or registered Files behaviors:
      download, report, quarantine where existing route/permission support permits it, remove attachment,
      delete file, and restore file.
- [x] Treat File Context edit and Files Preview as already-shipped 0.33.5.18.11 workflows; this slice
      may preserve their placement/visual parity but must not reimplement those routes or modals.
- [x] Preserve action isolation: row click/Enter opens File Context, Preview/View opens the Preview
      modal, Download downloads, and Delete/Restore/Report/Quarantine remain distinct controls.
- [x] Preserve existing confirmations, danger styling, permission-shaped visibility, scan/download
      availability, retention semantics, and post-action refresh behavior.
- [x] Keep route calls on the existing Files routes and keep API/service permission checks authoritative.
- [x] Do not add rename, move, hard purge, permanent delete, storage moves, file replacement, or direct
      file-metadata edit controls in this slice.
- [x] Keep unsupported files download-only rather than routing them into a preview/detail panel.
- [x] Add regressions proving action buttons use shared dense/action placement, remain accessible, and
      never bypass the Files routes.

#### Version 0.33.5.18.12.4 - Files visual states and control parity

- [x] Align Files page and attachment-panel controls with the Notes/Tasks converted control standard:
      icon buttons for dense row actions where appropriate, visible text for ambiguous upload/report
      actions, accessible labels/titles, wrapping action rows, and theme-token surfaces.
- [x] Include the already-shipped File Context and Preview controls in visual parity checks without
      changing their route-backed behavior from 0.33.5.18.11.
- [x] Standardize file status chips, scan-status chips, deleted/restored/quarantined messaging,
      attachment counts, and empty states across Files page and reusable attachment panels.
- [x] Preserve the compact listing boundary during visual work: no persistent inline preview, metadata,
      selected-file detail, selected-row state, or nested dashboard-like browse panels.
- [x] Ensure normal Files UI uses broad product language such as recovery, available, unavailable,
      attachment, upload, download, restore, and review rather than punitive or diagnostic copy.
- [x] Add responsive regressions or static guardrails proving action controls do not overlap file names,
      metadata, or attachment panel content on narrow widths.

#### Version 0.33.5.18.12.5 - Files strict guardrail inventory and escape-hatch map

- [ ] Add `docs/files-strict-guardrail-inventory.md` or an equivalent section in the view-building docs
      before strict enforcement.
- [ ] Inventory remaining framework-owned candidates in `public/js/files.js` and
      `public/js/shared/file-attachments.js`: page header, filters, table/list shell, attachment panel
      shell, upload/dropzone shell, empty/status states, dense actions, and modal/overlay placement.
- [ ] Document intentional Files-owned escape hatches: file reading, upload payloads, accepted
      categories, scan/download availability, route calls, confirmations, permission-aware visibility,
      target metadata, deleted/quarantined recovery states, and host refresh callbacks.
- [ ] Document the already-shipped File Context and Preview modal openers/routes as allowed Files-owned
      behavior, while marking inline detail/summary/preview/metadata panels, selected-row state, and
      Inspector-style browse behavior as forbidden.
- [ ] Add non-failing guardrail inventory coverage, but do not fail strict Files guardrails until the
      enforcement slice.

#### Version 0.33.5.18.12.6 - Files strict declarative guardrail enforcement

- [ ] Reduce `public/js/files.js` and framework-owned view portions of
      `public/js/shared/file-attachments.js` to data bindings, helper mounts, and Files-owned behavior
      handlers.
- [ ] Expand fail-on-violation declarative guardrails to the Files surface.
- [ ] Guard against hand-built framework-owned page/filter/table/panel/upload/action anatomy once a
      descriptor field or shared helper owns it.
- [ ] Keep documented Files-owned escape hatches allowed so the guardrail does not outlaw file route,
      upload, scan, permission, and attachment behavior.
- [ ] Keep the canonical File Context/Preview modal workflows, row action isolation, readable-label
      fallbacks, and attachment helper behavior allowed while failing reintroduced inline browse detail,
      metadata, preview, selected-row, or Inspector anatomy.
- [ ] Add regressions proving Files no longer creates framework-owned anatomy by hand and never bypasses
      file routes.

#### Version 0.33.5.18.12.7 - Files docs, changelog, and closeout

- [ ] Update `docs/view-building-contract.md`, `docs/declarative-view-surfaces.md`,
      `docs/module-contract.md`, and Files-specific developer docs with the completed Files conversion
      boundary.
- [ ] Preserve the 0.33.5.18.11 compact browse/edit/preview boundary: File Context and Preview remain
      route-backed modal workflows, while 0.33.5.18.12 closes upload, shared attachment panel, existing
      lifecycle actions, visual parity, and strict guardrails.
- [ ] Update `DECISIONS.md` with the Files UI standardization and strict-surface decision.
- [ ] Update `CHANGELOG.md` and package metadata to the implemented version.
- [ ] Archive completed Files roadmap sections according to the roadmap bookkeeping rule.
- [ ] Run:
  - [ ] `npm run check`
  - [ ] Files browse regressions.
  - [ ] Files edit modal and preview modal preservation regressions if touched by visual/action/guardrail
        work.
  - [ ] Files attachment/upload regressions.
  - [ ] Notes and Tasks Files utility regressions.
  - [ ] `npm run test:permissions` if file permission, attachment target, workspace gating, or route
        guard behavior changed.
- [ ] Verify `/api/app-info` reports the expected version.

Acceptance criteria:

- Files page and reusable attachment panels share the standardized converted control system.
- File Context and Preview remain the already-shipped route-backed modal workflows, with no inline
  browse detail/preview/metadata panel or selected-row state returning.
- File service behavior remains authoritative for storage, scanning, permissions, lifecycle, downloads,
  uploads, delete/restore, reporting, quarantine, and attachment target validation.
- Strict guardrails protect Files like Notes and Tasks without outlawing required Files-owned behavior.

---

## Clients/Projects Pages (0.33.5.18.13 - 0.33.5.18.14)

The Add/Edit Client and Add/Edit Project dialogs were already converted to shared modal/form/footer
helpers in 0.33.5.15.4. This cluster converts the remaining combined Clients/Projects page anatomy:
filters, the client/project hierarchy index, related tables, page-level actions, and hierarchy
interactions. Keep the already-converted dialogs working unchanged.

Framework owns: page shell, filters, hierarchy index/tree, split or table layout, detail shell, related
tables, action placement, empty/loading/error states. Clients/Projects owns: client/project hierarchy,
billing metadata, Business-only gating, Personal/Family scope, validation, save payloads, permissions.

### Version 0.33.5.18.13 - Clients/Projects Declarative Page Surface Proof

- [ ] Add a `viewSurfaces` descriptor for the combined Clients/Projects page read path.
- [ ] Reduce the Clients/Projects page HTML to a minimal framework host element.
- [ ] Move filters, the client/project hierarchy index (using hierarchy/tree index rendering from
      0.33.5.18.1), the split/table layout, and detail read anatomy into the descriptor.
- [ ] Define the normalized read endpoint and `fieldBindings`, preserving hierarchy, billing metadata
      display, Business-only gating, and Personal/Family scope behavior.
- [ ] Keep the already-converted Add/Edit Client and Add/Edit Project dialogs working; do not regress
      them.
- [ ] Preserve all Clients/Projects routes, payloads, permissions, and scope behavior.
- [ ] Add regressions proving the read-only Clients/Projects page renders from the descriptor with
      correct hierarchy and Business-only gating.

### Version 0.33.5.18.14 - Clients/Projects Hierarchy Interactions, Related Tables, Actions, and Cleanup

- [ ] Express hierarchy interactions (move/reparent), related-project and related-client tables, bulk
      controls, and page-level actions as declarative route actions or registered behaviors.
- [ ] Keep client/project hierarchy rules, billing defaults, Business-only gating, and scope checks in
      `public/js/clients-projects.js`.
- [ ] Reduce the page portions of `public/js/clients-projects.js` to data bindings and behavior
      handlers with no hand-built framework-owned anatomy (the dialogs remain as converted in
      0.33.5.15.4).
- [ ] Ensure Personal and Family workspaces still cannot reach Business-only client surfaces through
      the converted page.
- [ ] Expand fail-on-violation declarative guardrails to the Clients/Projects page surface.
- [ ] Add regressions proving the Clients/Projects page no longer creates framework-owned anatomy by
      hand and preserves workspace gating.

---

## Version 0.33.5.18.15 - Cross-Surface Guardrails, Inventory, Documentation, and Closeout

- [ ] Confirm fail-on-violation declarative guardrails are enforced on all four converted surfaces
      (Notes, Tasks, Files, Clients/Projects pages).
- [ ] A declarative surface must not call `document.createElement` for framework-owned anatomy (page
      header, table, dialog, action strip, filter panel, split layout, index list).
- [ ] A declarative surface must not ship a non-minimal protected HTML view.
- [ ] A declarative surface must not introduce one-off layout/footer classes when a descriptor field
      or framework class exists.
- [ ] Update the `docs/view-building-contract.md` inventory snapshot to mark Notes, Tasks, Files, and
      Clients/Projects pages as converted, and to note Admin/Settings (deferred), Reporting (0.33.6),
      and Dashboard/Workbench (0.33.7) as remaining or owned elsewhere.
- [ ] Update `docs/module-contract.md` and `docs/ui-surface-contract.md` with the shared capabilities
      added in 0.33.5.18.1 and the escape-hatch boundary.
- [ ] Update the developer guide for authoring a declarative surface with the new capabilities.
- [ ] Confirm no database schema, module API payload, permission, or workflow changes were introduced
      by the conversions.
- [ ] Update DECISIONS.md with the view-conversion-backlog decisions and the converted-surface list.
- [ ] Update CHANGELOG.md.
- [ ] Update package metadata to the implemented version.
- [ ] Run `npm run check`.
- [ ] Run `npm run test:permissions`.
- [ ] Verify `/api/app-info` reports the expected version.
- [ ] Defer Admin/Settings view conversion and any non-view concerns to their own later roadmap lines.

---

## Per-Slice Standing Constraints

These apply to every conversion slice above and should be treated as acceptance criteria:

- Behavior-preserving: no route, payload, permission, schema, or workflow changes.
- Modules own data loading, normalized read endpoints, `fieldBindings`, validation, save payloads,
  permissions, record labels, and workflow behavior; the framework owns layout anatomy.
- Use descriptors first; use imperative `LongtailForge.view` helpers only as the documented escape
  hatch for fragments a descriptor cannot express, never to hand-build covered anatomy.
- Reuse the per-workspace terminology system for all descriptor labels rather than hard-coded strings.
- Keep legacy module CSS classes as compatibility aliases during conversion; do not add new one-off
  classes for framework-owned anatomy; defer alias removal to a later cleanup pass.
- Preserve Business client/project behavior and Personal/Family workspace scope on every surface.
- Each surface's final cleanup slice must leave its browser file as data bindings plus behaviors with
  no hand-built framework-owned anatomy, and must expand strict guardrails to that surface.
- Add regressions per slice; wire each new regression into `scripts/regression-suite.mjs`.

## Version 0.33.5.19 - Runtime Configuration and SQLite Small-Office Foundation

Purpose:

Establish Longtail Forge's runtime configuration contract, keep SQLite first-class for self-hosted/small-office installs, and prepare the database layer for future PostgreSQL support without forcing PostgreSQL on self-hosted users.

SQLite support target:

- Single app server.
- Local or attached storage.
- Roughly 50 total users.
- Typical active usage of 5-15 concurrent users.
- No horizontal app scaling expectation.
- No external database setup required.
- Suitable for small offices, solo operators, families, and self-hosted teams.

PostgreSQL support target:

- Hosted SaaS.
- Multiple app/web instances.
- Durable workers.
- Larger multi-workspace datasets.
- High concurrency.
- Managed backups and operational monitoring.

Decision:

SQLite remains a first-class supported backend. PostgreSQL is required for hosted SaaS scale, but SQLite must remain viable and pleasant for self-hosted installs.

Do not remove SQLite.
Do not require PostgreSQL for small-office self-hosting.
Do not pretend SQLite mode supports horizontal scaling.

### Version 0.33.5.19.1 - Runtime configuration contract and `.env.example`

- [ ] Add `.env.example`.
- [ ] Ensure `.env` is ignored and never committed.
- [ ] Add `docs/runtime-configuration.md`.
- [ ] Define startup/runtime configuration groups:
  - [ ] App identity and environment.
  - [ ] Host/port/public URL.
  - [ ] Data directory.
  - [ ] Database provider.
  - [ ] SQLite settings.
  - [ ] Future PostgreSQL settings.
  - [ ] Initial super-admin bootstrap.
  - [ ] Session/cookie settings.
  - [ ] Secure-note encryption settings.
  - [ ] File storage provider settings.
  - [ ] File scanner settings.
  - [ ] Worker/job settings.
  - [ ] Logging/diagnostics settings.
- [ ] Preserve compatibility with existing environment variables where practical:
  - `HOST`
  - `PORT`
  - `LONGTAIL_DATA_DIR`
  - `LONGTAIL_DATABASE_FILE`
  - `SQLITE_COMMAND`
  - `WORKSPACE_INSTALL_MODE`
  - `WORKSPACE_TYPE_LIMIT`
  - `SUPER_ADMIN_USERNAME`
  - `SUPER_ADMIN_PASSWORD`
- [ ] Add startup validation for required variables.
- [ ] Add safe startup warnings for optional but recommended variables.
- [ ] Add tests proving missing required startup settings fail clearly.

Suggested initial `.env.example` groups:

```env
# App
LONGTAIL_ENV=development
LONGTAIL_PUBLIC_URL=http://localhost:8001
HOST=0.0.0.0
PORT=8001
TRUST_PROXY=false

# Data
LONGTAIL_DATA_DIR=./data

# Database
LONGTAIL_DATABASE_PROVIDER=sqlite

# SQLite
LONGTAIL_DATABASE_FILE=./data/longtail-forge.db
SQLITE_COMMAND=sqlite3
LONGTAIL_SQLITE_FOREIGN_KEYS=on
LONGTAIL_SQLITE_JOURNAL_MODE=wal
LONGTAIL_SQLITE_BUSY_TIMEOUT_MS=5000

# Future PostgreSQL
# DATABASE_URL=
# LONGTAIL_DATABASE_POOL_MIN=1
# LONGTAIL_DATABASE_POOL_MAX=10
# LONGTAIL_DATABASE_SSL=false

# Initial bootstrap
SUPER_ADMIN_USERNAME=support@longtailforge.local
SUPER_ADMIN_PASSWORD=

# Sessions / cookies
LONGTAIL_SESSION_COOKIE_SECURE=false
LONGTAIL_SESSION_COOKIE_SAMESITE=Lax
LONGTAIL_SESSION_TTL_SECONDS=43200

# Secure notes
# LONGTAIL_SECURE_NOTES_KEY=
LONGTAIL_SECURE_NOTES_KEY_VERSION=v1

# File storage
LONGTAIL_STORAGE_PROVIDER=local
LONGTAIL_LOCAL_STORAGE_ROOT=./data/files

# File scanning
LONGTAIL_FILE_SCANNER=none
# LONGTAIL_CLAMD_HOST=127.0.0.1
# LONGTAIL_CLAMD_PORT=3310
# LONGTAIL_CLAMSCAN_PATH=

# Jobs / workers
LONGTAIL_WORKER_MODE=inline
LONGTAIL_WORKER_ID=default
LONGTAIL_JOB_POLL_INTERVAL_MS=5000
LONGTAIL_JOB_LOCK_TTL_SECONDS=300

# Logging
LONGTAIL_LOG_LEVEL=info

```

This one is important because the current config already reads several values from `process.env`, but there is not yet a formal `.env.example` or startup contract. Current config pulls things like `HOST`, `PORT`, `LONGTAIL_DATA_DIR`, `LONGTAIL_DATABASE_FILE`, `SQLITE_COMMAND`, `WORKSPACE_INSTALL_MODE`, and `WORKSPACE_TYPE_LIMIT`. 

---

### Version 0.33.5.19.2 - SQLite connection hardening

- [ ] Enable SQLite foreign-key enforcement for every SQLite connection/process:
  - [ ] `PRAGMA foreign_keys = ON`.
- [ ] Add SQLite startup health checks:
  - [ ] Foreign keys enabled.
  - [ ] Journal mode.
  - [ ] Busy timeout.
  - [ ] Database file path.
  - [ ] Database file writable.
- [ ] Evaluate and enable WAL mode by default for SQLite self-hosted installs unless incompatible:
  - [ ] `PRAGMA journal_mode = WAL`.
- [ ] Keep or configure busy timeout behavior.
- [ ] Add SQLite health output that is safe for admins but does not leak secrets.
- [ ] Add regression coverage proving:
  - [ ] Foreign-key enforcement is enabled.
  - [ ] Invalid orphan records are rejected.
  - [ ] SQLite startup fails clearly when the database path is invalid.
  - [ ] SQLite mode remains the default provider when no database provider is set.

Acceptance criteria:

- SQLite mode is safer without changing user-facing behavior.
- Small-office SQLite installs get stricter data integrity by default.

### Version 0.33.5.19.3 - Provider-neutral database adapter contract v1

- [ ] Create a provider-neutral database module.
- [ ] Define the v1 database API:
  - [ ] `db.query(sql, params)`
  - [ ] `db.get(sql, params)`
  - [ ] `db.run(sql, params)`
  - [ ] `db.transaction(callback)`
  - [ ] `db.close()`
  - [ ] `db.health()`
  - [ ] `db.capabilities`
- [ ] Keep SQLite as the only implemented provider in this slice.
- [ ] Move SQLite-specific process handling behind the SQLite adapter.
- [ ] Keep existing repository behavior working.
- [ ] Preserve `querySql` / `runSql` compatibility temporarily if needed, but mark them as legacy compatibility helpers.
- [ ] Add a guardrail inventory for direct SQLite imports.
- [ ] Add documentation explaining:
  - [ ] SQLite is the default self-hosted backend.
  - [ ] PostgreSQL will plug into the same adapter later.
  - [ ] Repositories should not import `src/db/sqlite.js` directly.
- [ ] Add regressions proving:
  - [ ] Existing app startup still works on SQLite.
  - [ ] Existing migrations still run on SQLite.
  - [ ] Existing modules can query through the provider-neutral database module.

Acceptance criteria:

- The database layer has a real provider-facing boundary.
- SQLite behavior is preserved.
- Future PostgreSQL work can target the adapter instead of rewriting every module.

### Version 0.33.5.19.4 - Parameterized query pilot

- [ ] Add parameter binding support to the database adapter.
- [ ] Convert a small but representative set of repositories to parameterized queries:
  - [ ] Sessions.
  - [ ] Workspaces.
  - [ ] One Tasks read path.
  - [ ] One Notes read path.
- [ ] Add docs for query style:
  - [ ] No new string interpolation for user-supplied values.
  - [ ] Use parameters for values.
  - [ ] Keep table/column names static or validated.
- [ ] Add lint/static guardrails where practical.
- [ ] Add regression coverage for:
  - [ ] Quotes in user data.
  - [ ] Special characters in IDs/titles.
  - [ ] Attempts to inject SQL-like strings as values.

Acceptance criteria:

- New repository work has a clear safe query style.
- Existing string-SQL helpers remain only as compatibility escape hatches until broader migration.

### Version 0.33.5.19.5 - Explicit transaction helper

- [ ] Add provider-neutral `db.transaction(callback)` support.
- [ ] SQLite implementation should:
  - [ ] Begin transaction.
  - [ ] Commit on success.
  - [ ] Roll back on thrown error.
  - [ ] Prevent nested transaction confusion or document nested behavior.
- [ ] Convert one or two existing multi-step workflows to the helper:
  - [ ] Task assignee replacement.
  - [ ] One file attach/create workflow or one note create/link workflow.
- [ ] Add regression coverage proving:
  - [ ] Successful transaction commits all changes.
  - [ ] Failed transaction rolls back all changes.
  - [ ] Partial records are not left behind.

Acceptance criteria:

- Multi-step writes have a provider-neutral transaction path.
- Future outbox/job writes can be committed with the source record atomically.

### Version 0.33.5.19.6 - Migration locking and startup ownership

- [ ] Add migration lock strategy for SQLite.
- [ ] Document future PostgreSQL migration lock strategy.
- [ ] Ensure only one app/startup process can run migrations or schema repairs at a time.
- [ ] Separate normal app startup from one-time maintenance where practical.
- [ ] Add startup behavior docs:
  - [ ] Self-hosted single-process mode.
  - [ ] Future SaaS multi-instance mode.
  - [ ] Which process runs migrations.
  - [ ] Which process runs workers.
- [ ] Add regression coverage proving:
  - [ ] Migration lock is acquired before migrations.
  - [ ] A second migration attempt fails or waits clearly.
  - [ ] Startup failure messages are actionable.

Acceptance criteria:

- SQLite remains simple.
- Future multi-process deployment is not blocked by unsafe startup migrations.

### Version 0.33.5.19.7 - SQLite small-office closeout

- [ ] Add `docs/sqlite-small-office-mode.md`.
- [ ] Document supported SQLite deployment assumptions:
  - [ ] One app process/server.
  - [ ] Local or attached disk.
  - [ ] No shared SQLite database across multiple app servers.
  - [ ] Backup expectations.
  - [ ] Optional scanner expectations.
  - [ ] Recommended memory/disk guidance.
- [ ] Add admin diagnostics:
  - [ ] Database provider.
  - [ ] SQLite journal mode.
  - [ ] Foreign keys enabled.
  - [ ] Database file location.
  - [ ] Data directory.
  - [ ] Storage provider.
  - [ ] Scanner mode.
- [ ] Add warning copy for configurations outside SQLite support bounds.
- [ ] Run full regression suite.
- [ ] Run SQLite integrity check.
- [ ] Update changelog and decisions.

Acceptance criteria:

- SQLite is explicitly documented as supported small-office mode.
- The app can explain its runtime mode to admins.

## Version 0.33.5.20 - Bounded Queries and Small-Office Scale Data

Purpose:

Move high-volume list surfaces away from load-everything-then-filter-in-JavaScript behavior. Preserve the current user experience while making SQLite small-office mode and future PostgreSQL SaaS mode more predictable under larger datasets.

### Version 0.33.5.20.1 - Scale seed framework

- [ ] Add `scripts/seed-scale.mjs`.
- [ ] Add seed profiles:
  - [ ] `dev-demo`
  - [ ] `sqlite-small-office-50`
  - [ ] `sqlite-heavy-workspace`
  - [ ] `future-saas-postgres-mixed`
- [ ] Ensure seed scripts require an explicit database path/provider.
- [ ] Refuse to run against a database that is not clearly marked as disposable or test-only.
- [ ] Generate realistic data:
  - [ ] Workspaces.
  - [ ] Users.
  - [ ] Role assignments.
  - [ ] Clients.
  - [ ] Projects.
  - [ ] Tasks.
  - [ ] Notes.
  - [ ] Lists/list items.
  - [ ] Tags.
  - [ ] Notifications.
  - [ ] Audit logs.
  - [ ] File metadata.
- [ ] Add verification:
  - [ ] Expected counts.
  - [ ] Permission sanity.
  - [ ] Search sanity.
  - [ ] App startup sanity.

SQLite small-office seed target:

- 1 workspace.
- 50 users.
- 25-100 clients.
- 250-1,000 projects.
- 10,000-50,000 tasks.
- 10,000-25,000 notes.
- 25,000-100,000 time entries.
- 5,000-20,000 list items.
- 2,000-10,000 file metadata rows.
- 100,000+ audit rows.

Acceptance criteria:

- A developer can seed a disposable SQLite database and test realistic small-office load.

### Version 0.33.5.20.2 - Tasks server-side filtering and paging

- [ ] Replace full-workspace task list reads for normal list views with bounded server-side queries.
- [ ] Move task view filters into SQL where practical:
  - [ ] My Tasks.
  - [ ] All.
  - [ ] Unassigned.
  - [ ] Overdue.
  - [ ] Due Today.
  - [ ] Due This Week.
  - [ ] Completed.
  - [ ] Archived.
- [ ] Add page/cursor support.
- [ ] Add maximum page size.
- [ ] Keep permission checks authoritative.
- [ ] Add list projection separate from full task detail read.
- [ ] Add regressions proving:
  - [ ] Task views return correct rows.
  - [ ] Paging is stable.
  - [ ] Permissions still apply.
  - [ ] Large seeded task sets do not require loading the entire workspace task table.

Acceptance criteria:

- Tasks list behavior is unchanged for users.
- Server no longer loads all workspace tasks for normal list views.

### Version 0.33.5.20.3 - Notes list projection and server-side paging

- [ ] Add a lightweight Notes list endpoint/projection.
- [ ] Do not return full note body HTML in normal list responses.
- [ ] Add server-side paging/cursor support.
- [ ] Add server-side filters for:
  - [ ] Status.
  - [ ] Library bucket.
  - [ ] Collection.
  - [ ] Owner.
  - [ ] Visibility.
  - [ ] Security mode.
  - [ ] Updated since.
- [ ] Keep full body rendering on note detail/read endpoints.
- [ ] Preserve secure-note access behavior.
- [ ] Add regressions proving:
  - [ ] Notes list is lightweight.
  - [ ] Detail read still returns full safe rendered body where allowed.
  - [ ] Secure notes do not leak body content.
  - [ ] Paging and collection filters behave correctly.

Acceptance criteria:

- Notes list browsing scales better in SQLite and future PostgreSQL.
- Note reading/editing UX remains unchanged.

### Version 0.33.5.20.4 - Batched list enrichment

- [ ] Add shared helper/service pattern for batching related list metadata by visible record IDs.
- [ ] Batch where practical:
  - [ ] Tags for visible tasks/notes/lists/files.
  - [ ] File counts.
  - [ ] Linked-note counts.
  - [ ] Checklist progress.
  - [ ] Assignee labels.
  - [ ] Notification/subscription state.
- [ ] Avoid one-query-per-row list enrichment.
- [ ] Add query-count regressions or instrumentation for representative list surfaces.
- [ ] Preserve module ownership:
  - [ ] Modules own meaning.
  - [ ] Framework may own batching helper shape.

Acceptance criteria:

- List pages enrich visible rows with a small, bounded number of queries.
- Large workspaces do not produce query explosions.

### Version 0.33.5.20.5 - High-volume admin lists

- [ ] Add bounded paging/filtering to high-volume framework/admin surfaces:
  - [ ] Audit log.
  - [ ] Notifications.
  - [ ] Search results.
  - [ ] Files browse.
- [ ] Ensure each endpoint has:
  - [ ] Maximum page size.
  - [ ] Stable sort.
  - [ ] Permission filtering.
  - [ ] Clear empty/loading/error states.
- [ ] Add regressions using scale seed data.

Acceptance criteria:

- Admin/history surfaces remain usable with large SQLite small-office datasets.

### Version 0.33.5.20.6 - SQLite small-office performance pass

- [ ] Add a repeatable SQLite small-office performance script.
- [ ] Test representative routes:
  - [ ] App shell bootstrap.
  - [ ] Tasks list.
  - [ ] Task detail.
  - [ ] Notes list.
  - [ ] Note detail.
  - [ ] Files browse.
  - [ ] Search.
  - [ ] Notifications.
  - [ ] Workbench.
- [ ] Record timing targets for local development hardware.
- [ ] Add performance notes to SQLite small-office docs.
- [ ] Document expected limits honestly.

Acceptance criteria:

- SQLite support target is validated with seeded data.
- Regressions or docs make it clear when behavior exceeds SQLite small-office assumptions.

## Version 0.33.5.21 - Durable Jobs and Outbox Foundation

Purpose:

Add a SQLite-compatible background job/outbox system that works simply in self-hosted mode and can evolve into a separate worker model for hosted SaaS.

Decision:

Jobs are Node-side work stored in database tables. SQL stores job state; Node workers perform the work.

SQLite mode may run jobs inline or through a single local worker.
PostgreSQL/SaaS mode should run one or more separate worker processes.

### Version 0.33.5.21.1 - Job/outbox schema

- [ ] Add job/outbox tables compatible with SQLite:
  - [ ] `job_id`
  - [ ] `workspace_id`
  - [ ] `job_type`
  - [ ] `dedupe_key`
  - [ ] `payload_json`
  - [ ] `status`
  - [ ] `priority`
  - [ ] `available_at`
  - [ ] `attempt_count`
  - [ ] `max_attempts`
  - [ ] `locked_at`
  - [ ] `locked_by`
  - [ ] `last_error`
  - [ ] `created_at`
  - [ ] `updated_at`
  - [ ] `completed_at`
  - [ ] `dead_at`
- [ ] Add indexes for pending work by status/available time.
- [ ] Add dedupe behavior where appropriate.
- [ ] Add docs explaining:
  - [ ] Pending.
  - [ ] Running/locked.
  - [ ] Completed.
  - [ ] Failed/retry.
  - [ ] Dead-letter.

Acceptance criteria:

- SQLite can store durable background work.
- The schema is portable to PostgreSQL later.

### Version 0.33.5.21.2 - Worker runner v1

- [ ] Add a Node worker runner.
- [ ] Support modes:
  - [ ] `inline` for simple SQLite self-hosting.
  - [ ] `separate` for `node worker.js`.
  - [ ] `disabled` for tests/admin troubleshooting.
- [ ] Worker should:
  - [ ] Poll for available jobs.
  - [ ] Claim one or more jobs.
  - [ ] Run registered job handlers.
  - [ ] Mark jobs complete.
  - [ ] Retry failed jobs with backoff.
  - [ ] Move exhausted jobs to dead-letter state.
- [ ] Add worker health/status output.
- [ ] Add graceful shutdown.

Acceptance criteria:

- SQLite installs can run jobs without extra infrastructure.
- Future SaaS can run workers separately from web processes.

### Version 0.33.5.21.3 - Job claiming, locking, retry, and dead-letter behavior

- [ ] Implement safe job claiming.
- [ ] Add lock timeout handling.
- [ ] Add retry backoff.
- [ ] Add max-attempt handling.
- [ ] Add dead-letter state.
- [ ] Add admin-readable job failure summaries.
- [ ] Add regression coverage:
  - [ ] Failed job retries.
  - [ ] Exhausted job becomes dead.
  - [ ] Locked job is not claimed twice.
  - [ ] Expired lock can be reclaimed.

Acceptance criteria:

- A failed notification/indexing/scanning job does not block the system forever.

### Version 0.33.5.21.4 - Move search indexing to jobs

- [ ] Add job type for search indexing.
- [ ] Queue search-index jobs from create/update/archive/restore flows.
- [ ] Preserve immediate user-facing save behavior.
- [ ] Add synchronous fallback for tests or SQLite inline mode if needed.
- [ ] Remove full app-wide search rebuild from normal web startup or gate it behind explicit maintenance mode.
- [ ] Add admin/manual search rebuild job.
- [ ] Add regressions proving:
  - [ ] Record writes queue search jobs.
  - [ ] Worker updates search index.
  - [ ] Failed indexing jobs retry.
  - [ ] Startup does not launch duplicate full-app rebuilds in normal mode.

Acceptance criteria:

- Search indexing becomes durable background work.

### Version 0.33.5.21.5 - Move notification fan-out to jobs

- [ ] Add job type for notification event processing.
- [ ] Store notification-producing events in the outbox.
- [ ] Worker resolves recipients and creates notification records.
- [ ] Preserve permission checks.
- [ ] Preserve module-enabled checks.
- [ ] Add regressions proving:
  - [ ] Notification jobs are queued.
  - [ ] Recipients are resolved by worker.
  - [ ] Disabled modules do not create new notifications.
  - [ ] Failed fan-out jobs retry safely.

Acceptance criteria:

- Notifications no longer depend only on in-process event handlers.

### Version 0.33.5.21.6 - Move reminders, recurrence, and file scanning to jobs

- [ ] Add job handlers for:
  - [ ] Task reminders.
  - [ ] Recurrence generation.
  - [ ] File scanning.
  - [ ] Future imports.
- [ ] Keep SQLite inline mode simple.
- [ ] Ensure jobs are idempotent where practical.
- [ ] Add admin docs for worker mode.
- [ ] Add regressions for each job type.

Acceptance criteria:

- Time-sensitive and slow work has a durable background path.

## Version 0.33.5.22 - Storage Provider and Scanner Runtime

Purpose:

Keep local file storage simple for SQLite/self-hosted mode while making storage provider selection configuration-owned and preparing for S3-compatible SaaS storage.

### Version 0.33.5.22.1 - Storage provider configuration

- [ ] Resolve storage provider from runtime/workspace configuration instead of hardcoding `local`.
- [ ] Keep `local` as default for SQLite/self-hosted mode.
- [ ] Add provider health checks.
- [ ] Add admin diagnostics:
  - [ ] Provider ID.
  - [ ] Local root path or safe provider label.
  - [ ] Availability status.
- [ ] Add docs for local storage mode.
- [ ] Add regressions proving:
  - [ ] Local storage remains default.
  - [ ] Unknown provider fails clearly.
  - [ ] File routes do not expose storage keys/paths.

Acceptance criteria:

- Storage provider selection is centralized and configurable.

### Version 0.33.5.22.2 - Streamed local uploads

- [ ] Move file uploads away from JSON-body file payloads where practical.
- [ ] Add streamed or multipart upload support for local/self-hosted mode.
- [ ] Preserve existing route compatibility temporarily if needed.
- [ ] Add upload size enforcement.
- [ ] Add per-file result reporting.
- [ ] Add regressions for:
  - [ ] Successful upload.
  - [ ] Oversized upload rejection.
  - [ ] Partial batch failure.
  - [ ] Upload cancellation/error.

Acceptance criteria:

- Local uploads do not require buffering large file JSON payloads in memory.

### Version 0.33.5.22.3 - Scanner adapter configuration

- [ ] Formalize scanner modes:
  - [ ] `none`
  - [ ] `noop`
  - [ ] `clamd`
  - [ ] `clamscan`
- [ ] Keep no-op scanner only for development or explicitly accepted self-hosted mode.
- [ ] Add scanner health checks.
- [ ] Add admin warning when scanner is disabled.
- [ ] Add scanner docs for Windows, Linux, and macOS.
- [ ] Do not auto-delete suspicious files.
- [ ] Quarantine suspicious files and require review.
- [ ] Add regressions proving:
  - [ ] Scanner disabled state is visible.
  - [ ] Scanner failure quarantines or blocks according to policy.
  - [ ] Scanner does not bypass file permissions.

Acceptance criteria:

- Scanner behavior is OS-agnostic at the app level.
- ClamAV or other scanners are runtime adapters, not hard dependencies.

### Version 0.33.5.22.4 - ClamAV scanner adapter

- [ ] Add `clamd` adapter.
- [ ] Add `clamscan` executable adapter.
- [ ] Support configured executable/socket/host/port.
- [ ] Add timeout and failure behavior.
- [ ] Add safe scanner metadata.
- [ ] Add docs:
  - [ ] Linux service setup.
  - [ ] Windows executable path setup.
  - [ ] macOS/Homebrew setup if practical.
  - [ ] What happens when scanner is unavailable.
- [ ] Add regressions using mocked scanner responses:
  - [ ] Clean.
  - [ ] Infected.
  - [ ] Scanner unavailable.
  - [ ] Timeout.

Acceptance criteria:

- Real file scanning is available without making LTF Linux-only.

### Version 0.33.5.22.5 - S3-compatible storage provider proof

- [ ] Add S3-compatible storage adapter behind the provider contract.
- [ ] Support provider configuration through `.env`/runtime config.
- [ ] Do not require S3 for SQLite/self-hosted installs.
- [ ] Add safe provider health checks.
- [ ] Add direct/presigned upload planning or proof where practical.
- [ ] Keep all downloads permission-checked through LTF routes or signed URL rules.
- [ ] Add regressions with mocked S3 provider.

Acceptance criteria:

- Hosted SaaS has a path to object storage.
- Self-hosted local storage remains unchanged.

## Version 0.33.5.23 - PostgreSQL Adapter and SaaS Runtime Proof

Purpose:

Add the hosted-SaaS database backend behind the provider-neutral database contract while preserving SQLite small-office support.

### Version 0.33.5.23.1 - PostgreSQL adapter skeleton

- [ ] Add PostgreSQL database provider implementation.
- [ ] Support `DATABASE_URL`.
- [ ] Support pool configuration.
- [ ] Support TLS/SSL configuration.
- [ ] Add health checks.
- [ ] Add docs for local Postgres development.
- [ ] Do not change SQLite defaults.

Acceptance criteria:

- App can connect to PostgreSQL behind the same database adapter contract.

### Version 0.33.5.23.2 - SQL portability audit

- [ ] Inventory SQLite-specific SQL:
  - [ ] `INSERT OR IGNORE`.
  - [ ] SQLite-specific conflict syntax.
  - [ ] `COLLATE NOCASE`.
  - [ ] PRAGMA usage.
  - [ ] FTS-specific behavior.
  - [ ] JSON handling assumptions.
- [ ] Add compatibility helpers where needed.
- [ ] Document intentional SQLite-only paths.
- [ ] Add repository tests for SQLite and PostgreSQL where practical.

Acceptance criteria:

- Provider differences are explicit and tested.

### Version 0.33.5.23.3 - PostgreSQL migrations and schema proof

- [ ] Add PostgreSQL migration runner support.
- [ ] Add migration locking for PostgreSQL.
- [ ] Create PostgreSQL-compatible schema baseline or migration translation.
- [ ] Verify schema creation from empty database.
- [ ] Add checksum validation.
- [ ] Add docs explaining:
  - [ ] SQLite self-hosted path.
  - [ ] PostgreSQL SaaS path.
  - [ ] Migration ownership.
  - [ ] Backup expectations.

Acceptance criteria:

- PostgreSQL can initialize cleanly.
- SQLite migration behavior remains intact.

### Version 0.33.5.23.4 - Dual-backend repository contract tests

- [ ] Add a test runner that can execute repository contract tests against:
  - [ ] SQLite.
  - [ ] PostgreSQL, when configured.
- [ ] Prioritize high-value repositories:
  - [ ] Sessions.
  - [ ] Workspaces.
  - [ ] Permissions.
  - [ ] Tasks.
  - [ ] Notes.
  - [ ] Files metadata.
  - [ ] Search index.
  - [ ] Notifications.
- [ ] Add docs for optional Postgres test setup.

Acceptance criteria:

- Core behavior can be verified against both backends.

### Version 0.33.5.23.5 - SaaS seed and load smoke test

- [ ] Add Postgres seed profile for many workspaces.
- [ ] Add basic load-smoke scripts.
- [ ] Test:
  - [ ] Login/session.
  - [ ] App shell.
  - [ ] Tasks list/detail.
  - [ ] Notes list/detail.
  - [ ] Files browse.
  - [ ] Search.
  - [ ] Notifications.
  - [ ] Job worker.
- [ ] Record baseline performance numbers.
- [ ] Document what is proven and what is not yet proven.

Acceptance criteria:

- The SaaS backend has an evidence-based baseline.



## Version 0.33.6 - Reporting Framework and Time Report Contribution

Decision:

Reporting is framework-owned report infrastructure, not a normal disable-able first-party workflow module. The framework owns the Reporting page, report catalog, contribution filtering, report execution dispatch, shared filter host, loading/error/empty states, and future saved/export/export scheduling behavior. Individual modules own the actual report definitions, report runners, data queries, domain calculations, result shapes, and record-level permission checks.

The first 0.33.6 report should remain intentionally small: Time Tracking contributes one Project Time & Billing report. Do not build a custom report builder, report designer, analytics dashboard, or saved report system in this pass.

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
`src/modules/reporting` workflow module just to fit module-owned `viewSurfaces`. 0.33.6 must decide
and document the framework-owned equivalent: either a framework-owned descriptor/config source that
the same renderer can consume, or a narrow framework host adapter built directly on
`LongtailForge.view` primitives where the descriptor contract cannot yet model report execution.

### Version 0.33.6.1 - Reporting Architecture and Framework View Baseline

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

### Version 0.33.6.2 - Reporting Contribution Contract

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

### Version 0.33.6.3 - Reporting Framework Catalog Route

- [ ] Add framework-owned report catalog route:
  - [ ] `GET /api/reporting/catalog`
- [ ] Return only reports allowed by enabled modules, workspace capabilities, required modules, and user permissions.
- [ ] Include report metadata, supported filters, renderer ID, default filter values, and report-specific permission requirements.
- [ ] Ensure disabled modules do not contribute active catalog reports.
- [ ] Ensure reports from historically readable disabled modules are only visible when explicitly allowed by contribution and module policy.
- [ ] Add focused catalog regressions for disabled modules, missing permissions, workspace capability filtering, and required-module filtering.

### Version 0.33.6.4 - Reporting Runner Registry and Execution Route

- [ ] Add framework-owned report execution route:
  - [ ] `GET /api/reporting/reports/:moduleId/:reportId/run`
  - [ ] or a stable equivalent using a report key.
- [ ] Add a server-side report runner registry keyed by stable runner IDs.
- [ ] The framework Reporting service should validate report availability, permissions, enabled modules, workspace capability requirements, and basic filter shape before dispatching.
- [ ] The module-owned runner should remain responsible for domain-specific data access, calculations, and record-level permission safety.
- [ ] Normalize execution errors into framework-owned report status/error payloads without exposing implementation details.
- [ ] Add focused execution regressions for unknown report IDs, missing runners, denied permissions, disabled modules, and invalid filter shape.

### Version 0.33.6.5 - Time Tracking Project Time & Billing Contribution

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

### Version 0.33.6.6 - Correct Project and Client Rollup Billing Math

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

### Version 0.33.6.7 - Framework Reporting Host Shell

- [ ] Keep one framework-owned `reporting.html` page.
- [ ] Reduce `views/protected/reporting.html` to a minimal framework host that loads shared view assets,
      the chosen Reporting host renderer/adapter, and the Reporting browser behavior file.
- [ ] Convert the hard-coded Time Report UI into a framework Reporting host that loads available report definitions from the catalog.
- [ ] Render the page shell, header, report selector, status/error/empty states, filter host, and results host through the chosen framework view path.
- [ ] Do not hand-build framework-owned Reporting anatomy in static HTML or ad-hoc browser DOM when a descriptor field or `LongtailForge.view` primitive exists.
- [ ] Keep the first host simple: one selected report, one filter area, one status area, and one results area.
- [ ] Add a focused static regression proving the Reporting page is a minimal framework host.

### Version 0.33.6.8 - Reporting Filter Host and Report Selection

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

### Version 0.33.6.9 - Project Time & Billing Result Renderer

- [ ] Add a registered report result renderer for `time-project-billing-table`.
- [ ] The first renderer may remain specific to Project Time & Billing, but it should use framework table/action primitives where they fit.
- [ ] Preserve hierarchical project display:
  - [ ] Parent rows can expand/collapse child rows.
  - [ ] Child rows are display-only rows under their parent.
  - [ ] Footer totals come from the runner result and are not recomputed from expanded display rows.
- [ ] Keep Time Tracking responsible for the result shape and billing semantics.
- [ ] Keep the framework responsible for result-host placement, overflow wrappers, loading/error/empty states, and renderer dispatch.
- [ ] Add focused regressions for expandable child rows, totals, no-results state, and renderer-not-found recovery.

### Version 0.33.6.10 - Permissions, Navigation, Guardrails, and Closeout

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

## Version 0.33.7 - Dashboard and Workbench Formalization as Project hub and work center

### Version 0.33.7.1 - Dashboard and Workbench Surface Contracts

- [ ] Define Dashboard as the workspace overview/orientation surface.
- [ ] Define Workbench as the active work/resumption/focus surface.
- [ ] Keep Dashboard and Workbench separate.
- [ ] Add framework-owned contribution contracts for:
  - [ ] Dashboard panels.
  - [ ] Workbench cards.
  - [ ] Focus modes.
  - [ ] Work item sources.
  - [ ] Next action candidates.
  - [ ] Resume state/context snippets.
- [ ] Remove remaining hardcoded Task/Time assumptions from Dashboard and Workbench where a module contribution can own the behavior.
- [ ] Preserve permission checks, module enabled/disabled checks, and workspace boundaries for every contribution.

### Version 0.33.7.2 - Workbench Focus Modes

- [ ] Add Workbench focus selector.
- [ ] Initial modes:
  - [ ] Pick up where I left off.
  - [ ] Today.
  - [ ] Next due.
  - [ ] This week.
  - [ ] Blocked.
  - [ ] In progress.
  - [ ] Project focus.
  - [ ] Client focus for Business workspaces.
- [ ] Each focus mode should resolve to a normalized focus context passed to module work item providers.
- [ ] Focus modes should be user-friendly labels over deterministic filters, not separate hardcoded pages.

### Version 0.33.7.3 - Next Action Candidates

- [ ] Add normalized next action candidate shape.
- [ ] Tasks should provide first next action candidates.
- [ ] Time Tracking should provide running/paused timer candidates.
- [ ] Lists should provide active/incomplete/needed-soon list candidates when Lists integrations are ready.
- [ ] Notes should provide resume/supporting-context candidates for Active Work notes when Notes integrations are ready.
- [ ] Future Tickets should provide waiting/urgent/assigned ticket candidates.
- [ ] Add deterministic ranking:
  - [ ] Running timers.
  - [ ] Paused timers.
  - [ ] Overdue assigned work.
  - [ ] Due today.
  - [ ] Blocked/stale work.
  - [ ] Recently touched work.
  - [ ] Due this week.
- [ ] Every candidate should provide a reason string, primary action, safe context label, and source URL.

### Version 0.33.7.4 - Resume State Consumption / Where I Left Off UI

- [ ] Consume the framework-owned resume state service introduced in 0.33.5.9.
- [ ] Workbench "Pick up where I left off" should use `/api/work-resume` first.
- [ ] Fall back to recent activity only when no active resume rows exist.
- [ ] Show one recommended resume candidate first.
- [ ] Keep secondary candidates available but visually subordinate.
- [ ] Allow users to dismiss stale resume candidates.
- [ ] Preserve permission checks, disabled-module behavior, deleted-record handling, and private/secure content boundaries.

### Version 0.33.7.5 - Guided Workbench UI

- [ ] Add question-led Workbench entry:
  - [ ] "Pick up where I left off"
  - [ ] "Start with what's due"
  - [ ] "Work this week"
  - [ ] "Review blocked work"
  - [ ] "Focus on a project"
- [ ] Show one recommended next action before showing longer lists.
- [ ] Keep secondary lists available but visually subordinate.
- [ ] Avoid turning Workbench into another full module index.
- [ ] Add empty states that suggest a useful next step instead of dead ends.

### Version 0.33.7.6 - Quick Action Capture Utility Rail

Decision:

Quick Action Capture (QAC) is app-shell utility behavior, not a Workbench focus mode. It should provide low-distraction access to common capture and recovery tools without navigating away from the user's current work surface. QAC should keep the user on the existing screen and simply open modals (where available). The basic concept is to:

- Reduce the likelihood of focus/workflow being interrupted
- Keep productivity focused
- Allow easy idea/concept/thought expungement without derailing the entire work train

- [ ] Add a compact right-side Utility Rail on protected app pages.
  - [ ] Should be icons + small text on wide screens, can be narrowed to strictly icons on narrow screens
  - [ ] Should be available on ALL protected screens (not just the workbench)
  - [ ] A single, drawer-style Quick Action Capture button should float on mobile
    - [ ] The QAC menu drawer button should be an icon that indicates what it is, rather than words that would steal valuable screen real estate
      - Action or Capture should be the main icon driver; Perhaps a fast moving runner? Is there an icon for that?

- [ ] Rail actions should be contributed by enabled modules or mapped from registered module actions.
  - Since we don't know if the user has an idea/thought to contribute to an existing, task, list, or note we should offer an initial modal that allows for finding of the item or creating a new one.
  - [ ] Timer (Should open a modal capable of 2 timers, eventually; for now take you to time-tracker.html)
    - [ ] Add documentation for 0.33.7.7 for creating the timer modal funcationality with a limit of 2 timers
      - Within this documentation include instructions to redirect the QAC timer button to this new modal timer.
  - [ ] Task (Should open a picker to find a task with a button to Add Task, then open the appropriate modal)
  - [ ] Note (Should open a picker to find a note with a button to Add Note, then direct to the appropriate modal)
  - [ ] List (Should open a picker to add an item to a list or add a list, then open the appropriate modal)
  - [ ] Reporting (Should open a report creation modal, eventually; for now take you to reporting.html)
    - [ ] Add documentation for 0.37.5 for creating the reporting modal
  - [ ] File (Should open the Add file modal)
  - [ ] Search (Should open an advanced search modal, eventually; for now take you to search.html)
    - [ ] Add documentation for 0.33.7.8 for creating the advanced search modal functionality with a search result display modal
      - Add documentation in 0.33.7.9 to update all search results to display in this modal, even searches from the main menu ribbon. Yes, this might be a complete overhaul of the search system (or at least a major extension of it) if this needs to go into its own ROADMAP version in 0.33.8, that's also fine. Evaluate at the time of building the documentation, please
  - If a modal action does not exist yet, the QAC action may be hidden, disabled with a clear tooltip, or temporarily link to the existing module page as an explicitly temporary fallback.
  - Temporary navigation fallbacks must be removed once the modal action exists.

- [ ] Actions should open modals without changing the current page.
- [ ] Actions should receive safe current-page context when available.
- [ ] Actions must return focus to the triggering control when closed.
- [ ] The rail must stay visually quiet unless opened by the user.
- [ ] Do not use badges, alerts, or recommendation behavior in the rail; notifications and Workbench own those concerns.

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

