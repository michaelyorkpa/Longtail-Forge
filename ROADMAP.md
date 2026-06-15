# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.33.5.15 - Framework View Builder Contract and Lists Pilot

### Design and Clarification Questions

- [x] Confirm whether the first view builder should be a small DOM-helper library only, without state management, virtual DOM behavior, component lifecycle, or a new frontend framework.
  - Confirmed.
  - The first view builder should be a small, boring DOM-helper library.
  - Do not add state management.
  - Do not add virtual DOM behavior.
  - Do not add component lifecycle semantics.
  - Do not add a frontend framework.
  - Helpers should create safe, accessible DOM structures and apply framework-owned surface classes.
  - Modules remain responsible for data loading, state decisions, validation, API calls, and business workflow behavior.

- [x] Confirm the framework namespace and naming preference: `window.LongtailForge.view`, `window.LongtailForge.viewBuilder`, or another existing shared namespace.
  - Use `window.LongtailForge.view` as the public namespace.
  - The file can be named `public/js/shared/view-builder.js`, but the browser API should be short and stable: `LongtailForge.view`.
  - Avoid exposing both `view` and `viewBuilder` unless a temporary compatibility alias becomes necessary.
  - Keep helper names direct, for example `LongtailForge.view.createDataTable(...)` and `LongtailForge.view.createModal(...)`.

- [x] Confirm whether `0.33.5.15.3` should convert only the Lists protected workspace, leaving Lists modals/dialogs for later unless they are required by the page conversion.
  - Confirmed.
  - `0.33.5.15.3` should focus on the Lists protected workspace: filters, selector/index, list/detail layout, detail header, action strip, summary panels, item entry, item rows, and tables.
  - Leave full Lists modal/dialog refactoring for a later slice unless the page conversion requires touching a dialog.
  - If the Create/Edit List dialog must move because `lists.html` becomes a minimal host page, convert only the minimum needed shell/form/footer behavior and do not broaden the slice into a full Lists modal redesign.
  - Preserve all Lists routes, save payloads, permissions, and workflows.

- [x] Confirm whether the Client/Project modal adoption in `0.33.5.15.4` should cover both the combined Clients/Projects page and any shared dialogs opened from other protected surfaces.
  - Yes.
  - Convert the shared Add/Edit Client and Add/Edit Project dialog helpers at their source so the improvement applies wherever those dialogs are opened.
  - This should cover the combined Clients/Projects page and shared dialogs opened from other protected surfaces.
  - Do not convert unrelated inline tables, bulk controls, or full Clients/Projects page layout in this slice unless they directly block the modal conversion.
  - Personal and Family workspaces must not gain access to Business-only client dialogs through shared dialog entry points.

- [x] Confirm whether converted surfaces should keep legacy CSS classes as compatibility aliases during the pilot, or remove one-off classes immediately once framework helpers own the structure.
  - Keep legacy CSS classes as compatibility aliases during the pilot.
  - Converted surfaces should use the new framework helper structure and framework surface classes as the primary source of layout behavior.
  - Existing one-off classes may remain temporarily as aliases to avoid breaking tests or unrelated styling.
  - Do not add new one-off classes for framework-owned anatomy.
  - Mark legacy classes as deprecated in comments or docs where practical.
  - Remove deprecated compatibility classes in a later cleanup pass after the pilot proves stable.

- [x] Confirm whether view-builder guardrails should fail on all protected views or only on explicitly converted surfaces until the pilot proves stable.
  - Guardrails should fail only on explicitly converted surfaces during the pilot.
  - Add inventory/reporting coverage for all protected views, but do not make the entire app fail immediately.
  - Converted surfaces should have strict checks.
  - Non-converted surfaces may produce warnings, inventory output, or TODO findings.
  - This avoids turning the Lists pilot into a repo-wide UI migration.
  - Once Lists and the first modal conversions are stable, expand the fail-on-violation guardrails one module/surface group at a time.

Decision:

The framework should own shared view-building primitives for common app surfaces. Modules should not hand-build common page, table, form, dialog, action strip, empty state, status message, filter panel, or split list/detail structures when a framework primitive exists.

Modules still own business meaning: data loading, save payloads, validation rules, permissions, record labels, module-specific fields, and workflow behavior. The framework owns layout anatomy, surface classes, responsive behavior, dark-mode-safe tokens, accessibility defaults, and common action placement.

### Version 0.33.5.15.1 - View-Building Inventory and Boundary Contract

- [x] Inventory hard-coded view construction in current protected views and module browser scripts.
- [x] Identify repeated patterns across Lists, Clients/Projects, Tasks, Notes, Files, Help, Workbench, Dashboard, and future Reporting.
- [x] Define the first framework-owned view primitives:
  - [x] Page header
  - [x] Status message
  - [x] Empty state
  - [x] Filter panel
  - [x] Collapsible selector/index panel
  - [x] Split list/detail workspace
  - [x] Data table with overflow wrapper
  - [x] Detail header
  - [x] Detail metadata/badge row
  - [x] Detail action strip
  - [x] Summary/info panel
  - [x] Modal shell
  - [x] Modal form
  - [x] Modal footer/action groups
  - [x] Field grid
  - [x] Inline item/action row
- [x] Document what the framework owns versus what modules own.
- [x] Do not change module APIs, database schema, permissions, or business workflows in this slice.
- [x] Add developer documentation explaining how modules adopt framework view primitives.

### Version 0.33.5.15.2 - Shared Browser View Builder Helpers

- [x] Add a shared browser helper, for example `public/js/shared/view-builder.js`.
- [x] Expose helpers through `window.LongtailForge.view` or an equivalent framework namespace.
- [x] Helpers must use existing surface tokens and classes from 0.33.5.13.
- [x] Helpers must create accessible DOM by default:
  - [x] Safe text assignment instead of HTML injection.
  - [x] Proper button types.
  - [x] Optional accessible labels and titles.
  - [x] Focus-visible-safe controls.
  - [x] Empty/status regions with appropriate roles where needed.
- [x] Add helpers for:
  - [x] `createPageHeader`
  - [x] `createStatusMessage`
  - [x] `createFilterPanel`
  - [x] `createCollapsibleIndexPanel`
  - [x] `createSplitListDetail`
  - [x] `createDataTable`
  - [x] `createDetailActionStrip`
  - [x] `createInfoPanel`
  - [x] `createModal`
  - [x] `createModalForm`
  - [x] `createFieldGrid`
  - [x] `createActionButton`
- [x] Keep the helper layer small and boring. This is not a full frontend framework.

### Version 0.33.5.15.3 - Lists Framework View Builder Pilot

- [x] Convert `views/protected/lists.html` into a minimal framework host page.
- [x] Move Lists page structure into shared framework primitives instead of hard-coded static page sections.
- [x] Convert Lists filters to the framework filter panel helper.
- [x] Convert the list selector/index to the framework collapsible index panel helper.
- [x] Convert the selected list detail area to framework detail header, badge row, metadata row, action strip, summary panels, and table helpers.
- [x] Convert the item entry form to framework field grid/form helpers.
- [x] Convert list item rows/actions to overflow-safe framework row/action helpers.
- [x] Preserve all current Lists API routes, save payloads, permissions, and workflow behavior.
- [x] Preserve Business workspace client/project behavior.
- [x] Preserve Personal/Family workspace behavior from 0.33.5.14.
- [x] Add regressions proving Lists no longer relies on one-off static layout classes for framework-owned structures.

### Version 0.33.5.15.4 - Client/Project Modal Adoption

- [x] Convert Add/Edit Client dialogs to the shared modal/form/footer helpers.
- [x] Convert Add/Edit Project dialogs to the shared modal/form/footer helpers.
- [x] Keep Clients/Projects responsible for field meaning, validation, save payloads, and permission checks.
- [x] Keep framework responsible for modal shell, footer placement, responsive behavior, focus return, and action ordering.
- [x] Ensure Personal and Family workspaces cannot open Business-only client dialogs.
- [x] Add regressions preventing converted dialogs from using one-off modal footer structures.

### Version 0.33.5.15.5 - Static Guardrails for Converted Surfaces

- [x] Add focused static checks for converted modules.
- [x] Converted modules should not call `document.createElement("dialog")` directly.
- [x] Converted modules should not create new one-off modal footer/action classes when a framework helper exists.
- [x] Converted modules should not introduce hard-coded light backgrounds outside theme tokens.
- [x] Converted modules should not create non-wrapping action rows for dense/detail surfaces.
- [x] Converted modules should keep business logic in module files and shared layout logic in framework helpers.

### Version 0.33.5.15.6 - Documentation and Closeout

- [x] Update `docs/module-contract.md` with the framework view-building boundary.
- [x] Update Help/developer docs for module view adoption.
- [x] Update DECISIONS.md with the framework-owned view builder decision.
- [x] Update CHANGELOG.md.
- [x] Update package metadata.
- [x] Run `npm run check`.
- [x] Run `npm run test:permissions`.
- [x] Verify `/api/app-info` reports the expected version.

## Version 0.33.5.16 - Declarative Framework View Contract and Manifest View Descriptors

This version builds directly on the 0.33.5.15 Framework View Builder helper library. 0.33.5.15
gives the framework imperative DOM primitives (`window.LongtailForge.view`) that modules call by
hand. 0.33.5.16 inverts ownership: modules stop calling view primitives imperatively and instead
**declare a view descriptor** (data) in their manifest, and the framework renders the entire
surface from that descriptor using the 0.33.5.15 helpers as its internal engine. The goal is to
make framework-owned views the same kind of manifest-driven contribution that navigation,
dashboard panels, workbench cards, settings, and help already are, so future modules contribute
data and cannot hand-build divergent or breaking interfaces.

### Design and Clarification Questions

- [x] Confirm the relationship to the 0.33.5.15 helper library: should the declarative contract
  replace the imperative helpers, or layer on top of them?
  - Layer on top. Phased hybrid.
  - Ship and prove the 0.33.5.15 imperative helpers first.
  - The declarative renderer consumes the same `window.LongtailForge.view` primitives internally.
  - Modules adopt the helper library first, then graduate surfaces to descriptors.
  - Do not delete the imperative helpers; they remain the supported escape hatch for genuinely
    custom surfaces that no descriptor can express yet.

- [x] Confirm whether view descriptors should live in the module manifest, validated at startup
  like other contributions, or in a separate per-view config file.
  - Put descriptors in the module manifest as a new `viewSurfaces` field.
  - Validate them at startup in `src/core/modules/manifest-contract.js` with the same fail-fast
    rules used for navigation, dashboard, settings, and help.
  - Reject unknown descriptor keys, missing required fields, duplicate surface IDs, and
    references to permissions, modules, or data sources that do not exist.
  - Reuse the existing per-workspace `terminology` resolution for all descriptor labels rather
    than hard-coded strings.

- [x] Confirm that modules contribute data and behavior, not DOM, under the declarative contract.
  - Modules contribute: the descriptor (layout anatomy as data), a normalized data endpoint, a
    declared field-binding map, and named behavior handlers for actions that are not plain routes.
  - The framework owns: page shell, header, filters, table, split list/detail, detail header,
    badge/metadata rows, action strips, summary panels, empty/loading/error states, modal shell,
    form layout, footer/action placement, responsive behavior, dark-mode tokens, and a11y defaults.
  - Modules must not create framework-owned anatomy by hand once a surface is declarative.

- [x] Confirm how custom, module-specific interactions survive a declarative renderer.
  - Provide a small behavior registry: `LongtailForge.view.registerBehavior(id, handler)`.
  - Descriptors reference behaviors by `id`; the framework wires the control and invokes the
    registered handler with a safe context (record, workspace, refresh, openModal).
  - Business logic stays in module browser files; only layout moves to the framework.
  - If a surface needs something the descriptor cannot express, the module keeps using the
    0.33.5.15 imperative helpers for that surface only, not the whole page.

- [x] Confirm enforcement scope so this does not become a repo-wide migration.
  - Guardrails fail only on surfaces explicitly marked as declarative.
  - Inventory/report all protected views, but only converted surfaces are strictly enforced.
  - Expand fail-on-violation enforcement one module/surface group at a time after Lists proves out.

Decision:

The framework should own view construction as a first-class manifest-driven contribution, the
same way it already owns navigation, dashboards, settings, and help. Modules declare a
`viewSurfaces` descriptor describing the anatomy of a surface as data, expose a normalized data
endpoint with a declared field-binding map, and register named behavior handlers for non-trivial
actions. The framework reads the descriptor and renders the entire surface using the 0.33.5.15
view helpers as its internal engine, applying shared surface tokens, responsive behavior,
dark-mode safety, accessibility defaults, and consistent action placement.

This is a phased hybrid: 0.33.5.15 helpers ship first and remain the supported escape hatch;
0.33.5.16 layers the declarative contract on top and converts Lists as the proof. Modules keep
all business meaning - data loading, validation, save payloads, permissions, record labels, and
workflow behavior. Modules give up only hand-built layout. No state management, virtual DOM,
component lifecycle, or new frontend framework is introduced.

### Version 0.33.5.16.1 - View Descriptor Manifest Field and Base Schema

- [x] Add a `viewSurfaces` field to the manifest contract in `src/core/modules/manifest-contract.js`.
- [x] Define the first descriptor object shape without rendering it yet:
  - [x] `id`, `moduleId`, `viewId` (binds to an existing `protectedViews` entry).
  - [x] `layout`: `single-column`, `split-list-detail`, or `table-page`.
  - [x] `pageHeader`: title/terminology key, description, primary action.
  - [x] `filters`: declared filter controls (field, type, options source, default).
  - [x] `indexPanel`: collapsible selector/index config for split layouts.
  - [x] `table`: `columns` (label/terminology key, field binding, formatter, width hint),
        `rowActions`, `emptyState`, overflow wrapper on by default.
  - [x] `detail`: header, badge row, metadata row, action strip, summary panels, item form,
        item rows.
  - [x] `modals`: shell + field grid + footer action groups for create/edit surfaces.
  - [x] `dataSource`: route + a `fieldBindings` map from response fields to descriptor fields.
  - [x] `actions`: declarative `{ id, label, role, route, method, confirm, requiredPermissions }`
        or a `behavior` id for custom handlers.
- [x] Reject unknown descriptor keys and missing required fields at startup.
- [x] Do not change database schema, module APIs, browser rendering, or business workflows in this slice.
- [x] Add focused manifest-contract regressions for accepted and rejected descriptor shapes.

### Version 0.33.5.16.2 - View Descriptor Reference Validation

- [x] Validate descriptor references at startup with fail-fast rules.
- [x] Reject duplicate surface IDs across all loaded modules.
- [x] Reject `moduleId` values that do not match the declaring module or a known module.
- [x] Reject `viewId` values that do not bind to an existing `protectedViews` entry.
- [x] Reject `requiredPermissions` that do not exist in core permissions or loaded module permissions.
- [x] Reject action roles outside the allowed set used by framework view/action helpers.
- [x] Validate route/action/data-source shape without adding new routes or changing existing API payloads.
- [x] Keep enforcement limited to descriptor validity; do not render descriptors yet.

### Version 0.33.5.16.3 - View Descriptor Terminology and Authoring Contract

- [x] Resolve descriptor labels through the existing per-workspace `terminology` system
      (`src/core/modules/terminology.js`) so Business vs Personal/Family wording stays correct.
- [x] Define how descriptors express literal labels versus terminology keys.
- [x] Add schema documentation to `docs/module-contract.md`.
- [x] Add the framework-owns-vs-module-owns descriptor boundary to `docs/ui-surface-contract.md`.
- [x] Document that modules contribute descriptors, data endpoints, field bindings, and named behavior
      handlers, while the framework owns common layout anatomy and accessibility defaults.
- [x] Do not add the browser renderer in this slice.

### Version 0.33.5.16.4 - Framework View Renderer Shell

- [x] Add a renderer, for example `public/js/shared/view-renderer.js`, exposed as
      `window.LongtailForge.view.renderSurface(descriptor, host)`.
- [x] The renderer must use only the 0.33.5.15 `LongtailForge.view` primitives as its DOM engine.
- [x] Support the initial layout shells:
  - [x] `single-column`.
  - [x] `split-list-detail`.
  - [x] `table-page`.
- [x] Render static descriptor anatomy for page headers, filter panels, selector/index shells,
      split workspaces, table shells, detail shells, action strips, info panels, modal shells,
      field grids, and empty/status placeholders.
- [x] Keep this pass descriptor-in/static-rendering only: no app-shell delivery, no data fetching,
      no behavior registry, and no Lists conversion yet.
- [x] Keep the engine boring: no client state store, no virtual DOM, no component lifecycle.

### Version 0.33.5.16.5 - App-Shell Descriptor Delivery

- [x] Deliver validated descriptors to the browser through the existing app-shell bootstrap channel
      (`public/js/navigation.js` `loadAppShellBootstrap()` / `window.LongtailForge.workspaceContext`).
- [x] Use the same path that already ships module and navigation data; do not add a new transport.
- [x] Include only descriptors for enabled, visible, permission-allowed protected views.
- [x] Ensure disabled modules and hidden/unavailable protected views do not leak declarative surfaces
      through bootstrap payloads.
- [x] Add browser/bootstrap regressions proving descriptors arrive for allowed surfaces and are absent
      for unavailable surfaces.

### Version 0.33.5.16.6 - Renderer Data Binding and Default States

- [x] Implement the data-binding contract in the renderer.
- [x] Fetch `dataSource` routes through `shared/api-client.js`.
- [x] Map response records through the descriptor `fieldBindings` before rendering rows, fields,
      detail headers, badges, metadata, summary panels, and item collections.
- [x] Render framework-owned loading, empty, and error states for every data source by default.
- [x] Provide a descriptor-driven refresh path that re-fetches data without requiring modules to
      rebuild framework-owned layout by hand.
- [x] Do not convert Lists in this slice; use small test descriptors or fixtures for renderer coverage.

### Version 0.33.5.16.7 - Selectable Index Primitive and Split-Layout Correction

This slice was inserted after 0.33.5.16.6 to correct a framework view defect found while reviewing
the live Lists pilot: the split-layout selector/index is rendered as a wide multi-column data table
crammed into the narrow index track, so cells wrap one word per line and the panel grows a horizontal
scrollbar, while the split workspace fails to fill available width and leaves a large empty area beside
the detail pane. This must land before the Lists declarative read-only proof (0.33.5.16.9) so the
renderer is born rendering a correct selector instead of reproducing the broken table-as-index shape
into the descriptor contract. The fix belongs in the framework primitives, not in one-off Lists CSS.

- [x] Add a framework selectable index-list primitive to `public/js/shared/view-builder.js`
      (for example `createIndexList`) for split-layout selectors:
  - [x] Single-column, vertically stacked, selectable rows that do not horizontally overflow.
  - [x] Primary label line, optional status/metadata chip row, and optional secondary meta line.
  - [x] Keyboard-selectable and accessible by default with a clear selected/active state.
  - [x] Safe text assignment and module-owned select callbacks; the primitive owns no app state.
- [x] Correct `.view-split-list-detail` layout in `public/css/longtail-forge.css` so the framework
      split owns column sizing and responsive collapse, and remove the legacy one-off `.lists-workspace`
      grid that overrides it. The remaining space beside the detail pane is the app-standard `.wide-page`
      width cap (`--page-standard-width`) shared by every page, not a Lists defect, so global page width
      is intentionally left unchanged.
- [x] Correct `.view-data-table` / `.view-table-wrap` so genuinely wide tables degrade to horizontal
      scroll without mid-word/one-word-per-line wrapping, and so data tables are not used as
      narrow-track selectors.
- [x] Update the descriptor renderer's `indexPanel`/selector rendering to use the selectable index-list
      primitive rather than a data table, keeping the renderer on the 0.33.5.15 primitives as its engine.
- [x] Update the live imperative Lists workspace (`createListsIndexPanel` in `public/js/lists.js`) to use
      the new primitive instead of `createDataTable(["List","Status","Type","Needed","Items"])`, moving
      Status/Type/Needed/Items into compact chips/secondary text and keeping the full breakdown in the
      detail pane.
- [x] Keep the correction in framework primitives; do not add one-off Lists layout/table classes for
      framework-owned anatomy (consistent with the 0.33.5.15.5 guardrails).
- [x] Preserve all Lists selection behavior, routes, save payloads, permissions, Business client/project
      behavior, and Personal/Family workspace scope behavior.
- [x] Add regressions for the selectable index primitive structure/accessibility, split-layout width,
      data-table overflow degradation, and proof that the Lists index no longer renders a multi-column
      table in the selector track.

### Version 0.33.5.16.8 - Declarative Actions and Behavior Registry

- [x] Implement the behavior registry: `LongtailForge.view.registerBehavior(id, handler)`.
- [x] Wire declarative `route` actions automatically using descriptor `route`, `method`, `confirm`,
      `requiredPermissions`, and action role metadata.
- [x] Wire `behavior` actions by invoking the registered handler with a safe context:
      `{ record, workspaceContext, refresh, openModal, api }`.
- [x] Add a framework-owned `openModal` path for descriptor-declared create/edit modal shells while
      keeping modules responsible for field meaning, validation, and save payloads.
- [x] Ensure missing behavior handlers fail visibly and recoverably without breaking the rest of the
      rendered surface.
- [x] Do not migrate Lists workflow actions in this slice.

### Version 0.33.5.16.9 - Lists Declarative Read-Only Surface Proof

- [x] Convert the Lists protected workspace read path to a `viewSurfaces` descriptor on the Lists
      module manifest.
- [x] Reduce `views/protected/lists.html` to a minimal framework host element the renderer fills.
- [x] Move Lists filters, collapsible selector/index, split list/detail, table, detail header,
      badge/metadata rows, and read-only summary panels into the descriptor.
- [x] Preserve all Lists routes, response payloads, permissions, Business client/project behavior,
      and Personal/Family workspace scope behavior from 0.33.5.14.
- [x] Keep mutating Lists actions, item entry, item rows, modals, and linked-record management on
      the existing imperative path until later slices.
- [x] Add regressions proving the read-only Lists surface renders from the descriptor.

### Version 0.33.5.16.10 - Lists Items, Modals, and Field Behaviors

- [ ] Move Lists item entry, item rows, item tables, and item action placement into the descriptor
      or renderer-supported item-row primitives.
- [ ] Convert Lists create/edit modal shells to descriptor-declared modal/form/footer anatomy.
- [ ] Keep Lists responsible for item field meaning, catalog suggestions, validation, save payloads,
      permissions, and service behavior.
- [ ] Reduce `public/js/lists.js` item and modal code to data bindings plus registered behaviors
      where custom logic is still required.
- [ ] Preserve all item create, edit, reorder, check, uncheck, complete, and delete workflows.
- [ ] Add regressions for descriptor-rendered item entry, item rows, and Lists modal shells.

### Version 0.33.5.16.11 - Lists Workflow Actions, Linked Records, and Layout Cleanup

- [ ] Express Lists-specific workflow actions as declarative route actions or registered behaviors:
      Duplicate, Edit, Complete, Finalize, Reopen, Archive, Delete, Restore, and reusable-list handling.
- [ ] Move linked-record picker placement and linked-record rows into descriptor/renderer-supported
      anatomy while keeping linked-record permission checks and service logic in Lists files.
- [ ] Preserve Business client/project behavior and Personal/Family workspace scope behavior.
- [ ] Reduce `public/js/lists.js` to data bindings and behavior handlers with no hand-built
      framework-owned anatomy.
- [ ] Add regressions proving the Lists surface no longer creates page header, table, dialog,
      action strip, filter panel, or split-layout anatomy by hand.

### Version 0.33.5.16.12 - Declarative Guardrails, Documentation, and Closeout

- [ ] Add static checks that run only against surfaces marked declarative.
- [ ] A declarative module must not call `document.createElement` for framework-owned anatomy
      (page header, table, dialog, action strip, filter panel, split layout).
- [ ] A declarative module must not ship a non-minimal protected HTML view for a declarative surface.
- [ ] A declarative module must not introduce one-off layout/footer classes when a descriptor
      field or framework class exists.
- [ ] Inventory and report all protected views, but enforce strictly only on converted surfaces.
- [ ] Add a developer guide for authoring a declarative view surface (descriptor + data + behaviors).
- [ ] Update DECISIONS.md with the framework-owned declarative view decision.
- [ ] Update CHANGELOG.md.
- [ ] Update package metadata to the implemented version.
- [ ] Run `npm run check`.
- [ ] Run `npm run test:permissions`.
- [ ] Verify `/api/app-info` reports the expected version.

## Version 0.33.5.17 - CommonMark Markdown Platform Renderer

This version adds a framework-owned Markdown rendering contract before Reporting, Knowledge Base,
Tickets, Creator Studio, and other content-heavy surfaces build on inconsistent Markdown behavior.
The immediate user-facing driver is Notes list indentation, nested list rendering, and preview parity,
but the implementation should be platform-level so Notes, Help, Knowledge Base, and future content
surfaces share the same safe parser, sanitizer, plain-text extraction, and regression fixture corpus.

### Design and Clarification Questions

- [ ] Confirm whether the platform should adopt strict CommonMark only, or CommonMark plus a small
      approved extension set for current Longtail Forge needs.
  - Recommendation: CommonMark core plus explicitly allowed table and task-list support, because
    Help and future Knowledge Base content are likely to need tables, and task/checklist-style
    content already exists in the product model.
  - Do not enable broad extension bundles by default.

- [ ] Confirm whether raw HTML in user-authored Markdown should remain disabled or sanitized out.
  - Recommendation: disable raw HTML for Notes, Help-authored Markdown, and future KB article
    Markdown unless a later version introduces a narrow allowlist with explicit security review.

- [ ] Confirm whether saved Markdown should remain unchanged and only renderer/search/preview output
      should change.
  - Recommendation: preserve stored Markdown exactly. Do not rewrite existing note bodies, Help
    content, revisions, or future KB sources during this upgrade.

- [ ] Confirm whether browser previews should call a server-render endpoint or use the same renderer
      library in the browser bundle.
  - Recommendation: choose the least duplicative path after dependency review. Preview output must
    match saved rendering for supported syntax and must not bypass sanitization.

- [ ] Confirm whether Markdown editor keyboard behavior belongs in this version.
  - Recommendation: include only practical editor parity for Markdown authoring, such as Tab/Shift+Tab
    indentation in the Notes textarea and list-continuation helpers. Do not turn this into a WYSIWYG
    editor or a full authoring rewrite.

Decision:

Markdown parsing and rendering should become a framework-owned content service. Modules may own
source fields, visibility rules, linking semantics, revision history, and workflow meaning, but they
should not each invent their own Markdown parser, unsafe HTML policy, plain-text extraction, search
text conversion, or preview behavior. CommonMark compatibility is the baseline contract; any
extensions must be explicitly named, tested, and documented.

### Version 0.33.5.17.1 - Parser Selection and Markdown Contract

- [ ] Review current Markdown rendering paths in Notes, Help, search indexing, browser preview, and
      any static content helpers.
- [ ] Select a CommonMark-compatible parser package after dependency, maintenance, license, and
      security review.
- [ ] Define the approved syntax set:
  - [ ] CommonMark paragraphs, headings, emphasis, strong text, links, images where allowed,
        blockquotes, code spans, fenced code blocks, ordered lists, unordered lists, and nested lists.
  - [ ] Explicitly approved extensions, if confirmed, such as tables and task lists.
  - [ ] Explicitly disallowed behavior, especially raw HTML and unsafe links.
- [ ] Define the framework-owned Markdown APIs:
  - [ ] Render Markdown to safe HTML.
  - [ ] Convert Markdown to plain text for search, excerpts, and previews.
  - [ ] Validate or normalize safe links without changing saved source text.
  - [ ] Expose deterministic fixture-based rendering expectations.
- [ ] Define module-owned responsibilities:
  - [ ] Notes owns note body storage, revisions, library/collection visibility, wiki-style links,
        linked context, and note-specific permissions.
  - [ ] Help owns content discovery, module scoping, and article metadata.
  - [ ] Future Knowledge Base owns publication status, review workflow, source snapshots, and
        article visibility.
- [ ] Do not change database schema, saved Markdown, note visibility, Help article routing, or module
      permissions in this slice.

### Version 0.33.5.17.2 - Shared Server-Side Markdown Renderer

- [ ] Add the selected Markdown dependency and wire it through a framework-owned service, for example
      `src/core/markdown` or `src/services/markdown.service.js`.
- [ ] Render Markdown to sanitized HTML using the approved syntax contract.
- [ ] Strip or neutralize unsafe input:
  - [ ] Raw HTML.
  - [ ] Script/event attributes.
  - [ ] `javascript:` and other unsafe URLs.
  - [ ] Unsafe image sources if images are allowed.
- [ ] Add a plain-text/excerpt conversion path that uses the same parser contract instead of
      ad-hoc regular expressions.
- [ ] Add fixture coverage for:
  - [ ] Nested ordered and unordered lists.
  - [ ] Mixed ordered/unordered list nesting.
  - [ ] Two-space and four-space indentation behavior.
  - [ ] Task lists if approved.
  - [ ] Tables if approved.
  - [ ] Code fences, inline code, blockquotes, links, and unsafe input.
- [ ] Keep the service independent of Notes, Help, and future Knowledge Base business rules.

### Version 0.33.5.17.3 - Notes Renderer Migration

- [ ] Replace Notes-specific Markdown rendering and plain-text extraction with the shared framework
      Markdown service where appropriate.
- [ ] Preserve Notes-specific behavior:
  - [ ] Existing note body storage and revisions.
  - [ ] `All Libraries`, `All collections`, `Uncategorized`, and manual Library bucket semantics.
  - [ ] Private/secure/internal/workspace/client-visible visibility rules.
  - [ ] Wiki-style link detection and note relationship handling.
  - [ ] Linked context behavior for workspace, project, task, user, and Business-only client targets.
- [ ] Fix nested Markdown list rendering so indented child list items remain nested in rendered Notes.
- [ ] Add Notes regressions for nested lists, mixed lists, checklists if approved, revisions, excerpts,
      search text, and unsafe Markdown.
- [ ] Do not migrate stored note bodies or alter existing revision history.

### Version 0.33.5.17.4 - Help Renderer and Search Migration

- [ ] Move Help Markdown rendering to the shared framework Markdown service.
- [ ] Preserve Help-owned behavior:
  - [ ] Content path discovery.
  - [ ] Module/content scoping.
  - [ ] Article metadata.
  - [ ] Navigation and table-of-contents behavior.
  - [ ] Current-state Help wording rather than future roadmap promises.
- [ ] Update Help search/plain-text indexing to use the shared Markdown-to-text path.
- [ ] Validate current Help content fixtures against the shared renderer, especially headings, lists,
      links, tables if approved, and code fences.
- [ ] Add regressions proving Help articles render safely and search indexing does not expose raw
      Markdown syntax or unsafe HTML.

### Version 0.33.5.17.5 - Browser Preview and Editor Consistency

- [ ] Make the Notes live preview use the same approved Markdown contract as saved rendering.
- [ ] Ensure browser preview sanitization cannot diverge from the server-rendered saved note output.
- [ ] Add textarea authoring support for Markdown indentation:
  - [ ] Tab indents the current line or selected lines inside the editor.
  - [ ] Shift+Tab outdents the current line or selected lines.
  - [ ] Enter continues list markers where predictable and stops cleanly on an empty marker.
  - [ ] Keyboard behavior remains scoped to the active Markdown editor and does not break normal page
        focus movement elsewhere.
- [ ] Keep the editor as a Markdown textarea with preview. Do not introduce WYSIWYG editing in this
      version.
- [ ] Add browser/static regressions for editor indentation behavior, preview parity, asset loading,
      and cache-key updates.

### Version 0.33.5.17.6 - Documentation and Closeout

- [ ] Update `docs/module-contract.md` with the framework-owned Markdown rendering boundary.
- [ ] Update Help/developer documentation for the approved Markdown syntax set.
- [ ] Update Notes user-facing Help for list indentation, nested lists, preview behavior, and any
      approved extensions.
- [ ] Update DECISIONS.md with the CommonMark platform renderer decision.
- [ ] Update CHANGELOG.md.
- [ ] Update package metadata to the implemented version.
- [ ] Run `npm run check`.
- [ ] Run `npm run test:permissions` if permissions, visibility, or Help access behavior changed.
- [ ] Verify `/api/app-info` reports the expected version.
- [ ] Keep 0.33.5.17 closeout focused on Markdown rendering and editor parity; defer WYSIWYG editing,
      collaborative editing, content templates, and Knowledge Base publication behavior to later
      roadmap versions.

## Version 0.33.5.18 - View Conversion Backlog

- Tasks
- Notes
- Files
- Clients/Projects pages
- Admin/Settings

## Version 0.33.6 - Reporting Framework and Time Report Contribution

Decision:

Reporting is framework-owned report infrastructure, not a normal disable-able first-party workflow module. The framework owns the Reporting page, report catalog, contribution filtering, report execution dispatch, shared filter host, loading/error/empty states, and future saved/export/export scheduling behavior. Individual modules own the actual report definitions, report runners, data queries, domain calculations, result shapes, and record-level permission checks.

The first 0.33.6 report should remain intentionally small: Time Tracking contributes one Project Time & Billing report. Do not build a custom report builder, report designer, analytics dashboard, or saved report system in this pass.

### Version 0.33.6.1 - Reporting Contribution Contract

- [ ] Rename this roadmap section from "Reports Module" to "Reporting Framework and Time Report Contribution."
- [ ] Keep `reporting.html` framework-owned.
- [ ] Do not create a normal `src/modules/reporting` workflow module unless it is only a non-disableable framework package; prefer framework-owned services/routes instead.
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
- [ ] Update `docs/module-contract.md` with the finalized reporting contribution shape.

### Version 0.33.6.2 - Reporting Framework Routes and Runner Dispatch

- [ ] Add framework-owned report catalog route:
  - [ ] `GET /api/reporting/catalog`
- [ ] Add framework-owned report execution route:
  - [ ] `GET /api/reporting/reports/:moduleId/:reportId/run`
  - [ ] or a stable equivalent using a report key.
- [ ] Add a server-side report runner registry keyed by stable runner IDs.
- [ ] Do not place executable functions directly in module manifests.
- [ ] The framework Reporting service should validate report availability, permissions, enabled modules, workspace capability requirements, and basic filter shape before dispatching.
- [ ] The module-owned runner should remain responsible for domain-specific data access, calculations, and record-level permission safety.

### Version 0.33.6.3 - Time Tracking Project Time & Billing Report

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

### Version 0.33.6.4 - Correct Project and Client Rollup Billing Math

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

### Version 0.33.6.5 - Reporting Page Host MVP

- [ ] Keep one `reporting.html` framework page.
- [ ] Convert the current hard-coded Time Report UI into a report host that loads available report definitions from the catalog.
- [ ] The first renderer may remain specific to Project Time & Billing.
- [ ] Keep the page simple:
  - [ ] Report selector or default first available report
  - [ ] Filter area
  - [ ] Status/error/empty state
  - [ ] Results area
- [ ] Do not build saved reports, exports, scheduled reports, charts, or report sharing in this version unless needed for regression coverage.

### Version 0.33.6.6 - Permissions, Navigation, and Closeout

- [ ] Decide whether `reporting.view` should become a framework-owned permission instead of being contributed by Time Tracking.
- [ ] Keep report-specific visibility dependent on both `reporting.view` and the owning module's required permissions.
- [ ] Ensure disabled modules do not contribute active reports.
- [ ] Ensure reports from historically readable disabled modules are only available if explicitly allowed by the contribution and module policy.
- [ ] Keep Reporting navigation framework-owned, with child report entries contributed by modules.
- [ ] Add regression coverage for:
  - [ ] Report catalog filters disabled modules.
  - [ ] Report catalog filters missing permissions.
  - [ ] Time Tracking report appears when Time Tracking is enabled and permissions allow it.
  - [ ] Time Tracking report disappears or is blocked when Time Tracking is disabled.
  - [ ] Custom date fields are hidden unless Custom is selected.
  - [ ] Project/subproject/client rollups apply rounding at the correct level.
- [ ] Update Help, `docs/module-contract.md`, `CHANGELOG.md`, package metadata, and roadmap archive.
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
  - [ ] "Start with whatâ€™s due"
  - [ ] "Work this week"
  - [ ] "Review blocked work"
  - [ ] "Focus on a project"
- [ ] Show one recommended next action before showing longer lists.
- [ ] Keep secondary lists available but visually subordinate.
- [ ] Avoid turning Workbench into another full module index.
- [ ] Add empty states that suggest a useful next step instead of dead ends.

### Version 0.33.7.6 - Quick Action Capture Utility Rail

Decision:

Quick Action Capture (QAC) is app-shell utility behavior, not a Workbench focus mode. It should provide low-distraction access to common capture and recovery tools without navigating away from the userâ€™s current work surface. QAC should keep the user on the existing screen and simply open modals (where available). The basic concept is to: 

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
  * [ ] Generate â€œWhat links here.â€
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

- [ ] Wipe existing DB migrations and create a new DB baseline

- [ ] Evaluate all existing regressions and see what can be eliminated/lightened

- [ ] Determine where efficiencies can be made in the code/Perform an efficiency refactor

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

