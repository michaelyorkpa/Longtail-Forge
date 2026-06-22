# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.33.5.17 - CommonMark Markdown Platform Renderer

This version adds a framework-owned Markdown rendering contract before Reporting, Knowledge Base,
Tickets, Creator Studio, and other content-heavy surfaces build on inconsistent Markdown behavior.
The immediate user-facing driver is Notes list indentation, nested list rendering, and preview parity,
but the implementation should be platform-level so Notes, Help, Knowledge Base, and future content
surfaces share the same safe parser, sanitizer, plain-text extraction, and regression fixture corpus.

### Design and Clarification Questions

- [x] Confirm whether the platform should adopt strict CommonMark only, or CommonMark plus a small
      approved extension set for current Longtail Forge needs.
  - Recommendation: CommonMark core plus explicitly allowed table and task-list support, because
    Help and future Knowledge Base content are likely to need tables, and task/checklist-style
    content already exists in the product model.
  - Do not enable broad extension bundles by default.

- [x] Confirm whether raw HTML in user-authored Markdown should remain disabled or sanitized out.
  - Recommendation: disable raw HTML for Notes, Help-authored Markdown, and future KB article
    Markdown unless a later version introduces a narrow allowlist with explicit security review.

- [x] Confirm whether saved Markdown should remain unchanged and only renderer/search/preview output should change.
  - Recommendation: preserve stored Markdown exactly. Do not rewrite existing note bodies, Help
    content, revisions, or future KB sources during this upgrade.

- [x] Confirm whether browser previews should call a server-render endpoint or use the same renderer library in the browser bundle.
  - Recommendation: choose the least duplicative path after dependency review. Preview output must
    match saved rendering for supported syntax and must not bypass sanitization.

- [x] Confirm whether Markdown editor keyboard behavior belongs in this version.
  - Recommendation: include only practical editor parity for Markdown authoring, such as Tab/Shift+Tab indentation in the Notes textarea and list-continuation helpers. Do not turn this into a WYSIWYG editor or a full authoring rewrite.

Decision:

Markdown parsing and rendering should become a framework-owned content service. Modules may own
source fields, visibility rules, linking semantics, revision history, and workflow meaning, but they should not each invent their own Markdown parser, unsafe HTML policy, plain-text extraction, search text conversion, or preview behavior. CommonMark compatibility is the baseline contract; any extensions must be explicitly named, tested, and documented.

### Version 0.33.5.17.1 - Parser Selection and Markdown Contract

- [x] Review current Markdown rendering paths in Notes, Help, search indexing, browser preview, and any static content helpers.
- [x] Select a CommonMark-compatible parser package after dependency, maintenance, license, and
      security review.
- [x] Define the approved syntax set:
  - [x] CommonMark paragraphs, headings, emphasis, strong text, links, images where allowed, blockquotes, code spans, fenced code blocks, ordered lists, unordered lists, and nested lists.
  - [x] Explicitly approved extensions, if confirmed, such as tables and task lists.
  - [x] Explicitly disallowed behavior, especially raw HTML and unsafe links.
- [x] Define the framework-owned Markdown APIs:
  - [x] Render Markdown to safe HTML.
  - [x] Convert Markdown to plain text for search, excerpts, and previews.
  - [x] Validate or normalize safe links without changing saved source text.
  - [x] Expose deterministic fixture-based rendering expectations.
- [x] Define module-owned responsibilities:
  - [x] Notes owns note body storage, revisions, library/collection visibility, wiki-style links, linked context, and note-specific permissions.
  - [x] Help owns content discovery, module scoping, and article metadata.
  - [x] Future Knowledge Base owns publication status, review workflow, source snapshots, and article visibility.
- [x] Do not change database schema, saved Markdown, note visibility, Help article routing, or module permissions in this slice.

### Version 0.33.5.17.2 - Shared Server-Side Markdown Renderer

- [x] Add the selected Markdown dependency and wire it through a framework-owned service, for example
      `src/core/markdown` or `src/services/markdown.service.js`.
- [x] Render Markdown to sanitized HTML using the approved syntax contract.
- [x] Strip or neutralize unsafe input:
  - [x] Raw HTML.
  - [x] Script/event attributes.
  - [x] `javascript:` and other unsafe URLs.
  - [x] Unsafe image sources if images are allowed.
- [x] Add a plain-text/excerpt conversion path that uses the same parser contract instead of
      ad-hoc regular expressions.
- [x] Add fixture coverage for:
  - [x] Nested ordered and unordered lists.
  - [x] Mixed ordered/unordered list nesting.
  - [x] Two-space and four-space indentation behavior.
  - [x] Task lists if approved.
  - [x] Tables if approved.
  - [x] Code fences, inline code, blockquotes, links, and unsafe input.
- [x] Keep the service independent of Notes, Help, and future Knowledge Base business rules.

### Version 0.33.5.17.3 - Notes Renderer Migration

- [x] Replace Notes-specific Markdown rendering and plain-text extraction with the shared framework
      Markdown service where appropriate.
- [x] Preserve Notes-specific behavior:
  - [x] Existing note body storage and revisions.
  - [x] `All Libraries`, `All collections`, `Uncategorized`, and manual Library bucket semantics.
  - [x] Private/secure/internal/workspace/client-visible visibility rules.
  - [x] Wiki-style link detection and note relationship handling.
  - [x] Linked context behavior for workspace, project, task, user, and Business-only client targets.
- [x] Fix nested Markdown list rendering so indented child list items remain nested in rendered Notes.
- [x] Add Notes regressions for nested lists, mixed lists, checklists if approved, revisions, excerpts,
      search text, and unsafe Markdown.
- [x] Do not migrate stored note bodies or alter existing revision history.

### Version 0.33.5.17.4 - Help Renderer and Search Migration

- [x] Move Help Markdown rendering to the shared framework Markdown service.
- [x] Preserve Help-owned behavior:
  - [x] Content path discovery.
  - [x] Module/content scoping.
  - [x] Article metadata.
  - [x] Navigation and table-of-contents behavior.
  - [x] Current-state Help wording rather than future roadmap promises.
- [x] Update Help search/plain-text indexing to use the shared Markdown-to-text path.
- [x] Validate current Help content fixtures against the shared renderer, especially headings, lists,
      links, tables if approved, and code fences.
- [x] Add regressions proving Help articles render safely and search indexing does not expose raw
      Markdown syntax or unsafe HTML.

### Version 0.33.5.17.5 - Browser Preview and Editor Consistency

- [x] Make the Notes live preview use the same approved Markdown contract as saved rendering.
- [x] Ensure browser preview sanitization cannot diverge from the server-rendered saved note output.
- [x] Add textarea authoring support for Markdown indentation:
  - [x] Tab indents the current line or selected lines inside the editor.
  - [x] Shift+Tab outdents the current line or selected lines.
  - [x] Enter continues list markers where predictable and stops cleanly on an empty marker.
  - [x] Keyboard behavior remains scoped to the active Markdown editor and does not break normal page
        focus movement elsewhere.
- [x] Keep the editor as a Markdown textarea with preview. Do not introduce WYSIWYG editing in this
      version.
- [x] Add browser/static regressions for editor indentation behavior, preview parity, asset loading,
      and cache-key updates.

### Version 0.33.5.17.6 - Documentation and Closeout

- [x] Update `docs/module-contract.md` with the framework-owned Markdown rendering boundary.
- [x] Update Help/developer documentation for the approved Markdown syntax set.
- [x] Update Notes user-facing Help for list indentation, nested lists, preview behavior, and any
      approved extensions.
- [x] Update DECISIONS.md with the CommonMark platform renderer decision.
- [x] Update CHANGELOG.md.
- [x] Update package metadata to the implemented version.
- [x] Run `npm run check`.
- [x] Run `npm run test:permissions` if permissions, visibility, or Help access behavior changed.
- [x] Verify `/api/app-info` reports the expected version.
- [x] Keep 0.33.5.17 closeout focused on Markdown rendering and editor parity; defer WYSIWYG editing,
      collaborative editing, content templates, and Knowledge Base publication behavior to later
      roadmap versions.

# Version 0.33.5.18 - View Conversion Backlog (Framework-Owned Views, Module-Owned Data)

This version extends the proven declarative `viewSurfaces` contract from 0.33.5.16 (built and proven
on Lists) to the remaining first-party workflow surfaces so that modules contribute **data,
descriptors, and named behaviors** instead of hand-built DOM. The framework owns layout anatomy,
surface classes, responsive behavior, dark-mode tokens, accessibility defaults, and common action
placement; modules own data loading, normalized read endpoints, field bindings, validation, save
payloads, permissions, record labels, and workflow behavior.

Scope for 0.33.5.18 is the four remaining workflow surfaces, converted in this order:

1. Notes
2. Tasks
3. Files
4. Clients/Projects pages

Out of scope for this version (tracked elsewhere so the same surface is never converted twice):

- Admin/Settings surfaces (API Keys, Audit Log, Notifications, User Admin, User Settings, Workspace
  Settings, Files Settings, module settings) are deferred to their own later line. Several are
  framework-owned rather than module-owned data and deserve a dedicated design pass.
- Reporting page conversion is owned by 0.33.6 (the Reporting host is born framework-owned there).
- Dashboard and Workbench conversion is owned by 0.33.7 (contribution contracts + surface conversion).

## Dependencies and Framework Baseline

This version builds directly on completed work and must not reintroduce framework gaps:

- 0.33.5.16 declarative contract is complete: `viewSurfaces` manifest field validated in
  `src/core/modules/manifest-contract.js`; renderer `public/js/shared/view-renderer.js`
  (`LongtailForge.view.renderSurface(descriptor, host)`) with layouts `single-column`,
  `split-list-detail`, `table-page`; data binding via `dataSource.route` + `fieldBindings` through
  `shared/api-client.js`; framework-owned loading/empty/error states; `surface.refresh()`; the
  behavior registry `LongtailForge.view.registerBehavior(id, handler)`; declarative route actions;
  framework `openModal`; and descriptor delivery through the app-shell bootstrap
  (`LongtailForge.workspaceContext.viewSurfaces`).
- 0.33.5.16.7 added the selectable index primitive `LongtailForge.view.createIndexList` and made the
  framework `.view-split-list-detail` own split sizing and responsive collapse. Split-layout
  selectors use `createIndexList`, never a multi-column data table.
- 0.33.5.17 CommonMark Markdown platform renderer is complete. The Notes conversion in this version
  consumes that shared Markdown service for rendered bodies, previews, and plain-text extraction; it
  must not reintroduce ad-hoc Markdown rendering.

Notes is converted first specifically because 0.33.5.17 touches Notes immediately before this version,
so the module stays "warm" and the view rewrite can wire directly into the freshly landed Markdown
service rather than around soon-to-be-replaced rendering code.

## Design and Clarification Questions

- [x] Confirm the conversion cadence per surface now that both imperative `LongtailForge.view`
      helpers and the proven declarative `viewSurfaces` contract exist.
  - Declarative directly. Each surface goes straight to descriptors (read path, then sub-records /
    modals / fields, then workflow actions / cleanup).
  - The imperative `LongtailForge.view` helpers remain the supported escape hatch for surface parts a
    descriptor cannot yet express; they are not the primary path and must not be used to hand-build
    framework-owned anatomy that a descriptor field or shared capability already covers.
  - Do not run a separate imperative-only adoption phase per surface.

- [x] Confirm whether Admin/Settings surfaces belong in 0.33.5.18.
  - No. Scope 0.33.5.18 to Notes, Tasks, Files, and Clients/Projects pages.
  - Admin/Settings conversion is deferred to its own later line because the bucket is broad and
    several surfaces are framework-owned, not module-owned data.

- [x] Confirm the conversion order.
  - Notes, then Tasks, then Files, then Clients/Projects pages.

- [x] Confirm behavior parity expectations.
  - Conversions are behavior-preserving. No UX redesigns, route changes, payload changes, permission
    changes, schema changes, or workflow changes in this version.
  - Incidentally fixing a defect that is identical to one already corrected at the framework layer
    (for example, a selector rendered as a multi-column table) is allowed because the fix lives in the
    framework primitive, not in module code.

- [x] Confirm legacy CSS handling during conversion.
  - Keep legacy module CSS classes as compatibility aliases during conversion to avoid unrelated
    style or test breakage. Do not add new one-off classes for framework-owned anatomy. Retiring
    deprecated aliases is a later cleanup pass, not part of 0.33.5.18.

- [x] Confirm guardrail enforcement scope.
  - Expand fail-on-violation declarative guardrails one surface at a time as each surface is marked
    declarative, mirroring the 0.33.5.16 approach. Inventory and report all protected views, but
    enforce strictly only on converted surfaces.

- [x] Confirm the data-provision model.
  - Each converted surface exposes a normalized read endpoint and a declared `fieldBindings` map.
    Reuse existing routes and response shapes where they already serve the surface; only add
    additive normalized read endpoints when an existing payload cannot be bound directly. Do not
    change existing API payloads relied on by other callers.

Decision:

Framework-owned view construction becomes the standard for the remaining workflow surfaces. Each of
Notes, Tasks, Files, and Clients/Projects pages declares a `viewSurfaces` descriptor, exposes a
normalized data endpoint with a field-binding map, and registers named behaviors for interactions the
descriptor cannot express. The framework renders the surface from the descriptor using the existing
view primitives and renderer; modules keep all business meaning. Imperative helpers remain the escape
hatch for genuinely custom fragments only. No new frontend framework, client state store, virtual DOM,
or component lifecycle is introduced.

---

## Version 0.33.5.18.1 - Descriptor Capability Gaps and Shared Renderer/Primitive Extensions

Before converting any surface, inventory what the current descriptor/renderer cannot yet express
across the four target surfaces and add only the capabilities needed by two or more of them, so
individual surface conversions do not each reinvent shared anatomy. Surface-unique needs stay as
documented escape-hatch behaviors rather than new descriptor fields.

- [x] Inventory descriptor/renderer gaps against Notes, Tasks, Files, and Clients/Projects pages,
      classifying each as either a shared descriptor capability or a per-surface escape-hatch pattern:
  - [x] Inline/editable item rows (Tasks checklists, Lists-style item entry parity). — Shared: built as rich `itemRows` (chips/meta/row actions).
  - [x] Multi-select plus a bulk-action toolbar (Tasks, Files). — Deferred to the first surface that needs it (Tasks).
  - [x] Reorder/drag affordance for ordered collections. — Per-surface escape-hatch behavior.
  - [x] Sectioned or tabbed detail panels (Tasks detail, Notes linked context). — Covered by mount regions.
  - [x] Hierarchy/tree index rendering (Clients/Projects parent/child). — Deferred to the first surface that needs it.
  - [x] File upload control with progress and the framework file routes (Files, attachment panels). — Escape-hatch behavior mounted in a region.
  - [x] Tag picker behavior hook (Notes, Tasks, Files, Clients/Projects). — Escape-hatch behavior mounted in a region.
  - [x] Live Markdown preview region bound to the 0.33.5.17 service (Notes). — Escape-hatch behavior mounted in a region.
  - [x] Revision/history list panel (Notes; reusable later). — Escape-hatch behavior mounted in a region.
  - [x] "Load more"/pagination affordance for large collections. — Deferred to the first surface that needs it.
  - [x] Per-row dense action overflow on narrow widths. — Owned by existing `surface-dense-actions` wrapping.
  - [x] Filter controls that drive a normalized read endpoint without per-module DOM. — Shared: built as filter→refetch query binding.
- [x] For each shared gap, extend the descriptor schema and renderer minimally, keeping the renderer
      on the existing `LongtailForge.view` primitives as its engine. — Built the three minimal enablers (filter→refetch, mount regions, rich item rows); other capabilities deferred or routed through the escape hatch per the decision in DECISIONS.md.
- [x] Add manifest-contract validation in `src/core/modules/manifest-contract.js` for any new
      descriptor fields (reject unknown keys, missing required fields, bad references).
- [x] Document each per-surface escape-hatch pattern as a registered behavior contract rather than a
      descriptor field, so module-specific interactions stay in module browser files.
- [x] Add renderer/primitive regressions with small fixtures for every new shared capability. Do not
      convert any real surface in this slice.
- [x] Update the developer guide and `docs/view-building-contract.md` with the new shared capabilities
      and the escape-hatch boundary.

---

## Version 0.33.5.18.2 - Stacked List/Detail Layout, Collapsible Filters, Scrollable Index

This framework layout slice was inserted before resuming the surface conversions so Notes and every
later surface adopt the corrected layout rather than building on the retired split-list-detail view.
It also resolves the detail action-strip overflow seen in the split layout's narrow detail track.
Narrative: 0.33.5.18.1 framework capabilities, 0.33.5.18.2 framework layout, 0.33.5.18.3+ surfaces.

- [x] Add a framework `stacked` view layout: collapsible filters on top, a height-capped scrollable
      index panel (~5 rows, inset scroll region), then a full-width detail panel below.
- [x] Make the framework filter panel collapsible (`createFilterPanel` renders a `<details>`),
      collapsed by default on rendered surfaces.
- [x] Retire `split-list-detail` as a selectable layout (manifest enum, renderer branch, descriptors);
      keep the `createSplitListDetail` primitive and `.view-split-list-detail` CSS as deprecated
      compatibility shims annotated `@deprecated`.
- [x] Switch the Lists and Notes descriptors (and the Lists fallback) to `layout: "stacked"`, and
      point the Lists adapter decoration at the stacked DOM (`.view-stacked` / `.view-stacked-detail`).
- [x] Add regression coverage for the stacked layout, collapsible filter panel, and scrollable index;
      update affected layout assertions; bump asset cache-busts and version/app metadata.
- [x] Run `npm run check` and `npm run test:permissions`.

---

## Notes (0.33.5.18.3 - 0.33.5.18.5)

Framework owns: page shell, library filter panel, collection selector/index, split list/detail,
note detail header/metadata/badges, action strips, summary/linked-context panels, modal shell/form,
field grid, empty/loading/error states, rendered Markdown container styling.

Notes owns: note body storage and revisions; `All Libraries`, `All collections`, `Uncategorized`, and
manual Library bucket semantics; private/secure/internal/workspace/client-visible visibility rules;
wiki-style link detection and note relationships; linked context for workspace/project/task/user and
Business-only client targets; tags; save payloads; permissions. Markdown rendering, preview, and
plain-text extraction come from the 0.33.5.17 shared service.

### Version 0.33.5.18.3 - Notes Declarative Read-Only Surface Proof

- [x] Add a `viewSurfaces` descriptor for the Notes protected workspace read path on the Notes manifest.
- [x] Reduce `views/protected/notes.html` to a minimal framework host element the renderer fills. — `notes.html` is now `<main data-notes-host>` plus the two static dialogs (deferred to 0.33.5.18.4).
- [x] Move library filters, the collection selector/index, the split list/detail workspace, the note
      detail header, metadata/badge rows, and the read-only rendered note body into the descriptor. — Per the chosen "framework shell + module-mounted chrome" approach: the framework descriptor owns the page header, filters panel, stacked layout, collapsible panels, and detail container; Notes-specific chrome mounts as a separate Library panel (`createNotesLibraryPanel`/`createNotesLibraryChrome`) and Notes list panel (`createNotesListChrome`) through `decorateNotesDeclarativeSurface`. Follow-up layout polish keeps Filters collapsed, Library and Notes List open with native disclosure markers, blank detail on first load, summary-line pagination through the framework collapsible-index action slot, compact no-excerpt list stubs with two visible tags plus ellipsis overflow, and Library/Notes auto-collapse after note selection.
- [x] Render the note body through the 0.33.5.17 Markdown service; do not reintroduce ad-hoc rendering. — Detail body continues to render the server's `body_html` (produced by the 0.33.5.17 Markdown service); no ad-hoc rendering added.
- [x] Define the normalized Notes read endpoint and `fieldBindings`; reuse existing routes/payloads
      where possible and only add additive normalized reads if needed. — Reuses `/api/notes` with `note_id`/`title` bindings; no new routes.
- [x] Preserve all Notes routes, response payloads, permissions, visibility rules, library/collection
      bucket semantics, wiki-link display, and workspace scope behavior. — Read/filter/detail logic and secure-note rules remain in `notes.js`.
- [x] Keep note creation/editing, modals, revisions, and linked-record management on the existing
      imperative path until later slices. — The editor and collection dialogs stay static/imperative (0.33.5.18.4).
- [x] Add regressions proving the read-only Notes surface renders from the descriptor with correct
      visibility filtering and Markdown rendering.

### Version 0.33.5.18.4 - Notes Editor, Modals, Field Behaviors, and Live Preview

- [x] Convert the note create/edit modal shell to descriptor-declared modal/form/footer anatomy. — The
      Notes manifest descriptor now declares a `modals` block (`note-editor`, `note-collection`) with
      fields and `footerActions`; `createNoteDialogShell`/`createCollectionDialogShell` build both
      dialogs through the framework `view.createModalForm` primitive (dialog/form/title/footer), and
      the two static `<dialog>` elements were removed from `views/protected/notes.html`.
- [x] Bind the live Markdown preview to the same 0.33.5.17 contract as saved rendering so preview and
      saved output cannot diverge and sanitization is not bypassed. — Preview keeps POSTing to
      `/api/notes/preview` (the 0.33.5.17 Markdown service); no ad-hoc client rendering reintroduced.
- [x] Express editor field behaviors (visibility selector, library/collection assignment, tags,
      linked-record targets) as descriptor fields plus registered behaviors. — Field set and select
      options are sourced from the descriptor `modals` block (`modalFieldOptions`); footer actions
      declare their behavior ids. Save/validation/secure-rule wiring stays module-owned in `notes.js`.
- [x] Keep Notes responsible for body storage, revision creation, validation, save payloads,
      secure/private rules, and permissions. — Unchanged; all storage/save/secure logic remains in
      `notes.js`/`notes.service.js`.
- [x] Reduce `public/js/notes.js` editor/modal code to data bindings plus registered behaviors. — The
      modal anatomy (dialog/form/title/footer) is now framework-built; `notes.js` builds only the
      module-specific body sections (selects, secure warning, linked-context picker, toolbar, preview)
      and retains the imperative bindings.
- [x] Add regressions for descriptor-rendered note editor, live preview parity, revisions, and
      secure-note handling. — `notes-ui-workflow`, `notes-declarative-readonly-surface`, and
      `notes-preview-editor` regressions now assert the framework-built dialog shells and that no
      static dialog markup remains.

### Version 0.33.5.18.5 - Notes Workflow Actions, Linked Context, and Layout Cleanup

Split into three focused sub-slices so each ships green and reviewable.

#### Version 0.33.5.18.5.1 - Notes Workflow Actions + Declarative Action Strip

- [x] Express the Notes detail workflow actions (edit, archive, restore) as a declarative
      `detail.actionStrip` in the `notes.workspace` descriptor with `behavior` ids
      (`notes.workflow.edit/archive/restore`) and `requiredPermissions`. — Added `detail.actionStrip`
      to the manifest descriptor and the `notes.js` fallback, and registered the workflow behaviors.
- [x] Render the detail action strip via `view.renderDescriptorActionStrip` (replacing the hand-built
      `<details>` actions menu) and dispatch clicks through the registered behaviors, applying
      edit/archive/restore visibility by note status. Keep archive/restore service logic in Notes.

#### Version 0.33.5.18.5.2 - Notes Linked Context and Linked Records

- [x] Move the linked-records panel and linked-record rows into descriptor/renderer-supported anatomy
      (`detail.linkedRecords` + `view.renderDescriptorLinkedRecordsPanel`) while keeping linkage
      permission checks and service logic in Notes files. — The `notes.workspace` descriptor declares
      `detail.linkedRecords` (fields + `add-link`/`remove-link` actions carrying `notes.link.*`
      behavior ids and `NOTE_PERMISSIONS.MANAGE_LINKS`); `renderLinksPanel` now builds the panel via
      `view.renderDescriptorLinkedRecordsPanel` and rows via `linkRecordNodes`/`view.createElement`.
      Add/remove service routes (`/api/notes/:id/links`, `…/remove`) and target-scope logic stay in
      Notes. (The read-only linked-context metadata list — Client/Project/Task/User dt/dd — is folded
      into the 0.33.5.18.5.3 anatomy cleanup.)

#### Version 0.33.5.18.5.3 - Notes Anatomy Cleanup and Strict Guardrails

- [x] Reduce `public/js/notes.js` to data bindings and behavior handlers with no hand-built
      framework-owned anatomy (swap `createModalForm` → `renderDescriptorModalForm`, remove raw
      `document.createElement` of structural tags including the read-only linked-context dt/dd list,
      etc.). — The note/collection dialogs now build through `view.renderDescriptorModalForm` (the
      renderer forwards the `size: "wide"` editor hint); the two `<details>` disclosures (collections
      menu, revisions) and the detail header/body/tags/breadcrumb/context dt-dd list now use
      `view.createElement`. notes.js no longer calls `createModalForm` or any
      `document.createElement("dialog"|"table"|"details")`.
- [x] Expand fail-on-violation declarative guardrails to the Notes surface. — `notes.workspace` is now
      in `strictDeclarativeSurfaceIds`; `view-descriptor-declarative-guardrails` enforces a Notes block
      (forbids the low-level framework primitives + `document.createElement` of dialog/table/details,
      requires `renderDescriptorActionMenu`/`renderDescriptorLinkedRecordsPanel`/`renderDescriptorModalForm`).
      `createCollapsibleIndexPanel` is an allowed, documented exception for the secondary Library nav panel.
- [x] Add regressions proving Notes no longer creates framework-owned anatomy by hand. — The strict
      guardrail + new `notes-ui-workflow` markers assert the modal-helper swap, no
      dialog/table/details, and the framework-built disclosures and context list.

#### Version 0.33.5.18.5.4 - Framework Modal Scroll/Footer Fix

Framework-wide modal fix (affects Notes, Lists, Clients/Projects, Tasks). Regression from the
0.33.5.18.4 sticky-footer work. (User screenshots pending for exact repro.)

- [x] Fix the layout shift when a modal grows tall enough to show a vertical scrollbar. — Added
      `scrollbar-gutter: stable` to the modal scroll regions (`.view-modal-body`/`.view-modal-form`) so
      toggling the vertical scrollbar no longer reflows the modal content width.
- [x] Fix the gap that opens below the pinned footer when the modal body scrolls. — Root cause was the
      sticky form footer's `margin-bottom: -20px` combined with the form's 20px bottom padding, which
      pushed the visible footer ~20px above the sticky stop so scrolled content (the Body textarea)
      showed beneath it. Fixed by dropping the form's bottom padding (`.view-modal-form { padding-bottom:
      0 }`) and removing the footer's negative bottom margin (`12px -20px 0`); the footer's own bottom
      padding supplies the inset. The body-variant footer (`createModal`) was already flex-pinned.
- [x] Verify the fix across all framework modals. — Fix is in shared CSS; bumped cache-busts on every
      framework-modal page (`notes.html` css?v=30, `lists.html` css?v=24, `clients.html`/`projects.html`
      css?v=8) so notes editor/collection, lists editor, and client/project modals all pick it up.
      (Visual confirmation at small viewport heights still pending user review.)
- [x] Add a regression asserting the framework modal scroll/footer CSS contract; bump the affected asset
      cache-busts. — `modal-footer-contract-regression` now asserts the gutter reservation, the
      form's dropped bottom padding, and the flush (non-negative-margin) sticky footer.

#### Version 0.33.5.18.5.5 - Notes Add/Edit Modal Refinement

- [x] Group the note "Details" fields (Library, Collection, Note Kind, Visibility, Security) into a
      collapsible section — default open in the Add modal, default closed in the Edit modal. — Built as a
      module-owned `<details class="notes-detail-group">` via `view.createElement` (the sanctioned
      builder under strict mode); `openEditor` sets `detailsGroup.open = !note`. (A dedicated framework
      field-group primitive remains an optional future refinement.)
- [x] Move Tags to a footer utility button (matching the Tasks modal pattern) rather than an inline
      section. — Extended the framework footer (`createModalFooter`/`createModalForm`/
      `renderDescriptorModalForm`) to accept `utilityActions`, rendered in a
      `surface-modal-footer-utilities` group; the Tags button toggles a hidden tag panel (the picker
      still mounts via `window.LongtailForge.tags.mountPicker`).
- [x] Restore the file-attach affordance in the Edit note modal (a footer button). — Added a Files
      footer utility button toggling a hidden file panel; `mountNoteEditorFiles` mounts
      `window.LongtailForge.fileAttachments` (saved/non-secure notes; Add shows the "save first"
      message), hidden for secure notes.
- [x] Keep note storage, validation, save payloads, secure rules, and revisions module-owned; add
      regression markers for the collapsible group, footer Tags button, and footer file button. — All
      save/secure logic unchanged; `notes-ui-workflow` markers cover the collapsible group, the footer
      utility actions, the toggle/mount helpers, and the framework footer utility-group support.

#### Version 0.33.5.18.5.6 - Notes Navigation Standardization

- [x] Standardize the "Library" and "Notes List" panel headings to match the "Filters" heading. — The
      gap was the Filters heading: `.view-filter-panel-title` was plain weight while the collapsible-index
      summaries were bold. Made `.view-filter-panel-title` bold/clickable (framework CSS), so all
      action-page disclosure headings (Filters, Library, Notes List) read consistently.
- [x] Simplify the Library panel: drop the bucket-tab buttons in favor of the Library + Collection
      dropdowns; add "Archive" to the Library dropdown; bring the dropdowns inline with the New Collection
      icon button as one tight row. — `createNotesLibraryChrome` now renders a single
      `.notes-collection-picker-row` (Library dropdown · Collection dropdown · collection actions · New
      Collection); the Library dropdown gained an "Archive" option and is the sole bucket selector
      (`selectBucket`/`renderCollections` handle "archive"); the legacy bucket tabs + `updateBucketTabs`
      were removed.
- [x] Move the Notes List pagination to the bottom-right of the Notes List box, keeping it hidden when
      collapsed. — Added a framework `.view-collapsible-index-footer` slot; pagination mounts there
      (below the scrollable body) and hides natively when the `<details>` panel collapses.
- [x] Add regression markers for the standardized headings, simplified Library row, and pagination
      placement. — `notes-declarative-readonly-surface`/`notes-ui-workflow` updated (footer slot, one-row
      picker, Archive option, retired bucket tabs, bold Filters heading).

#### Version 0.33.5.18.5.7 - Notes Detail Metadata and Panels

- [x] Make the detail metadata row carry ALL metadata: size Created/Updated/Owner into the same
      chip/meta format; drop the duplicated linked-record context; render Owner as the display name. —
      `detailMetaItems` now includes Ticket/Created/Updated/Owner (Owner = `owner_display_name`, resolved
      server-side in `attachNoteIntegrations` via `resolveNoteOwnerLabel`, falling back to the id); the
      `notes-context-list` dl (Client/Project/Task/User — already in Linked Records) was removed.
- [x] Make the Linked Records panel collapsible and collapsed by default; render Remove/Add Link as icon
      buttons. — Added a `collapsible`/`open` mode to the framework `createInfoPanel` (and
      `renderDescriptorLinkedRecordsPanel`); Notes renders it collapsed; Add Link uses the `add` icon and
      Remove uses the `delete` icon.
- [x] Make the Files panel collapsible and collapsed by default; remove the redundant outer box. — The
      Files panel is now a collapsible `<details class="notes-files-panel">` with no outer section box
      (the file-attachments component supplies its own surface).
- [x] Fix the Revisions panel border (and inner revision listing borders) to use the light border token
      in dark mode. — `.notes-detail-section` and `.notes-revision-item` now use `var(--color-border)`
      instead of the near-invisible-in-dark `var(--color-border-subtle)`.
- [x] Add regression markers for the metadata consolidation, owner display-name, and collapsible
      Linked/Files panels. — `notes-ui-workflow` asserts the meta-row Owner/Created/Updated, the removed
      dl, the collapsed Linked Records, the icon Add/Remove, the collapsible Files panel, and the
      server-side `owner_display_name` resolution.

#### Version 0.33.5.18.5.8 - Lists Main Page Refinement

Lists is already strict/declarative; this is UI/layout refinement that reuses the Notes patterns above.

- [x] Reorganize the Lists detail (it is very long and poorly organized) and shrink the metadata line
      (e.g. "active - procurement") to match the compact Notes meta format. — `renderDetail` now builds a
      Notes-style header (`createListDetailHeader`: title row + rule + compact `detailMetaItems` labeled
      spans) and a clear body order: header → description → Next → Source → Linked Records → item form →
      items table → Costs.
- [x] Put the Lists detail action buttons behind a 3-dot overflow menu, reusing the framework
      `view.createDetailActionMenu` / `renderDescriptorActionMenu` primitive added for Notes. —
      `createListActionStrip` now returns `view.renderDescriptorActionMenu(detailActionButtons(...))`;
      `renderDescriptorActionStrip` is retired for Lists (guardrails updated to require the menu).
- [x] Fix the items list/table overlapping the detail action buttons. — Collapsing the wide inline action
      row into the "..." menu in the title row removes the overlap; the items table stays full-width below
      in the stacked detail.
- [x] Tighten the "Next" panel: roughly half width, with fewer/stacked chips instead of a long chip run. —
      `.lists-next-action` is `max-width: 520px`; `stateFacts` is trimmed to progress / next-needed /
      assignment (context + source chips dropped, since they live in the meta line / Source panel).
- [x] Investigate the "Source" panel — if it only repeats the "Independent list" chip, deprecate the
      section. — `shouldShowSourceContext` gates it; it renders only with real provenance/usage context
      (duplicated-from, reusable source/template, finalized, BOM) and is omitted for plain independent lists.
- [x] Move the Costs panel below the items table. — `costSummary` is now the last child appended in
      `renderDetail`, beneath the items table it totals.
- [x] Make Lists linked records follow the Notes linked-records model (collapsible, collapsed by default,
      icon Add/Remove) from 0.33.5.18.5.7. — `createLinkedRecordsPanel` passes `collapsible: true,
      open: false`; Add Link is the `add` icon button and Remove is the `delete` icon button.

#### Version 0.33.5.18.5.9 - Lists Items Inset Refinement

- [x] Rework the item-entry inset (it is messy): Item field larger and on the top line; Qty and Unit
      side-by-side and narrower. — Item uses the new `full` width hint (own top row); Qty/Unit use `narrow`.
- [x] Put Needed, Assigned, and Status narrower and side-by-side with Qty/Unit; default the purchase
      status to "needed" (not "cancelled"). — Needed by/Assigned/Status use the new `compact` width hint;
      the `purchase_status` descriptor field has `default: "needed"` applied via `applySelectDefault`.
- [x] "Needed" should be "Needed by" — `needed_by_date` entry label is now "Needed by".
- [x] Default "Save as reusable item" to on. — `checkboxField` honors the descriptor `default: "true"` as
      checked-by-default (`defaultChecked`, so it survives `form.reset()`); submit value stays `"true"`.
- [x] Put Details on the third line, opening as one long row; move Notes to the bottom; right-justify the
      "Add Item" button. — `.lists-item-advanced` is a full-width row whose fields flow via `.view-field-grid`;
      Notes left the disclosure to become a full-width field; the Add Item button is `margin-left: auto`.
- [x] Honor the framework field-grid/width hints so the inset wraps cleanly; keep item validation, catalog,
      and save logic module-owned. — Layout is purely width-hint driven (`full`/`narrow`/`compact`); the
      item routes, catalog suggestion/save, and validation are unchanged.

#### Version 0.33.5.18.5.10 - Lists Items Table (Display) Refinement

The read-only items *table* that lists existing items on the Lists detail page (`listsItemRowsDescriptor`
columns + `createItemRow` + `.lists-items-table`). This is distinct from .18.5.9, which reworks the item
*entry* inset form — here we only tune which columns show and how wide they are. Column widths are
module-owned `.lists-items-table` styling (with framework width hints where they apply); item data,
validation, catalog, and save logic stay module-owned.

- [x] Widen the Item column and truncate long names: cap the displayed `item_name` to ~20 characters with
      an ellipsis (keep the full name in the cell `title`), and give the Item column the freed width. —
      `truncateItemName` caps at 20 + ellipsis with the full name in `itemCell.title`; Item (col 2) has no
      fixed width so it absorbs the leftover, with `text-overflow: ellipsis` as a backstop.
- [x] Remove the per-row metadata sub-line from the table (`itemTitle`'s sibling `.lists-row-meta` =
      `itemDetailSummary` — vendor / "Has URL" / est. & actual cost / tracking / notes). — Removed the
      row-meta node, the dead `itemDetailSummary`/`findUser` helpers, and the `.lists-row-meta` CSS.
- [x] Make the Qty column very narrow (it holds a small number + unit). — Qty column is 64px.
- [x] Add a dedicated Cost column to the items table, surfacing `estimated_cost`/`actual_cost` (formatted)
      instead of burying cost in the removed row-meta line. — New Cost column via `applyItemCostCell`
      (actual-or-estimated, with an `Estimated … · Actual …` tooltip), 84px wide.
- [x] Rename the "Needed" column heading to "Needed By" and constrain the column to date width only. —
      Heading is "Needed By"; the column is 116px (date width).
- [x] Make the Status column narrower. — Status column is 104px.
- [x] Remove the Assigned column from the items table view. — Dropped from the descriptor columns and
      `createItemRow` (assignment stays editable in the item entry form per .18.5.9).

#### Version 0.33.5.18.5.11 - Lists Add/Edit Item Modal

Convert the (now well-laid-out) inline item-entry form into a framework-rendered modal, matching the app's
other add/edit modals — framework renders the shell, the module provides the data.

- [x] Render the add/edit item form as a framework modal via `view.renderDescriptorModalForm` from the
      `detail.itemForm` descriptor (wide size), built once at startup and repopulated per open
      (`createItemDialogShell` + `openItemDialog`), mirroring the create/edit list modal.
- [x] Replace the inline `lists-item-entry` form with an Items header + Add Item button
      (`createItemsHeader`, `data-list-action="add-item"`); the row Edit action opens the same modal
      pre-filled. Item create/edit/save routes, catalog suggestions, and validation stay module-owned.

---

## Version 0.33.5.18.6 - Final Notes UI, Context Picker, and Markdown Editor Standardization

This release finalizes Notes as the template surface before the remaining workflow surfaces are cleaned up. Notes should establish the standard add/edit/view patterns for Primary Context, Linked Context, modal utility actions, safe target labels, and shared Markdown editor behavior.

This section intentionally focuses on Notes and shared framework pieces required by Notes. Lists-specific add/edit cleanup will follow in the next roadmap section after screenshots/instructions are provided.

Planning note:

- 0.33.5.18.6.1, 0.33.5.18.6.2, and 0.33.5.18.6.3 are scoped to one implementation pass each.
- 0.33.5.18.6.4 through 0.33.5.18.6.9 were split into sub-slices because each originally combined multiple state models, shared framework contracts, provider implementations, or renderer/sanitizer changes.
- The split keeps Notes work first, shared contracts explicit, and closeout verification last.

Decision:

Notes keeps its current backend model:

- Direct nullable context fields on the note row, such as `client_id` and `project_id`, represent **Primary Context**.
- Link rows, such as `note_links`, represent **Linked Context**.
- Primary Context and Linked Context are related, but they are not the same thing.
- Primary Context may be shown inside Linked Context UI as a non-removable reference, but it must be edited through the Note Details / Primary Context controls.
- Linked Context rows may be added or removed through the Linked Context panel when permissions allow.
- Client and Project are nullable.
- Client must not appear in Personal or Family workspace UI.
- Personal/Family workspaces may still use nullable Project context.
- UUIDs must not appear in normal user-facing UI except Audit Logs.

Frontend terminology:

- Use **Linked Context** everywhere in normal UI.
- Do not use **Linked Records** in user-facing UI.
- Backend table names, route names, and internal identifiers do not need to be renamed in this release.

---

### Version 0.33.5.18.6.1 - Notes UI terminology and context guardrails

- [x] Add or update a docs/contract file for workflow record context terminology.
  - [x] User-facing term: **Primary Context**.
  - [x] User-facing term: **Linked Context**.
  - [x] Avoid **Linked Records** in frontend copy unless referring to developer/internal implementation.
- [x] Add or update Notes developer docs:
  - [x] Direct `notes.client_id` and `notes.project_id` are Primary Context.
  - [x] `note_links` rows are Linked Context.
  - [x] Primary Context is used by framework-facing behavior such as permissions, tags, search, files, filters, public API shaping, and future resume context.
  - [x] Linked Context is flexible related-record context and should not replace Primary Context.
- [x] Add UI guardrails:
  - [x] Normal app UI must not display raw UUIDs.
  - [x] Audit Logs may display raw UUIDs.
  - [x] If a linked/primary target cannot be resolved to a readable label, show a safe fallback label such as:
    - `Unavailable client`
    - `Unavailable project`
    - `Unavailable task`
    - `Unavailable note`
    - `Unavailable list`
    - `Unavailable linked context`
  - [x] Do not expose the raw target ID in the fallback label.
- [x] Rename visible Notes frontend copy:
  - [x] `Linked Records` -> `Linked Context`
  - [x] `Add Link` may remain acceptable if the surrounding section is clearly Linked Context.
  - [x] Prefer `Use Target` or `Add Context` for new shared picker actions where sensible.
- [x] Keep backend identifiers stable in this pass unless a later migration explicitly requires renaming.

Acceptance criteria:

- Notes view/create/edit UI consistently says Linked Context.
- No normal Notes UI displays raw UUIDs.
- Docs clearly define Primary Context vs Linked Context.
- Personal/Family workspace UI never shows Client context.

---

### Version 0.33.5.18.6.2 - Add Primary Context controls to Add/Edit Note details

- [x] Add a **Primary Context** subsection inside the existing collapsible **Note Details** section of the Add/Edit Note modal.
- [x] Bind the controls to the note row's direct nullable context fields:
  - [x] `client_id`
  - [x] `project_id`
- [x] Business workspace behavior:
  - [x] Show Client select.
  - [x] Show Project select.
  - [x] Both fields must allow blank/null.
  - [x] Selecting a client without a project sets `client_id` and clears/keeps `project_id` null.
  - [x] Selecting a project with a client derives `client_id` from the selected project.
  - [x] Selecting a workspace-level project sets `project_id` and leaves `client_id` null.
  - [x] Clearing both saves null/empty Primary Context.
- [x] Personal/Family workspace behavior:
  - [x] Do not show Client.
  - [x] Show Project select only.
  - [x] Project must allow blank/null.
  - [x] Save `client_id` as null/empty.
- [x] Project labels in the Primary Context project select should be concise and readable.
  - [x] Business client project: `Project Name - Client Name`
  - [x] Business workspace project: `Project Name - Workspace Name`
  - [x] Personal/Family project: `Project Name`
  - [x] No raw UUID.
  - [x] No redundant `Project:` prefix.
  - [x] No status suffix unless explicitly needed elsewhere.
- [x] Client labels should be only the client name.
  - [x] No `Client:` prefix.
  - [x] No `- Client`.
  - [x] No status suffix.
- [x] Add regression coverage for:
  - [x] Business note with no Primary Context.
  - [x] Business note with client-only Primary Context.
  - [x] Business note with project-derived Primary Context.
  - [x] Business note with workspace project Primary Context.
  - [x] Personal/Family note with project-only Primary Context.
  - [x] Clearing Primary Context.

Acceptance criteria:

- Users can create and edit a note's Primary Context directly.
- Primary Context is no longer hidden or only indirectly produced by task-created notes.
- Client is never visible in Personal/Family workspaces.
- Client and Project remain nullable.
- No Primary Context select or summary displays UUIDs.

---

### Version 0.33.5.18.6.3 - Correct task-created note context behavior and display

Current issue:

Notes created from a task may receive client/project/task context in the database, but the edit dialog shows the primary client/project/task context as UUID text and does not clearly distinguish Primary Context from the linked task.

Desired behavior:

- [x] When creating a note from a task:
  - [x] Assign the task's readable/available client/project as note Primary Context.
  - [x] Assign the task itself as Linked Context.
  - [x] Do not display task ID as part of a raw Primary Context text line.
- [x] In Add/Edit Note:
  - [x] Primary client/project appears in Note Details > Primary Context.
  - [x] The source task appears as a normal removable Linked Context row when permissions allow.
  - [x] Removing the task link does not remove Primary Context.
  - [x] Editing Primary Context does not remove unrelated Linked Context.
- [x] In View Note:
  - [x] Primary Context, where displayed, uses readable labels.
  - [x] The linked task appears in the Linked Context panel like other links.
- [x] Remove UUID display from task-created note edit flows.
- [x] Add regression coverage for a task-created note:
  - [x] Primary Context shows readable client/project labels.
  - [x] Linked Context shows readable task label.
  - [x] No UUIDs appear.
  - [x] Removing the task link preserves Primary Context.

Acceptance criteria:

- Notes created from tasks have clear Primary Context and clear Linked Context.
- The task link is displayed like a normal linked context item.
- Users do not see raw IDs in task-created note add/edit/view workflows.

---

### Version 0.33.5.18.6.4 - Redesign Add/Edit Note Linked Context panel and Notes List controls

Split into four sub-slices so the saved-note API behavior, unsaved draft behavior, visual panel redesign, and Notes List sort control can each ship green.

#### Version 0.33.5.18.6.4.1 - Add/Edit Linked Context visual model and Primary Context row

- [x] Update the Add/Edit Note Linked Context section to match the cleaner View Note linked context pattern.
- [x] The Add/Edit Linked Context section should contain:
  - [x] A non-removable Primary Context display row/card.
  - [x] Existing Linked Context rows/cards.
  - [x] Target / Search / Record / `+ Use Target` add controls.
- [x] Primary Context display row/card:
  - [x] Clearly label it as `Primary Context`.
  - [x] Show readable labels only.
  - [x] If no Primary Context exists, show:
    - `No primary context selected.`
  - [x] Do not show a Remove button on the Primary Context row/card.
  - [x] Include a small hint:
    - `Edit in Note Details`
- [x] Linked Context rows/cards:
  - [x] Show readable target label.
  - [x] Show useful secondary context where appropriate.
  - [x] Show Remove button when permissions allow.
  - [x] Use an icon + `Remove` label or equivalent accessible icon button.
  - [x] Do not display UUIDs.
- [x] Add regression coverage proving Primary Context is visible but not removable in the Add/Edit Linked Context section.

Acceptance criteria:

- Add/Edit Note Linked Context visually matches the View Note linked context model.
- Primary Context is visible but not removable from the Linked Context section.
- No UUIDs appear in the redesigned panel.

#### Version 0.33.5.18.6.4.2 - Existing-note Linked Context add/remove refresh

- [x] Existing saved note behavior:
  - [x] Adding Linked Context persists immediately through the API.
  - [x] Removing Linked Context persists immediately through the API.
  - [x] The user does not need to close/reopen the editor.
  - [x] The user does not need to save the whole note to see the linked context row update.
- [x] Preserve service-layer permission enforcement.
  - [x] UI controls are display hints only.
  - [x] Backend must still reject unauthorized link add/remove operations.
- [x] Add regression coverage:
  - [x] Existing note add linked context immediate update.
  - [x] Existing note remove linked context immediate update.
  - [x] No UUID display in updated rows.

Acceptance criteria:

- Saved notes can add/remove Linked Context without leaving the dialog.
- The Add/Edit panel refreshes after each link mutation.
- Service-layer permissions remain authoritative.

#### Version 0.33.5.18.6.4.3 - Unsaved-note staged Linked Context

- [x] New unsaved note behavior:
  - [x] Adding Linked Context stages the link in local draft state.
  - [x] Removing staged Linked Context removes it from local draft state.
  - [x] Staged links persist when the note is saved.
  - [x] Staged links keep readable labels while the note remains unsaved.
- [x] Preserve Primary Context separately from staged Linked Context.
- [x] Add regression coverage:
  - [x] Unsaved note staged linked context.
  - [x] Removing a staged link before save.
  - [x] Saved note receives staged links.
  - [x] No UUID display.

Acceptance criteria:

- Unsaved notes can stage links before saving.
- Staged links are visible, removable, and persisted on save.
- Primary Context remains distinct from staged Linked Context.

#### Version 0.33.5.18.6.4.4 - Notes List sorting control

- [x] Add a Notes List sort dropdown below the inset, scrollable Notes List body.
  - [x] Place the sort control on the bottom-left of the Notes List panel footer.
  - [x] Preserve pagination/action controls on the bottom-right where applicable.
  - [x] Keep the sort control hidden when the Notes List panel is collapsed.
- [x] Sort the currently visible Notes List result set only.
  - [x] Respect the current workspace, Library, Collection, filters, search, and archive scope.
  - [x] Do not mutate note records, collection membership, or saved note metadata when sorting.
  - [x] Use a deterministic tie-breaker such as title, then note id, when primary sort values match.
- [x] Required sort options:
  - [x] `Alphabetical (A-Z)`
  - [x] `Alphabetical (Z-A)`
  - [x] `Date Created (Newest First)`
  - [x] `Date Created (Oldest First)`
  - [x] `Date Updated (Newest First)` [Default]
  - [x] `Date Updated (Oldest First)`
  - [x] `Library / Collection, then Date Updated`
  - [x] `Note Kind, then Date Updated`
  - [x] `Primary Context, then Date Updated`
- [x] Add regression coverage:
  - [x] Default sort is Date Updated newest first.
  - [x] Alphabetical A-Z and Z-A apply to visible note titles.
  - [x] Created/updated ascending and descending order work with stable tie-breaks.
  - [x] Sorting preserves the active Library/Collection/filter/search scope.
  - [x] Sort dropdown placement stays below the scrollable Notes List body and does not overlap pagination.

Acceptance criteria:

- Users can reorder the Notes List without changing filters or navigating away.
- Default ordering is Date Updated newest first.
- The sort control is a compact dropdown in the Notes List footer, bottom-left below the scrollable list.

---

### Version 0.33.5.18.6.5 - Shared Linked Context picker contract

Decision:

The Target / Search / Record / `+ Use Target` pattern should become a shared framework-owned Linked Context picker shell. The framework owns the UI anatomy. Source modules own the provider data, filtering, sorting, permission-safe labels, and target summaries.

Split into three sub-slices so the contract, framework shell, and Notes adoption do not land in one large pass.

#### Version 0.33.5.18.6.5.1 - Linked Context picker provider contract

- [x] Create or formalize a shared Linked Context picker contract. — Added the `linked-context-target.v1`
      provider response contract and validation helpers in `src/core/linked-context/provider-contract.js`.
- [x] Source modules should expose link target providers.
  - [x] The framework must not hard-code how Projects, Tasks, Notes, Lists, Clients, or future modules sort and label their own records. — Provider descriptors live in module manifests; provider docs and regressions state source modules own filtering, sorting, labels, summaries, URLs, and context hints.
  - [x] The framework may standardize the provider response shape. — The framework validates the normalized contract fields while leaving provider-owned query/sort/label behavior to source modules.
- [x] Provider response shape should include normalized fields such as:
  - [x] `moduleId`
  - [x] `targetType`
  - [x] `targetId`
  - [x] `displayLabel`
  - [x] `secondaryLabel`
  - [x] `sortKey`
  - [x] `sourceUrl`
  - [x] `clientId`
  - [x] `projectId`
  - [x] `workspaceId`
  - [x] `isAvailable`
  - [x] Optional `primaryContextHints`
- [x] Add contract documentation:
  - [x] Source module provider responsibilities.
  - [x] Required fields.
  - [x] Sorting responsibility.
  - [x] Label safety rules.
  - [x] No UUID UI rule.

Acceptance criteria:

- The shared provider response contract is documented and regression-covered.
- The framework contract says providers own sorting and label construction.
- Provider labels must be safe for direct UI rendering without raw UUIDs.

#### Version 0.33.5.18.6.5.2 - Framework Linked Context picker shell

- [x] Build or formalize the shared picker UI shell. — Added `LongtailForge.view.createLinkedContextPicker()` as the framework-owned Target/Search/Record/Use Target shell.
- [x] The shared picker UI shell should support:
  - [x] Target select.
  - [x] Search input.
  - [x] Record dropdown.
  - [x] `+ Use Target` action.
  - [x] Existing linked context row rendering.
  - [x] Remove action rendering.
  - [x] Empty state rendering.
  - [x] Permission-disabled/read-only state rendering.
- [x] The picker must render provider-supplied labels rather than constructing strings like:
  - `Project: Name - Client - Active`
  - `Client: Name - Client - Active`
  - `Task: Name - Active`
- [x] Add framework shared-component regression coverage for the shell and provider-label rendering. — Added `linked-context-picker-shell-regression.mjs` plus shared view-helper exposure coverage.

Acceptance criteria:

- [x] The framework owns reusable picker anatomy.
- [x] The shell can be reused by Lists, Tasks, Files, Clients/Projects, and future modules.
- [x] The shell does not construct module-specific labels or sorting.

#### Version 0.33.5.18.6.5.3 - Notes adoption of shared Linked Context picker

- [x] Migrate Add/Edit Note Linked Context controls to the shared picker shell. — Add/Edit Notes now mount `LongtailForge.view.createLinkedContextPicker()` and bind the existing Notes target/search/record/use-target hooks through `viewParts`.
- [x] Hide/deprecate `Workspace` as a normal selectable target in Add/Edit Note Linked Context unless a later workflow explicitly needs it.
  - [x] Backend support may remain if currently needed. — The service still recognizes workspace links for legacy/backend paths.
  - [x] Do not default the Add/Edit Note picker to Workspace when the user is trying to link useful context. — The normal picker default is Project.
- [x] Notes Linked Context supported target types:
  - [x] Client, Business workspaces only.
  - [x] Project.
  - [x] Task.
  - [x] Note.
  - [x] List.
  - [x] User only if the current Notes link model intentionally continues to support user links. — User remains available behind existing user-read rules.
- [x] Personal/Family workspace behavior:
  - [x] Do not show Client target.
  - [x] Do not show client labels in project/task display strings.
- [x] Business workspace behavior:
  - [x] Client target appears only if user can read clients.
  - [x] Workspace-level projects are supported.
  - [x] Workspace-level project/task labels use workspace name where client name would otherwise appear.
- [x] Linked Context is read-only for Primary Context.
  - [x] Linked Context picker/select/staged/saved-link flows do not create, update, delete, infer, or recover direct `client_id` / `project_id` Primary Context.
  - [x] Primary Context can be displayed as a non-removable reference row, but direct Primary Context is authored only through Note Details or explicit service payload fields.
- [x] Task-created Note creation remains a Notes-owned explicit create workflow.
  - [x] Creating a note from a task pre-fills direct Primary Context controls from the task's readable client/project before save.
  - [x] The task itself is still staged as removable Linked Context and does not own Primary Context.
  - [x] Task-created notes saved during the broken prefill window are repaired only when they match the task-created defaults and a single task link created with the note.
- [x] Saved-note Edit dialogs hydrate from the authoritative no-store Notes API payload before modal fields are populated.
  - [x] The first Edit modal open uses the same current Primary Context that the Notes view page is already displaying.
  - [x] Current saved client/project selections remain selected even when the first provider result page does not include that client/project option.
  - [x] Direct hydrated `client_id` / `project_id` values are passed into option loading before browser select controls can drop values whose options are not mounted yet.
- [x] Add Notes UI regression coverage for the shared picker adoption. — Extended Notes UI and linked-context picker regressions for shared shell hooks, hidden Workspace picker options, Note/List targets, label safety, and shared row hint rendering.

Acceptance criteria:

- [x] Add/Edit Note uses the shared Linked Context picker shell.
- [x] Notes target choices match workspace type and permission rules.
- [x] No picker option displays raw UUIDs or redundant type/status strings.
- [x] Linked Context never mutates Primary Context.
- [x] View-page Primary Context and first-open Edit modal Primary Context stay in sync.
- [x] Notes created from task context carry the task client/project as direct Primary Context and the task as Linked Context.

---

### Version 0.33.5.18.6.5.4 - Check, regression, and database efficiency implementation

- [x] Consolidate the database to a fresh current SQLite baseline.
  - [x] Replace historical migration replay with `src/db/schema/current.sql` as the fresh-start schema source.
  - [x] Record a single baseline row in `schema_migrations` as `0.33.5.18.6.5.4 / core / current_fresh_start_database`.
  - [x] Remove the historical core/module migration files from the tracked source tree.
  - [x] Keep future post-baseline migrations possible through the existing runner.
  - [x] Adopt compatible current-schema pre-baseline local databases in place by replacing historical migration rows with the consolidated baseline marker while preserving existing users and data.
  - [x] Fail incompatible pre-baseline local databases with a clear backup/restore message instead of silently attempting a partial upgrade.
- [x] Make regressions faster without weakening coverage.
  - [x] Add a runner-prepared baseline database fixture and copy it into per-script temp DB/data directories.
  - [x] Move default/search and file-storage regression buckets off the real local database path.
  - [x] Add `LONGTAIL_DATA_DIR` support so file-storage checks isolate their files.
  - [x] Keep `fresh-database-regression.mjs` on true empty-database startup.
  - [x] Add `baseline-adoption-regression.mjs` to guard adoption of compatible existing local databases without deleting users.
  - [x] Update migration-era regressions to assert the fresh baseline contract and current schema.
- [x] Reduce static/source check overhead.
  - [x] Parallelize `scripts/check-js.mjs` with bounded concurrency.
  - [x] Expand syntax checking to `.js` and `.mjs`.
  - [x] Keep the syntax check in the standard suite.
- [x] Improve API regression stability under parallel execution.
  - [x] Normalize local test server base URLs to `127.0.0.1:${port}` where scripts already bind to loopback.
- [x] Update release bookkeeping and docs.
  - [x] Update database, architecture, and module-contract documentation for the consolidated baseline.
  - [x] Update `DECISIONS.md`, `CHANGELOG.md`, package metadata, and the ignored `C-R-DB-EFFICIENCY.md` results.
  - [x] Preserve the old local dev database as `data/longtail-forge.pre-0.33.5.18.6.5.4.db` before restarting the local app on the new baseline.
  - [x] Restore that preserved local dev database as the active database after discovering the fresh restart displaced existing local users.

Efficiency result:

- `npm run check` improved from about 138.6s wall time to 63.6s wall time on this machine.
- The regression runner improved from 134.67s to 56.91s.
- The isolated DB bucket's total script time dropped from 338.84s to 125.52s.

Verification:

- [x] `node scripts/fresh-database-regression.mjs`
- [x] `node scripts/baseline-adoption-regression.mjs`
- [x] `node scripts/legacy-cleanup-regression.mjs`
- [x] `node scripts/regression-runner-regression.mjs`
- [x] `node scripts/check-js.mjs`
- [x] `npm run check`
  - [x] Corrective reruns passed 142/142 regression scripts plus ESLint; runner time held around 74-76s.
- [x] `npm run test:permissions`
  - [x] Corrective rerun passed 236 permission checks.
- [x] `sqlite3 data/longtail-forge.db "PRAGMA integrity_check;"`
- [x] Active restored DB has 9 users and the single `0.33.5.18.6.5.4 / core / current_fresh_start_database` baseline marker.
- [x] Login succeeds for restored `support@longtailforge.local`.
- [x] `/api/app-info` reports `0.33.5.18.6.5.4`.

---

### Version 0.33.5.18.6.6 - Linked Context target label and sort rules

Implement provider-owned display and sorting rules.

Split by provider family so each pass can update one display/sort contract and its regressions.

#### Version 0.33.5.18.6.6.1 - Client and Project target labels/sorting

Client target:

- [x] Display label:
  - `Client Name`
- [x] Do not show:
  - `Client:`
  - `- Client`
  - status
  - UUID
- [x] Sort by Clients/Projects-owned hierarchy order:
  - [x] Top-level clients alphabetically.
  - [x] Child clients under their parent alphabetically.
  - [x] Preserve Clients/Projects-owned child indentation in picker display labels.

Project target:

- [x] Do not show:
  - `Project:`
  - status
  - UUID
- [x] Business workspace display:
  - [x] Client project: `Project Name - Client Name`
  - [x] Workspace-level project: `Project Name - Workspace Name`
- [x] Business workspace sorting:
  - [x] Workspace-level projects first.
  - [x] Then sort by client/workspace display name.
  - [x] Then sort by project name.
- [x] Personal/Family workspace display:
  - [x] `Project Name`
- [x] Personal/Family sorting:
  - [x] Sort by project name.
- [x] Add provider and picker regression coverage for Client/Project options.

Acceptance criteria:

- Client and Project dropdown options are concise.
- Project dropdown sorts by workspace/client grouping, then project.
- Client/Project options do not include redundant type prefixes, redundant status suffixes, or UUIDs.

#### Version 0.33.5.18.6.6.2 - Task target labels/sorting

Task target:

- [x] Do not show:
  - `Task:`
  - status
  - UUID
- [x] Truncate long task titles for dropdown display.
  - [x] Use approximately 20 characters for the task title portion.
  - [x] Preserve the full title in `title`, tooltip, or accessible label if possible.
- [x] Business workspace display:
  - [x] Client project task: `Task title… - Client Name | Project Name`
  - [x] Workspace project task: `Task title… - Workspace Name | Project Name`
  - [x] No project: `Task title…`
- [x] Personal/Family workspace display:
  - [x] With project: `Task title… - Project Name`
  - [x] No project: `Task title…`
- [x] Sort tasks by provider-defined usefulness.
  - [x] Prefer active/readable tasks.
  - [x] Then sort by client/workspace, project, task title where applicable.
- [x] Add provider and picker regression coverage for Task options.

Acceptance criteria:

- Task dropdown uses truncated task names plus readable context.
- Task options do not include redundant target type prefixes, redundant status suffixes, or UUIDs.
- Task sorting is provider-owned and deterministic.

#### Version 0.33.5.18.6.6.3 - Note and List Linked Context targets

Note target:

- [x] Add Note as a selectable Linked Context target.
- [x] Display label:
  - [x] `Note Title`
- [x] Optional secondary label may include Library bucket or collection if helpful.
- [x] Do not show secure/private/inaccessible note labels to unauthorized users.
- [x] Do not show UUIDs.

List target:

- [x] Add List as a selectable Linked Context target.
- [x] Display label:
  - [x] `List Title`
- [x] Optional secondary label may include list type or primary context if helpful.
- [x] Do not show UUIDs.
- [x] Add provider and picker regression coverage for Note/List options.

Acceptance criteria:

- Note and List can be selected as Linked Context targets.
- Note/List options are permission-safe and do not expose UUIDs.
- Existing linked context rows can render Note/List labels safely.

#### Version 0.33.5.18.6.6.4 - Unavailable target fallback labels

Unavailable targets:

- [ ] Existing links whose target cannot be resolved/read should show safe placeholders:
  - [ ] `Unavailable linked context`
  - [ ] `Unavailable client`
  - [ ] `Unavailable project`
  - [ ] `Unavailable task`
  - [ ] `Unavailable note`
  - [ ] `Unavailable list`
- [ ] Do not expose raw target IDs.
- [ ] Apply fallback behavior consistently to picker options, existing linked context rows, and Primary Context display where applicable.
- [ ] Add regression coverage for unresolved/unreadable targets.

Acceptance criteria:

- Unavailable linked/primary targets never expose raw IDs.
- Existing linked context rows use the same readable display rules as picker options.
- Fallback labels are type-specific where the type is known and generic otherwise.

---

### Version 0.33.5.18.6.7 - Notes Tags and Files modal behavior

Split into three sub-slices so modal-stack behavior is framework-safe before each utility moves.

#### Version 0.33.5.18.6.7.1 - Modal-stack guardrails and utility labels

- [ ] Rename Add/Edit Note footer utility buttons:
  - [ ] `Note tags` -> `Tags`
  - [ ] `Note files` -> `Files`
  - [ ] Keep the existing icons.
- [ ] Add shared modal-stack guardrails:
  - [ ] Secondary modals must not break the underlying Add/Edit Note state.
  - [ ] Closing secondary modal returns to the note editor.
  - [ ] Saving/closing the note editor should prevent or safely close open secondary modals.
  - [ ] Escape key and backdrop behavior must not accidentally close both modals unless explicitly intended.
- [ ] Add framework/modal regression coverage for stacked secondary modal behavior.

Acceptance criteria:

- Button labels are simply `Tags` and `Files`.
- Icons are preserved.
- Secondary modal behavior is guarded before Tags/Files migrate.

#### Version 0.33.5.18.6.7.2 - Tags stacked modal

- [ ] Tags button behavior:
  - [ ] Open a stacked modal/dialog above the Add/Edit Note modal.
  - [ ] Do not expand an inline box below the Body field.
  - [ ] Preserve note editor state while the Tags modal is open.
  - [ ] Closing the Tags modal returns focus to the Tags button or sensible editor focus.
  - [ ] Unsaved note: tag changes may be staged locally and saved with the note.
  - [ ] Existing note: tag changes may persist immediately if the existing tag service supports that safely.
- [ ] Add regression coverage:
  - [ ] Tags opens as stacked modal, not inline panel.
  - [ ] Editor state is preserved while Tags is open.
  - [ ] Tags state persists correctly for unsaved/saved notes.

Acceptance criteria:

- Tags no longer opens an inline panel below Body.
- Tags opens as a stacked modal.
- Tags changes follow safe unsaved/saved-note behavior.

#### Version 0.33.5.18.6.7.3 - Files stacked modal

- [ ] Files button behavior:
  - [ ] Open a stacked modal/dialog above the Add/Edit Note modal.
  - [ ] Do not expand an inline box below the Body field.
  - [ ] Existing saved normal note: show file attachment UI in the modal.
  - [ ] New unsaved note: show a modal with this message:
    - `Save the note before adding files.`
  - [ ] The unsaved-note files message should use error/warning styling, preferably red/danger treatment.
  - [ ] Secure note behavior must continue to follow secure-note file restrictions.
- [ ] Add regression coverage:
  - [ ] Files opens as stacked modal, not inline panel.
  - [ ] Unsaved note Files modal shows save-first warning.
  - [ ] Secure-note file restrictions still apply.

Acceptance criteria:

- Files no longer opens an inline panel below Body.
- Files opens as a stacked modal.
- Files on unsaved notes shows the red save-first message.
- Secure-note file behavior is unchanged.

---

### Version 0.33.5.18.6.8 - Shared Markdown editor and display cleanup

Decision:

Markdown display and editor improvements should be made through the shared Markdown renderer/editor helper so every module using the approved contract benefits consistently.

Split into four sub-slices because rendered line-break semantics, toolbar UI, preview placement, and underline renderer/sanitizer support are different risk profiles.

#### Version 0.33.5.18.6.8.1 - Markdown soft line break display parity

Current issue:

The Note view display collapses single line endings inside a note body even when the editor preserves those single-newline breaks. Example manual smoke note: `ca3ee346-a528-405a-ad88-ab9a9d6bfecc` (`Factory Power Converter`) currently renders lines such as `12v side`, `Fuse 1 is lights`, `Fuse 2 is Heater`, and `Fuse 3 is Pump` as one visual paragraph instead of separate visible lines.

Desired behavior:

- [ ] Decide the Markdown contract for user-authored Notes single newlines:
  - [ ] Prefer rendering Markdown soft line breaks as visible line breaks in Notes read display and Notes preview when that matches editor intent.
  - [ ] Preserve saved Markdown exactly; do not rewrite existing note bodies to add trailing spaces, `<br>`, or blank lines.
  - [ ] If the shared framework renderer change would unintentionally alter Help or future Knowledge Base article layout, introduce an explicit renderer mode for user-authored note bodies instead of changing repo-authored documentation behavior silently.
- [ ] Ensure Notes read display and Notes preview use the same line-break behavior.
- [ ] Preserve normal blank-line paragraph behavior.
- [ ] Do not permit raw HTML or unsafe break-related markup as part of this fix.
- [ ] Add regression coverage:
  - [ ] A note body with single newlines renders visible line breaks in View Note.
  - [ ] The same body renders the same line breaks in Preview.
  - [ ] Saved Markdown remains unchanged.
  - [ ] Paragraphs separated by blank lines still render as paragraphs.
  - [ ] Automated regression creates its own fixture; the real note `ca3ee346-a528-405a-ad88-ab9a9d6bfecc` is only a manual smoke reference.

Acceptance criteria:

- Single newlines authored in Notes are visible in View Note and Preview according to the approved Markdown contract.
- Saved note bodies are not rewritten.
- Help/KB-style repo-authored Markdown behavior is either intentionally unchanged or explicitly documented if the shared contract changes.

#### Version 0.33.5.18.6.8.2 - Markdown toolbar compact buttons and list commands

- [ ] Update the shared Markdown editor toolbar.
- [ ] Existing `List` button should be renamed visually to one of:
  - [ ] `UL`
  - [ ] `Bullets`
  - [ ] Bullet-list icon
- [ ] Add an ordered list button.
  - [ ] Visual label may be `1.`
  - [ ] Accessible label must be `Ordered list`.
- [ ] Convert toolbar buttons to smaller/icon-style buttons:
  - [ ] Bold: `B`
  - [ ] Italic: `I`
  - [ ] Heading: `H`
  - [ ] Unordered list: bullet icon or `UL`
  - [ ] Ordered list: `1.`
  - [ ] Link: chain icon
  - [ ] Wiki: Wikipedia/Wikimedia-style globe icon or compact `Wiki` icon if no approved icon exists
  - [ ] Preview: eye icon preferred; magnifier acceptable
- [ ] Keep accessible labels/tooltips for every icon button.
- [ ] Do not add a new external icon dependency unless the project already has an approved icon path.
- [ ] Add regression coverage:
  - [ ] Ordered list insertion.
  - [ ] Unordered list insertion.
  - [ ] Existing keyboard indentation/list-continuation behavior still works.

Acceptance criteria:

- Ordered list button exists.
- Existing `List` button is no longer generically labeled `List`.
- Toolbar buttons are compact and accessible.
- Existing list indentation/list-continuation behavior still works.

#### Version 0.33.5.18.6.8.3 - Markdown toolbar stable placement

- [ ] Ensure toolbar layout remains full-width above the Body editor.
  - [ ] Toolbar must not move into preview columns.
  - [ ] Toolbar must not change position when Preview is toggled.
- [ ] Keep Preview as a toolbar action with an accessible label/tooltip.
- [ ] Add regression coverage:
  - [ ] Preview toggle preserves toolbar layout.
  - [ ] Toolbar remains full-width above the editor/preview area.

Acceptance criteria:

- Toolbar stays full-width and stable when Preview toggles.
- Preview remains reachable through the shared toolbar control.

#### Version 0.33.5.18.6.8.4 - Safe underline Markdown contract

- [ ] Add underline button only through an explicit safe Markdown contract.
  - [ ] Visual label may be `U`.
  - [ ] Accessible label must be `Underline`.
  - [ ] Do not insert arbitrary unsafe raw HTML.
  - [ ] If underline requires Markdown renderer support, update the framework Markdown contract and sanitizer deliberately.
  - [ ] Safe implementation options:
    - [ ] Allow sanitized `<u>` with no attributes, or
    - [ ] Add a dedicated safe underline token handled by the Markdown adapter.
- [ ] Add regression coverage:
  - [ ] Underline insertion/rendering/sanitization if implemented.
  - [ ] Underline cannot inject unsafe HTML, attributes, event handlers, or scripts.

Acceptance criteria:

- Underline exists only through a safe Markdown contract.
- Underline rendering is documented and sanitized.
- Unsafe underline payloads are rejected or stripped.

---

### Version 0.33.5.18.6.9 - Shared Markdown editor preview layout

Split into two sub-slices so the shared editor layout can land before modal-specific stress coverage.

#### Version 0.33.5.18.6.9.1 - Shared Markdown editor preview layout

- [ ] Update shared Markdown editor preview behavior.
- [ ] Preview off:
  - [ ] Body editor shows the textarea full-width.
  - [ ] Toolbar remains full-width above the textarea.
- [ ] Preview on:
  - [ ] Body section becomes a two-column editor/preview layout on sufficiently wide screens.
  - [ ] Textarea shrinks to the left column.
  - [ ] Preview renders in the right column.
  - [ ] Toolbar remains full-width above both columns.
- [ ] Markdown rendering:
  - [ ] Preview must continue to use the same approved Markdown contract as saved rendering.
  - [ ] Do not reintroduce ad-hoc client-only rendering.
- [ ] Add regression coverage:
  - [ ] Preview off full-width editor.
  - [ ] Preview on two-column desktop layout.
  - [ ] Toolbar remains full-width.

Acceptance criteria:

- Preview no longer simply opens downward as a cramped inline block on desktop.
- Preview toggling creates a usable two-column body editor/preview layout on wide screens.
- Toolbar remains stable above the editor/preview area.
- Preview uses the shared Markdown renderer contract.

#### Version 0.33.5.18.6.9.2 - Markdown preview responsive and modal behavior

- [ ] Responsive behavior:
  - [ ] On narrow screens, stack textarea and preview vertically.
  - [ ] Do not create horizontal overflow.
  - [ ] Preserve mobile usability.
- [ ] Preview height behavior:
  - [ ] Preview should grow with content more naturally.
  - [ ] Avoid the current cramped preview box that cuts off content too aggressively.
  - [ ] If height must be capped inside a modal, use a sensible scroll region that does not break the sticky footer.
- [ ] Modal behavior:
  - [ ] Preview layout must not break the framework modal scroll/footer fixes.
  - [ ] Preview must not create content under the sticky footer.
  - [ ] Preview must not shift footer buttons horizontally.
- [ ] Add regression coverage:
  - [ ] Preview on stacked mobile layout.
  - [ ] Preview content grows/scrolls safely.
  - [ ] Modal footer remains pinned and clean.

Acceptance criteria:

- Preview remains usable on narrow screens.
- Preview content grows/scrolls safely.
- Modal scrolling/footer remains correct.

---

### Version 0.33.5.18.6.10 - Notes UI regression pass and docs closeout

- [ ] Add or update Notes UI workflow regressions covering:
  - [ ] Create Note modal.
  - [ ] Edit Note modal.
  - [ ] View Note detail.
  - [ ] Primary Context controls.
  - [ ] Linked Context add/remove.
  - [ ] Task-created note context display.
  - [ ] Tags stacked modal.
  - [ ] Files stacked modal.
  - [ ] Unsaved-note files warning.
  - [ ] Markdown toolbar buttons.
  - [ ] Markdown line-break view/preview parity.
  - [ ] Markdown preview two-column layout.
  - [ ] Personal/Family workspace context hiding.
  - [ ] Notes List sorting controls and default order.
  - [ ] No UUID user-facing UI.
- [ ] Add or update framework shared-component regressions:
  - [ ] Linked Context picker contract.
  - [ ] Provider-owned labels/sorting.
  - [ ] Modal stack behavior.
  - [ ] Markdown editor toolbar.
  - [ ] Markdown preview layout.
- [ ] Update docs:
  - [ ] `docs/notes-module.md`
  - [ ] `docs/view-building-contract.md`
  - [ ] `docs/module-contract.md`
  - [ ] Any UI guardrails/contracts doc added in this release.
- [ ] Update Help/user-facing text only if behavior exposed to users changes.
- [ ] Update CHANGELOG.
- [ ] Bump package/app metadata to the implemented version.
- [ ] Run:
  - [ ] `npm run check`
  - [ ] Relevant Notes UI regression scripts.
  - [ ] Relevant Markdown/editor regression scripts.
  - [ ] Relevant permissions tests if context/visibility/readability changed.
- [ ] Verify `/api/app-info` reports the expected version.
- [ ] Keep this section focused on Notes and shared framework contracts.
  - [ ] Do not perform Lists add/edit redesign in this section.
  - [ ] Do not convert Tasks, Files, or Clients/Projects in this section.
  - [ ] Do not rename database tables or route names.
  - [ ] Do not introduce a frontend framework.

Acceptance criteria:

- Notes is a clean template for future add/edit/view module surfaces.
- Primary Context and Linked Context are visually and behaviorally distinct.
- Notes add/edit/view UI is free of raw UUID display.
- Shared picker/modal/Markdown contracts are documented.
- Tests/checks pass.

---

## Tasks (0.33.5.18.7 - 0.33.5.18.10)

Tasks is the most complex surface (filters, list/board, detail, checklists, relationships, recurrence,
bulk actions, timer controls, resume context/next action). Expect the heaviest use of registered
behaviors as the escape hatch; keep business logic in `public/js/tasks.js` and
`public/js/task-dialog.js`.

Framework owns: page shell, filters, task table/list, detail shell, badge/metadata rows, action
strips, summary panels, modal shell/form/footer, field grid, bulk-action toolbar, empty/loading/error
states. Tasks owns: canonical task query, statuses, recurrence rules, relationships, checklist items,
timer logic, resume/next-action data, validation, save payloads, permissions, workspace scope.

### Version 0.33.5.18.7 - Tasks Declarative Read-Only Surface Proof

- [ ] Add a `viewSurfaces` descriptor for the Tasks protected workspace read path.
- [ ] Reduce `views/protected/tasks.html` to a minimal framework host element.
- [ ] Move task filters, the task table/list, detail header, badge/metadata rows, and read-only
      summary panels into the descriptor.
- [ ] Define the normalized Tasks read endpoint and `fieldBindings`, preserving the canonical task
      query, status set, recurrence/relationship display, resume context, and workspace scope.
- [ ] Preserve all Tasks routes, response payloads, permissions, and scope behavior.
- [ ] Keep task creation/editing, checklists, bulk actions, timers, and modals on the existing
      imperative path until later slices.
- [ ] Add regressions proving the read-only Tasks surface renders from the descriptor.

### Version 0.33.5.18.8 - Task Detail, Checklists, Relationships, and Field Behaviors

- [ ] Move task detail anatomy (header, metadata, badges, summary panels, resume/next-action strip)
      into the descriptor.
- [ ] Render checklist rows through the editable item-row capability from 0.33.5.18.1, keeping
      checklist add/edit/check/reorder/delete logic in Tasks files via registered behaviors.
- [ ] Render relationships and linked context through descriptor/renderer-supported anatomy while
      keeping relationship rules in Tasks files.
- [ ] Keep Tasks responsible for field meaning, validation, save payloads, and permissions.
- [ ] Add regressions for descriptor-rendered task detail, checklist rows, and relationships.

### Version 0.33.5.18.9 - Task Create/Edit Modal, Bulk Actions, Recurrence, and Timer Controls

- [ ] Convert the task create/edit dialog (`public/js/task-dialog.js`) to descriptor-declared
      modal/form/footer anatomy with registered behaviors for custom field logic.
- [ ] Render the multi-select bulk-action toolbar through the 0.33.5.18.1 capability; keep bulk
      due/tag/status logic in Tasks files.
- [ ] Express the recurrence dialog through the descriptor modal contract plus a registered behavior
      for recurrence rule editing.
- [ ] Wire timer start/pause/resume controls as registered behaviors; the framework owns placement and
      the timer chip surface, Tasks owns timer state and routes.
- [ ] Preserve every task create, edit, bulk-edit, recurrence, relationship, checklist, and timer
      workflow.
- [ ] Add regressions for the descriptor task modal, bulk toolbar, recurrence behavior, and timer
      controls.

### Version 0.33.5.18.10 - Tasks Workflow Actions and Layout Cleanup

- [ ] Express remaining Tasks workflow actions (complete, reopen, block/unblock, archive, delete,
      restore, assign, recurrence apply, and related actions) as declarative route actions or
      registered behaviors.
- [ ] Reduce `public/js/tasks.js` and `public/js/task-dialog.js` to data bindings and behavior
      handlers with no hand-built framework-owned anatomy.
- [ ] Expand fail-on-violation declarative guardrails to the Tasks surface.
- [ ] Add regressions proving Tasks no longer creates framework-owned anatomy by hand.

---

## Files (0.33.5.18.11 - 0.33.5.18.12)

The framework already owns the file service (storage, scanning, lifecycle, downloads). This conversion
is strictly the browse/attachment UI and must never bypass file permission, scan, storage, or download
routes.

Framework owns: page shell, filters, file table/cards, detail/preview shell, attachment panel shells,
upload control shell, row action placement, empty/loading/error states. Files owns: file metadata,
placement meaning, permission checks, scan/storage/download routes, and attachment business rules.

### Version 0.33.5.18.11 - Files Declarative Browse Surface Proof

- [ ] Add a `viewSurfaces` descriptor for the Files browse read path.
- [ ] Reduce `views/protected/files.html` to a minimal framework host element.
- [ ] Move file filters, the browse table/cards, file detail/preview read anatomy, and summary/status
      panels into the descriptor.
- [ ] Define the normalized Files read endpoint and `fieldBindings`, reusing existing file list routes.
- [ ] Preserve framework file service ownership: read paths must continue to flow through existing
      permission-checked file routes.
- [ ] Keep upload, attachment management, and row mutations on the existing imperative path until the
      next slice.
- [ ] Add regressions proving the read-only Files browse surface renders from the descriptor without
      bypassing file routes.

### Version 0.33.5.18.12 - File Upload, Attachment Panels, Row Actions, and Cleanup

- [ ] Render the upload control with progress through the 0.33.5.18.1 capability, wired to the existing
      upload route via a registered behavior.
- [ ] Convert the shared attachment panel (`public/js/shared/file-attachments.js`) view anatomy to
      descriptor/renderer-supported panels and overlay host usage, keeping upload/scan/download logic
      in Files files.
- [ ] Express row actions (download, rename, move, delete, restore) as declarative route actions or
      registered behaviors honoring the existing file routes and permissions.
- [ ] Reduce `public/js/files.js` and the view portions of `public/js/shared/file-attachments.js` to
      data bindings and behavior handlers with no hand-built framework-owned anatomy.
- [ ] Expand fail-on-violation declarative guardrails to the Files surface.
- [ ] Add regressions proving Files no longer creates framework-owned anatomy by hand and never
      bypasses file routes.

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

## Version 0.33.5.18.145- Cross-Surface Guardrails, Inventory, Documentation, and Closeout

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
  - [ ] "Start with what’s due"
  - [ ] "Work this week"
  - [ ] "Review blocked work"
  - [ ] "Focus on a project"
- [ ] Show one recommended next action before showing longer lists.
- [ ] Keep secondary lists available but visually subordinate.
- [ ] Avoid turning Workbench into another full module index.
- [ ] Add empty states that suggest a useful next step instead of dead ends.

### Version 0.33.7.6 - Quick Action Capture Utility Rail

Decision:

Quick Action Capture (QAC) is app-shell utility behavior, not a Workbench focus mode. It should provide low-distraction access to common capture and recovery tools without navigating away from the user’s current work surface. QAC should keep the user on the existing screen and simply open modals (where available). The basic concept is to:

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
  * [ ] Generate “What links here.”
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

- [x] Wipe existing DB migrations and create a new DB baseline — Completed in 0.33.5.18.6.5.4.

- [x] Evaluate all existing regressions and see what can be eliminated/lightened — Completed in 0.33.5.18.6.5.4 without removing coverage from the standard release gate.

- [x] Determine where efficiencies can be made in the code/Perform an efficiency refactor — Initial regression/database efficiency pass completed in 0.33.5.18.6.5.4.

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

