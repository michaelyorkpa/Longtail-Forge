# UI Surface Contract

This document captures the 0.33.5.13.7 framework surface inventory, token contract, modal section contract, modal footer/action contract, overlay host contract, drawer/slideout shell contract, main-screen internal surface contract, first adoption pass, and the 0.33.5.18.6.11 action-surface slide-out closeout. It is the closeout reference for shipped shared surface behavior, not a promise that every listed surface has already been converted.

## Surface Inventory

- Page surfaces: protected workflow pages such as Dashboard, Workbench, Tasks, Lists, Notes, Files, Search, Notifications, Clients, Projects, Reporting, and Settings use the shared shell and should read page background from `--color-page-bg`.
- Main-screen internal surfaces: filters, toolbars, settings groups, notification panels, timer panels, list detail panels, linked-note panels, search results, and table/list wrappers should use framework surface tokens rather than one-off colors.
- Modals: native `dialog` elements, app confirm/alert dialogs, add/edit task dialogs, recurrence dialogs, client/project dialogs, user/role dialogs, and future module dialogs should share modal body, internal group, divider, focus, and footer patterns.
- Drawers and slideouts: reporting submenus, future quick editors, contextual detail views, and narrow-screen side panels should use the shared drawer or slideout shell when implemented.
- Overlay-like panels: shell notifications, search suggestions, modal footer pickers, tag pickers, file attachment panels, and future small module-owned pickers should use overlay panel tokens while leaving picker content and save behavior module-owned.
- Footer/action bars: modal footers, bulk-action toolbars, dense row actions, and utility action strips should use shared placement and accessible-label rules, with adaptive text labels handled by the later footer contract slice.

## Token Meanings

- `--color-page-bg`: app page background behind work surfaces.
- `--color-surface`: standard flat panel, card, and dialog body background.
- `--color-surface-raised`: modal groups, drawers, and prominent grouped controls.
- `--color-surface-muted`: chips, low-emphasis grouped controls, and quiet secondary fills.
- `--color-surface-inset`: nested input-adjacent or recessed surfaces.
- `--color-surface-overlay`: popovers, bottom sheets, notification flyouts, and other temporary panels.
- `--color-border`, `--color-border-subtle`, and `--color-border-strong`: normal, quiet, and emphasized surface boundaries.
- `--shadow-card`, `--shadow-modal`, and `--shadow-control`: overlay/card elevation, modal/drawer elevation, and small control elevation.
- `--surface-radius-sm` and `--surface-radius-md`: shared control and surface radii. Cards remain 8px or less unless a specific control such as a chip requires a pill.
- `--surface-focus-ring`: visible keyboard focus ring for framework-owned surface containers.

## Compatibility Aliases

The existing aliases `--color-background`, `--color-page`, and `--color-surface-alt` are defined in the root theme as compatibility names. New or converted framework-owned surfaces should prefer the explicit names above. Later cleanup may retire aliases after converted areas no longer reference them.

## Shared Classes

- `.surface-page`: page background alignment.
- `.surface-card`: repeated item or genuinely framed tool surface.
- `.surface-main-panel`: main-screen internal panel for filters, bulk toolbars, settings groups, notification/timer panels, and contextual work surfaces.
- `.surface-main-panel--sticky`: sticky or persistent main-screen control panel using shared control elevation.
- `.surface-modal-group`: modal internal group surface for titled or collapsible sections, including shared box padding and section gap.
- `.surface-modal-heading`: shared modal title row for the modal title and one adjacent secondary control such as Close or Follow/Unfollow.
- `.surface-modal-section-heading`: shared internal heading style for modal `summary` headings and non-collapsible section headings.
- `.surface-modal-section-body`: shared body wrapper for grouped modal section controls.
- `.surface-modal-section-help`: shared low-emphasis helper/status text inside modal sections.
- `.surface-modal-section-validation`: shared inline validation text inside modal sections.
- `.surface-overlay-host`: positioning and lifecycle host for one active overlay at a time.
- `.surface-overlay-panel`: temporary popover, bottom sheet, or picker host surface.
- `.surface-overlay-panel--bottom-sheet`: mobile full-width bottom-sheet presentation for overlay panels.
- `.surface-drawer` and `.surface-slideout`: contextual side surfaces for future side panels, quick editors, and detail views.
- `.surface-drawer-header`, `.surface-drawer-body`, and `.surface-drawer-footer`: shared drawer shell anatomy.
- `.surface-slideout-header`, `.surface-slideout-body`, and `.surface-slideout-footer`: shared slideout shell anatomy.
- `.surface-dense-actions`: compact row/table/list action placement separate from modal footer placement.
- `.surface-divider-top`: divider placed at the top of a section or option being toggled.
- `.surface-chip`: compact metadata or state chip.
- `.surface-chip-row`: wrapping row for compact metadata chips.
- `.surface-modal-footer`: shared modal footer shell.
- `.surface-modal-footer-group`: grouped footer actions.
- `.surface-modal-footer-utilities`: utility footer action group for compact helpers such as Tags, Files, Copy Link, and Follow/Unfollow.
- `.surface-modal-footer-commit`: commit footer action group for secondary, primary, destructive, and unusual record actions.
- `.surface-modal-footer-action`: footer action control with a `data-surface-action-role` of `primary`, `secondary`, `destructive`, or `utility`.
- `.surface-disabled`: disabled surface state.
- `.surface-focus-ring`: opt-in focus ring for custom focusable containers.

## Adaptive Footer Labels

Converted add/edit modals should use one shared action model. The framework owns footer placement,
utility and commit grouping, sticky footer behavior, shared action button anatomy, accessible defaults,
and focus return. Modules own which actions appear, record-specific labels/icons, availability, API
calls, save payloads, validation, permissions, record URLs, notification event meaning, and picker or
upload bodies.

Footer utility actions such as Tags, Files, and Copy Link should use an icon plus short visible text on
converted add/edit modals unless a deliberately dense surface opts into icon-only controls with clear
accessible labels, hover titles, native button types, and regression coverage. Footer commit actions
should follow the compact Tasks pattern for Cancel and Save: recognizable icon buttons with accessible
labels, titles, native button types, and consistent secondary/primary roles.

The modal heading action slot should hold one contextual record-level utility such as a Follow
Notifications bell. It should not carry a duplicate Close button when the footer already provides
Cancel or Close behavior. A module should not show a follow bell as a cosmetic control until that module
can produce meaningful notifications through the framework notification system.

## Overlay Host

Use `LongtailForge.overlayHost.create({ host })` for small module-owned panels opened from modal footer or row actions. The framework host owns placement, close behavior, focus handling, Escape, click-away, responsive sizing, mobile bottom-sheet presentation, trigger `aria-expanded`, panel dialog semantics, and ensuring only one overlay is open per host. Modules own the panel body, picker/upload content, save payloads, validation, permissions, and record meaning.

Use `LongtailForge.view.showModal()` and `LongtailForge.view.closeModal()` for converted modal surfaces that may open secondary dialogs above a parent editor. The framework owns parent/child dialog stack tracking, top-dialog Escape/backdrop guardrails, focus return, and safe child closure when the parent closes. Modules still own the secondary dialog content and save behavior.

## Drawers and Slideouts

Use `.surface-drawer` for narrower side panels such as future navigation drawers, filter drawers, or quick-edit side panels. Use `.surface-slideout` for wider contextual detail views that need more room for fields, linked context, or review content. Both shells use header, body, and footer anatomy so close controls, titles, scrollable content, and actions stay predictable. The framework owns shell spacing, elevation, focus styling, and responsive placement. Modules own the panel content, validation, record actions, and save behavior.

On narrow screens, drawers and slideouts become full-screen overlays instead of squeezed side panels. They should keep the user in the current workflow and return focus to the triggering control when paired with a framework open/close helper.

Descriptor-backed action/workflow surfaces that need controls beside a primary record view should prefer `layout: "slide-out-sidebar"` instead of a persistent split. The framework-owned `.view-slideout-sidebar` shell uses a fixed off-canvas drawer, backdrop, screen-left funnel/filter trigger, footer-visible offset, and scroll lock. The trigger stays near the lower-left viewport edge and lifts above the visible footer without overlapping it. The main/detail panel stays central, full-width within the page container, and top-anchored; opening the drawer must not squeeze or re-center the selected-record view.

`slide-out-sidebar` is distinct from the generic `.surface-drawer` and `.surface-slideout` helper shells because it is a full page/workflow anatomy driven by a `viewSurfaces` descriptor. It is also distinct from the retired `split-list-detail` center split and the persistent split-column `sidebar-detail` layout. Modules may mount filters, libraries, record lists, sort controls, pagination, and other module-owned controls inside ordered drawer panels, but the framework owns the drawer shell, panel chrome, ARIA state, Escape/backdrop/trigger close behavior, focus return, reduced-motion fallback, and overflow containment.

## Main-Screen Internal Surfaces

Use `.surface-main-panel` for main-screen internal boxes such as filters, bulk toolbars, settings groups, notification panels, task timer/recovery panels, list detail panels, and contextual work surfaces. Use `.surface-main-panel--sticky` only when the panel persists near the top of the work surface while the user scrolls. The Tasks filter toolbar and bulk toolbar are the first proof target for this shell; later adoption slices can broaden it to Notifications, Time Tracking, Lists, Clients/Projects, and Notes.

Notifications boxes and task timer surfaces are the first adoption-pass targets after the Tasks modal shell proof. The Notifications list workspace, preferences workspace, grouping preferences, preference groups, and preference rows use `.surface-main-panel`; full page notification rows use `.surface-card`; notification row actions and task timer controls use `.surface-dense-actions`; the task timer display uses `.surface-chip`.

## Dense Table and List Actions

Use `.surface-dense-actions` for compact row, table, and list action clusters. Dense actions belong near the record or row they affect and stay separate from `.surface-modal-footer`, which is reserved for modal-level commit, secondary, utility, and destructive actions. Dense action clusters should prefer icon buttons with accessible labels and titles when space is tight, wrapping on narrow screens instead of forcing horizontal overflow.

## Ownership Boundary

The framework owns the tokens, shared class names, focus visibility, overlay host behavior, drawer/slideout shell behavior, responsive placement, and generic footer/action alignment. Modules own form fields, record-specific content, picker/upload bodies, save payloads, validation, permissions, and business meaning.

The first concrete converted area is the Tasks modal surface shell: converted modal title rows use `.surface-modal-heading`, modal groups use `.surface-modal-group`, modal section headings use `.surface-modal-section-heading`, grouped controls use `.surface-modal-section-body`, helper/status text uses `.surface-modal-section-help`, footer picker hosts use `.surface-overlay-panel`, top-only divider intent is marked with `.surface-divider-top`, footer actions use `.surface-modal-footer` with utility and commit groups, and Tags/Files footer panels register with the shared overlay host. Notes and Tasks must not keep module-specific title-row heading classes or module-specific modal heading spacing for converted add/edit modals. Converted modal footer utility actions should use icon plus text for readable module utilities such as Tags, Files, and Copy Link; compact commit actions should keep the Tasks-style Cancel and Save icon treatment with accessible labels. Collapsible modal section summaries must use the shared inside-the-box caret instead of relying on browser-native markers, and non-collapsible modal group headings should not use `fieldset`/`legend` when that would cut the box border. The first main-screen proof target is the Tasks filter toolbar and bulk toolbar using `.surface-main-panel`. The first adoption pass extends the shared classes to Notifications boxes and task timer surfaces without changing module behavior. Later 0.33.5.13 slices will broaden module adoption.

Declarative `viewSurfaces` descriptors are the manifest form of the same ownership boundary. A descriptor may name framework anatomy such as page headers, filter panels, selector/index panels, split workspaces, tables, detail headers, metadata/badge rows, action strips, summary panels, modal shells, field grids, and footer action groups. The descriptor describes the shape; the framework applies shared surface classes, accessibility defaults, overflow wrappers, responsive behavior, focus-safe controls, and workspace terminology. The owning module still supplies the data endpoint, field bindings, route and permission contract, named behavior handlers, validation, save payloads, and record-specific workflow semantics.

Descriptor labels use `label`, `title`, and `description` as literal fallbacks and `labelKey`, `titleKey`, and `descriptionKey` as workspace terminology keys. This lets one surface say `Lists`, `Procurement Lists`, or `Shopping Lists` without branching layout code. Terminology changes display text only; surface IDs, module IDs, view IDs, routes, permission IDs, data bindings, behavior IDs, and workflow rules remain stable framework/module contracts.

As of 0.33.5.16.4, `public/js/shared/view-renderer.js` provides the first static descriptor renderer as `LongtailForge.view.renderSurface(descriptor, host)`. It renders descriptor anatomy by composing the existing 0.33.5.15 `LongtailForge.view` primitives, supports the `single-column`, `split-list-detail`, and `table-page` layout shells, and intentionally does not fetch data, register behavior handlers, own client state, implement a virtual DOM, or deliver descriptors through the app shell.

As of 0.33.5.16.5, validated active descriptors travel to the browser through the existing app-shell bootstrap channel and are stored on `LongtailForge.workspaceContext.viewSurfaces`. Delivery uses the same enabled-module, workspace-capability, and protected-view permission filters as module navigation. Disabled modules, unavailable protected views, and permission-denied protected views do not expose descriptors in the bootstrap payload.

As of 0.33.5.16.6, data-bound descriptor surfaces fetch through the shared browser API client, project response records through descriptor field bindings, and redraw framework-owned table, index, detail, summary, field, item collection, loading, empty, and error-state anatomy. Modules still own the route implementation, returned record shape, validation, save semantics, and workflow behavior.

As of 0.33.5.16.8, descriptor actions can be dispatched by the framework. Route actions call the shared browser API client with descriptor method/confirm metadata, and behavior actions call module-registered handlers through `LongtailForge.view.registerBehavior`. The framework owns dispatch, modal shell opening, and recoverable action errors; modules still own handler behavior, validation, save payloads, and workflow meaning.

As of 0.33.5.16.9, Lists is the first live descriptor read-shell proof. Its manifest declares the protected workspace header, filters, selector/index, split layout, and read-only detail summary intent, while the Lists browser module still owns filtered reads, hydrated detail rendering, mutations, item rows, modals, linked records, and workspace-scope behavior until later explicit conversion slices.

As of 0.33.5.16.12, Lists item entry fields, item table/action placement, list-level workflow actions, linked-record picker/row placement, and the create/edit modal shell are descriptor-declared. The Lists browser module binds module-owned field meaning, catalog suggestions, validation, payloads, permissions, task-link picker behavior, and API workflows to that anatomy; the descriptor does not make Lists a generic inventory, purchasing system, or cross-module relationship engine. Strict declarative guardrails now enforce the converted Lists, Notes, and Tasks surfaces and report the remaining protected views as inventory until each is explicitly converted.
